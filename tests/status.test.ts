import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';
import type { CapabilityIndex, PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

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

const loadArchetypeConfigOrExit = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({ loadArchetypeConfigOrExit }));

const fetchRemoteSkillsVersion = vi.fn();
const readSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', () => ({
  fetchRemoteSkillsVersion,
  readSkillsVersion,
}));

const { runStatus } = await import('../src/commands/status.js');
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
  afterEach(() => vi.clearAllMocks());

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
  it('describes the drift section as DIFFERS FROM @main, not "locally modified"', async () => {
    // The comparison is against upstream HEAD, so a file can differ because
    // UPSTREAM moved — status cannot tell that from a user edit.
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
    expect(drift).toContain('.pharn-backup/');
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

  it('MODELS note renders the per-stage routing from config.models', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        models: {
          default: { model: 'sonnet-5', effort: 'high' },
          stages: { review: { model: 'opus-4-8', effort: 'high' } },
        },
      }),
    );
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runStatus({ drift: false });

    const models = noteBody('MODELS');
    expect(models).toContain('default   sonnet-5 · high');
    expect(models).toContain('review    opus-4-8 · high');
    // The note reports what the config RECORDS, and says so: no installed
    // command reads models.stages yet, so a reader must not take these lines
    // as the model a stage will actually run.
    expect(models).toContain('no installed stage reads this yet');
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
