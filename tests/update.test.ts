import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  ProcessExit,
  restoreNodeVersion,
  restoreTTY,
  setNodeVersion,
  setTTY,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import { LOCK_FILE } from '../src/lib/project-lock.js';
import type { PharnConfig } from '../src/types.js';

// One ordered record of what a run showed — spinner starts/stops and info/warn
// lines together — so a test can assert ORDER: a line logged while a clack
// spinner animates is glued to its frame, and below ~50 columns the spinner's
// stop erases it. Hoisted, because the mock factory can run before this file's
// own top-level code. Emptied after every test with the mocks' calls.
const { shown } = vi.hoisted(() => ({ shown: [] as string[] }));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  note: vi.fn(),
  log: {
    info: vi.fn((m: unknown) => {
      shown.push(`info: ${String(m)}`);
    }),
    warn: vi.fn((m: unknown) => {
      shown.push(`warn: ${String(m)}`);
    }),
    error: vi.fn(),
  },
  outro: vi.fn(),
  spinner: () => ({
    start: vi.fn((m?: string) => {
      shown.push(`start: ${m ?? ''}`);
    }),
    stop: vi.fn((m?: string) => {
      shown.push(`stop: ${m ?? ''}`);
    }),
  }),
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
vi.mock('../src/lib/release.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/release.js')>(
    '../src/lib/release.js',
  )),
  resolveSource,
}));

const fetchRemoteSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/skills-version.js')
  >('../src/lib/skills-version.js');
  return { ...actual, fetchRemoteSkillsVersion };
});

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const resolveCapabilities = vi.fn();
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

const loadArchetypeConfigOrExit = vi.fn();
const assertConfigUnchanged = vi.fn();
vi.mock('../src/lib/pharn-config.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/pharn-config.js')
  >('../src/lib/pharn-config.js');
  return { ...actual, assertConfigUnchanged, loadArchetypeConfigOrExit };
});

const { ReleaseResolveError } = await import('../src/lib/release.js');
const { runUpdate } = await import('../src/commands/update.js');
const prompts = await import('@clack/prompts');
const {
  MODELS_RECORD_KEY,
  modelsRecordHash,
  readRecords,
  writeRecords,
  RECORDS_FILE,
} = await import('../src/lib/install-records.js');
const { contentHash } = await import('../src/lib/hash.js');
const { BACKUP_DIR } = await import('../src/lib/backup.js');
const { readPharnConfig, writePharnConfig } =
  await import('../src/lib/pharn-config.js');

// ---------------------------------------------------------------------------
// Real-filesystem fixture: a fake clone + a real project root. The command's
// network + index resolution are mocked; every FILE decision is exercised for
// real, because "was this byte overwritten?" is the whole feature and a mock
// cannot answer it.
// ---------------------------------------------------------------------------

const CAP = { name: 'a11y', role: 'griller' as const };

// Files the fake clone ships (flat layout), and thus the install manifest.
const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
const DOC = 'CONSTITUTION.md';
const HOOK = '.claude/hooks/set-writes-scope.cjs';

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function scaffoldClone(repo: string, version: string, marker: string): void {
  write(join(repo, 'SKILLS_VERSION'), `${version}\n`);
  write(join(repo, CAP_FILE), `a11y ${marker}`);
  write(join(repo, DOC), `constitution ${marker}`);
  write(join(repo, HOOK), `hook ${marker}`);
  write(join(repo, '.claude/commands/pharn-plan.md'), `plan ${marker}`);
}

function baseConfig(over: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.4.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [CAP],
    layout: 'flat',
    ...over,
  };
}

describe('runUpdate (drift-safe)', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let proj = '';
  let repo = '';
  let cleanup = vi.fn();

  // Install the "v1.0.0" tree into the project and record it, i.e. exactly what
  // `pharn init` leaves behind. Then point the clone at "v1.1.0".
  async function installed(
    over: Partial<PharnConfig> = {},
  ): Promise<PharnConfig> {
    const old = join(tmp.path(), 'old-clone');
    scaffoldClone(old, '1.0.0', 'v1');
    for (const rel of [CAP_FILE, DOC, HOOK, '.claude/commands/pharn-plan.md']) {
      write(join(proj, rel), readFileSync(join(old, rel), 'utf8'));
    }
    const config = baseConfig(over);
    await writeRecords(proj, {
      skillsVersion: config.skillsVersion,
      commit: config.commit,
      files: {
        [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
        [DOC]: contentHash(join(proj, DOC)),
        [HOOK]: contentHash(join(proj, HOOK)),
        ['.claude/commands/pharn-plan.md']: contentHash(
          join(proj, '.claude/commands/pharn-plan.md'),
        ),
      },
    });
    loadArchetypeConfigOrExit.mockReturnValue(config);
    return config;
  }

  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    repo = join(tmp.path(), 'repo');
    mkdirSync(proj, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    cleanup = vi.fn();

    scaffoldClone(repo, '1.1.0', 'v2');
    fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
    resolveCapabilities.mockReturnValue({
      selected: [{ ...CAP, matched: ['ssr'] }],
      skipped: [],
    });
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    loadArchetypeConfigOrExit.mockReturnValue(baseConfig());
    // `update` now refuses to prompt into a dead stream, and the vitest runner
    // reports isTTY as undefined — so every test that expects to REACH the
    // confirm must open the gate. The non-TTY refusals below close it explicitly.
    setTTY(true, true);
  });
  afterEach(() => {
    vi.clearAllMocks();
    shown.length = 0;
    restoreTTY();
    restoreNodeVersion();
  });

  // The Node floor (pharn-oss's floor CLIs refuse below 24.2.0): update refuses
  // FIRST — ahead of the config load, the TTY gate and every network call — and
  // writes nothing, `--yes` and `--force` included.
  describe('Node floor preflight', () => {
    it.each(['24.1.9', '22.18.0', '20.13.0'])(
      'refuses on Node %s: exit 1, before the config load and any network call',
      async (v) => {
        await installed();
        loadArchetypeConfigOrExit.mockClear();
        setNodeVersion(v);

        await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

        const [msg, opts] = vi.mocked(prompts.log.error).mock.calls.at(-1)!;
        expect(msg).toContain('24.2.0');
        expect(msg).toContain(v);
        expect(msg).toContain('Nothing was written');
        expect(opts).toEqual({ output: process.stderr });
        expect(loadArchetypeConfigOrExit).not.toHaveBeenCalled();
        expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
        expect(fetchRepo).not.toHaveBeenCalled();
        expect(prompts.confirm).not.toHaveBeenCalled();
        expect(body(DOC)).toBe('constitution v1');
        expect(readPharnConfig(proj)).toBeNull();
      },
    );

    it('is not bypassed by --yes or --force', async () => {
      await installed();
      setNodeVersion('22.18.0');

      await expect(runUpdate({ yes: true, force: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(fetchRepo).not.toHaveBeenCalled();
      expect(readPharnConfig(proj)).toBeNull();
    });

    it('refuses on an UNPARSEABLE Node version', async () => {
      await installed();
      setNodeVersion('');

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(
        String(vi.mocked(prompts.log.error).mock.calls.at(-1)![0]),
      ).toContain('could not read');
      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    });

    it('lets a supported Node through to the normal flow', async () => {
      await installed();
      setNodeVersion('24.2.0');

      await runUpdate();

      expect(fetchRemoteSkillsVersion).toHaveBeenCalled();
    });
  });

  const records = () => {
    const read = readRecords(proj);
    return read.kind === 'ok' ? read.store.files : null;
  };
  const body = (rel: string) => readFileSync(join(proj, rel), 'utf8');
  const backupDirs = () =>
    existsSync(join(proj, BACKUP_DIR))
      ? readdirSync(join(proj, BACKUP_DIR))
      : [];
  const infoLines = () =>
    vi
      .mocked(prompts.log.info)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
  // Everything the run said through the three log levels. The aborted-run backup
  // notice splits across warn (the abort line) and info (the pointer), so "did
  // the user actually see it" cannot be answered by reading one level.
  const printedLines = () =>
    [prompts.log.error, prompts.log.warn, prompts.log.info]
      .flatMap((fn) => vi.mocked(fn).mock.calls)
      .map((c) => String(c[0]))
      .join('\n');

  it('aborts before any fetch when the config is not an archetype install', async () => {
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  // One clone, ONE filename floor. The install manifest drives update's writes,
  // and it now holds the clone's product-command / hook basenames to the same
  // COPY_FILENAME_RE allowlist copyFilteredDir holds them to at `init`. Before
  // that, this exact clone was refused by `init` and copied straight in by
  // `update` — two write paths, two trust floors.
  it('refuses a clone whose product-command name fails the allowlist, and writes nothing', async () => {
    await installed();
    write(join(repo, '.claude/commands/pharn-Weird_Name.md'), 'weird');

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

    expect(printedLines()).toMatch(/pharn-Weird_Name\.md/);
    // The offending file is not installed, and the run is not a partial write:
    // the manifest throws before planUpdate, so no expected file moves either.
    expect(existsSync(join(proj, '.claude/commands/pharn-Weird_Name.md'))).toBe(
      false,
    );
    expect(body(CAP_FILE)).toBe('a11y v1');
    expect(body('.claude/commands/pharn-plan.md')).toBe('plan v1');
    expect(cleanup).toHaveBeenCalled();
  });

  // --- fatal-error reporting (FABLE 4.6 + 5.2) -------------------------------
  //
  // The hint used to print at exactly two of update's fatal exits and at none of
  // the exception-derived ones - so the first network failure a user meets, the
  // one they paste into an issue, offered no next step at all. It now rides on a
  // single axis: an exception was passed to the reporter.
  describe('fatal-error reporting', () => {
    const realDebug = process.env.PHARN_DEBUG;
    beforeEach(() => delete process.env.PHARN_DEBUG);
    afterEach(() => {
      if (realDebug === undefined) delete process.env.PHARN_DEBUG;
      else process.env.PHARN_DEBUG = realDebug;
    });

    const errored = (): string =>
      vi
        .mocked(prompts.log.error)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
    const informed = (): string =>
      vi
        .mocked(prompts.log.info)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');

    it('prints the PHARN_DEBUG hint when the version check throws, on stderr', async () => {
      await installed();
      fetchRemoteSkillsVersion.mockRejectedValueOnce(
        new Error('Could not reach raw.githubusercontent.com: fetch failed'),
      );

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('Could not reach');
      expect(informed()).toContain('PHARN_DEBUG');
      // The stream, proven at a real call site and not only at the helper's
      // definition: the vi.fn() mock would swallow a missing option silently.
      expect(vi.mocked(prompts.log.error).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
      expect(vi.mocked(prompts.log.info).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
    });

    it('prints the hint when the clone throws', async () => {
      await installed();
      fetchRepo.mockRejectedValueOnce(new Error('fetch exploded'));

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('fetch exploded');
      expect(informed()).toContain('PHARN_DEBUG');
    });

    // The other half of the axis: a curated refusal has no stack to dump, so
    // offering PHARN_DEBUG there would be a lie.
    it('prints NO hint for the non-TTY refusal', async () => {
      await installed();
      setTTY(false, false);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('interactive terminal');
      expect(informed()).not.toContain('PHARN_DEBUG');
    });

    it('prints NO hint for the MIN_CLI policy refusal', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '99.0.0\n');

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errored()).toContain('too old');
      expect(informed()).not.toContain('PHARN_DEBUG');
    });

    it('dumps the error instead of the hint under PHARN_DEBUG=1', async () => {
      process.env.PHARN_DEBUG = '1';
      const errSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      await installed();
      const boom = new Error('fetch exploded');
      fetchRepo.mockRejectedValueOnce(boom);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(errSpy).toHaveBeenCalledWith(boom);
      expect(informed()).not.toContain('PHARN_DEBUG');
      errSpy.mockRestore();
    });
  });

  // --- the proxy notice (wiring) ----------------------------------------------
  //
  // update makes TWO fetches, and the notice must precede BOTH: the
  // SKILLS_VERSION read that opens every run, and the tarball download inside
  // the lock. LIMITS.md §3a promises it of EVERY network-bearing command and
  // names this command's version check as one of those fetches in the same
  // paragraph; docs/troubleshooting.md says pharn "says so before it fetches".
  //
  // These cases previously asserted the OPPOSITE for the up-to-date early
  // return: that it stays silent "because it never clones". That reasoning
  // conflated the CLONE with the network — the early return reaches
  // fetchRemoteSkillsVersion before it returns — and the assertion promoted the
  // mistake from a code comment into the suite, so the suite DEFENDED the bug
  // and a green `npm test` was evidence for it. The inversion below is the fix;
  // it is recorded here because a test that pins a documented guarantee's
  // violation is worth naming, not quietly flipping.
  //
  // Each order case pins ORDER, not mere presence: the check runs INSIDE the
  // fetch mock, so it fires at call time and proves the warning came first.
  describe('proxy notice', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('warns before the clone', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.0.0' });
      let warnedBeforeFetch = false;
      fetchRepo.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return { dir: repo, sha: 'a'.repeat(40), cleanup };
      });

      await runUpdate();

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    // The up-to-date early return skips the CLONE, not the network: it still
    // reads SKILLS_VERSION over the wire before it returns. Skipping the notice
    // here was the bug, and this assertion used to pin it.
    it('warns before the SKILLS_VERSION fetch on the up-to-date early return, which still fetches', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.1.0' });
      let warnedBeforeFetch = false;
      fetchRemoteSkillsVersion.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return '1.1.0';
      });

      await runUpdate();

      // No clone — the early return still does what it says.
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

    // The case that would have caught the defect. `warns before the clone`
    // above was green THROUGHOUT the bug, because the notice did precede the
    // clone — it just did not precede the command's FIRST fetch, which runs
    // 100+ lines earlier and on every single run.
    it('warns before the SKILLS_VERSION fetch, not merely before the clone', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.0.0' });
      let warnedBeforeFetch = false;
      fetchRemoteSkillsVersion.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return '1.1.0';
      });

      await runUpdate();

      expect(warnedBeforeFetch).toBe(true);
    });

    // The scenario the notice exists for: a proxy-only network blocks direct
    // egress, so the fetch FAILS. Every other case here exercises a fetch that
    // succeeds, which would leave a future edit that warned only on the success
    // path (moving the block inside the try, after the await) undetected.
    it('warns before the fetch even when that fetch then fails', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.0.0' });
      let warnedBeforeFetch = false;
      fetchRemoteSkillsVersion.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        throw new Error('connect ETIMEDOUT');
      });

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    // A lock refusal now warns, and that is the point rather than a side
    // effect: the old placement was justified by "a refused run performs no
    // fetch", and this proves the premise false — the version check has already
    // gone over the wire by the time the lock is attempted.
    it('warns even when the lock is held, because the version fetch already happened', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.0.0' });
      // This process is alive by definition, so a same-host lock naming it is live.
      writeFileSync(
        join(proj, LOCK_FILE),
        `${JSON.stringify({
          pid: process.pid,
          host: hostname(),
          command: 'add',
          startedAt: new Date().toISOString(),
        })}\n`,
      );

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(fetchRemoteSkillsVersion).toHaveBeenCalled();
      // F-24: the plan snapshot is fetched before the confirm, so a run the
      // lock refuses has downloaded the tarball — and cleaned it up.
      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(existsSync(join(proj, RECORDS_FILE))).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    // One warning per run, on either path. This pins what the user SEES; it
    // cannot see source shape — a block duplicated into both paths would still
    // emit exactly one warning per run, because they are mutually exclusive.
    // That the source has a single call site is advisory (the comment and
    // review), not something a count can check.
    it.each([
      ['the up-to-date early return', '1.1.0'],
      ['the full update path', '1.0.0'],
    ])('warns exactly once on %s', async (_label, skillsVersion) => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      vi.stubEnv('HTTPS_PROXY', 'http://proxy.internal:3128');
      await installed({ skillsVersion });

      await runUpdate();

      const notices = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .filter((m) => m.includes('will not use it'));
      expect(notices).toHaveLength(1);
    });

    // The promptless local step still wins. An uninitialized directory deserves
    // its actionable "run pharn init", not a note about a transport it will
    // never reach — and the refusal still costs zero round-trips.
    it('stays silent when the config load refuses, which comes first', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      loadArchetypeConfigOrExit.mockImplementationOnce(() => {
        throw new ProcessExit(1);
      });

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('will not use it');
    });

    // Same principle one step later: the TTY gate refuses before any network
    // call, so a piped run without --yes gets its actionable error and nothing
    // about proxies.
    it('stays silent when the TTY gate refuses, which also comes first', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      await installed({ skillsVersion: '1.0.0' });
      setTTY(false, false);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('will not use it');
    });

    it('says nothing when no proxy variable is set', async () => {
      vi.stubEnv('https_proxy', undefined);
      vi.stubEnv('HTTPS_PROXY', undefined);
      await installed({ skillsVersion: '1.0.0' });

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('will not use it');
    });
  });

  it('reports already up to date without cloning', async () => {
    await installed({ skillsVersion: '1.1.0' });
    await runUpdate();
    expect(prompts.outro).toHaveBeenCalledWith(
      'Already up to date (skills v1.1.0).',
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  // F-09: the same-version early return used to skip planning outright, so a
  // file (or capability dir) deleted at the current version stayed gone until
  // upstream bumped SKILLS_VERSION or the user reached for `--force`. A LOCAL,
  // read-only check now re-opens it; a complete install still early-returns.
  describe('same version, install incomplete', () => {
    const noteText = () =>
      vi
        .mocked(prompts.note)
        .mock.calls.map((c) => stripVTControlCharacters(String(c[0])))
        .join('\n');

    it('restores a missing RECORDED file without --force', async () => {
      await installed({ skillsVersion: '1.1.0' });
      rmSync(join(proj, DOC));

      await runUpdate();

      expect(prompts.outro).not.toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(noteText()).toContain(`${DOC} is missing`);
      expect(body(DOC)).toBe('constitution v2');
      expect(records()![DOC]).toBe(contentHash(join(proj, DOC)));
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
      expect(backupDirs()).toEqual([]);
    });

    it('restores a missing capability dir even with no records store', async () => {
      await installed({ skillsVersion: '1.1.0' });
      rmSync(join(proj, RECORDS_FILE));
      rmSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });

      await runUpdate();

      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(noteText()).toContain('pharn-pipeline/grillers/a11y is missing');
      expect(body(CAP_FILE)).toBe('a11y v2');
    });

    it('closes again after the restoring run: the next run early-returns', async () => {
      await installed({ skillsVersion: '1.1.0' });
      rmSync(join(proj, DOC));
      await runUpdate();
      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj)!);
      vi.clearAllMocks();
      fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');

      await runUpdate();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('a complete install still early-returns, with no fetch beyond the version check', async () => {
      await installed({ skillsVersion: '1.1.0' });
      await runUpdate();
      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRemoteSkillsVersion).toHaveBeenCalledTimes(1);
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(prompts.confirm).not.toHaveBeenCalled();
    });

    // A symlinked component is not "missing": the real run refuses to write
    // through it, so re-opening could not repair it and would loop forever.
    it('a recorded path behind a symlinked dir does not re-open it', async () => {
      await installed({ skillsVersion: '1.1.0' });
      const outside = join(tmp.path(), 'outside');
      mkdirSync(outside);
      rmSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });
      symlinkSync(outside, join(proj, 'pharn-pipeline/grillers/a11y'));

      await runUpdate();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // The scenario `pharn remove`'s warning describes. `remove` drops the
    // config entry AND prunes its records, so nothing LOCAL is left to say the
    // capability is gone; only the upstream index (which the early return
    // never fetches) knows the archetypes select it. So the same-version run
    // leaves it removed, and the next run that re-applies — a version bump, or
    // `--force` — reinstalls it. The warning says exactly that.
    it('an auto capability removed at the current version stays removed until a run re-applies', async () => {
      await installed({ skillsVersion: '1.1.0' });
      rmSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });
      const removed = baseConfig({ skillsVersion: '1.1.0', capabilities: [] });
      const { [CAP_FILE]: _gone, ...kept } = records()!;
      await writeRecords(proj, {
        skillsVersion: '1.1.0',
        commit: null,
        files: kept,
      });
      loadArchetypeConfigOrExit.mockReturnValue(removed);

      await runUpdate();
      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(existsSync(join(proj, CAP_FILE))).toBe(false);

      await runUpdate({ force: true });
      expect(body(CAP_FILE)).toBe('a11y v2');
      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
      ]);
    });
  });

  // F-22: `add` writes pharn.records.json (stamped with the new commit) BEFORE
  // pharn.config.json, so a torn add leaves a store stamped for a state the
  // config never reached. The baseline then reads as unavailable, and the
  // same-version early return used to say "Already up to date" over it — so
  // the NEXT version bump degraded every differing file to `unverifiable`. A
  // store that PARSES but is stamped for another state now re-opens the run,
  // which re-records the install at the config's stamp; an ABSENT or corrupt
  // store does not (nothing torn to repair, and a corrupt one is the user's to
  // fix — re-minting it would discard what they could still recover).
  describe('same version, records stamped for another install state (F-22)', () => {
    const noteText = () =>
      vi
        .mocked(prompts.note)
        .mock.calls.map((c) => stripVTControlCharacters(String(c[0])))
        .join('\n');
    const RELS = [CAP_FILE, DOC, HOOK, '.claude/commands/pharn-plan.md'];
    const TORN_COMMIT = 'b'.repeat(40);

    // An install that is CURRENT (its bytes are the clone's v1.1.0) whose store
    // a torn `add` stamped with a commit the config never got.
    async function tornAdd(): Promise<PharnConfig> {
      for (const rel of RELS)
        write(join(proj, rel), readFileSync(join(repo, rel), 'utf8'));
      const config = baseConfig({ skillsVersion: '1.1.0' });
      await writePharnConfig(proj, config);
      await writeRecords(proj, {
        skillsVersion: '1.1.0',
        commit: TORN_COMMIT,
        files: Object.fromEntries(
          RELS.map((rel) => [rel, contentHash(join(proj, rel))]),
        ),
      });
      loadArchetypeConfigOrExit.mockReturnValue(config);
      return config;
    }

    it('re-opens the early return and names the reason in the header', async () => {
      await tornAdd();

      await runUpdate();

      expect(prompts.outro).not.toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(noteText()).toContain(
        `${RECORDS_FILE} is stamped for a different install state than pharn.config.json`,
      );
      expect(noteText()).toContain(
        'this run re-applies the install and records it again',
      );
    });

    it('re-records the store at the config stamp, so the next run early-returns', async () => {
      await tornAdd();

      await runUpdate();

      const read = readRecords(proj);
      expect(read.kind).toBe('ok');
      if (read.kind !== 'ok') return;
      const config = readPharnConfig(proj)!;
      expect(read.store.skillsVersion).toBe(config.skillsVersion);
      expect(read.store.commit).toBe(config.commit);
      expect(read.store.commit).not.toBe(TORN_COMMIT);
      for (const rel of RELS)
        expect(read.store.files[rel]).toBe(contentHash(join(proj, rel)));
      expect(backupDirs()).toEqual([]);

      loadArchetypeConfigOrExit.mockReturnValue(config);
      vi.clearAllMocks();
      fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');

      await runUpdate();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // The consequence the fix exists for: after the repair, the next version
    // bump is a clean upgrade instead of a wall of `unverifiable` skips.
    it('lets the next version bump upgrade cleanly instead of skipping unverifiable', async () => {
      await tornAdd();
      await runUpdate();

      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj)!);
      vi.clearAllMocks();
      scaffoldClone(repo, '1.2.0', 'v3');
      fetchRepo.mockResolvedValue({ dir: repo, sha: 'c'.repeat(40), cleanup });
      fetchRemoteSkillsVersion.mockResolvedValue('1.2.0');

      await runUpdate();

      for (const rel of RELS) expect(body(rel)).toContain('v3');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.2.0');
      expect(noteText()).not.toContain('unverifiable');
    });

    it('an ABSENT store does not re-open it', async () => {
      await tornAdd();
      rmSync(join(proj, RECORDS_FILE));

      await runUpdate();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(existsSync(join(proj, RECORDS_FILE))).toBe(false);
    });

    it('a CORRUPT store does not re-open it, and is left byte-identical', async () => {
      await tornAdd();
      writeFileSync(join(proj, RECORDS_FILE), '{ not json');

      await runUpdate();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe('{ not json');
    });

    it('a store whose stamp matches still early-returns', async () => {
      await tornAdd();
      await writeRecords(proj, {
        skillsVersion: '1.1.0',
        commit: null,
        files: records()!,
      });

      await runUpdate();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // The ahead-of-source guard still wins: a stale store cannot carry a
    // downgrade in, because the guard runs before every re-open.
    it('does not re-open an install ahead of its source', async () => {
      await tornAdd();
      loadArchetypeConfigOrExit.mockReturnValue(
        baseConfig({ skillsVersion: '2.0.0' }),
      );

      await runUpdate();

      expect(fetchRepo).not.toHaveBeenCalled();
      expect(String(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0])).toContain(
        'newer than pharn-oss main',
      );
    });
  });

  // F-24: the plan is fetched BEFORE the confirm (so it can name what changes);
  // a declined run has paid for that one download, cleans it up, and writes
  // nothing.
  it('cancels when declined — one clone, cleaned up, nothing written', async () => {
    await installed();
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(0));
    expect(fetchRepo).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(body(DOC)).toBe('constitution v1');
    expect(readPharnConfig(proj)).toBeNull();
    expect(backupDirs()).toEqual([]);
  });

  it('fetches ONCE per run: the locked re-plan reuses the confirmed clone', async () => {
    await installed();
    await runUpdate();
    expect(fetchRepo).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(body(DOC)).toBe('constitution v2');
  });

  it('asks "Apply this update?" (default Yes) when nothing is deleted', async () => {
    await installed();
    await runUpdate();
    expect(prompts.confirm).toHaveBeenCalledWith({
      message: 'Apply this update?',
      initialValue: true,
    });
  });

  it('asks with the --force wording under --force', async () => {
    await installed();
    await runUpdate({ force: true });
    expect(prompts.confirm).toHaveBeenCalledWith({
      message: 'Apply this update and overwrite your changes?',
      initialValue: true,
    });
  });

  // The MIN_CLI refusal is answered from the snapshot clone — before the user
  // is asked, not after.
  it('refuses a MIN_CLI newer than this CLI BEFORE the confirm: exit 1, nothing written', async () => {
    await installed();
    write(join(repo, 'MIN_CLI'), '99.0.0\n');
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(body(DOC)).toBe('constitution v1');
    expect(readPharnConfig(proj)).toBeNull();
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });

  it('a failed download stops the run before the confirm: exit 1', async () => {
    await installed();
    fetchRepo.mockRejectedValueOnce(new Error('could not reach codeload'));
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(body(DOC)).toBe('constitution v1');
  });

  // The non-TTY refusal still costs ZERO round-trips: the TTY gate runs before
  // the version check, the release resolve and the plan download alike.
  it('a non-TTY refusal makes no network call at all', async () => {
    await installed();
    setTTY(false, false);
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    expect(resolveSource).not.toHaveBeenCalled();
    expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('takes the lock AFTER the confirm — a declined run creates none', async () => {
    // The half of audit finding P-9 that was deliberately NOT changed. The
    // acquisition moved to just BEFORE the fetch, which in `update` is already
    // after the confirm, so no human prompt is ever held under the lock. If a
    // later refactor hoisted it above the confirm — to close update's one
    // remaining small round-trip (fetchRemoteSkillsVersion) — then an unanswered
    // prompt would refuse every other pharn run in this project for up to
    // STALE_MS. This is the test that fails when that happens.
    await installed();
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(0));
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });

  it('leaves no lock behind after a completed run', async () => {
    await installed();
    await runUpdate();
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });

  // --- the two network failures: exit code + EFFECTS, not wording -------------
  //
  // `update` makes exactly two network calls — the SKILLS_VERSION read and the
  // clone — and each has its own catch that reports and exits 1. The
  // fatal-error suite above pins what those catches SAY (the message, the
  // PHARN_DEBUG hint, the stream); nothing pinned what a failed run LEAVES
  // BEHIND, or how far it got before giving up. Those are the two properties a
  // refactor breaks silently, and a `pharn update` that reports success having
  // written nothing is the same automation failure shape the TTY gate exists to
  // eliminate. No message string is asserted here on purpose: the wording is
  // owned by the fatal-error suite above and may change without touching this.
  describe('network failure', () => {
    it('version check fails: exit 1 before the confirm and before any clone', async () => {
      await installed();
      const recorded = { ...records()! };
      fetchRemoteSkillsVersion.mockRejectedValueOnce(new Error('offline'));

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      // The ORDER is the property worth pinning: the cheap version read gates
      // the expensive clone, so a run that cannot even reach SKILLS_VERSION
      // costs zero fetches — and never asks the user to approve work it already
      // knows it cannot do. A reorder that cloned first would still report and
      // still exit 1, so only these two absences would notice.
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(prompts.confirm).not.toHaveBeenCalled();
      // Nothing written. A completed update writes pharn.config.json into the
      // project; its absence is the proof — and it is the withheld-bump rule at
      // its strongest, since no version can advance over bytes never fetched.
      expect(readPharnConfig(proj)).toBeNull();
      expect(body(DOC)).toBe('constitution v1');
      expect(body(CAP_FILE)).toBe('a11y v1');
      // The record store is byte-stable AND still describes the disk: a store
      // that had drifted from the files would satisfy only the first half.
      expect(records()).toEqual(recorded);
      expect(records()![DOC]).toBe(contentHash(join(proj, DOC)));
      expect(backupDirs()).toEqual([]);
    });

    it('clone fails: exit 1, no clone to clean up, nothing written', async () => {
      await installed();
      const recorded = { ...records()! };
      fetchRepo.mockRejectedValueOnce(new Error('offline'));

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      // The mirror of "a SUCCESSFUL clone is always cleaned up before the exit":
      // there is no temp directory on this path at all, so nothing is cleaned
      // up and the fetch is attempted exactly once. `cleanup` is reachable ONLY
      // through a fetchRepo that resolved, so the call count is what makes the
      // pair falsifiable — a retry, or a second salvage fetch, breaks it while
      // the message assertions above stay green.
      expect(cleanup).not.toHaveBeenCalled();
      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(readPharnConfig(proj)).toBeNull();
      expect(body(DOC)).toBe('constitution v1');
      expect(body(CAP_FILE)).toBe('a11y v1');
      expect(records()).toEqual(recorded);
      expect(records()![DOC]).toBe(contentHash(join(proj, DOC)));
      expect(backupDirs()).toEqual([]);
    });
  });

  // --- non-interactive honesty: the TTY gate + the real --yes ----------------
  //
  // The bug this closes: off a TTY the confirm above cancelled on stream end and
  // routed through cancelAndExit's exit(0) — `echo "" | pharn update` reported
  // success having updated nothing. A pipeline that "passes" having done nothing
  // is the worst failure shape for automation, so the refusal is exit 1.
  describe('non-interactive (TTY gate + --yes)', () => {
    it('refuses in a NON-TTY, before any network call, and writes nothing', async () => {
      await installed();
      setTTY(false, false);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      // Zero network: the refusal precedes even the lightweight version check.
      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(body(DOC)).toBe('constitution v1');
      // A completed update writes pharn.config.json into the project; its
      // absence is the proof that this run wrote nothing at all.
      expect(readPharnConfig(proj)).toBeNull();
    });

    it('names BOTH ways out — an interactive terminal and --yes', async () => {
      await installed();
      setTTY(false, false);
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      const [msg] = vi.mocked(prompts.log.error).mock.calls.at(-1)!;
      expect(msg).toContain('--yes');
      expect(msg).toContain('interactive terminal');
    });

    it('refuses when only ONE stream is a TTY (both must be)', async () => {
      await installed();
      setTTY(true, false);
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    });

    // inv-9: the config error is the ACTIONABLE one, so it must win. A user in an
    // uninitialized directory needs "run pharn init", not a TTY lecture about a
    // prompt they would never have reached.
    it('lets the config error win over the TTY message in an uninitialized dir', async () => {
      setTTY(false, false);
      loadArchetypeConfigOrExit.mockImplementationOnce(() => {
        throw new ProcessExit(1);
      });

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(prompts.log.error).not.toHaveBeenCalled();
      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    });

    it('--yes runs the FULL update in a non-TTY without ever calling confirm', async () => {
      await installed();
      setTTY(false, false);

      await expect(runUpdate({ yes: true })).resolves.toBeUndefined();

      expect(prompts.confirm).not.toHaveBeenCalled();
      // Byte-equivalent to the interactive happy path: the note still printed,
      // the files landed, the version advanced, the summary rendered.
      expect(prompts.note).toHaveBeenCalled();
      expect(body(CAP_FILE)).toBe('a11y v2');
      expect(body(DOC)).toBe('constitution v2');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
      expect(prompts.outro).toHaveBeenCalled();
    });

    it('--yes behaves identically WITH a TTY — it means "do not ask", not "non-interactive"', async () => {
      await installed();
      setTTY(true, true);

      await runUpdate({ yes: true });

      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(body(DOC)).toBe('constitution v2');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
    });

    // inv-4c: `--force` is an overwrite POLICY, not a confirmation bypass. The
    // shortcut "force implies yes" is the tempting mis-implementation, and it
    // would silently auto-confirm the most destructive run pharn offers.
    it('--force WITHOUT --yes still refuses in a non-TTY', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      setTTY(false, false);

      await expect(runUpdate({ force: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
      expect(body(DOC)).toBe('MY LOCAL EDIT');
      expect(backupDirs()).toEqual([]);
    });

    it('--yes --force composes: the forced path runs unprompted and backs up', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      setTTY(false, false);

      await runUpdate({ force: true, yes: true });

      expect(prompts.confirm).not.toHaveBeenCalled();
      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      expect(readFileSync(join(proj, BACKUP_DIR, dirs[0]!, DOC), 'utf8')).toBe(
        'MY LOCAL EDIT',
      );
      expect(body(DOC)).toBe('constitution v2');
    });

    it('--yes at the current version early-returns "Already up to date", exit 0', async () => {
      await installed({ skillsVersion: '1.1.0' });
      setTTY(false, false);

      await expect(runUpdate({ yes: true })).resolves.toBeUndefined();

      expect(prompts.outro).toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // inv-4d: --yes must not touch the drift-safe skip semantics. A skip is a
    // decision the user asked for, so it stays exit 0 and still withholds the
    // version bump — `pharn status --strict` remains the CI drift gate.
    it('--yes leaves the skip semantics alone: exit 0, version still withheld', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      setTTY(false, false);

      await expect(runUpdate({ yes: true })).resolves.toBeUndefined();

      expect(body(DOC)).toBe('MY LOCAL EDIT');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.0.0');
      expect(body(CAP_FILE)).toBe('a11y v2');
    });

    // inv-6b: the premise --yes rests on. `--yes` is sold as a COMPLETE bypass of
    // update's interactivity, which is only true while the confirm is update's
    // ONLY prompt. A future prompt added below the gate would silently re-open
    // the very bug this increment closes, and nothing else would catch it.
    it('the confirm is update.ts ONLY prompt (the premise --yes rests on)', () => {
      const here = fileURLToPath(import.meta.url);
      const src = readFileSync(
        join(here, '..', '..', 'src', 'commands', 'update.ts'),
        'utf8',
      );
      const clackPromptApis = [
        'autocomplete',
        'autocompleteMultiselect',
        'confirm',
        'date',
        'groupMultiselect',
        'multiline',
        'multiselect',
        'password',
        'path',
        'select',
        'selectKey',
        'text',
      ] as const;
      const prompted = [
        ...src.matchAll(
          new RegExp(`\\bawait (${clackPromptApis.join('|')})\\(`, 'g'),
        ),
      ].map((m) => m[1]);
      expect(prompted).toEqual(['confirm']);
    });
  });

  it('upgrades every pristine file and refreshes its record', async () => {
    await installed();

    await runUpdate();

    expect(body(CAP_FILE)).toBe('a11y v2');
    expect(body(DOC)).toBe('constitution v2');
    expect(records()?.[DOC]).toBe(contentHash(join(repo, DOC)));
    // A complete run advances the recorded version + commit.
    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.1.0');
    expect(config.commit).toBe('a'.repeat(40));
    expect(cleanup).toHaveBeenCalled();
  });

  // --- the channel: main by default, verified releases with `--ref latest` ---
  //
  // The default installs the tip of pharn-oss main; `--ref latest` opts into the
  // newest pharn-oss release (tagged only after its post-merge CI passed) and is
  // RECORDED, so later runs keep following it until `--ref main`.
  describe('release channel', () => {
    it('installs the tip of main by default, recording no ref', async () => {
      await installed();

      await runUpdate();

      expect(resolveSource).toHaveBeenCalledWith('main');
      expect(fetchRemoteSkillsVersion).toHaveBeenCalled();
      expect(fetchRepo).toHaveBeenCalledWith({ kind: 'main' });
      expect(readPharnConfig(proj)!.ref).toBeUndefined();
    });

    it('--ref latest installs the verified release at its commit and RECORDS the channel', async () => {
      await installed();

      await runUpdate({ ref: 'latest' });

      expect(resolveSource).toHaveBeenCalledWith('latest');
      expect(fetchRepo).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'release', tag: 'v1.1.0' }),
      );
      expect(readPharnConfig(proj)!.ref).toBe('latest');
    });

    it('follows verified releases without the flag once the config records it', async () => {
      await installed({ ref: 'latest' });

      await runUpdate();

      expect(resolveSource).toHaveBeenCalledWith('latest');
      expect(readPharnConfig(proj)!.ref).toBe('latest');
    });

    it('refuses with exit 1, before any clone, when the release cannot be resolved', async () => {
      await installed({ ref: 'latest' });
      resolveSource.mockRejectedValueOnce(
        new ReleaseResolveError(
          'Could not resolve the latest verified release: HTTP 404. … --ref main',
        ),
      );

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(fetchRepo).not.toHaveBeenCalled();
      expect(
        String(vi.mocked(prompts.log.error).mock.calls.at(-1)![0]),
      ).toContain('--ref main');
      expect(readPharnConfig(proj)).toBeNull();
    });

    // An install made from main can be NEWER than the newest release. Applying
    // the release would be a downgrade presented as an update.
    it('does not downgrade an install that is AHEAD of the release', async () => {
      await installed({ skillsVersion: '1.2.0' });

      await runUpdate({ ref: 'latest' });

      const outro = String(vi.mocked(prompts.outro).mock.calls.at(-1)![0]);
      expect(outro).toContain('ahead of the latest verified release (v1.1.0)');
      expect(outro).toContain('--ref main');
      expect(outro).toContain('--force');
      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(body(DOC)).toBe('constitution v1');
      expect(readPharnConfig(proj)).toBeNull();
    });

    it('--force goes back to the release from an install that is ahead', async () => {
      await installed({ skillsVersion: '1.2.0' });

      await runUpdate({ ref: 'latest', force: true });

      expect(fetchRepo).toHaveBeenCalled();
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
    });

    // F-15: pharn-oss main can move BACK — a revert of its SKILLS_VERSION. The
    // install is then ahead of the tip, and applying the tip would be the same
    // downgrade presented as an update (`v1.2.0 → v1.1.0` over every file), so
    // the main channel gets the release channel's guard: refused, exit 0,
    // nothing changed, unless `--force`.
    describe('an install AHEAD of main (main moved back)', () => {
      const outroText = (): string =>
        String(vi.mocked(prompts.outro).mock.calls.at(-1)![0]);

      it('refuses the downgrade without --force: exit 0, nothing fetched or written', async () => {
        await installed({ skillsVersion: '1.2.0' });

        await runUpdate();

        expect(resolveSource).toHaveBeenCalledWith('main');
        expect(outroText()).toContain(
          'newer than pharn-oss main (v1.1.0) — main has moved back',
        );
        expect(outroText()).toContain('skills v1.2.0');
        expect(outroText()).toContain('Nothing changed');
        expect(outroText()).toContain('pharn update --force');
        expect(prompts.confirm).not.toHaveBeenCalled();
        expect(fetchRepo).not.toHaveBeenCalled();
        expect(body(DOC)).toBe('constitution v1');
        expect(readPharnConfig(proj)).toBeNull();
      });

      it('--force downgrades to main as before', async () => {
        await installed({ skillsVersion: '1.2.0' });

        await runUpdate({ force: true });

        expect(fetchRepo).toHaveBeenCalledWith({ kind: 'main' });
        expect(body(DOC)).toBe('constitution v2');
        expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
      });

      it('--yes skips the confirm, never the guard', async () => {
        await installed({ skillsVersion: '1.2.0' });

        await runUpdate({ yes: true });

        expect(fetchRepo).not.toHaveBeenCalled();
        expect(readPharnConfig(proj)).toBeNull();
      });

      // A pending version is what every file but the user's kept edits is at;
      // stepping those files back to an older tip is the same downgrade, even
      // though the recorded `skillsVersion` is older than the tip.
      it('refuses when the PENDING version is ahead of main', async () => {
        await installed({
          skillsVersion: '1.0.0',
          pendingSkillsVersion: '1.2.0',
        });

        await runUpdate();

        expect(outroText()).toContain('newer than pharn-oss main (v1.1.0)');
        expect(outroText()).toContain('v1.2.0');
        expect(fetchRepo).not.toHaveBeenCalled();
        expect(readPharnConfig(proj)).toBeNull();
      });

      it('still upgrades when the pending version is BEHIND main', async () => {
        await installed({
          skillsVersion: '1.0.0',
          pendingSkillsVersion: '1.0.5',
        });

        await runUpdate();

        expect(fetchRepo).toHaveBeenCalled();
        expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
      });

      // The guard runs BEFORE everything that re-opens the same-version early
      // return, so none of them can sneak the downgrade in.
      it('runs before a frozen-capability re-check', async () => {
        await installed({
          skillsVersion: '1.2.0',
          frozenCapabilities: ['griller:backwards-compat'],
        });

        await runUpdate();

        expect(outroText()).toContain('newer than pharn-oss main');
        expect(fetchRepo).not.toHaveBeenCalled();
      });

      it('runs before an old-format models conversion', async () => {
        await installed({
          skillsVersion: '1.2.0',
          models: {
            default: { model: 'sonnet-5', effort: 'high' },
            stages: { plan: { model: 'opus-4-8', effort: 'max' } },
          },
        });

        await runUpdate();

        expect(outroText()).toContain('newer than pharn-oss main');
        expect(fetchRepo).not.toHaveBeenCalled();
      });

      it('runs before a channel switch: `--ref main` on a release install is not recorded', async () => {
        const config = await installed({
          skillsVersion: '1.2.0',
          ref: 'latest',
        });
        await writePharnConfig(proj, config);

        await runUpdate({ ref: 'main' });

        expect(resolveSource).toHaveBeenCalledWith('main');
        expect(outroText()).toContain('newer than pharn-oss main');
        expect(fetchRepo).not.toHaveBeenCalled();
        expect(readPharnConfig(proj)!.ref).toBe('latest');
      });

      it('an equal version is still "Already up to date", never ahead', async () => {
        await installed({ skillsVersion: '1.1.0' });

        await runUpdate();

        expect(outroText()).toBe('Already up to date (skills v1.1.0).');
      });
    });

    it('--ref main switches a release install back to main', async () => {
      await installed({ ref: 'latest' });

      await runUpdate({ ref: 'main' });

      expect(resolveSource).toHaveBeenCalledWith('main');
      expect(readPharnConfig(proj)!.ref).toBeUndefined();
    });

    // Otherwise the same-version early return would swallow the switch and the
    // next run would silently revert to the old channel.
    it('records a channel switch even at the current version', async () => {
      await installed({ skillsVersion: '1.1.0' });

      await runUpdate({ ref: 'latest' });

      expect(prompts.outro).not.toHaveBeenCalledWith(
        'Already up to date (skills v1.1.0).',
      );
      expect(fetchRepo).toHaveBeenCalled();
      expect(readPharnConfig(proj)!.ref).toBe('latest');
    });

    it('names the source in the version note', async () => {
      await installed({ ref: 'latest' });

      await runUpdate();

      const notes = vi
        .mocked(prompts.note)
        .mock.calls.map(([m]) => stripVTControlCharacters(String(m)))
        .join('\n');
      expect(notes).toContain('verified release v1.1.0');
    });
  });

  // PHARN-04: new upstream hook wiring is REPORTED, and settings.json is never
  // written — the old silence let the 6.1.0 / 6.12.0 re-wiring go unnoticed.
  it('reports upstream hooks missing from settings.json and leaves the file byte-identical', async () => {
    await installed();
    const oldSettings = JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command', command: 'node .claude/hooks/x.cjs' }],
          },
        ],
      },
    });
    write(join(proj, '.claude/settings.json'), oldSettings);
    write(
      join(repo, '.claude/settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node',
                  args: ['.claude/hooks/require-loop-record.cjs'],
                },
              ],
            },
          ],
        },
      }),
    );

    await runUpdate();

    const hooksNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'HOOKS');
    expect(String(hooksNote?.[0])).toContain(
      'Stop: {"type":"command","command":"node","args":[".claude/hooks/require-loop-record.cjs"]}',
    );
    expect(body('.claude/settings.json')).toBe(oldSettings);
  });

  it('prints no HOOKS note when upstream ships no settings.json', async () => {
    await installed();
    await runUpdate();
    expect(
      vi.mocked(prompts.note).mock.calls.some((c) => c[1] === 'HOOKS'),
    ).toBe(false);
  });

  // F-10: a declared surface the clone ships no file for is NAMED — never a
  // silent existence-guarded skip — and, being nothing on disk, withholds
  // nothing.
  it('names every declared surface the clone does not ship in a NOT SHIPPED note, and still records the new version', async () => {
    await installed();
    await runUpdate();
    const notShipped = String(
      vi
        .mocked(prompts.note)
        .mock.calls.find((c) => c[1] === 'NOT SHIPPED')?.[0],
    );
    // The scaffold ships commands, hooks and CONSTITUTION.md only.
    expect(notShipped).toContain('pharn-contracts (contracts)');
    expect(notShipped).toContain('.dev/floor (floor)');
    expect(notShipped).toContain('LICENSE (license)');
    expect(notShipped).toContain('LIMITS.md (trusted-doc)');
    expect(notShipped).not.toContain('(hooks)');
    expect(notShipped).not.toContain('(commands)');
    expect(notShipped).not.toContain('CONSTITUTION.md');
    expect(readPharnConfig(proj)?.skillsVersion).toBe('1.1.0');
  });

  it('prints no NOT SHIPPED note when the clone ships every declared surface', async () => {
    await installed();
    for (const rel of [
      'ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
      'LICENSE',
      'features/README.md',
      'pharn-contracts/finding-shape.md',
      '.dev/floor/validate.mjs',
    ])
      write(join(repo, rel), 'x');
    await runUpdate();
    expect(
      vi.mocked(prompts.note).mock.calls.some((c) => c[1] === 'NOT SHIPPED'),
    ).toBe(false);
  });

  it('copies an .mjs hook upstream ships, and never its .test.mjs', async () => {
    await installed();
    write(join(repo, '.claude/hooks/require-loop-record.mjs'), 'esm');
    write(join(repo, '.claude/hooks/require-loop-record.test.mjs'), 'TEST');
    await runUpdate();
    expect(body('.claude/hooks/require-loop-record.mjs')).toBe('esm');
    expect(
      existsSync(join(proj, '.claude/hooks/require-loop-record.test.mjs')),
    ).toBe(false);
  });

  // PHARN-05: a bump withheld ONLY by the user's own kept edits records the
  // version it did apply, so `pharn add` is not dead-ended by one kept edit.
  it("records pendingSkillsVersion when only the user's edits were skipped", async () => {
    await installed();
    write(join(proj, DOC), 'MY LOCAL EDIT');

    await runUpdate();

    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.0.0');
    expect(config.pendingSkillsVersion).toBe('1.1.0');
    expect(body(CAP_FILE)).toBe('a11y v2');
  });

  it('records NO pendingSkillsVersion when a skip is not a user edit (no usable records)', async () => {
    await installed();
    rmSync(join(proj, RECORDS_FILE));
    write(join(proj, DOC), 'MY LOCAL EDIT');

    await runUpdate();

    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.0.0');
    expect(config.pendingSkillsVersion).toBeUndefined();
  });

  it('a complete run clears a previous pendingSkillsVersion', async () => {
    await installed({ pendingSkillsVersion: '1.0.5' });

    await runUpdate();

    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.1.0');
    expect(config.pendingSkillsVersion).toBeUndefined();
  });

  it('re-resolves the RECORDED archetypes against the fresh index, and UNIONS the result with the manual entries', async () => {
    // This test used to pin only the re-resolve call — which was true of the
    // wholesale-replace bug too. The re-resolve still happens; what it now also
    // pins is that the resolved set does NOT become the config verbatim.
    await installed({
      capabilities: [
        CAP,
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ],
    });
    resolveCapabilities.mockReturnValue({
      selected: [{ ...CAP, matched: ['ssr'] }],
      skipped: [{ name: 'n-plus-one', role: 'lens', reason: 'not for ssr' }],
    });

    await runUpdate();

    expect(resolveCapabilities).toHaveBeenCalledWith(['ssr'], {
      capabilities: [],
      unknown: [],
    });
    expect(readPharnConfig(proj)!.capabilities).toEqual([
      { ...CAP, source: 'auto' },
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Capability membership: the union, the report, and the acceptance scenario.
  // Before this, `update` replaced `capabilities` wholesale — deleting manual
  // adds and resurrecting removals, both in total silence.
  // -------------------------------------------------------------------------
  describe('capability membership', () => {
    const MANUAL_FILE = 'pharn-review/n-plus-one/n-plus-one.md';

    // Add a lens to the CLONE (so it is in the install manifest) and, when
    // `inProject`, to the project + its records — i.e. what `pharn add` leaves.
    async function withManualLens(inProject: boolean): Promise<void> {
      write(join(repo, MANUAL_FILE), 'n-plus-one v2');
      if (!inProject) return;
      write(join(proj, MANUAL_FILE), 'n-plus-one v1');
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          ...read.store.files,
          [MANUAL_FILE]: contentHash(join(proj, MANUAL_FILE)),
        },
      });
    }

    // The resolver selects a11y only; n-plus-one exists upstream but is not
    // selected for these archetypes (exactly the live `lens:n-plus-one` case).
    function selectsA11yOnly(): void {
      resolveCapabilities.mockReturnValue({
        selected: [{ ...CAP, matched: ['ssr'] }],
        skipped: [
          { name: 'n-plus-one', role: 'lens', reason: 'applies to [backend]' },
        ],
      });
    }

    // The POST-RUN report: since F-24 the same note also prints, in the future
    // tense, before the confirm (see previewNote).
    const capNote = () =>
      vi
        .mocked(prompts.note)
        .mock.calls.filter((c) => c[1] === 'CAPABILITIES')
        .at(-1)?.[0];

    // ACCEPTANCE (the reported e2e, inverted): a LEGACY manual entry — no
    // `source`, because it predates the field — must survive the first
    // post-upgrade update, with its files upgraded and its records intact.
    it('preserves a LEGACY (source-less) manual entry, upgrades its files, and keeps its records', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [CAP, { name: 'n-plus-one', role: 'lens' }],
      });
      await withManualLens(true);
      selectsA11yOnly();

      await runUpdate();

      // Still in the config — now explicitly tagged as the user's.
      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ]);
      // First-class in the manifest: its bytes upgraded like any other file...
      expect(body(MANUAL_FILE)).toBe('n-plus-one v2');
      // ...and its record survived rather than being pruned.
      expect(records()?.[MANUAL_FILE]).toBe(
        contentHash(join(repo, MANUAL_FILE)),
      );
      // And the preservation was NAMED, not silent.
      expect(capNote()).toContain('lens:n-plus-one');
      expect(capNote()).toContain('KEPT');
    });

    it('is IDEMPOTENT — a second run leaves capabilities byte-stable and reports no membership change', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [CAP, { name: 'n-plus-one', role: 'lens' }],
      });
      await withManualLens(true);
      selectsA11yOnly();
      await runUpdate();
      const afterFirst = readPharnConfig(proj)!.capabilities;

      // A plain second run would early-return on the version gate, so bypass it
      // the way the rest of this suite does.
      vi.clearAllMocks();
      selectsA11yOnly();
      fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
      parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
      vi.mocked(prompts.confirm).mockResolvedValue(true);
      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj)!);

      await runUpdate({ force: true });

      expect(readPharnConfig(proj)!.capabilities).toEqual(afterFirst);
      expect(capNote()).toBeUndefined();
    });

    it('prints NOTHING about capabilities when membership is unchanged', async () => {
      await installed();
      await runUpdate();
      expect(capNote()).toBeUndefined();
    });

    it('NAMES a newly-selected capability — which is how a resurrected removal becomes visible', async () => {
      // The user removed a universal capability; the resolver selects it again.
      // Tombstones are out of scope, so this is REPORTED, not prevented.
      await installed({ capabilities: [] });
      await runUpdate();

      expect(capNote()).toContain('ADDED');
      expect(capNote()).toContain('griller:a11y');
    });

    // The dropped capability MUST exist in the CLONE, and its file MUST be
    // recorded, or this test proves nothing: with no source dir, addDir bails
    // (install-manifest.ts:117) and the file sits outside the manifest whether
    // the merge drops the entry or keeps it — so the byte/record assertions
    // would pass even with row 5 inverted. Seeding the clone makes them causal:
    // KEEP puts the file in the manifest, upgrades it to 'stale v2' and
    // refreshes its record; DROP leaves it at v1 with its record pruned.
    const STALE_FILE = 'pharn-review/stale/stale.md';

    it('DROPS an auto capability the archetypes no longer select: named, its directory DELETED, record PRUNED', async () => {
      await installed({
        capabilities: [CAP, { name: 'stale', role: 'lens', source: 'auto' }],
      });
      write(join(repo, STALE_FILE), 'stale v2'); // upstream still ships it
      write(join(proj, STALE_FILE), 'stale v1'); // and it is installed here
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          ...read.store.files,
          [STALE_FILE]: contentHash(join(proj, STALE_FILE)),
        },
      });
      selectsA11yOnly();

      await runUpdate();

      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
      ]);
      expect(capNote()).toContain('lens:stale');
      // It left the manifest: NOT upgraded to the clone's bytes — and its
      // directory is gone (F-04): PHARN's commands find capabilities by scanning
      // the directories, so one left behind would keep running. Its one file was
      // pharn's own, recorded and unchanged, so nothing needed a backup.
      expect(existsSync(join(proj, 'pharn-review/stale'))).toBe(false);
      expect(backupDirs()).toEqual([]);
      // nextRecords is keyed by the manifest just applied, so a path no longer
      // installed is pruned rather than accumulating forever
      // (lib/update-decision.ts). Files outliving their record is exactly why a
      // returning capability later reads as `unrecorded`.
      expect(records()?.[STALE_FILE]).toBeUndefined();
    });

    // Membership answers "which capabilities does this project have" (the
    // archetypes decide); the version answers "are its BYTES complete". They are
    // deliberately decoupled — withholding membership too would strand a phantom
    // entry forever for anyone whose tree carries a single local edit.
    it('still writes the merged membership when a skip WITHHOLDS the version bump', async () => {
      await installed({ capabilities: [] });
      write(join(proj, DOC), 'MY LOCAL EDIT'); // forces a `modified` skip

      await runUpdate();

      const config = readPharnConfig(proj)!;
      // The version is held back...
      expect(config.skillsVersion).toBe('1.0.0');
      expect(config.commit).toBeNull();
      // ...but the membership change still landed, and was reported.
      expect(config.capabilities).toEqual([{ ...CAP, source: 'auto' }]);
      expect(capNote()).toContain('griller:a11y');
    });

    // The trap: the install manifest SILENTLY contributes zero paths for a
    // missing capability dir, so without the index-membership filter this entry
    // would live in the config forever as a phantom and nothing would ever say so.
    it('DROPS a manual entry whose capability is gone upstream — named, contributing zero manifest paths, its directory deleted after a backup', async () => {
      await installed({
        capabilities: [CAP, { name: 'gone', role: 'lens', source: 'manual' }],
      });
      write(join(proj, 'pharn-review/gone/gone.md'), 'my bytes');
      // Selection knows nothing of `gone` — it is in neither selected nor skipped.
      resolveCapabilities.mockReturnValue({
        selected: [{ ...CAP, matched: ['ssr'] }],
        skipped: [],
      });

      await expect(runUpdate()).resolves.toBeUndefined();

      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
      ]);
      expect(capNote()).toContain('lens:gone');
      expect(capNote()).toContain('no longer exists upstream');
      // Zero manifest paths ⇒ its file was never a write target; the directory
      // is deleted with the entry, and the file — pharn has no record of it —
      // was copied to .pharn-backup/ first.
      expect(existsSync(join(proj, 'pharn-review/gone'))).toBe(false);
      const [ts] = backupDirs();
      expect(
        readFileSync(
          join(proj, BACKUP_DIR, ts!, 'pharn-review/gone/gone.md'),
          'utf8',
        ),
      ).toBe('my bytes');
    });

    // F-04 — what a drop deletes, what it saves first, and what it never touches.
    describe('deleting a dropped capability', () => {
      const STALE_DIR = 'pharn-review/stale';
      const NOTES = `${STALE_DIR}/NOTES.md`;

      // `stale` is installed, recorded, and no longer selected; the user added
      // NOTES.md inside it.
      async function droppedStale(
        over: Partial<PharnConfig> = {},
      ): Promise<PharnConfig> {
        const cfg = await installed({
          capabilities: [CAP, { name: 'stale', role: 'lens', source: 'auto' }],
          ...over,
        });
        write(join(proj, STALE_FILE), 'stale v1');
        write(join(proj, NOTES), 'my notes');
        const read = readRecords(proj);
        if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
        await writeRecords(proj, {
          skillsVersion: cfg.skillsVersion,
          commit: cfg.commit,
          files: {
            ...read.store.files,
            [STALE_FILE]: contentHash(join(proj, STALE_FILE)),
          },
        });
        selectsA11yOnly();
        return cfg;
      }

      it('backs up the files pharn cannot prove it wrote, announces it, then deletes the directory', async () => {
        await droppedStale();

        await runUpdate();

        expect(existsSync(join(proj, STALE_DIR))).toBe(false);
        const [ts] = backupDirs();
        const saved = join(proj, BACKUP_DIR, ts!);
        expect(readFileSync(join(saved, NOTES), 'utf8')).toBe('my notes');
        // pharn's own unchanged bytes are not "saved" — `add` can write them again.
        expect(existsSync(join(saved, STALE_FILE))).toBe(false);
        expect(infoLines()).toContain(
          `Backed up 1 file(s) to ${BACKUP_DIR}/${ts} before removing.`,
        );
        // The store describes nothing under the deleted directory.
        expect(
          Object.keys(records() ?? {}).filter((k) => k.startsWith(STALE_DIR)),
        ).toEqual([]);
        // The report says what happened, accurately.
        const text = stripVTControlCharacters(String(capNote()));
        expect(text).toContain('lens:stale — directory deleted');
        expect(text).toContain('1 file(s) backed up first');
        expect(text).not.toContain('left on disk');
        expect(text).not.toContain('never deletes');
      });

      // F-12 composes with F-04: a dropped capability's recorded files are
      // never orphans (findOrphans skips capabilities outside the next config),
      // and its directory is deleted — so nothing of it is left to report.
      it('never reports a dropped capability’s files as orphans', async () => {
        await droppedStale();

        await runUpdate();

        const orphaned = vi
          .mocked(prompts.note)
          .mock.calls.find((c) => c[1] === 'ORPHANED')?.[0];
        expect(String(orphaned ?? '')).not.toContain(STALE_DIR);
        expect(existsSync(join(proj, STALE_DIR))).toBe(false);
        expect(
          Object.keys(records() ?? {}).filter((k) => k.startsWith(STALE_DIR)),
        ).toEqual([]);
      });

      it('backs up an EDITED recorded file too', async () => {
        await droppedStale();
        write(join(proj, STALE_FILE), 'MY EDIT');

        await runUpdate();

        const [ts] = backupDirs();
        expect(
          readFileSync(join(proj, BACKUP_DIR, ts!, STALE_FILE), 'utf8'),
        ).toBe('MY EDIT');
      });

      it('backs up every file when the record store is not usable', async () => {
        await droppedStale();
        rmSync(join(proj, RECORDS_FILE));

        await runUpdate();

        const [ts] = backupDirs();
        const saved = join(proj, BACKUP_DIR, ts!);
        expect(existsSync(join(saved, NOTES))).toBe(true);
        expect(existsSync(join(saved, STALE_FILE))).toBe(true);
        expect(existsSync(join(proj, STALE_DIR))).toBe(false);
      });

      it('makes ONE backup directory for --force overwrites and removals together', async () => {
        await droppedStale();
        write(join(proj, DOC), 'MY DOC EDIT'); // a forced overwrite

        await runUpdate({ force: true });

        const dirs = backupDirs();
        expect(dirs).toHaveLength(1);
        const saved = join(proj, BACKUP_DIR, dirs[0]!);
        expect(readFileSync(join(saved, DOC), 'utf8')).toBe('MY DOC EDIT');
        expect(readFileSync(join(saved, NOTES), 'utf8')).toBe('my notes');
        expect(infoLines()).toContain(
          `Backed up 2 file(s) to ${BACKUP_DIR}/${dirs[0]} before overwriting and removing.`,
        );
      });

      it('names an already-gone directory as such, and backs up nothing', async () => {
        await droppedStale();
        rmSync(join(proj, STALE_DIR), { recursive: true });

        await runUpdate();

        expect(backupDirs()).toEqual([]);
        expect(stripVTControlCharacters(String(capNote()))).toContain(
          'lens:stale — already gone',
        );
      });

      it('deletes nothing else: a stray file in a KEPT capability, and .claude/settings.json, stay', async () => {
        await droppedStale();
        const stray = 'pharn-pipeline/grillers/a11y/MINE.md';
        write(join(proj, stray), 'kept capability, my file');
        write(join(proj, '.claude/settings.json'), '{"hooks":{}}\n');

        await runUpdate();

        expect(body(stray)).toBe('kept capability, my file');
        expect(body('.claude/settings.json')).toBe('{"hooks":{}}\n');
        expect(existsSync(join(proj, STALE_DIR))).toBe(false);
      });

      it('refuses the whole run when the backup cannot be made: nothing deleted, config and records untouched', async () => {
        await droppedStale();
        const outside = join(tmp.path(), 'outside-backup');
        mkdirSync(outside, { recursive: true });
        symlinkSync(outside, join(proj, BACKUP_DIR));
        const recordsBefore = readFileSync(join(proj, RECORDS_FILE), 'utf8');

        await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

        expect(body(NOTES)).toBe('my notes');
        expect(body(STALE_FILE)).toBe('stale v1');
        expect(readPharnConfig(proj)).toBeNull();
        expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(
          recordsBefore,
        );
        expect(body(DOC)).toBe('constitution v1');
      });

      it('refuses the whole run when the directory sits behind a symlinked component: nothing written', async () => {
        await droppedStale();
        // Move the review subtree outside and link it back in.
        const outside = join(tmp.path(), 'shared-review');
        mkdirSync(join(outside, 'stale'), { recursive: true });
        write(join(outside, 'stale/stale.md'), 'not this project');
        rmSync(join(proj, 'pharn-review'), { recursive: true });
        symlinkSync(outside, join(proj, 'pharn-review'));

        await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

        // F-24: refused from the plan snapshot, before the user is asked.
        expect(prompts.confirm).not.toHaveBeenCalled();
        expect(readFileSync(join(outside, 'stale/stale.md'), 'utf8')).toBe(
          'not this project',
        );
        expect(printedLines()).toContain('pharn-review is a symbolic link');
        expect(printedLines()).not.toContain('PHARN_DEBUG');
        expect(readPharnConfig(proj)).toBeNull();
        expect(body(DOC)).toBe('constitution v1');
        expect(backupDirs()).toEqual([]);
      });

      // Deletes run BEFORE the writes, so a failing delete leaves no unrecorded
      // pharn write behind; the abort repeats the backup pointer and says what
      // may already be gone.
      it.skipIf(process.getuid?.() === 0)(
        'a delete that fails stops the run before any write, naming the backup',
        async () => {
          await droppedStale();
          chmodSync(join(proj, STALE_DIR), 0o555); // its entries cannot be unlinked
          try {
            await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
          } finally {
            chmodSync(join(proj, STALE_DIR), 0o755);
          }
          expect(body(DOC)).toBe('constitution v1'); // no write happened
          expect(readPharnConfig(proj)).toBeNull();
          const text = printedLines();
          expect(text).toContain('stopped part-way');
          expect(text).toContain('removed');
          expect(text).toContain(`${BACKUP_DIR}/${backupDirs()[0]}`);
        },
      );

      it('names the removal in the backup notice even when the deleted directory needed no copy', async () => {
        await droppedStale();
        rmSync(join(proj, NOTES)); // stale.md alone: recorded, unchanged — no copy
        write(join(proj, DOC), 'MY DOC EDIT'); // a forced overwrite

        await runUpdate({ force: true });

        expect(existsSync(join(proj, STALE_DIR))).toBe(false);
        expect(infoLines()).toContain(
          `Backed up 1 file(s) to ${BACKUP_DIR}/${backupDirs()[0]} before overwriting and removing.`,
        );
      });

      // F-24: the confirm used to come before the fetch, so it could only say
      // "dropped capabilities are deleted — see --dry-run". It now comes after
      // the plan snapshot and NAMES them.
      it('names the dropped capability and its deleted directory BEFORE the confirm, which defaults to No', async () => {
        await droppedStale();

        await runUpdate();

        const notes = vi.mocked(prompts.note).mock;
        const previewAt = notes.calls.findIndex((c) => c[1] === 'CAPABILITIES');
        expect(previewAt).toBeGreaterThan(-1);
        const preview = stripVTControlCharacters(
          String(notes.calls[previewAt]![0]),
        );
        expect(preview).toContain('lens:stale — directory would be deleted');
        expect(preview).toContain('1 file(s) would be backed up first');
        expect(notes.invocationCallOrder[previewAt]!).toBeLessThan(
          vi.mocked(prompts.confirm).mock.invocationCallOrder[0]!,
        );
        expect(prompts.confirm).toHaveBeenCalledWith({
          message: 'Apply this update? It deletes 1 capability directory.',
          initialValue: false,
        });
        // The generic pointer at --dry-run is gone from the header.
        const header = stripVTControlCharacters(String(notes.calls[0]![0]));
        expect(header).not.toContain('pharn update --dry-run');
      });

      it('composes the deletion count with the --force wording', async () => {
        await droppedStale();
        await runUpdate({ force: true });
        expect(prompts.confirm).toHaveBeenCalledWith({
          message:
            'Apply this update and overwrite your changes? It deletes 1 capability directory.',
          initialValue: false,
        });
      });

      it('a dropped capability whose directory is already gone keeps the default Yes', async () => {
        await droppedStale();
        rmSync(join(proj, STALE_DIR), { recursive: true });
        await runUpdate();
        expect(prompts.confirm).toHaveBeenCalledWith({
          message: 'Apply this update?',
          initialValue: true,
        });
      });

      it('declining leaves the directory, the config and the records untouched', async () => {
        await droppedStale();
        const recordsBefore = readFileSync(join(proj, RECORDS_FILE), 'utf8');
        vi.mocked(prompts.confirm).mockResolvedValue(false);

        await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(0));

        expect(body(NOTES)).toBe('my notes');
        expect(body(STALE_FILE)).toBe('stale v1');
        expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(
          recordsBefore,
        );
        expect(backupDirs()).toEqual([]);
        expect(cleanup).toHaveBeenCalledTimes(1);
      });

      it('--yes prints the same preview, skips the confirm, and deletes', async () => {
        await droppedStale();

        await runUpdate({ yes: true });

        expect(prompts.confirm).not.toHaveBeenCalled();
        const preview = vi
          .mocked(prompts.note)
          .mock.calls.find((c) => c[1] === 'CAPABILITIES')?.[0];
        expect(stripVTControlCharacters(String(preview))).toContain(
          'lens:stale — directory would be deleted',
        );
        expect(existsSync(join(proj, STALE_DIR))).toBe(false);
      });

      // THE MEMBERSHIP GUARD: what the locked re-plan changes must be what the
      // confirm showed. A directory that was "already gone" at the snapshot
      // and re-appears before the lock would otherwise be deleted under a
      // confirm that never named a deletion.
      it('refuses when the locked re-plan would delete a directory the confirm did not show: exit 1, nothing written', async () => {
        await droppedStale();
        rmSync(join(proj, STALE_DIR), { recursive: true });
        const recordsBefore = readFileSync(join(proj, RECORDS_FILE), 'utf8');
        vi.mocked(prompts.confirm).mockImplementation(async () => {
          // The directory comes back while the prompt is open.
          write(join(proj, NOTES), 'my notes');
          return true;
        });

        await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

        expect(body(NOTES)).toBe('my notes');
        expect(readPharnConfig(proj)).toBeNull();
        expect(body(DOC)).toBe('constitution v1');
        expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(
          recordsBefore,
        );
        expect(backupDirs()).toEqual([]);
        const said = printedLines();
        expect(said).toContain('no longer what you confirmed');
        expect(said).toContain('delete pharn-review/stale/');
        expect(said).not.toContain('PHARN_DEBUG');
        expect(cleanup).toHaveBeenCalledTimes(1);
      });

      it('refuses when the membership itself differs under the lock, naming both sides', async () => {
        await droppedStale();
        // The second resolution (under the lock) keeps `stale` selected.
        resolveCapabilities
          .mockReturnValueOnce({
            selected: [{ ...CAP, matched: ['ssr'] }],
            skipped: [],
          })
          .mockReturnValueOnce({
            selected: [
              { ...CAP, matched: ['ssr'] },
              { name: 'stale', role: 'lens', matched: ['ssr'] },
            ],
            skipped: [],
          });

        await expect(runUpdate({ yes: true })).rejects.toMatchObject(
          new ProcessExit(1),
        );

        expect(existsSync(join(proj, STALE_DIR))).toBe(true);
        expect(readPharnConfig(proj)).toBeNull();
        const said = printedLines();
        expect(said).toContain(
          'shown but not planned now: dropped-unselected lens:stale',
        );
        expect(said).toContain('Nothing was changed');
      });
    });

    it('names a capability the update ADDS before the confirm', async () => {
      await installed({ capabilities: [] });

      await runUpdate();

      const notes = vi.mocked(prompts.note).mock;
      const previewAt = notes.calls.findIndex((c) => c[1] === 'CAPABILITIES');
      expect(
        stripVTControlCharacters(String(notes.calls[previewAt]![0])),
      ).toContain('griller:a11y');
      expect(notes.invocationCallOrder[previewAt]!).toBeLessThan(
        vi.mocked(prompts.confirm).mock.invocationCallOrder[0]!,
      );
      expect(prompts.confirm).toHaveBeenCalledWith({
        message: 'Apply this update?',
        initialValue: true,
      });
    });

    it('prints no preview when membership is unchanged', async () => {
      await installed();
      await runUpdate();
      const capNotes = vi
        .mocked(prompts.note)
        .mock.calls.filter((c) => c[1] === 'CAPABILITIES');
      expect(capNotes).toEqual([]);
    });

    it('SKIPS a manual capability file the user edited, with the standard report', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [
          CAP,
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
        ],
      });
      await withManualLens(true);
      write(join(proj, MANUAL_FILE), 'MY LOCAL EDIT');
      selectsA11yOnly();

      await runUpdate();

      expect(body(MANUAL_FILE)).toBe('MY LOCAL EDIT');
      const skipNote = vi
        .mocked(prompts.note)
        .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
      expect(skipNote).toContain('MODIFIED');
      expect(skipNote).toContain(MANUAL_FILE);
    });

    it('RESTORES a manual capability file the user deleted', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [
          CAP,
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
        ],
      });
      await withManualLens(false);
      selectsA11yOnly();

      await runUpdate();

      expect(body(MANUAL_FILE)).toBe('n-plus-one v2');
    });
  });

  it('SKIPS a file the user modified, leaves its bytes alone, and exits 0', async () => {
    await installed();
    write(join(proj, DOC), 'MY LOCAL EDIT');

    await expect(runUpdate()).resolves.toBeUndefined();

    expect(body(DOC)).toBe('MY LOCAL EDIT');
    // Its record still describes what pharn wrote, not the user's bytes.
    expect(records()?.[DOC]).not.toBe(contentHash(join(proj, DOC)));
    // Everything else still upgraded.
    expect(body(CAP_FILE)).toBe('a11y v2');
  });

  it('labels a modified skip and groups it under MODIFIED in the report', async () => {
    await installed();
    write(join(proj, DOC), 'MY LOCAL EDIT');
    await runUpdate();

    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('MODIFIED');
    expect(skipNote).toContain(DOC);
    expect(skipNote).toContain('--force');
  });

  it('WITHHOLDS the version bump when anything was skipped, so the next run still has work', async () => {
    // Without this, the same-version early-return would strand the skipped file
    // forever on the very run that reported it.
    await installed();
    write(join(proj, DOC), 'MY LOCAL EDIT');

    await runUpdate();

    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.0.0');
    expect(config.commit).toBeNull();
    // The store's stamp matches the config it sits beside, so it stays usable.
    const read = readRecords(proj);
    expect(read.kind === 'ok' && read.store.skillsVersion).toBe('1.0.0');
  });

  it('RESTORES a deleted file, recreating its parent directories', async () => {
    await installed();
    rmSync(join(proj, 'pharn-pipeline'), { recursive: true, force: true });

    await runUpdate();

    expect(body(CAP_FILE)).toBe('a11y v2');
  });

  it('treats a pre-upgrade install (no record store) as unverifiable and skips', async () => {
    await installed();
    rmSync(join(proj, RECORDS_FILE), { force: true });
    write(join(proj, DOC), 'user bytes');

    await runUpdate();

    // Every file that DIFFERS is skipped; nothing is overwritten.
    expect(body(DOC)).toBe('user bytes');
    expect(body(CAP_FILE)).toBe('a11y v1');
    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('UNVERIFIABLE');
  });

  it('reports a corrupt record store BY NAME rather than blaming a legacy install', async () => {
    await installed();
    writeFileSync(join(proj, RECORDS_FILE), 'not json{');

    await runUpdate();

    const warned = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(warned).toContain(RECORDS_FILE);
  });

  it('ignores a store whose stamp disagrees with the config (a downgrade round-trip)', async () => {
    await installed();
    await writeRecords(proj, {
      skillsVersion: '0.9.0', // written for a different install state
      commit: null,
      files: { [DOC]: contentHash(join(proj, DOC)) },
    });

    await runUpdate();

    // Fails CLOSED: the stale store is not trusted, so nothing is overwritten.
    expect(body(DOC)).toBe('constitution v1');
  });

  // -------------------------------------------------------------------------
  // A benign upstream FILENAME must not read as a corrupt store.
  //
  // The record store is keyed by the install manifest, which enumerates the
  // CLONE — capability contents are copied verbatim and their basenames are
  // never name-validated. A `..` INSIDE a basename is not a traversal segment,
  // but a substring ban read it as one and invalidated the WHOLE store, so every
  // present file degraded to `unverifiable` and the version bump was withheld —
  // for a filename `cpSync` had copied happily.
  //
  // The fixture file lives INSIDE the installed capability directory on purpose:
  // that is the only thing that puts it in the manifest, so the upgrade
  // assertion exercises the real write path rather than passing because the file
  // was never a candidate.
  // -------------------------------------------------------------------------
  it('a `..`-in-basename file upgrades normally instead of invalidating the store', async () => {
    const ODD = 'pharn-pipeline/grillers/a11y/migration..v2.md';
    const config = await installed();
    write(join(repo, ODD), 'odd v2');
    write(join(proj, ODD), 'odd v1');
    await writeRecords(proj, {
      skillsVersion: config.skillsVersion,
      commit: config.commit,
      files: { ...records()!, [ODD]: contentHash(join(proj, ODD)) },
    });

    await runUpdate();

    // The store read OK, so the odd-named file matched its record and upgraded
    // like every other recorded file — and so did everything else.
    expect(body(ODD)).toBe('odd v2');
    expect(body(DOC)).toBe('constitution v2');
    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toBeUndefined();
    // Nothing was skipped, so the bump is not withheld for this reason.
    expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
  });

  // -------------------------------------------------------------------------
  // FORWARD COMPATIBILITY — a capability the fetch boundary could not PARSE.
  //
  // Two things must hold at once, and they pull in opposite directions:
  //   * the config entry SURVIVES (update never deletes, and a transient upstream
  //     grammar break must not silently drop a user's capability), and
  //   * NOT ONE BYTE of its clone directory is written (the manifest is update's
  //     only write source, so leaving it in would copy an arbitrary WIP upstream
  //     directory into the project — the exact fail-open this contract prevents).
  //
  // The fixture ships a POPULATED unparseable directory in the clone on purpose:
  // an empty one would make the manifest contribute nothing regardless of the
  // fix, so the test would pass for the wrong reason (GRILL.md F5).
  // -------------------------------------------------------------------------
  describe('unparseable upstream capability (frozen)', () => {
    const FROZEN = { name: 'backwards-compat', role: 'griller' as const };
    const FROZEN_FILE =
      'pharn-pipeline/grillers/backwards-compat/backwards-compat.md';
    const FROZEN_EXTRA =
      'pharn-pipeline/grillers/backwards-compat/evals/cases/one.md';

    // A real, file-bearing directory in the clone that the parse refused.
    function frozenUpstream(): void {
      write(join(repo, FROZEN_FILE), 'WIP upstream content');
      write(join(repo, FROZEN_EXTRA), 'WIP eval case');
      parseCapabilityIndex.mockReturnValue({
        capabilities: [],
        unknown: [
          {
            name: FROZEN.name,
            role: FROZEN.role,
            subtree: 'pharn-pipeline/grillers',
            reason: 'Capability "backwards-compat" has invalid role "auditor"',
          },
        ],
      });
    }

    // The POST-RUN report: since F-24 the same note also prints, in the future
    // tense, before the confirm (see previewNote).
    const capNote = () =>
      vi
        .mocked(prompts.note)
        .mock.calls.filter((c) => c[1] === 'CAPABILITIES')
        .at(-1)?.[0];

    it('writes ZERO files under it while KEEPING its pharn.config.json entry', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      // Nothing under the unparseable dir was copied into the project.
      expect(existsSync(join(proj, FROZEN_FILE))).toBe(false);
      expect(existsSync(join(proj, FROZEN_EXTRA))).toBe(false);
      // ...and it was not recorded either (recorded is not the same as copied).
      expect(records()?.[FROZEN_FILE]).toBeUndefined();
      // The entry survives, verbatim.
      expect(readPharnConfig(proj)!.capabilities).toEqual([
        { ...CAP, source: 'auto' },
        { ...FROZEN, source: 'auto' },
      ]);
    });

    // Its records must SURVIVE. planUpdate keys nextRecords by the manifest, and
    // a frozen capability is deliberately absent from it — so without an explicit
    // carry-over its entries would be pruned as "no longer installed". They are
    // not: nothing under it was touched, so the recorded hashes are still true.
    // Losing them would make the next run (once upstream parses again) read every
    // one of those files as `unrecorded` and skip it — a transient upstream break
    // turned into a --force.
    it('KEEPS the records of an already-installed frozen capability', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      // The capability WAS installed at v1, so the project holds its bytes and
      // the store holds their hashes.
      const INSTALLED_FILE = FROZEN_FILE;
      write(join(proj, INSTALLED_FILE), 'installed at v1');
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          ...read.store.files,
          [INSTALLED_FILE]: contentHash(join(proj, INSTALLED_FILE)),
        },
      });
      const before = records()![INSTALLED_FILE];
      frozenUpstream();

      await runUpdate();

      // Untouched on disk...
      expect(body(INSTALLED_FILE)).toBe('installed at v1');
      // ...and still recorded, at the same hash.
      expect(records()?.[INSTALLED_FILE]).toBe(before);
    });

    it('reports it as KEPT — never dropped-unselected, never dropped-gone', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      expect(capNote()).toContain('griller:backwards-compat');
      expect(capNote()).toContain('KEPT');
      expect(capNote()).not.toContain('REMOVED');
    });

    it('names the skipped capability with its reason (no silent skips, P5)', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('backwards-compat');
      expect(warned).toContain('invalid role');
    });

    // THE UNWEDGING PROPERTY. `add`'s versionGate refuses on ANY
    // readSkillsVersion(clone) !== config.skillsVersion, so if an unparseable dir
    // on main made every update withhold the bump, the config would never reach
    // the upstream version and every `pharn add` would be refused FOREVER — the
    // very wedge this whole contract removes. A frozen capability contributes no
    // expected file, hence no FILE-level skip, hence no withholding.
    it('still bumps skillsVersion/commit when nothing at FILE level was skipped', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();

      await runUpdate();

      const written = readPharnConfig(proj)!;
      expect(written.skillsVersion).toBe('1.1.0');
      expect(written.commit).toBe('a'.repeat(40));
      // The withheld-bump warning must NOT have fired.
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).not.toContain('still recorded as skills');
    });

    // PHARN-13: the bump above must not END the re-checking. Without a record of
    // what was kept, the next run at the same version returns "Already up to
    // date" before fetching, so the KEPT report never repeats and the bytes stay
    // stale even once a newer pharn can parse the capability.
    it('records the KEPT key — and only KEPT ones — in frozenCapabilities', async () => {
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      frozenUpstream();
      // A second unparseable capability this project never had.
      parseCapabilityIndex.mockReturnValue({
        capabilities: [],
        unknown: [
          ...parseCapabilityIndex().unknown,
          {
            name: 'never-installed',
            role: 'lens',
            subtree: 'pharn-pipeline/lenses',
            reason: 'bad frontmatter',
          },
        ],
      });

      await runUpdate();

      expect(readPharnConfig(proj)!.frozenCapabilities).toEqual([
        'griller:backwards-compat',
      ]);
    });

    it('re-fetches and re-reports KEPT at the same version while one is frozen', async () => {
      await installed({
        skillsVersion: '1.1.0',
        capabilities: [CAP, { ...FROZEN, source: 'auto' }],
        frozenCapabilities: ['griller:backwards-compat'],
      });
      frozenUpstream();

      await runUpdate();

      expect(fetchRepo).toHaveBeenCalledTimes(1);
      const outros = vi
        .mocked(prompts.outro)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(outros).not.toContain('Already up to date');
      expect(capNote()).toContain('KEPT');
      // Still frozen → still recorded.
      expect(readPharnConfig(proj)!.frozenCapabilities).toEqual([
        'griller:backwards-compat',
      ]);
    });

    it('refreshes its files and clears the field once it parses again', async () => {
      await installed({
        skillsVersion: '1.1.0',
        capabilities: [CAP, { ...FROZEN, source: 'auto' }],
        frozenCapabilities: ['griller:backwards-compat'],
      });
      // Installed at v1 and recorded, so a clean upstream copy is an upgrade.
      write(join(proj, FROZEN_FILE), 'installed at v1');
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        skillsVersion: '1.1.0',
        commit: null,
        files: {
          ...read.store.files,
          [FROZEN_FILE]: contentHash(join(proj, FROZEN_FILE)),
        },
      });
      // Upstream now parses (e.g. after a pharn upgrade).
      write(join(repo, FROZEN_FILE), 'parsed upstream content');
      resolveCapabilities.mockReturnValue({
        selected: [
          { ...CAP, matched: ['ssr'] },
          { ...FROZEN, matched: ['ssr'] },
        ],
        skipped: [],
      });

      await runUpdate();

      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(body(FROZEN_FILE)).toBe('parsed upstream content');
      expect(readPharnConfig(proj)!.frozenCapabilities).toBeUndefined();
    });

    // update-frozen-recheck. The bump already happened on the run that froze the
    // capability, so on the re-check run a skip withholds nothing: only the list
    // keeps the next run from returning "Already up to date" over stale files.
    describe('a formerly-frozen capability that parses again', () => {
      // Installed at v1 and recorded at the (already bumped) 1.1.0 stamp, exactly
      // what the run that froze it leaves behind; upstream now parses.
      async function reCheckable(): Promise<void> {
        await installed({
          skillsVersion: '1.1.0',
          capabilities: [CAP, { ...FROZEN, source: 'auto' }],
          frozenCapabilities: ['griller:backwards-compat'],
        });
        write(join(proj, FROZEN_FILE), 'installed at v1');
        const read = readRecords(proj);
        if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
        await writeRecords(proj, {
          skillsVersion: '1.1.0',
          commit: null,
          files: {
            ...read.store.files,
            [FROZEN_FILE]: contentHash(join(proj, FROZEN_FILE)),
          },
        });
        write(join(repo, FROZEN_FILE), 'parsed upstream content');
        resolveCapabilities.mockReturnValue({
          selected: [
            { ...CAP, matched: ['ssr'] },
            { ...FROZEN, matched: ['ssr'] },
          ],
          skipped: [],
        });
      }
      // The next run reads the config the last one wrote.
      const reload = (): void => {
        loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj)!);
        vi.mocked(fetchRepo).mockClear();
      };

      it('stays listed while a file of its own is skipped — and is re-checked until that file lands', async () => {
        await reCheckable();
        write(join(proj, FROZEN_FILE), 'my local edit');

        await runUpdate();

        // Skipped as the user's edit — and the key survives.
        expect(body(FROZEN_FILE)).toBe('my local edit');
        let config = readPharnConfig(proj)!;
        expect(config.frozenCapabilities).toEqual(['griller:backwards-compat']);
        // Same-version run: a pending version equal to the recorded one says
        // nothing `add` does not already accept.
        expect(config.skillsVersion).toBe('1.1.0');
        expect(config.pendingSkillsVersion).toBeUndefined();

        // The next run fetches again instead of "Already up to date".
        reload();
        await runUpdate();
        expect(fetchRepo).toHaveBeenCalledTimes(1);
        expect(readPharnConfig(proj)!.frozenCapabilities).toEqual([
          'griller:backwards-compat',
        ]);

        // The user resolves the edit as advised → the file finally lands.
        write(join(proj, FROZEN_FILE), 'installed at v1');
        reload();
        await runUpdate();
        expect(body(FROZEN_FILE)).toBe('parsed upstream content');
        config = readPharnConfig(proj)!;
        expect(config.frozenCapabilities).toBeUndefined();
      });

      it('a skip under ANOTHER path does not keep it listed', async () => {
        await reCheckable();
        write(join(proj, DOC), 'my edit of the constitution');

        await runUpdate();

        expect(body(DOC)).toBe('my edit of the constitution');
        expect(body(FROZEN_FILE)).toBe('parsed upstream content');
        expect(readPharnConfig(proj)!.frozenCapabilities).toBeUndefined();
      });

      it('leaves the list when the merge drops the entry', async () => {
        await reCheckable();
        write(join(proj, FROZEN_FILE), 'my local edit');
        // Parses again, but the archetypes no longer select it: an `auto`
        // entry is dropped (merge row 5), so nothing may keep it listed.
        resolveCapabilities.mockReturnValue({
          selected: [{ ...CAP, matched: ['ssr'] }],
          skipped: [{ ...FROZEN, reason: 'applies to [backend]' }],
        });

        await runUpdate();

        const config = readPharnConfig(proj)!;
        expect(config.capabilities!.map((c) => c.name)).toEqual(['a11y']);
        expect(config.frozenCapabilities).toBeUndefined();
      });
    });

    it('still returns early at the same version when nothing is frozen', async () => {
      await installed({ skillsVersion: '1.1.0' });

      await runUpdate();

      expect(fetchRepo).not.toHaveBeenCalled();
      expect(vi.mocked(prompts.outro)).toHaveBeenCalledWith(
        expect.stringContaining('Already up to date'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // The MIN_CLI handshake, at the command level.
  // -------------------------------------------------------------------------
  describe('MIN_CLI gate', () => {
    it('refuses a too-old CLI: exit 1, clone cleaned up, NOTHING written', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '99.0.0\n');
      const before = body(CAP_FILE);

      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(cleanup).toHaveBeenCalled();
      expect(body(CAP_FILE)).toBe(before);
      // Not "the config still says 1.0.0" — NO config was written at all: the
      // refusal fires before applyUpdate, so the whole write phase never runs.
      expect(readPharnConfig(proj)).toBeNull();
      const errored = vi
        .mocked(prompts.log.error)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(errored).toContain('too old');
      expect(errored).toContain('99.0.0');
    });

    it('a GARBAGE MIN_CLI does NOT exit 1 — it warns and updates normally', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), 'not-a-version\n');

      await runUpdate();

      expect(body(CAP_FILE)).toBe('a11y v2');
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('MIN_CLI');
    });

    it('a satisfied MIN_CLI is silent and updates normally', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '0.0.1\n');

      await runUpdate();

      expect(body(CAP_FILE)).toBe('a11y v2');
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).not.toContain('MIN_CLI');
    });
  });

  describe('--force', () => {
    it('backs the file up BEFORE overwriting, and the backup holds the pre-overwrite bytes', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      expect(readFileSync(join(proj, BACKUP_DIR, dirs[0]!, DOC), 'utf8')).toBe(
        'MY LOCAL EDIT',
      );
      expect(body(DOC)).toBe('constitution v2');
      expect(records()?.[DOC]).toBe(contentHash(join(repo, DOC)));
    });

    it('a forced run with nothing left to skip advances the version', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      await runUpdate({ force: true });
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
    });

    it("prints the backup directory — the user's only pointer to their bytes", async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      const dirs = backupDirs();
      // The DIRECTORY, not merely the constant: `.pharn-backup` alone also
      // appears in the gitignore line, so it would pass while the run named the
      // wrong timestamp.
      expect(infoLines()).toContain(`${BACKUP_DIR}/${dirs[0]!}`);
      expect(infoLines()).toContain('Backed up 1 file(s)');
      expect(infoLines()).toContain('not gitignored');
      // The success notice stays on STDOUT. Pinned at a real call site because
      // the wording now travels through a helper that takes an output stream —
      // a wiring slip sending this to stderr would pass every other assertion
      // here, and the vi.fn() mock would swallow a missing option silently.
      expect(vi.mocked(prompts.log.info).mock.calls.at(-1)![1]).toEqual({
        output: process.stdout,
      });
    });

    it('creates NO backup when nothing needed one', async () => {
      await installed();
      await runUpdate({ force: true });
      expect(backupDirs()).toEqual([]);
    });

    it('bypasses the same-version early-return, so it is usable at the current version', async () => {
      // status tells the user --force overwrites their edits; that has to be
      // true when they are already on the latest version.
      await installed({ skillsVersion: '1.1.0' });
      scaffoldClone(repo, '1.1.0', 'v2');
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      expect(body(DOC)).toBe('constitution v2');
      expect(backupDirs()).toHaveLength(1);
    });

    // F21: the notice used to print while the apply's spinner still animated
    // — glued to its frame, and erased by its stop in a narrow terminal. The
    // spinner is stopped first, the notice printed, and a new one started for
    // the writes.
    it('prints the backup notice with no spinner running', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      const notice = shown.findIndex((l) => l.startsWith('info: Backed up'));
      expect(notice).toBeGreaterThan(-1);
      const before = shown
        .slice(0, notice)
        .filter((l) => l.startsWith('start:') || l.startsWith('stop:'));
      // The last spinner event before the notice STOPPED a spinner…
      expect(before.at(-1)).toMatch(/^stop: /);
      // …without repeating what the notice says next.
      expect(before.at(-1)).not.toContain('Backed up');
      // …and the writes run under a spinner started AFTER it.
      const after = shown.slice(notice);
      expect(after.findIndex((l) => l.startsWith('start:'))).toBeGreaterThan(0);
      expect(after.at(-1)).toBe('stop: Capabilities updated');
    });

    // --- the pointer on the FAILURE path --------------------------------
    //
    // createBackup runs BEFORE the first original is touched, but its path used
    // to travel out only inside a successful outcome — so a run that died after
    // the backup exited 1 having moved the user's bytes somewhere it never
    // named. Everything past createBackup is a post-backup throw site.

    // Two --force casualties, and the hook's DIRECTORY made read-only so the
    // backup still completes (0o555 is listable and the file readable, so
    // readDiskState hashes it and the backup copies it) and the WRITE is what
    // fails, mid-loop: the replacement's temp sibling cannot be created there.
    // (A read-only FILE no longer stops it — every write replaces the file by
    // rename rather than writing into it, F-19.)
    //
    // ORDER IS LOAD-BEARING: the chmod comes after the writes above it, or the
    // fixture's own write would fail EACCES and the test would pass for the
    // wrong reason.
    async function abortedForcedRun(): Promise<void> {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      write(join(proj, HOOK), 'MY LOCAL HOOK EDIT');
      chmodSync(join(proj, HOOK, '..'), 0o555);
      try {
        await expect(runUpdate({ force: true })).rejects.toMatchObject(
          new ProcessExit(1),
        );
      } finally {
        // Restored inside the helper, not in an afterEach: useTmpDir's rmSync
        // suppresses ENOENT, not EACCES, and this must hold even if the
        // assertion throws. (Inert for uid 0 — this suite must not run as root.)
        chmodSync(join(proj, HOOK, '..'), 0o755);
      }
    }

    it('names the backup directory when the apply aborts part-way', async () => {
      await abortedForcedRun();

      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      // The pre-overwrite bytes really are in there, and the run named THAT
      // directory — earlier runs may have left others beside it.
      expect(readFileSync(join(proj, BACKUP_DIR, dirs[0]!, HOOK), 'utf8')).toBe(
        'MY LOCAL HOOK EDIT',
      );
      expect(printedLines()).toContain(`${BACKUP_DIR}/${dirs[0]!}`);
      expect(printedLines()).toContain('Backed up 2 file(s)');
      // The abort is named too: some originals are already gone from the tree.
      expect(printedLines()).toContain('stopped part-way');
    });

    // F21: the abort used to repeat the whole notice. The pointer is printed
    // once per stream (the stderr copy is what `2> err.log` keeps), and the
    // .gitignore hint only once — it is advice, not a pointer.
    it('prints the .gitignore hint once, and the backup dir once per stream', async () => {
      await abortedForcedRun();

      const infos = vi.mocked(prompts.log.info).mock.calls;
      expect(
        infos.filter((c) => String(c[0]).includes('not gitignored')),
      ).toHaveLength(1);
      const dir = backupDirs()[0]!;
      const pointers = infos.filter((c) =>
        String(c[0]).includes(`${BACKUP_DIR}/${dir}`),
      );
      expect(pointers.map((c) => c[1])).toEqual([
        { output: process.stdout },
        { output: process.stderr },
      ]);
    });

    it('sends the aborted-run notice to stderr, with the rest of the failure', async () => {
      await abortedForcedRun();

      // An operator running `pharn update --force > out.log 2> err.log` must
      // find the pointer in the file they read after a non-zero exit.
      expect(vi.mocked(prompts.log.info).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
      expect(vi.mocked(prompts.log.warn).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
      // The failure itself is still reported, and still exits 1 (above).
      expect(printedLines()).toContain('⚠');
    });

    it('names the backup directory when the CONFIG write is what fails', async () => {
      // Every post-backup throw site, not just applyWrites: writeRecords and
      // writePharnConfig throw plain Errors and are equally past the point of no
      // return. A pointer attached to ApplyError alone would miss both.
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      rmSync(join(proj, 'pharn.config.json'), { force: true });
      mkdirSync(join(proj, 'pharn.config.json'), { recursive: true });

      await expect(runUpdate({ force: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      expect(printedLines()).toContain(`${BACKUP_DIR}/${dirs[0]!}`);
    });

    // PHARN-10: the pointer is printed the moment the backup EXISTS (as `add`
    // does, and as docs/commands/update.md promises) — an interrupt after it
    // (clack's Ctrl-C → process.exit, which runs no catch) must not hide it.
    it('prints the backup pointer at creation, before a later write fails', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      rmSync(join(proj, 'pharn.config.json'), { force: true });
      mkdirSync(join(proj, 'pharn.config.json'), { recursive: true });

      await expect(runUpdate({ force: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      const atCreation = vi
        .mocked(prompts.log.info)
        .mock.calls.filter(
          (c) =>
            String(c[0]).startsWith('Backed up') &&
            (c[1] as { output?: unknown } | undefined)?.output ===
              process.stdout,
        );
      expect(atCreation).toHaveLength(1);
    });

    it('names the backup exactly once on a successful --force run', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      const named = vi
        .mocked(prompts.log.info)
        .mock.calls.filter((c) => String(c[0]).startsWith('Backed up'));
      expect(named).toHaveLength(1);
    });

    it('aborts without touching any original when the backup cannot be written', async () => {
      await installed();
      write(join(proj, DOC), 'MY LOCAL EDIT');
      // A plain file at .pharn-backup makes the backup mkdir fail.
      write(join(proj, BACKUP_DIR), 'not a directory');

      await expect(runUpdate({ force: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );

      expect(body(DOC)).toBe('MY LOCAL EDIT');
      expect(body(CAP_FILE)).toBe('a11y v1');
      expect(cleanup).toHaveBeenCalled();
      // A backup that never happened is never announced: createBackup threw, so
      // the tree is intact and there is nothing to point at.
      expect(printedLines()).not.toContain('Backed up');
    });
  });

  it('never DELETES a project file that upstream no longer ships', async () => {
    await installed();
    write(join(proj, 'pharn-pipeline/grillers/a11y/legacy.md'), 'mine');

    await runUpdate();

    expect(body('pharn-pipeline/grillers/a11y/legacy.md')).toBe('mine');
  });

  // F-12: a file upstream stops shipping stays on disk (update never deletes),
  // and is now NAMED — on this run and every later one, until it is gone.
  describe('orphaned files (upstream stopped shipping them)', () => {
    const OLD_CMD = '.claude/commands/pharn-plan.md';
    const orphanNote = () =>
      vi
        .mocked(prompts.note)
        .mock.calls.filter((c) => c[1] === 'ORPHANED')
        .map((c) => stripVTControlCharacters(String(c[0])));
    // The next run starts from what this one wrote.
    const reloadConfig = () =>
      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj)!);
    const nextUpstream = (version: string) => {
      write(join(repo, 'SKILLS_VERSION'), `${version}\n`);
      fetchRemoteSkillsVersion.mockResolvedValue(version);
    };

    it('names an unchanged orphan, keeps the file and its record, and bumps the version', async () => {
      await installed();
      const recorded = records()![OLD_CMD];
      rmSync(join(repo, OLD_CMD));

      await runUpdate();

      expect(body(OLD_CMD)).toBe('plan v1');
      expect(records()![OLD_CMD]).toBe(recorded);
      const [text] = orphanNote();
      expect(text).toContain('UNCHANGED');
      expect(text).toContain(OLD_CMD);
      expect(text).toContain('git rm');
      // Not a skip: the version is not withheld and SKIPPED says nothing.
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
      expect(
        vi.mocked(prompts.note).mock.calls.some((c) => c[1] === 'SKIPPED'),
      ).toBe(false);
    });

    it('keeps listing it on a later run, and drops it once the file is gone', async () => {
      await installed();
      rmSync(join(repo, OLD_CMD));
      await runUpdate();

      reloadConfig();
      nextUpstream('1.2.0');
      vi.mocked(prompts.note).mockClear();
      await runUpdate();
      expect(orphanNote()[0]).toContain(OLD_CMD);
      expect(records()![OLD_CMD]).toBeDefined();

      rmSync(join(proj, OLD_CMD));
      reloadConfig();
      nextUpstream('1.3.0');
      vi.mocked(prompts.note).mockClear();
      await runUpdate();
      expect(orphanNote()).toEqual([]);
      expect(records()![OLD_CMD]).toBeUndefined();
    });

    // With #281, a recorded path that is gone re-opens the same-version early
    // return. A deleted orphan is such a path until a planned run drops its
    // record: ONE run (which restores nothing — upstream no longer ships it),
    // then "Already up to date" again.
    it('after you delete an orphan at the same version, one run drops its record, then it is up to date', async () => {
      await installed();
      rmSync(join(repo, OLD_CMD));
      await runUpdate();
      expect(records()![OLD_CMD]).toBeDefined();

      rmSync(join(proj, OLD_CMD));
      reloadConfig();
      vi.mocked(prompts.note).mockClear();
      vi.mocked(prompts.outro).mockClear();
      await runUpdate();
      const header = stripVTControlCharacters(
        String(vi.mocked(prompts.note).mock.calls[0]?.[0] ?? ''),
      );
      expect(header).toContain(`${OLD_CMD} is missing`);
      expect(header).toContain('if upstream still ships it');
      expect(existsSync(join(proj, OLD_CMD))).toBe(false);
      expect(records()![OLD_CMD]).toBeUndefined();
      expect(orphanNote()).toEqual([]);

      reloadConfig();
      vi.mocked(prompts.outro).mockClear();
      await runUpdate();
      expect(String(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0])).toContain(
        'Already up to date',
      );
    });

    it('names an edited orphan as EDITED', async () => {
      await installed();
      rmSync(join(repo, OLD_CMD));
      write(join(proj, OLD_CMD), 'MY EDIT');

      await runUpdate();

      const [text] = orphanNote();
      expect(text).toContain('EDITED');
      expect(text).toContain('review before deleting');
      expect(text).not.toContain('UNCHANGED');
      expect(body(OLD_CMD)).toBe('MY EDIT');
    });

    it('upgrades a path upstream ships AGAIN cleanly, from the carried record', async () => {
      await installed();
      rmSync(join(repo, OLD_CMD));
      await runUpdate();

      reloadConfig();
      nextUpstream('1.2.0');
      write(join(repo, OLD_CMD), 'plan v3');
      await runUpdate();

      // Still at the bytes pharn wrote → `updated`, not an `unrecorded` skip.
      expect(body(OLD_CMD)).toBe('plan v3');
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.2.0');
    });

    it('prints no ORPHANED note when nothing is orphaned', async () => {
      await installed();
      await runUpdate();
      expect(orphanNote()).toEqual([]);
    });
  });

  it('never writes .claude/settings.json (user-owned, excluded from the manifest)', async () => {
    await installed();
    write(join(repo, '.claude/settings.json'), '{"upstream":true}');
    write(join(proj, '.claude/settings.json'), '{"mine":true}');

    await runUpdate();

    expect(body('.claude/settings.json')).toBe('{"mine":true}');
  });

  it('records the layout detected in the CLONE, so the config stops disagreeing with the bytes', async () => {
    await installed();
    await runUpdate();
    expect(readPharnConfig(proj)!.layout).toBe('flat');
  });

  // A destination that cannot even be inspected must not crash the run: lstat's
  // `throwIfNoEntry:false` suppresses ENOENT only, so a path whose PARENT is a
  // regular file raises ENOTDIR.
  it('reports an uninspectable destination as a skip instead of crashing', async () => {
    await installed();
    rmSync(join(proj, 'pharn-pipeline'), { recursive: true, force: true });
    write(join(proj, 'pharn-pipeline'), 'a FILE where a directory belongs');

    await expect(runUpdate()).resolves.toBeUndefined();

    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('UNREADABLE');
    expect(cleanup).toHaveBeenCalled();
  });

  // A symlinked PARENT directory — `.claude/hooks` pointed into a dotfiles repo
  // is the shape users actually have. The leaf-only classifier read straight
  // through it, planned a write, and then the write-side walk threw: exit 1,
  // partial writes, no config, and the identical abort on every re-run. It is now
  // the per-file skip the `unreadable` terminal was designed to produce.
  it('SKIPS a file under a symlinked PARENT instead of aborting the run', async () => {
    await installed();
    const outside = join(tmp.path(), 'dotfiles-hooks');
    mkdirSync(outside, { recursive: true });
    rmSync(join(proj, '.claude/hooks'), { recursive: true, force: true });
    symlinkSync(outside, join(proj, '.claude/hooks'));

    await expect(runUpdate()).resolves.toBeUndefined();

    const skipNote = vi
      .mocked(prompts.note)
      .mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    expect(skipNote).toContain('UNREADABLE');
    expect(skipNote).toContain(HOOK);
    // Not one byte went THROUGH the link.
    expect(readdirSync(outside)).toEqual([]);
    // ...while every other file upgraded normally.
    expect(body(CAP_FILE)).toBe('a11y v2');
    // ...and the bump is withheld, because something was skipped: the recorded
    // version stays true and the next run still has work.
    expect(readPharnConfig(proj)!.skillsVersion).toBe('1.0.0');
    expect(cleanup).toHaveBeenCalled();
  });

  // The advice a skip report prints must name an action that can actually
  // succeed. `--force` overrides exactly the three record-based buckets
  // (`skipOrForce`); `unreadable` is decided BEFORE the decision table and
  // `force` is not an input to that branch — so prescribing `--force` when every
  // skip is `unreadable` sends the user round a loop that produces a
  // byte-identical run forever, while the withheld version bump keeps
  // `pharn status --strict` red with no command that clears it.
  describe('advice for skips --force cannot clear', () => {
    const skipNote = () =>
      vi.mocked(prompts.note).mock.calls.find((c) => c[1] === 'SKIPPED')?.[0];
    const withheldWarning = () =>
      vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .find((m) => m.includes('still recorded as skills v'));

    // A regular file where a directory belongs: CAP_FILE's destination cannot be
    // inspected at all, which is the only way into the `unreadable` bucket.
    const makeUnreadable = () => {
      rmSync(join(proj, 'pharn-pipeline'), { recursive: true, force: true });
      write(join(proj, 'pharn-pipeline'), 'a FILE where a directory belongs');
    };

    it('does NOT prescribe --force when every skip is unreadable', async () => {
      await installed();
      makeUnreadable();

      await expect(runUpdate()).resolves.toBeUndefined();

      const skipped = skipNote();
      expect(skipped).toContain('UNREADABLE');
      expect(skipped).not.toContain('Re-run with --force');
      expect(skipped).toContain(
        '--force cannot clear the UNREADABLE paths above.',
      );
      expect(skipped).toContain('Inspect each path by hand');
      expect(withheldWarning()).toContain('resolve them to finish the upgrade');
      expect(withheldWarning()).not.toContain('--force');
    });

    it('says the same under --force, which changes nothing for these paths', async () => {
      await installed();
      makeUnreadable();

      // Still a skip and still exit 0 — `--force` cannot reach this bucket...
      await expect(runUpdate({ force: true })).resolves.toBeUndefined();

      const skipped = skipNote();
      expect(skipped).toContain('UNREADABLE');
      expect(skipped).not.toContain('Re-run with --force');
      expect(skipped).toContain(
        '--force cannot clear the UNREADABLE paths above.',
      );
      expect(withheldWarning()).toContain('resolve them to finish the upgrade');
      expect(withheldWarning()).not.toContain('--force');
      // ...and the bump stays withheld, so the recorded version stays true.
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.0.0');
    });

    it('KEEPS the --force advice when a forceable bucket is skipped too', async () => {
      await installed();
      makeUnreadable();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate();

      const skipped = skipNote();
      expect(skipped).toContain('MODIFIED');
      expect(skipped).toContain('Re-run with --force');
      expect(skipped).toContain(
        '--force cannot clear the UNREADABLE paths above.',
      );
      // Fixed at the source, never by map iteration order (P5).
      expect(skipped!.indexOf('Re-run with --force')).toBeLessThan(
        skipped!.indexOf('--force cannot clear'),
      );
      expect(withheldWarning()).toContain('or re-run with --force');
    });

    // The invariant the whole wording leans on: under `--force` the three
    // record-based buckets all become writes, so `unreadable` is the only label
    // that can still reach the skip report — a forced run can therefore never
    // honestly prescribe `--force`.
    it('drops the --force advice on a FORCED run that also had a modified file', async () => {
      await installed();
      makeUnreadable();
      write(join(proj, DOC), 'MY LOCAL EDIT');

      await runUpdate({ force: true });

      // The modified file was overwritten; only the unreadable path survives.
      expect(body(DOC)).toBe('constitution v2');
      const skipped = skipNote();
      expect(skipped).toContain('UNREADABLE');
      expect(skipped).not.toContain('MODIFIED');
      expect(skipped).not.toContain('Re-run with --force');
      expect(withheldWarning()).toContain('resolve them to finish the upgrade');
      expect(withheldWarning()).not.toContain('--force');
    });
  });

  // The replacement for the whole-dir copy's "no partial installs" property: if
  // the loop dies part-way, the files pharn DID write must still be recorded —
  // an unrecorded pharn write reads as the user's edit on the next run and is
  // then skipped forever.
  it('records the files it already wrote when the apply throws mid-loop', async () => {
    await installed();
    // Make every file differ so they are all planned writes...
    for (const rel of [CAP_FILE, DOC, HOOK]) write(join(proj, rel), 'stale v0');
    await writeRecords(proj, {
      skillsVersion: '1.0.0',
      commit: null,
      files: {
        [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
        [DOC]: contentHash(join(proj, DOC)),
        [HOOK]: contentHash(join(proj, HOOK)),
        ['.claude/commands/pharn-plan.md']: contentHash(
          join(proj, '.claude/commands/pharn-plan.md'),
        ),
      },
    });
    // ...then make ONE of them unwritable, so applyWrites succeeds on the earlier
    // files and throws on this one.
    //
    // The mechanism has to survive the classifier: a symlinked PARENT (what this
    // used to use) is now an `unreadable` SKIP and never reaches applyWrites at
    // all. A read-only DEST DIRECTORY does — readDiskState still hashes the file,
    // so the plan is unchanged (row 3, `updated`, a planned write), and the
    // replacement's temp sibling is what cannot be created, mid-loop. (A
    // read-only dest FILE no longer fails: writes replace by rename, F-19.)
    //
    // ORDER IS LOAD-BEARING: the chmod comes AFTER the writes above and AFTER
    // writeRecords hashed those bytes, or the fixture itself would fail EACCES
    // and the test would pass for the wrong reason.
    chmodSync(join(proj, HOOK, '..'), 0o555);

    try {
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    } finally {
      // Restored inside the test, not in an afterEach: useTmpDir's rmSync
      // suppresses ENOENT, not EACCES, and this must hold even if the assertion
      // above throws. (Inert for uid 0 — this suite must not run as root.)
      chmodSync(join(proj, HOOK, '..'), 0o755);
    }

    // The manifest writes capabilities and commands BEFORE hooks, so those
    // landed; the hook write is the one that threw.
    const store = records();
    expect(body(CAP_FILE)).toBe('a11y v2');
    expect(store?.[CAP_FILE]).toBe(contentHash(join(proj, CAP_FILE)));
    // The failing one is not claimed as written.
    expect(store?.[HOOK]).not.toBe(contentHash(join(repo, HOOK)));
    // The config was never written, so the store is stamped with the config's
    // UNCHANGED values and the two still agree — the next run can use it.
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
    const read = readRecords(proj);
    expect(read.kind === 'ok' && read.store.skillsVersion).toBe('1.0.0');
    expect(cleanup).toHaveBeenCalled();
  });

  it('does NOT mint a record store on a partial failure when there was no baseline', async () => {
    // Minting from a handful of paths would flip the rest of the install from the
    // honest `unverifiable` to a false `unrecorded` (the rule `add` also follows).
    await installed();
    rmSync(join(proj, RECORDS_FILE), { force: true });
    // A DIFFERENT mechanism from the test above, and it has to be: with the store
    // deleted every PRESENT file is `unverifiable` and skipped (row 6), so a
    // read-only dest file would leave plan.writes EMPTY and the run would resolve.
    // The hook must stay ABSENT — row 1, `restored`, the one row that survives a
    // deleted store — and its PARENT must be what refuses the write. A read-only
    // directory does exactly that: applyWrites' mkdirSync({recursive:true}) is a
    // no-op on an existing directory, and the copyFileSync after it fails EACCES.
    const hooks = join(proj, '.claude/hooks');
    rmSync(hooks, { recursive: true, force: true });
    mkdirSync(hooks);
    chmodSync(hooks, 0o555);

    try {
      await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

      expect(readRecords(proj)).toEqual({ kind: 'absent' });
    } finally {
      chmodSync(hooks, 0o755);
    }
  });

  it('records hashes read back from the DEST, not carried over from the clone', async () => {
    await installed();
    await runUpdate();
    // Equal here because the copy behaved — the point is that the value is
    // obtained by re-reading disk, so it cannot disagree with what landed.
    expect(records()?.[DOC]).toBe(contentHash(join(proj, DOC)));
  });

  it('prints NO backup line when the failed run created no backup', async () => {
    // The other half of the contract: without --force nothing is backed up, so a
    // mid-run failure has no pointer to offer and must not invent one. (The
    // writes it did make were all to files pharn itself wrote and proved
    // pristine — rows 1 and 3 — so no user bytes were at risk.)
    await installed();
    rmSync(join(proj, 'pharn.config.json'), { force: true });
    mkdirSync(join(proj, 'pharn.config.json'), { recursive: true });

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

    expect(backupDirs()).toEqual([]);
    expect(printedLines()).not.toContain(BACKUP_DIR);
    expect(printedLines()).not.toContain('stopped part-way');
  });

  it('writes the records BEFORE the config, so a failed config write still leaves records describing disk', async () => {
    // Asserted by consequence rather than by spying: make the config write fail
    // (a directory where the file belongs → EISDIR) and check the records landed
    // anyway. Config-first would have left the records stale instead — which is
    // the failure mode that makes pharn's own bytes look like the user's edits.
    await installed();
    rmSync(join(proj, 'pharn.config.json'), { force: true });
    mkdirSync(join(proj, 'pharn.config.json'), { recursive: true });

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));

    expect(records()?.[DOC]).toBe(contentHash(join(proj, DOC)));
    expect(cleanup).toHaveBeenCalled();
  });

  // The `models` block is pharn-oss's. `update` moves a block pharn wrote to
  // pharn-oss's current one and keeps one the user edited — the per-file rows,
  // over the block (lib/models-update.ts) — and converts the format pharn
  // wrote before 0.7.0.
  describe('the models block', () => {
    const UPSTREAM = {
      stages: {
        default: { model: 'sonnet', effort: 'high' },
        plan: { model: 'opus', effort: 'high' },
        review: { model: 'opus', effort: 'high' },
      },
    };
    // The default every published pharn through 0.6.0 wrote.
    const OLD_DEFAULT = {
      default: { model: 'sonnet-5', effort: 'high' },
      stages: {
        plan: { model: 'opus-4-8', effort: 'max' },
        review: { model: 'opus-4-8', effort: 'high' },
      },
    };
    const models = () => readPharnConfig(proj)!.models;
    const needsConversionAfter = () =>
      JSON.stringify(models()).includes('opus-4-8');
    const modelsNote = () =>
      (vi
        .mocked(prompts.note)
        .mock.calls.find((c) => c[1] === 'MODELS')?.[0] as
        string | undefined) ?? '';
    // The config on disk too: `--force` backs it up, and the position test
    // reads it raw.
    async function installedWith(
      block: unknown,
      recorded?: unknown,
    ): Promise<PharnConfig> {
      const config = await installed(
        block === undefined ? {} : { models: block },
      );
      await writePharnConfig(proj, config);
      if (recorded !== undefined) {
        const read = readRecords(proj);
        if (read.kind !== 'ok') throw new Error('no records');
        await writeRecords(proj, {
          skillsVersion: config.skillsVersion,
          commit: config.commit,
          files: {
            ...read.store.files,
            [MODELS_RECORD_KEY]: modelsRecordHash(recorded),
          },
        });
      }
      return config;
    }

    beforeEach(() => {
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({ models: UPSTREAM, ship: {} }),
      );
    });

    it("replaces the default an earlier pharn wrote with pharn-oss's block", async () => {
      await installedWith(OLD_DEFAULT);

      await runUpdate();

      expect(models()).toEqual(UPSTREAM);
      expect(records()?.[MODELS_RECORD_KEY]).toBe(modelsRecordHash(UPSTREAM));
      expect(modelsNote()).toContain(
        "Replaced the models block an earlier pharn wrote with pharn-oss's.",
      );
      expect(modelsNote()).toContain(
        'node .dev/floor/check-model-config.mjs agreement',
      );
    });

    it('converts an edited block in the old format and keeps its values — and the version still advances', async () => {
      await installedWith({
        default: { model: 'haiku-4-5', effort: 'low' },
        stages: { review: { model: 'fable-5', effort: 'max' } },
      });

      await runUpdate();

      expect(models()).toEqual({
        stages: {
          default: { model: 'haiku', effort: 'low' },
          review: { model: 'fable', effort: 'max' },
        },
      });
      // Converted by pharn, still the user's: no record claims it.
      expect(records()?.[MODELS_RECORD_KEY]).toBeUndefined();
      const note = modelsNote();
      expect(note).toContain(
        'Kept your models block — pharn has no record of writing it.',
      );
      expect(note).toContain(
        'Converted your models block from the format pharn wrote before 0.7.0,',
      );
      expect(note).toContain('stage "review" model "fable-5" → "fable"');
      expect(note).toContain("--force replaces it with pharn-oss's");
      // The note's own lines (not the quoted, indented details) stay within
      // 70 VISIBLE columns: an 80-column note box never wraps one mid-sentence.
      // Measured without color codes, which FORCE_COLOR can turn on (lib/color.ts).
      for (const line of stripVTControlCharacters(note).split('\n')) {
        if (!line.startsWith('  ')) expect(line.length).toBeLessThanOrEqual(70);
      }
      // A kept block is configuration, not unfinished work.
      expect(readPharnConfig(proj)!.skillsVersion).toBe('1.1.0');
    });

    it('names what cannot be converted and leaves it as it is', async () => {
      await installedWith({
        default: { model: 'gpt-4', effort: 'high' },
        stages: { plan: { model: 'opus-4-8', effort: 'max' } },
      });

      await runUpdate();

      expect(models()).toEqual({
        stages: {
          default: { model: 'gpt-4', effort: 'high' },
          plan: { model: 'opus', effort: 'max' },
        },
      });
      expect(modelsNote()).toContain(
        "pharn-oss's rules still reject your models block — left as is,",
      );
      expect(modelsNote()).toContain('stage "default" model "gpt-4"');
    });

    // The conversion is this CLI's job, so it must reach an install that is
    // already current — and must not keep re-opening the gate once done.
    it('migrates at the same skills version, then is up to date', async () => {
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
      write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
      await installedWith(OLD_DEFAULT);

      await runUpdate();

      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(models()).toEqual(UPSTREAM);
      // The confirm note said why a current install is being re-applied.
      expect(String(vi.mocked(prompts.note).mock.calls[0]?.[0])).toContain(
        'Your models block is in the format pharn wrote before 0.7.0 — this run converts it.',
      );

      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj));
      vi.mocked(prompts.outro).mockClear();
      await runUpdate();

      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0]).toBe(
        'Already up to date (skills v1.0.0).',
      );
    });

    // Review finding (REVIEW.md, P5): the gate must close even when what update
    // wrote is itself convertible — here a block pharn-oss might ship with a
    // top-level `default`, which its checker ignores.
    it('closes the gate once it has written the block, even a convertible one', async () => {
      const shaped = {
        default: { model: 'sonnet', effort: 'high' },
        stages: UPSTREAM.stages,
      };
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({ models: shaped }),
      );
      fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
      write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
      await installedWith(OLD_DEFAULT);

      await runUpdate();
      expect(models()).toEqual(shaped);

      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj));
      await runUpdate();

      expect(fetchRepo).toHaveBeenCalledTimes(1);
      expect(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0]).toBe(
        'Already up to date (skills v1.0.0).',
      );
    });

    // Review finding (REVIEW.md, P5), end to end: an old default converted
    // while pharn-oss's block was unusable is still pharn's afterwards.
    it('replaces an old default it had to convert, once pharn-oss’s block is usable', async () => {
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({ models: { stages: { triage: {} } } }),
      );
      await installedWith(OLD_DEFAULT);

      await runUpdate();
      expect(needsConversionAfter()).toBe(false);

      // pharn-oss fixes its block in its next release.
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({ models: UPSTREAM }),
      );
      write(join(repo, 'SKILLS_VERSION'), '1.2.0\n');
      fetchRemoteSkillsVersion.mockResolvedValue('1.2.0');
      loadArchetypeConfigOrExit.mockReturnValue(readPharnConfig(proj));
      vi.mocked(prompts.note).mockClear();
      await runUpdate();

      expect(models()).toEqual(UPSTREAM);
      expect(modelsNote()).toContain(
        "Moved your models block to pharn-oss's current one: you had",
      );
    });

    it("restores a missing block with pharn-oss's", async () => {
      await installedWith(undefined);

      await runUpdate();

      expect(models()).toEqual(UPSTREAM);
      expect(records()?.[MODELS_RECORD_KEY]).toBe(modelsRecordHash(UPSTREAM));
      expect(modelsNote()).toContain(
        "Your config had no models block — wrote pharn-oss's.",
      );
    });

    it('moves a block still at its recorded hash to the current one', async () => {
      const previous = {
        stages: { default: { model: 'opus', effort: 'low' } },
      };
      await installedWith(previous, previous);

      await runUpdate();

      expect(models()).toEqual(UPSTREAM);
      expect(modelsNote()).toContain(
        "Moved your models block to pharn-oss's current one: you had",
      );
    });

    it('keeps a block the user changed, in place, with its record carried', async () => {
      const edited = {
        stages: {
          default: { model: 'haiku', effort: 'low' },
          review: { model: 'fable', effort: 'max' },
        },
      };
      await installedWith(edited, { stages: {} });
      const keysBefore = Object.keys(
        JSON.parse(readFileSync(join(proj, 'pharn.config.json'), 'utf8')),
      );

      await runUpdate();

      expect(models()).toEqual(edited);
      expect(records()?.[MODELS_RECORD_KEY]).toBe(
        modelsRecordHash({ stages: {} }),
      );
      expect(modelsNote()).toContain(
        'Kept your models block — you changed it since pharn wrote it.',
      );
      // The key keeps its place in the file.
      const keysAfter = Object.keys(
        JSON.parse(readFileSync(join(proj, 'pharn.config.json'), 'utf8')),
      );
      expect(keysAfter.indexOf('models')).toBe(keysBefore.indexOf('models'));
    });

    it('--force replaces a block the user changed, after backing up the config', async () => {
      const edited = {
        stages: { default: { model: 'haiku', effort: 'low' } },
      };
      await installedWith(edited, { stages: {} });

      await runUpdate({ force: true });

      expect(models()).toEqual(UPSTREAM);
      const dirs = backupDirs();
      expect(dirs).toHaveLength(1);
      const saved = JSON.parse(
        readFileSync(
          join(proj, BACKUP_DIR, dirs[0]!, 'pharn.config.json'),
          'utf8',
        ),
      ) as { models: unknown };
      expect(saved.models).toEqual(edited);
      expect(modelsNote()).toContain(
        "Replaced your models block with pharn-oss's (--force).",
      );
      expect(modelsNote()).toContain(`${BACKUP_DIR}/${dirs[0]!}`);
    });

    it("says nothing about a block that is already pharn-oss's", async () => {
      await installedWith(structuredClone(UPSTREAM));

      await runUpdate();

      expect(modelsNote()).toBe('');
      expect(records()?.[MODELS_RECORD_KEY]).toBe(modelsRecordHash(UPSTREAM));
    });

    it('with no usable records file, keeps a block it cannot prove is pharn’s', async () => {
      const edited = { stages: { default: { model: 'haiku', effort: 'low' } } };
      await installedWith(edited);
      rmSync(join(proj, RECORDS_FILE));

      await runUpdate();

      expect(models()).toEqual(edited);
      expect(modelsNote()).toContain(
        `Kept your models block — no usable ${RECORDS_FILE} to check it.`,
      );
    });

    it('when pharn-oss ships no block, still converts yours from the old format', async () => {
      rmSync(join(repo, 'pharn.config.json'));
      await installedWith(OLD_DEFAULT);

      await runUpdate();

      expect(models()).toEqual({
        stages: {
          default: { model: 'sonnet', effort: 'high' },
          plan: { model: 'opus', effort: 'max' },
          review: { model: 'opus', effort: 'high' },
        },
      });
      const note = modelsNote();
      expect(note).toContain(
        'pharn-oss ships no models block, so yours is kept.',
      );
      expect(note).toContain('Converted your models block');
    });

    it('when pharn-oss ships no block and yours needs nothing, says nothing', async () => {
      rmSync(join(repo, 'pharn.config.json'));
      await installedWith(structuredClone(UPSTREAM));

      await runUpdate();

      expect(models()).toEqual(UPSTREAM);
      expect(modelsNote()).toBe('');
    });

    it("does not apply a block pharn-oss's rules reject, and names why", async () => {
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({
          models: { stages: { default: UPSTREAM.stages.default, triage: {} } },
        }),
      );
      await installedWith(OLD_DEFAULT);

      await runUpdate();

      // Yours stays — converted, since the old format is rejected regardless.
      expect(models()).toEqual({
        stages: {
          default: { model: 'sonnet', effort: 'high' },
          plan: { model: 'opus', effort: 'max' },
          review: { model: 'opus', effort: 'high' },
        },
      });
      const note = modelsNote();
      expect(note).toContain(
        "pharn-oss's models block was not applied; this pharn rejects it:",
      );
      expect(note).toContain('stage "triage" is not a product stage');
      expect(note).toContain('upgrade pharn');
    });
  });

  describe('layout migration (the (d) fix)', () => {
    // A project recorded `flat` meeting a `pharn`-layout clone: the copy has
    // always landed at the clone's paths, but the config used to keep saying
    // `flat`, leaving status/remove/list addressing a tree the files left.
    function pharnClone(): void {
      rmSync(repo, { recursive: true, force: true });
      write(join(repo, 'SKILLS_VERSION'), '1.1.0\n');
      write(
        join(repo, 'pharn/pharn-contracts/finding-shape.md'),
        'contract v2',
      );
      write(
        join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'),
        'a11y v2',
      );
      write(join(repo, 'pharn/CONSTITUTION.md'), 'constitution v2');
      write(join(repo, '.claude/commands/pharn-plan.md'), 'plan v2');
      // The fixed pharn-core surface (seam-resolver + its evals).
      write(
        join(repo, 'pharn/pharn-core/seam-resolver/seam-resolver.md'),
        'resolver v2',
      );
      write(
        join(repo, 'pharn/pharn-core/seam-resolver/evals/cases/resolve.md'),
        'case v2',
      );
    }

    it("records the CLONE's layout, not the stale one from the config", async () => {
      await installed(); // config.layout === 'flat'
      pharnClone();

      await runUpdate();

      expect(readPharnConfig(proj)!.layout).toBe('pharn');
      expect(body('pharn/pharn-pipeline/grillers/a11y/a11y.md')).toBe(
        'a11y v2',
      );
    });

    // pharn-core is a FIXED surface, not a capability, so it reaches the project
    // only through the install manifest. A project that predates the surface has
    // none of its files — they classify `missing → restore` (row 1: nothing local
    // to protect), so a version-bumping update installs the seam-resolver the
    // copied /pharn-build command cites. Note the bound this does NOT cover: a
    // project already at the latest skillsVersion early-returns before any of
    // this (src/commands/update.ts) and needs --force — see docs/commands/update.md.
    it('RESTORES a missing pharn/pharn-core (fixed surface, missing → restore)', async () => {
      await installed(); // v1.0.0 tree; no pharn/pharn-core anywhere
      pharnClone(); // v1.1.0 clone that ships it
      expect(existsSync(join(proj, 'pharn/pharn-core'))).toBe(false);

      await runUpdate();

      expect(body('pharn/pharn-core/seam-resolver/seam-resolver.md')).toBe(
        'resolver v2',
      );
      expect(
        body('pharn/pharn-core/seam-resolver/evals/cases/resolve.md'),
      ).toBe('case v2');
      // Restored files are recorded, so the next run can tell pharn's bytes from
      // the user's edits (an unrecorded file would skip as `unrecorded` forever).
      expect(records()).toHaveProperty(
        'pharn/pharn-core/seam-resolver/seam-resolver.md',
      );
    });

    it('warns that the abandoned flat tree is no longer managed', async () => {
      await installed();
      pharnClone();

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('pharn/ layout');
      // update never deletes, so the old copies are still there — hence the warning.
      expect(body(CAP_FILE)).toBe('a11y v1');
    });

    // The mirror direction: a project recorded `pharn` meeting a flat clone — which
    // is the default fixture, since scaffoldClone writes the flat tree. The field
    // has always been direction-agnostic; the report used to test only for 'flat'
    // and dropped this case on the floor, silently abandoning the whole pharn/ tree
    // (contracts, floor, docs, every capability) — strictly more than the other
    // direction leaves behind.
    //
    // Scope, honestly: this pins the RENDERER branch, not a migration end-to-end. A
    // real pharn→flat migration restores the flat paths (they do not exist yet)
    // whereas here they are present at v1 and upgrade; the branch fires either way,
    // because it keys off `written.length > 0` and not off which action wrote them.
    it('warns that the abandoned pharn/ tree is no longer managed', async () => {
      await installed({ layout: 'pharn' });
      // A real pharn/ tree for the warning to be about. It sits outside the flat
      // manifest, so update neither reads nor touches it — and detectLayout reads
      // the CLONE, so this cannot change which layout is resolved.
      write(
        join(proj, 'pharn/pharn-contracts/finding-shape.md'),
        'contract v1',
      );

      await runUpdate();

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(warned).toContain('pharn/ tree');
      // The other direction's message must NOT fire: this pins the branch that ran,
      // not merely that some warning appeared.
      expect(warned).not.toContain('moved to the pharn/ layout');
      // update never deletes, so the abandoned tree is still there — hence the warning.
      expect(body('pharn/pharn-contracts/finding-shape.md')).toBe(
        'contract v1',
      );
      expect(readPharnConfig(proj)!.layout).toBe('flat');
    });
  });
});
