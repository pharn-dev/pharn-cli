import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreNodeVersion,
  setNodeVersion,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import type { AbsentSurface } from '../src/lib/install-manifest.js';
import type { CapabilityIndex, PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRepo = vi.fn();
// `fetchRepo` returns the source it fetched; the wrapper fills it in from the
// argument, so the suite's `{ dir, sha, cleanup }` stubs stay what they were.
vi.mock('../src/lib/repo.js', () => ({
  fetchRepo: async (source: unknown) => ({
    source,
    ...(await fetchRepo(source)),
  }),
}));
// The release resolve (lib/release.ts) is a network call, so it is replaced. The
// default channel resolves to a verified release AT the version the suite's
// existing `fetchRemoteSkillsVersion` knob names — so every scenario it drives
// (up to date, behind, offline) drives the release path the same way.
const resolveSource = vi.fn(async (ref: string) => {
  if (ref === 'main') return { kind: 'main' as const };
  const version = String(await fetchRemoteSkillsVersion());
  return {
    kind: 'release' as const,
    tag: `v${version}`,
    version,
    sha: 'b'.repeat(40),
  };
});
// `--no-drift` on `latest`: ONE request (the release's tag), no commit resolve.
const resolveLatestReleaseVersion = vi.fn(async () => {
  const version = String(await fetchRemoteSkillsVersion());
  return { kind: 'release' as const, tag: `v${version}`, version };
});
vi.mock('../src/lib/release.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/release.js')>(
    '../src/lib/release.js',
  )),
  resolveSource,
  resolveLatestReleaseVersion,
}));

const diffInstalledCapabilities = vi.fn();
vi.mock('../src/lib/diff.js', () => ({ diffInstalledCapabilities }));

// status parses the index on the drift path to exclude FROZEN capabilities — the
// ones the fetch boundary could not read — so that `--strict` cannot report drift
// no command can resolve. Default: a fully-parseable clone (nothing frozen).
const parseCapabilityIndex = vi.fn((): CapabilityIndex => ({
  capabilities: [],
  unknown: [],
}));
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

// The surface accounting runs on the clone; its own behaviour is pinned in
// tests/install-manifest.test.ts. Here it is a seam: nothing absent unless a
// test says so.
const absentInstallSurfaces = vi.fn((): AbsentSurface[] => []);
vi.mock('../src/lib/install-manifest.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/install-manifest.js')>(
    '../src/lib/install-manifest.js',
  )),
  absentInstallSurfaces,
}));

const loadArchetypeConfigOrExit = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({ loadArchetypeConfigOrExit }));

const fetchRemoteSkillsVersion = vi.fn();
const readSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', () => ({
  fetchRemoteSkillsVersion,
  readSkillsVersion,
}));

const { runStatus } = await import('../src/commands/status.js');
const { contentHash } = await import('../src/lib/hash.js');
const prompts = await import('@clack/prompts');

function config(extra: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
    ...extra,
  };
}

// The body string of the note() rendered under the given title.
function noteBody(title: string): string {
  const call = vi.mocked(prompts.note).mock.calls.find((c) => c[1] === title);
  return (call?.[0] as string | undefined) ?? '';
}

const CLEAN = {
  modified: [] as string[],
  missing: [] as string[],
  unreadable: [] as { rel: string; reason: string }[],
  okCount: 5,
};

describe('runStatus (archetype)', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    loadArchetypeConfigOrExit.mockReturnValue(config());
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreNodeVersion();
  });

  // --- the NODE note (pharn-oss's floor CLIs refuse below Node 24.2.0) ---------
  //
  // Local and instant, so it renders on both paths and BEFORE any fetch — it must
  // survive a failed fetch. A mismatch is reported, never fatal, and never a
  // `--strict` input: the read-only report names it; the floor checks give the
  // verdict.
  // --- the channel -----------------------------------------------------------
  //
  // status follows the channel the config records — main by default, verified
  // releases for `ref: "latest"` — and an install AHEAD of the release (made
  // from main, then switched) is reported as ahead, never outdated,
  // so `--strict` does not demand an update that would be a downgrade.
  describe('release channel', () => {
    const plain = (title: string): string =>
      stripVTControlCharacters(noteBody(title));

    it('compares against the tip of main by default', async () => {
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

      await runStatus({ drift: false });

      expect(resolveSource).toHaveBeenCalledWith('main');
      expect(plain('VERSION')).toContain('main (tip)');
    });

    it('follows verified releases when the config records it', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(config({ ref: 'latest' }));
      fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
      readSkillsVersion.mockReturnValue('1.0.0');
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
      diffInstalledCapabilities.mockReturnValue(CLEAN);

      await runStatus({});

      expect(resolveSource).toHaveBeenCalledWith('latest');
      expect(plain('VERSION')).toContain('verified release v1.0.0');
    });

    it('reports an install AHEAD of the release as ahead, and --strict passes', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        config({ skillsVersion: '1.2.0', ref: 'latest' }),
      );
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');

      await runStatus({ drift: false, strict: true });

      expect(plain('VERSION')).toContain(
        'ahead of the latest verified release',
      );
      expect(plain('VERSION')).not.toContain('update available');
    });

    // pharn-oss main moved BACK (its SKILLS_VERSION reverted): the install is
    // ahead of the tip. `pharn update` refuses that downgrade without --force,
    // so --strict must not demand it either — the release channel's rule.
    it('reports an install AHEAD of main as ahead, and --strict passes', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(
        config({ skillsVersion: '1.2.0' }),
      );
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');

      await runStatus({ drift: false, strict: true });

      expect(resolveSource).toHaveBeenCalledWith('main');
      expect(plain('VERSION')).toContain('ahead of pharn-oss main (v1.1.0)');
      expect(plain('VERSION')).toContain('pharn update --force');
      expect(plain('VERSION')).not.toContain('update available');
      expect(plain('VERSION')).not.toContain('verified release v');
    });

    it('prints the recorded channel: main, with the way to verified releases', async () => {
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

      await runStatus({ drift: false });

      expect(plain('VERSION')).toMatch(
        /Channel\s+main — the pharn-oss tip \(`pharn update --ref latest` follows verified releases\)/,
      );
      expect(resolveLatestReleaseVersion).not.toHaveBeenCalled();
    });

    it('prints the recorded channel: latest, and says a newer verified release exists', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(config({ ref: 'latest' }));
      fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
      readSkillsVersion.mockReturnValue('1.1.0');
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
      diffInstalledCapabilities.mockReturnValue(CLEAN);

      await runStatus({});

      expect(plain('VERSION')).toMatch(/Channel\s+latest — verified releases/);
      expect(plain('VERSION')).toContain(
        'v1.0.0 → v1.1.0 (newer verified release v1.1.0 — run `pharn update`)',
      );
      expect(plain('VERSION')).not.toContain('update available');
    });

    it('on latest with no newer release, says so', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(config({ ref: 'latest' }));
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

      await runStatus({ drift: false });

      expect(plain('VERSION')).toContain('(no newer verified release)');
    });

    it('--no-drift on latest makes ONE request (the release tag) and clones nothing', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(config({ ref: 'latest' }));
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');

      await runStatus({ drift: false });

      expect(resolveLatestReleaseVersion).toHaveBeenCalledTimes(1);
      expect(resolveSource).not.toHaveBeenCalled();
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(plain('VERSION')).toContain('newer verified release v1.1.0');
      expect(plain('VERSION')).toContain('verified release v1.1.0');
    });

    it('still reports a BEHIND install as outdated, and --strict fails', async () => {
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');

      await expect(
        runStatus({ drift: false, strict: true }),
      ).rejects.toMatchObject(new ProcessExit(1));

      expect(plain('VERSION')).toContain('update available');
    });

    it('exits 1 when the release cannot be resolved', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(config({ ref: 'latest' }));
      fetchRemoteSkillsVersion.mockRejectedValueOnce(new Error('HTTP 404'));

      await expect(runStatus({})).rejects.toMatchObject(new ProcessExit(1));

      expect(fetchRepo).not.toHaveBeenCalled();
    });
  });

  describe('NODE note', () => {
    const plain = (title: string): string =>
      stripVTControlCharacters(noteBody(title));

    it('shows the floor and the running Node on the drift path, without a mismatch', async () => {
      setNodeVersion('24.13.1');
      fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
      readSkillsVersion.mockReturnValue('1.0.0');
      diffInstalledCapabilities.mockReturnValue(CLEAN);

      await runStatus({});

      expect(plain('NODE')).toContain('>= 24.2.0');
      expect(plain('NODE')).toContain('v24.13.1');
      expect(plain('NODE')).not.toContain('MISMATCH');
    });

    it('shows it under --no-drift too', async () => {
      setNodeVersion('24.2.0');
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

      await runStatus({ drift: false });

      expect(plain('NODE')).toContain('v24.2.0');
      expect(plain('NODE')).not.toContain('MISMATCH');
    });

    it('flags a Node below the floor, and still exits 0 — even with --strict', async () => {
      setNodeVersion('22.18.0');
      fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
      readSkillsVersion.mockReturnValue('1.0.0');
      diffInstalledCapabilities.mockReturnValue(CLEAN);

      await runStatus({ strict: true });

      expect(plain('NODE')).toContain('>= 24.2.0');
      expect(plain('NODE')).toContain('v22.18.0');
      expect(plain('NODE')).toContain('MISMATCH');
    });

    it('flags an UNPARSEABLE Node version, quoting it', async () => {
      setNodeVersion('garbage');
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

      await runStatus({ drift: false });

      expect(plain('NODE')).toContain('"garbage"');
      expect(plain('NODE')).toContain('MISMATCH');
    });

    it('renders before any fetch, so it survives a fetch failure', async () => {
      setNodeVersion('22.18.0');
      fetchRemoteSkillsVersion.mockRejectedValueOnce(new Error('offline'));

      await expect(runStatus({ drift: false })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(plain('NODE')).toContain('MISMATCH');
    });
  });

  it('aborts before any fetch when the config is not an archetype install', async () => {
    // loadArchetypeConfigOrExit prints LEGACY_CONFIG_MESSAGE + exit(1) for a
    // legacy config (asserted in pharn-config.test.ts); here: no network.
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runStatus()).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
  });

  it('--no-drift: version via SKILLS_VERSION fetch, no clone', async () => {
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runStatus({ drift: false });

    expect(fetchRemoteSkillsVersion).toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(noteBody('VERSION')).toContain('ssr');
    expect(noteBody('DRIFT')).toBe('');
  });

  it('--no-drift exits(1) when the SKILLS_VERSION fetch fails', async () => {
    fetchRemoteSkillsVersion.mockRejectedValueOnce(new Error('offline'));
    await expect(runStatus({ drift: false })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  // --- fatal-error reporting (FABLE 4.6 + 5.2) -------------------------------
  //
  // status's local `reportError` was one of eight hand-rolled copies and the
  // only one of the three that never printed the hint. It is folded into the
  // shared reporter, so every one of its three call sites gains it at once.
  describe('fatal-error reporting', () => {
    const realDebug = process.env.PHARN_DEBUG;
    beforeEach(() => delete process.env.PHARN_DEBUG);
    afterEach(() => {
      if (realDebug === undefined) delete process.env.PHARN_DEBUG;
      else process.env.PHARN_DEBUG = realDebug;
    });

    it('prints the hint and the message on stderr when the version fetch throws', async () => {
      fetchRemoteSkillsVersion.mockRejectedValueOnce(
        new Error('Could not reach raw.githubusercontent.com: fetch failed'),
      );

      await expect(runStatus({ drift: false })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      const [msg, opts] = vi.mocked(prompts.log.error).mock.calls.at(-1)!;
      expect(String(msg)).toContain('Could not reach');
      expect(opts).toEqual({ output: process.stderr });
      expect(
        vi
          .mocked(prompts.log.info)
          .mock.calls.map((c) => String(c[0]))
          .join('\n'),
      ).toContain('PHARN_DEBUG');
    });

    it('prints the hint when the clone throws, and still exits 1', async () => {
      fetchRepo.mockRejectedValueOnce(new Error('offline'));

      await expect(runStatus({})).rejects.toMatchObject(new ProcessExit(1));

      expect(
        vi
          .mocked(prompts.log.info)
          .mock.calls.map((c) => String(c[0]))
          .join('\n'),
      ).toContain('PHARN_DEBUG');
    });
  });

  // --- the proxy notice (wiring) ----------------------------------------------
  //
  // BOTH status paths are network-bearing, so the notice must precede BOTH: the
  // drift path's clone and `--no-drift`'s SKILLS_VERSION read. LIMITS.md §3a
  // promises it of EVERY network-bearing command, and docs/troubleshooting.md
  // says pharn "says so before it fetches" — with `status --no-drift`'s fetch
  // named in that same section.
  //
  // These cases previously asserted the OPPOSITE for --no-drift: that it stays
  // silent "because it never clones". That reasoning conflated never-clones with
  // never-fetches, and the assertion promoted the mistake from a code comment
  // into the suite — so the suite DEFENDED the bug and a green `npm test` was
  // evidence for it. The inversion below is the fix; it is recorded here because
  // a test that pins a documented guarantee's violation is worth naming, not
  // quietly flipping.
  //
  // Each case pins ORDER, not mere presence: the check runs INSIDE the fetch
  // mock, so it fires at call time and proves the warning came first.
  describe('proxy notice', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('warns before the clone on the drift path', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      const cleanup = vi.fn();
      let warnedBeforeFetch = false;
      fetchRepo.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return { dir: '/repo', cleanup };
      });
      readSkillsVersion.mockReturnValue('1.0.0');
      diffInstalledCapabilities.mockReturnValue(CLEAN);

      await runStatus({});

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    // --no-drift skips the CLONE, not the network: it still reads
    // SKILLS_VERSION over the wire. Skipping the notice here was the bug.
    it('warns before the SKILLS_VERSION fetch under --no-drift, which still fetches', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      let warnedBeforeFetch = false;
      fetchRemoteSkillsVersion.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return '1.0.0';
      });

      await runStatus({ drift: false });

      // No clone — the flag still does what it says.
      expect(fetchRepo).not.toHaveBeenCalled();
      // But there WAS a fetch, and the warning preceded it.
      expect(fetchRemoteSkillsVersion).toHaveBeenCalled();
      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    // The scenario the notice exists for: a proxy-only network blocks direct
    // egress, so the fetch FAILS. Every other case here exercises a fetch that
    // succeeds, which would leave a future edit that warned only on the success
    // path (moving the block inside the try, after the await) undetected.
    it('warns before the fetch even when that fetch then fails', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      let warnedBeforeFetch = false;
      fetchRemoteSkillsVersion.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        throw new Error('connect ETIMEDOUT');
      });

      await expect(runStatus({ drift: false })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    // One warning per run, on either path. This pins what the user SEES; it
    // cannot see source shape — a block duplicated into both branches would
    // still emit exactly one warning per run, because the branches are mutually
    // exclusive. That the source has a single call site is advisory (the
    // comment and review), not something a count can check.
    it.each([
      ['--no-drift', { drift: false }],
      ['the drift path', {}],
    ])('warns exactly once on %s', async (_label, opts) => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      vi.stubEnv('HTTPS_PROXY', 'http://proxy.internal:3128');
      const cleanup = vi.fn();
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
      fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
      readSkillsVersion.mockReturnValue('1.0.0');
      diffInstalledCapabilities.mockReturnValue(CLEAN);

      await runStatus(opts);

      const notices = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .filter((m) => m.includes('will not use it'));
      expect(notices).toHaveLength(1);
    });

    it('says nothing when no proxy variable is set', async () => {
      vi.stubEnv('https_proxy', undefined);
      vi.stubEnv('HTTPS_PROXY', undefined);
      const cleanup = vi.fn();
      fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
      readSkillsVersion.mockReturnValue('1.0.0');
      diffInstalledCapabilities.mockReturnValue(CLEAN);

      await runStatus({});

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('will not use it');
    });
  });

  it('default: clones, reads SKILLS_VERSION, diffs capabilities, cleans up', async () => {
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);

    await runStatus({});

    expect(readSkillsVersion).toHaveBeenCalledWith('/repo');
    expect(diffInstalledCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        repoDir: '/repo',
        projectRoot: '/proj',
        // No recorded layout → flat, the safe default (P7).
        layout: 'flat',
      }),
    );
    expect(noteBody('DRIFT')).toContain('No drift');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits(1) and cleans up when the clone cannot be fetched', async () => {
    fetchRepo.mockRejectedValueOnce(new Error('offline'));
    await expect(runStatus({})).rejects.toMatchObject(new ProcessExit(1));
    expect(diffInstalledCapabilities).not.toHaveBeenCalled();
  });

  it('passes the recorded layout: pharn through to the capability diff', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config({ layout: 'pharn' }));
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);

    await runStatus({});

    expect(diffInstalledCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ layout: 'pharn' }),
    );
    expect(cleanup).toHaveBeenCalled();
  });

  it('--strict exits 1 on capability drift, cleaning up first', async () => {
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['pharn-pipeline/grillers/a11y/a11y.md'],
      missing: [],
      unreadable: [],
      okCount: 3,
    });

    await expect(runStatus({ strict: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(cleanup).toHaveBeenCalled();
  });

  // The DRIFT copy is the user's only pointer from "status found something" to
  // "here is what update will do about it" — it must not promise the old
  // overwrite-by-default behavior.
  it('describes the drift section as DIFFERS FROM <source>, not "locally modified"', async () => {
    // The comparison is against what upstream ships now, so a file can differ
    // because UPSTREAM moved — status cannot tell that from a user edit.
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['CONSTITUTION.md'],
      missing: [],
      unreadable: [],
      okCount: 3,
    });

    await runStatus({});

    const drift = noteBody('DRIFT');
    expect(drift).toContain('DIFFERS FROM pharn-dev/pharn-oss@main');
    expect(drift).not.toContain('LOCALLY MODIFIED');
  });

  it('tells the user their edits are KEPT, and names --force + the backup dir', async () => {
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['CONSTITUTION.md'],
      missing: [],
      unreadable: [],
      okCount: 3,
    });

    await runStatus({});

    const drift = noteBody('DRIFT');
    expect(drift).toContain("keeps files you've edited");
    expect(drift).toContain('--force');
    expect(drift).toContain('pharn/.backup/');
    // The claim it replaced is gone.
    expect(drift).not.toContain('will overwrite these');
  });

  it('qualifies the MISSING hint with when update actually restores', async () => {
    // update early-returns at the current version, so the hint must name
    // `--force`; add is only for capabilities not yet in config.
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: [],
      missing: ['.claude/hooks/set-writes-scope.cjs'],
      unreadable: [],
      okCount: 3,
    });

    await runStatus({});

    const drift = noteBody('DRIFT');
    expect(drift).toContain('pharn update --force');
    expect(drift).toContain('exits early when already up to date');
    expect(drift).toContain('not yet in pharn.config.json');
    expect(drift).toContain('additive-only');
    expect(drift).not.toContain('re-added');
  });

  it('a default (non-strict) run with drift resolves without exiting', async () => {
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['pharn-pipeline/grillers/a11y/a11y.md'],
      missing: [],
      unreadable: [],
      okCount: 3,
    });

    await expect(runStatus({})).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  // The fourth partition: expected paths that EXIST but cannot be compared (a
  // symlink, a directory, an ENOTDIR parent). status used to either crash on
  // these or file them under Modified/Missing; now it names them, and --strict
  // counts them like any other drift.
  const UNREADABLE = {
    modified: [] as string[],
    missing: [] as string[],
    unreadable: [{ rel: 'CONSTITUTION.md', reason: 'the path is a symlink' }],
    okCount: 3,
  };

  it('--strict exits 1 when the ONLY drift is unreadable, cleaning up first', async () => {
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(UNREADABLE);

    await expect(runStatus({ strict: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(cleanup).toHaveBeenCalled();
  });

  it('plain status REPORTS unreadable paths with their reason and exits 0', async () => {
    // Report-only, exactly like modified/missing: status is a report, not a
    // guard. The reason is rendered because "a link sits there" is the whole
    // point — without it this is indistinguishable from an edit.
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(UNREADABLE);

    await expect(runStatus({})).resolves.toBeUndefined();

    const drift = noteBody('DRIFT');
    expect(drift).toContain('UNREADABLE');
    expect(drift).toContain('CONSTITUTION.md — the path is a symlink');
    // Not a clean bill: an unreadable path is drift.
    expect(drift).not.toContain('No drift');
  });

  it('orders the drift subsections DIFFERS → MISSING → UNREADABLE', async () => {
    // Deterministic report order, the read-side twin of update's SKIP_ORDER —
    // unreadable last, because nothing pharn can run resolves it.
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['CONSTITUTION.md'],
      missing: ['.claude/hooks/set-writes-scope.cjs'],
      unreadable: [
        {
          rel: 'pharn-contracts/finding-shape.md',
          reason: 'the path is a symlink',
        },
      ],
      okCount: 3,
    });

    await runStatus({});

    const drift = noteBody('DRIFT');
    expect(drift.indexOf('DIFFERS FROM')).toBeLessThan(
      drift.indexOf('MISSING'),
    );
    expect(drift.indexOf('MISSING')).toBeLessThan(drift.indexOf('UNREADABLE'));
  });

  it('omits the UNREADABLE subsection entirely when nothing is unreadable', async () => {
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['CONSTITUTION.md'],
      missing: [],
      unreadable: [],
      okCount: 3,
    });

    await runStatus({});

    expect(noteBody('DRIFT')).not.toContain('UNREADABLE');
  });

  // The MODELS note shows pharn-oss's block resolved per product stage, under
  // a label that says what reads it: /pharn-ship and /pharn-loop (model only,
  // never effort); a directly run stage uses its own frontmatter, which the
  // block is held to.
  it('MODELS note resolves every product stage, labeled truthfully', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        layout: 'pharn',
        models: {
          stages: {
            default: { model: 'sonnet', effort: 'high' },
            plan: { model: 'opus', effort: 'high' },
            review: { model: 'claude-opus-4-8', effort: 'xhigh' },
          },
        },
      }),
    );
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runStatus({ drift: false });

    const models = noteBody('MODELS');
    expect(models).toContain('default          sonnet · high');
    expect(models).toContain('plan             opus · high');
    expect(models).toContain('review           claude-opus-4-8 · xhigh');
    // A stage with no entry of its own shows the default it resolves to.
    expect(models).toContain('memory-promote   sonnet · high  (default)');
    expect(models).toContain('ac-test          sonnet · high  (default)');
    expect(models).toContain(
      '/pharn-ship and /pharn-loop read this block to pick the model they',
    );
    expect(models).toContain('Effort is never');
    expect(models).toContain(
      "A stage you run directly uses its command's own model:/effort:",
    );
    expect(models).toContain(
      'node pharn/floor/check-model-config.mjs agreement',
    );
    expect(models).not.toContain('not this block');
    expect(models).not.toContain('no installed stage reads');
  });

  it('points a flat install at the checker under .dev/floor', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        models: { stages: { default: { model: 'opus', effort: 'low' } } },
      }),
    );
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    await runStatus({ drift: false });
    expect(noteBody('MODELS')).toContain(
      'node .dev/floor/check-model-config.mjs agreement',
    );
  });

  it('says a block in the old pharn format is converted by `pharn update`', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        models: {
          default: { model: 'sonnet-5', effort: 'high' },
          stages: {
            plan: { model: 'opus-4-8', effort: 'max' },
            review: { model: 'opus-4-8', effort: 'high' },
          },
        },
      }),
    );
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    await runStatus({ drift: false });
    const models = noteBody('MODELS');
    expect(models).toContain('In the format pharn wrote before 0.7.0');
    expect(models).toContain('`pharn update` converts it');
    // Visible columns: FORCE_COLOR can turn color codes on (lib/color.ts).
    for (const line of stripVTControlCharacters(models).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(70);
    }
    expect(models).not.toContain('sonnet-5 · high');
  });

  it("lists what pharn-oss's rules reject — terminal-safe — and does not fail --strict", async () => {
    const ESC = String.fromCharCode(27);
    const RLO = String.fromCharCode(0x202e);
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        models: {
          stages: {
            default: { model: 'sonnet', effort: 'high' },
            [`pl${ESC}[2Kan`]: { model: 'opus', effort: 'high' },
            review: { model: `${RLO}opus`, effort: 'high' },
          },
        },
      }),
    );
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    // --strict gates on the install, not on this block: pharn-oss's checker
    // owns that verdict. Current version + no drift checked → no exit.
    await runStatus({ strict: true, drift: false });

    const models = noteBody('MODELS');
    expect(models).toContain("pharn-oss's rules reject this block:");
    expect(models).toContain('is not a product stage');
    expect(models).toContain('is not an alias');
    expect(models).toContain('node .dev/floor/check-model-config.mjs validate');
    expect(models).not.toContain(RLO);
    expect(models).not.toContain(`${ESC}[2K`);
  });

  it('says so when the block declares no stages', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config({ models: {} }));
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    await runStatus({ drift: false });
    expect(noteBody('MODELS')).toContain('Declares no stages');
  });

  it('omits the MODELS note when config.models is absent (legacy archetype config)', async () => {
    // beforeEach returns config() with no `models` block.
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    await runStatus({ drift: false });
    expect(noteBody('MODELS')).toBe('');
  });

  it('--no-drift --strict exits(1) when the version is behind', async () => {
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    await expect(
      runStatus({ strict: true, drift: false }),
    ).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// FROZEN capabilities and `status`.
//
// `update` deliberately KEEPS the config entry of a capability the fetch boundary
// could not parse, but never writes its files. `status` reads the same config, so
// without the matching exclusion it would walk the unparseable clone directory,
// report every file under it as MISSING, and make `--strict` exit 1 forever over
// a break no command can resolve. The two must agree about which capabilities
// this install actually owns bytes for.
// ---------------------------------------------------------------------------
describe('runStatus — frozen capabilities', () => {
  stubProcessExit();
  const cleanup = vi.fn();

  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    fetchRepo.mockResolvedValue({ dir: '/repo', sha: null, cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: [],
      missing: [],
      unreadable: [],
      okCount: 3,
    });
    parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
  });
  afterEach(() => vi.clearAllMocks());

  const frozenIndex = () =>
    parseCapabilityIndex.mockReturnValue({
      capabilities: [],
      unknown: [
        {
          name: 'backwards-compat',
          role: 'griller',
          subtree: 'pharn-pipeline/grillers',
          reason: 'missing its markdown',
        },
      ],
    });

  it('excludes a frozen capability from the diff, keeping the rest', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        capabilities: [
          { name: 'a11y', role: 'griller' },
          { name: 'backwards-compat', role: 'griller' },
        ],
      }),
    );
    frozenIndex();

    await runStatus({});

    expect(diffInstalledCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: [{ name: 'a11y', role: 'griller' }],
      }),
    );
  });

  it('matches on the (name, role) PAIR — a same-name lens is still compared', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        capabilities: [{ name: 'backwards-compat', role: 'lens' }],
      }),
    );
    frozenIndex();

    await runStatus({});

    expect(diffInstalledCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: [{ name: 'backwards-compat', role: 'lens' }],
      }),
    );
  });

  it('names the skipped capability (no silent skips, P5) and still exits 0 under --strict', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({ capabilities: [{ name: 'backwards-compat', role: 'griller' }] }),
    );
    frozenIndex();

    await runStatus({ strict: true });

    expect(cleanup).toHaveBeenCalled();
    const warned = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(warned).toContain('backwards-compat');
    expect(warned).toContain('missing its markdown');
  });

  it('stays silent about capabilities when the whole clone parsed', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config());

    await runStatus({});

    const warned = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(warned).not.toContain('could not be read');
  });

  it('--no-drift never parses the index (it does not clone)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config());
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runStatus({ drift: false });

    expect(parseCapabilityIndex).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
  });
});

// PHARN-04: settings.json is never compared as a file, but whether every hook
// upstream wires is wired in the project IS checked — and fails --strict.
describe('runStatus — HOOKS (PHARN-04)', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let repo = '';
  let proj = '';
  const oldWiring = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [{ type: 'command', command: 'node .claude/hooks/a.cjs' }],
        },
      ],
    },
  };
  const newWiring = {
    hooks: {
      ...oldWiring.hooks,
      Stop: [
        {
          hooks: [
            { type: 'command', command: 'node', args: ['.claude/hooks/b.cjs'] },
          ],
        },
      ],
    },
  };
  const put = (dir: string, v: unknown) => {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify(v));
  };

  beforeEach(() => {
    repo = join(tmp.path(), 'repo');
    proj = join(tmp.path(), 'proj');
    put(repo, newWiring);
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    loadArchetypeConfigOrExit.mockReturnValue(config());
    fetchRepo.mockResolvedValue({ dir: repo, cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);
  });
  afterEach(() => vi.clearAllMocks());

  it('names an upstream hook the project does not wire, and exits 0 without --strict', async () => {
    put(proj, oldWiring);
    await runStatus({});
    expect(noteBody('HOOKS')).toContain(
      'Stop: {"type":"command","command":"node","args":[".claude/hooks/b.cjs"]}',
    );
    expect(noteBody('DRIFT')).toContain('No drift');
  });

  it('--strict exits 1 when an upstream hook is not wired', async () => {
    put(proj, oldWiring);
    await expect(runStatus({ strict: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
  });

  it('--strict exits 0 and prints no HOOKS note when the wiring matches', async () => {
    put(proj, newWiring);
    await runStatus({ strict: true });
    expect(noteBody('HOOKS')).toBe('');
  });

  // Hooks wired in the per-user .claude/settings.local.json run for this user,
  // so they are WIRED: --strict passes. The note still says they reach nobody
  // else. (In CI that file does not exist, so CI's answer is unchanged.)
  it('--strict exits 0 when the hooks are wired only in settings.local.json, and says so', async () => {
    put(proj, { permissions: { allow: [] } });
    writeFileSync(
      join(proj, '.claude/settings.local.json'),
      JSON.stringify(newWiring),
    );
    await runStatus({ strict: true });
    expect(noteBody('HOOKS')).toContain('settings.local.json');
    expect(noteBody('HOOKS')).toContain('not for teammates or CI');
  });
});

// F-12: files pharn recorded writing that upstream no longer ships, still on
// disk. status reads pharn.records.json for this ONLY; drift is unchanged.
describe('runStatus — ORPHANED', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let repo = '';
  let proj = '';
  const OLD = '.claude/commands/pharn-old.md';
  const KEPT = '.claude/commands/pharn-plan.md';

  const put = (root: string, rel: string, content: string) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  const records = (files: Record<string, string>, skillsVersion = '1.0.0') =>
    put(
      proj,
      'pharn.records.json',
      JSON.stringify({ schemaVersion: 1, skillsVersion, commit: 'old', files }),
    );
  const hash = (rel: string) => contentHash(join(proj, rel));

  beforeEach(() => {
    repo = join(tmp.path(), 'repo');
    proj = join(tmp.path(), 'proj');
    put(repo, KEPT, 'plan');
    put(proj, KEPT, 'plan');
    put(proj, OLD, 'old command');
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    loadArchetypeConfigOrExit.mockReturnValue(config());
    fetchRepo.mockResolvedValue({ dir: repo, cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);
  });
  afterEach(() => vi.clearAllMocks());

  it('names a recorded file upstream no longer ships, and --strict still exits 0', async () => {
    records({ [KEPT]: hash(KEPT), [OLD]: hash(OLD) });
    await runStatus({ strict: true });
    const body = stripVTControlCharacters(noteBody('ORPHANED'));
    expect(body).toContain('UNCHANGED');
    expect(body).toContain(OLD);
    expect(body).not.toContain(KEPT);
    expect(noteBody('DRIFT')).toContain('No drift');
  });

  it('prints nothing without a usable records store', async () => {
    records({ [OLD]: hash(OLD) }, '0.9.0'); // stamped for another state
    await runStatus({});
    expect(noteBody('ORPHANED')).toBe('');
  });

  it('prints nothing when the clone is at another layout than the install', async () => {
    records({ [OLD]: hash(OLD) });
    put(repo, 'pharn/pharn-contracts/x.md', 'x'); // a pharn-layout clone
    await runStatus({});
    expect(noteBody('ORPHANED')).toBe('');
  });

  it('--no-drift never reads for orphans', async () => {
    records({ [OLD]: hash(OLD) });
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    await runStatus({ drift: false });
    expect(noteBody('ORPHANED')).toBe('');
  });
});

// F-10: a declared product surface the clone ships NO file for is named in the
// DRIFT note and fails --strict. It is computed at the CLONE's own layout, so it
// means exactly "upstream ships nothing there" — a recorded layout that differs
// from upstream's is a separate, advisory LAYOUT note, and not a --strict input.
describe('runStatus — NOT SHIPPED UPSTREAM and LAYOUT (F-10)', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let repo = '';
  const plain = (title: string): string =>
    stripVTControlCharacters(noteBody(title));
  const ABSENT: AbsentSurface[] = [
    { surface: 'hooks', path: '.claude/hooks' },
    { surface: 'contracts', path: 'pharn/pharn-contracts' },
  ];

  beforeEach(() => {
    repo = join(tmp.path(), 'repo');
    mkdirSync(repo, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    loadArchetypeConfigOrExit.mockReturnValue(config());
    fetchRepo.mockResolvedValue({ dir: repo, cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);
    absentInstallSurfaces.mockReturnValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it('names each absent surface in the DRIFT note — and is not "No drift"', async () => {
    absentInstallSurfaces.mockReturnValue(ABSENT);
    await runStatus({});
    const drift = plain('DRIFT');
    expect(drift).toContain('NOT SHIPPED UPSTREAM');
    expect(drift).toContain('.claude/hooks (hooks)');
    expect(drift).toContain('pharn/pharn-contracts (contracts)');
    expect(drift).not.toContain('No drift');
  });

  it('exits 0 without --strict, and 1 under --strict when it is the ONLY finding', async () => {
    absentInstallSurfaces.mockReturnValue(ABSENT);
    await runStatus({});
    await expect(runStatus({ strict: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
  });

  it('accounts at the CLONE layout, not the recorded one', async () => {
    mkdirSync(join(repo, 'pharn/pharn-contracts'), { recursive: true });
    loadArchetypeConfigOrExit.mockReturnValue(config({ layout: 'flat' }));
    await runStatus({});
    expect(absentInstallSurfaces).toHaveBeenCalledWith({
      repoDir: repo,
      layout: 'pharn',
    });
    // The file diff still addresses the project at its recorded layout.
    expect(diffInstalledCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ layout: 'flat' }),
    );
  });

  it('a recorded layout upstream no longer ships is a LAYOUT note, and --strict stays 0', async () => {
    mkdirSync(join(repo, 'pharn/pharn-contracts'), { recursive: true });
    loadArchetypeConfigOrExit.mockReturnValue(config({ layout: 'flat' }));
    await runStatus({ strict: true });
    const layout = plain('LAYOUT');
    expect(layout).toContain('flat');
    expect(layout).toContain('pharn');
    expect(layout).toContain('pharn update');
    expect(plain('DRIFT')).toContain('No drift');
  });

  it("prints no LAYOUT note when the recorded layout is upstream's", async () => {
    await runStatus({});
    expect(
      vi.mocked(prompts.note).mock.calls.some((c) => c[1] === 'LAYOUT'),
    ).toBe(false);
  });

  it('--no-drift fetches no clone and accounts nothing', async () => {
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    await runStatus({ drift: false, strict: true });
    expect(absentInstallSurfaces).not.toHaveBeenCalled();
  });
});
