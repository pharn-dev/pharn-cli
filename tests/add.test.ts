import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  ProcessExit,
  restoreTTY,
  setTTY,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  groupMultiselect: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

// The single-writer lock does REAL fs work in the project root, and most of this
// file runs against the fake cwd `/proj`. Pass it through here and assert the
// WIRING (which command name, which cwd) — the lock's own behaviour, and the
// end-to-end refusal, are covered against real directories in
// tests/project-lock.test.ts and tests/project-lock-commands.test.ts.
const withProjectLock = vi.fn(
  async (_cwd: string, _command: string, fn: () => unknown) => fn(),
);
vi.mock('../src/lib/project-lock.js', async () => ({
  // Only the acquisition is stubbed. ProjectLockedError stays the REAL class,
  // because add.ts branches on `instanceof` to route a held lock to the refusal
  // path (no PHARN_DEBUG hint) rather than the crash path — a stand-in class
  // would silently take the wrong branch.
  ...(await vi.importActual<typeof import('../src/lib/project-lock.js')>(
    '../src/lib/project-lock.js',
  )),
  withProjectLock,
}));

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const installCapabilityDirs = vi.fn();
vi.mock('../src/lib/install-capabilities.js', () => ({
  installCapabilityDirs,
}));

const readSkillsVersion = vi.fn();
// min-cli-gate imports readMinCli from this module, so the mock must expose it —
// the default is the real-world case: upstream ships no MIN_CLI, no constraint.
const readMinCli = vi.fn(
  (): { version: string | null; warning: string | null } => ({
    version: null,
    warning: null,
  }),
);
vi.mock('../src/lib/skills-version.js', () => ({
  readSkillsVersion,
  readMinCli,
}));

const loadArchetypeConfigOrExit = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  loadArchetypeConfigOrExit,
  writePharnConfig,
}));

// capability-address.js and capability-picker.js are intentionally NOT mocked —
// add uses the real parseCapabilityArg (name / role:name parsing) and the real
// buildAddSelection / interactiveAllowed (available = index − installed).
const { runAdd } = await import('../src/commands/add.js');
const prompts = await import('@clack/prompts');
const { readRecords, writeRecords, RECORDS_FILE } =
  await import('../src/lib/install-records.js');
const { sha256File } = await import('../src/lib/hash.js');

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// The project-relative dir one capability occupies, at the flat layout or under
// pharn/. Mirrors installCapabilityDirs' own role→subtree ternary, which is what
// the copying installer mocks below have to reproduce to be faithful.
function capDir(
  cap: { name: string; role: string },
  prefix: '' | 'pharn/' = '',
): string {
  return cap.role === 'griller'
    ? `${prefix}pharn-pipeline/grillers/${cap.name}`
    : `${prefix}pharn-review/${cap.name}`;
}

// An installCapabilityDirs mock that COPIES the clone dir into the project,
// exactly as the real one does. `add` derives BOTH its destination-drift set and
// its record keys from the CLONE now, so a mock that invents files the clone does
// not carry would be asserting against a tree that cannot exist.
function copyingInstaller(prefix: '' | 'pharn/' = ''): void {
  installCapabilityDirs.mockImplementation(
    (repo: string, root: string, caps: { name: string; role: string }[]) => {
      for (const c of caps) {
        const rel = capDir(c, prefix);
        cpSync(join(repo, rel), join(root, rel), {
          recursive: true,
          force: true,
        });
      }
      return caps;
    },
  );
}

// The single `.pharn-backup/<ts>/` directory a run created, or null when it
// created none. `null` is the assertion that matters for the no-drift cases.
function backupRoot(proj: string): string | null {
  const root = join(proj, '.pharn-backup');
  if (!existsSync(root)) return null;
  const entries = readdirSync(root);
  return entries.length === 1 ? join(root, entries[0]!) : null;
}

describe('runAdd (archetype)', () => {
  stubProcessExit();
  beforeEach(() => vi.spyOn(process, 'cwd').mockReturnValue('/proj'));
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  const archConfig = (
    caps: { name: string; role: 'griller' | 'lens' }[] = [
      { name: 'security', role: 'griller' },
    ],
  ): PharnConfig => ({
    pharnVersion: '0.2.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [],
    installedAt: '2026-07-07T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: caps,
  });

  const index = {
    unknown: [],
    capabilities: [
      { name: 'a11y', role: 'griller', applies: ['ssr', 'spa'] },
      { name: 'security', role: 'griller', applies: 'universal' },
      { name: 'n-plus-one', role: 'lens', applies: ['backend', 'ssr'] },
    ],
  };

  function mockClone(): ReturnType<typeof vi.fn> {
    const cleanup = vi.fn();
    // fetchRepo carries the pinned SHA; the archetype-add path records repo.sha
    // as `commit`, no separate fetch.
    fetchRepo.mockResolvedValue({ dir: '/repo', sha: 'sha', cleanup });
    parseCapabilityIndex.mockReturnValue(index);
    readSkillsVersion.mockReturnValue('1.0.0');
    return cleanup;
  }

  // ---------------------------------------------------------------------------
  // The unpinned control flow. `add.ts` measured the weakest branch coverage of
  // any command file, and the gaps were not obscure — they were the ambiguity
  // hard-fail CLAUDE.md documents, the cancel exit code, and both clone
  // failures. Each is a path a user reaches, and none of them had a test.
  // ---------------------------------------------------------------------------

  /** An index where one name exists in BOTH roles — the ambiguity fixture. */
  const AMBIGUOUS = {
    unknown: [],
    capabilities: [
      { name: 'dup', role: 'griller', applies: 'universal' },
      { name: 'dup', role: 'lens', applies: 'universal' },
    ],
  };

  it('hard-fails on an ambiguous bare name, listing both role:name addresses', async () => {
    // `matches[0]!` sits on the line right after the length check, so a
    // regression that dropped or inverted it would silently install whichever
    // capability the index happened to list first. `remove`'s twin branch is
    // pinned; this one was not.
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();
    parseCapabilityIndex.mockReturnValue(AMBIGUOUS as never);

    await expect(runAdd('dup')).rejects.toMatchObject(new ProcessExit(1));

    expect(lastError()).toMatch(/griller:dup/);
    expect(lastError()).toMatch(/lens:dup/);
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    // The refusal still happens after the finally that disposes of the clone.
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('and the role:name form resolves that ambiguity and installs', async () => {
    // The positive companion is what makes this a disambiguation CONTRACT
    // rather than "an error exists": the error must be escapable by the exact
    // address the error names.
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    parseCapabilityIndex.mockReturnValue(AMBIGUOUS as never);

    await runAdd('lens:dup');

    expect(installCapabilityDirs).toHaveBeenCalledWith('/repo', '/proj', [
      { name: 'dup', role: 'lens' },
    ]);
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect((written as PharnConfig).capabilities).toContainEqual({
      name: 'dup',
      role: 'lens',
      source: 'manual',
    });
  });

  it('the picker cancel exits 0 — a user cancel is not a failure', async () => {
    // `add`'s cancel exit-code contract was entirely unpinned: a cancel that
    // leaked a non-zero code, or fell through to "Nothing selected", would have
    // gone unnoticed.
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    setTTY(true, true);
    const cleanup = mockClone();
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(CANCEL as never);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(0));

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when the clone fails on the NAMED path, before any parse', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    fetchRepo.mockRejectedValueOnce(new Error('offline'));

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(parseCapabilityIndex).not.toHaveBeenCalled();
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('exits 1 when the clone fails on the PICKER path, without prompting', async () => {
    // The user is never asked to choose from a menu the command cannot serve.
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    setTTY(true, true);
    fetchRepo.mockRejectedValueOnce(new Error('offline'));

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('aborts before any fetch when the config is not an archetype install', async () => {
    // loadArchetypeConfigOrExit prints LEGACY_CONFIG_MESSAGE + exit(1) for a
    // legacy config (asserted in pharn-config.test.ts); here: no network.
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('installs a capability by name and appends it (archetypes untouched)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();

    await runAdd('a11y');

    expect(installCapabilityDirs).toHaveBeenCalledWith('/repo', '/proj', [
      { name: 'a11y', role: 'griller' },
    ]);
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect((written as PharnConfig).capabilities).toEqual([
      { name: 'security', role: 'griller' },
      // `add` is the ONLY writer of `manual`: the user named this capability, so
      // `pharn update` must preserve it rather than re-derive it (P7).
      { name: 'a11y', role: 'griller', source: 'manual' },
    ]);
    expect((written as PharnConfig).archetypes).toEqual(['ssr']);
    expect(cleanup).toHaveBeenCalled();
  });

  it('holds the single-writer lock across the install, once per run', async () => {
    // Wiring, not behaviour: the lock itself is covered in
    // tests/project-lock.test.ts and the refusal end-to-end in
    // tests/project-lock-commands.test.ts. What must be pinned HERE is that
    // `add` takes it at all, names itself, and takes exactly one — a per-pick
    // lock would leave gaps between picks for another process to interleave.
    await runAdd('a11y');
    expect(withProjectLock).toHaveBeenCalledTimes(1);
    expect(withProjectLock).toHaveBeenCalledWith(
      '/proj',
      'add',
      expect.any(Function),
    );
  });

  it('resolves role:name addressing', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();

    await runAdd('lens:n-plus-one');

    expect(installCapabilityDirs).toHaveBeenCalledWith('/repo', '/proj', [
      { name: 'n-plus-one', role: 'lens' },
    ]);
  });

  it('is a no-op when the capability is already installed', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    const cleanup = mockClone();

    await runAdd('a11y');

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith('a11y is already installed.');
    expect(cleanup).toHaveBeenCalled();
  });

  it('exits(1) listing valid capabilities for an unknown name (cleans up)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();

    await expect(runAdd('bogus')).rejects.toMatchObject(new ProcessExit(1));

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('exits(1) on an invalid role prefix, before any fetch', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    await expect(runAdd('bogus:x')).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  // --- bare `pharn add` (no arg): interactive picker / non-TTY guard ----------

  it('no-arg in a NON-TTY exits(1) before any fetch (never prompts)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    setTTY(false, false);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(fetchRepo).not.toHaveBeenCalled();
    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
  });

  it('no-arg in a TTY installs each pick via the per-name path, threading config', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig()); // installed: security
    mockClone();
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([
      'griller:a11y',
      'lens:n-plus-one',
    ]);

    await runAdd(undefined);

    expect(installCapabilityDirs).toHaveBeenNthCalledWith(1, '/repo', '/proj', [
      { name: 'a11y', role: 'griller' },
    ]);
    expect(installCapabilityDirs).toHaveBeenNthCalledWith(2, '/repo', '/proj', [
      { name: 'n-plus-one', role: 'lens' },
    ]);
    // grill F1: the FINAL persisted config holds ALL picks, not just the last.
    const written = writePharnConfig.mock.calls.at(-1)![1] as PharnConfig;
    // Both entry-construction sites tag `manual` — the per-name path AND the
    // picker's threaded mirror. If only the first did, every pick but the last
    // would persist untagged and the next update would delete it.
    expect(written.capabilities).toEqual([
      { name: 'security', role: 'griller' },
      { name: 'a11y', role: 'griller', source: 'manual' },
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
    ]);
  });

  // --- the proxy notice (wiring) ----------------------------------------------
  //
  // add has TWO fetch sites — the named path and the picker path — and the
  // picker one sits behind an arg check plus a non-TTY refusal, making it the
  // site most likely to be lost in a refactor. Both are pinned, plus the
  // no-clone refusal paths.
  describe('proxy notice', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('warns before the clone on the NAMED path', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      loadArchetypeConfigOrExit.mockReturnValue(archConfig());
      mockClone();
      let warnedBeforeFetch = false;
      const cleanup = vi.fn();
      fetchRepo.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return { dir: '/repo', sha: 'sha', cleanup };
      });

      await runAdd('a11y');

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    it('warns before the clone on the PICKER path', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      loadArchetypeConfigOrExit.mockReturnValue(
        archConfig([
          { name: 'a11y', role: 'griller' },
          { name: 'security', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ]),
      );
      mockClone();
      setTTY(true, true);
      let warnedBeforeFetch = false;
      const cleanup = vi.fn();
      fetchRepo.mockImplementationOnce(async () => {
        warnedBeforeFetch = vi.mocked(prompts.log.warn).mock.calls.length > 0;
        return { dir: '/repo', sha: 'sha', cleanup };
      });

      await runAdd(undefined);

      expect(warnedBeforeFetch).toBe(true);
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).toContain('will not use it');
    });

    // A path that never clones must not describe a transport. The legacy-config
    // abort exits before any fetch.
    it('says nothing on a path that never clones', async () => {
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      loadArchetypeConfigOrExit.mockImplementationOnce(() => {
        throw new ProcessExit(1);
      });

      await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

      expect(fetchRepo).not.toHaveBeenCalled();
      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('will not use it');
    });

    it('says nothing when no proxy variable is set', async () => {
      vi.stubEnv('https_proxy', undefined);
      vi.stubEnv('HTTPS_PROXY', undefined);
      loadArchetypeConfigOrExit.mockReturnValue(archConfig());
      mockClone();

      await runAdd('a11y');

      const warned = vi
        .mocked(prompts.log.warn)
        .mock.calls.map(([m]) => String(m))
        .join('\n');
      expect(warned).not.toContain('will not use it');
    });
  });

  it('no-arg in a TTY with everything installed exits 0 without prompting', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([
        { name: 'a11y', role: 'griller' },
        { name: 'security', role: 'griller' },
        { name: 'n-plus-one', role: 'lens' },
      ]),
    );
    const cleanup = mockClone();
    setTTY(true, true);

    await runAdd(undefined);

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'All available capabilities are already installed.',
    );
    expect(cleanup).toHaveBeenCalled();
  });

  it('no-arg in a TTY with an empty selection installs nothing (no config write)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([]);

    await runAdd(undefined);

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  // --- the version gate ------------------------------------------------------
  // `add` clones @main, so the clone can be AHEAD of what this project installed.
  // Stamping the clone's SKILLS_VERSION into the config over unchanged old bytes
  // is what made `pharn update`'s same-version early-return print "Already up to
  // date" over a stale install. These pin the refusal on BOTH paths.

  // The refusal reaches the user through the same log.error the other add errors
  // use; read the last one rather than asserting an exact string, so the message
  // can be reworded without the invariants (both versions + the resolution) going
  // untested.
  const lastError = (): string =>
    vi.mocked(prompts.log.error).mock.calls.at(-1)![0] as string;

  it('refuses a named add when the clone is at a different skills version', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig()); // records v1.0.0
    const cleanup = mockClone();
    readSkillsVersion.mockReturnValue('2.0.0'); // upstream released

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    // Names BOTH versions and the one command that resolves it.
    expect(lastError()).toContain('v1.0.0');
    expect(lastError()).toContain('v2.0.0');
    expect(lastError()).toContain('pharn update');
    expect(cleanup).toHaveBeenCalled();
  });

  // --- fatal-error reporting (FABLE 4.6 + 5.2) -------------------------------
  //
  // `add`'s `{kind:'error'}` outcome carries BOTH caught exceptions and curated
  // gate refusals, so the hint has to follow the exception, not the outcome kind.
  describe('fatal-error reporting', () => {
    const realDebug = process.env.PHARN_DEBUG;
    beforeEach(() => delete process.env.PHARN_DEBUG);
    afterEach(() => {
      if (realDebug === undefined) delete process.env.PHARN_DEBUG;
      else process.env.PHARN_DEBUG = realDebug;
    });

    const informed = (): string =>
      vi
        .mocked(prompts.log.info)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');

    it('prints the PHARN_DEBUG hint when the clone throws', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(archConfig());
      fetchRepo.mockRejectedValueOnce(new Error('fetch exploded'));

      await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

      expect(lastError()).toContain('fetch exploded');
      expect(informed()).toContain('PHARN_DEBUG');
      expect(vi.mocked(prompts.log.error).mock.calls.at(-1)![1]).toEqual({
        output: process.stderr,
      });
    });

    it('prints NO hint for the version-gate refusal (a curated policy message)', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(archConfig());
      mockClone();
      readSkillsVersion.mockReturnValue('2.0.0');

      await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

      expect(lastError()).toContain('pharn update');
      expect(informed()).not.toContain('PHARN_DEBUG');
    });

    it('prints NO hint for an unresolvable capability name', async () => {
      loadArchetypeConfigOrExit.mockReturnValue(archConfig());
      mockClone();
      readSkillsVersion.mockReturnValue('1.0.0');
      parseCapabilityIndex.mockReturnValue({
        unknown: [],
        capabilities: [{ name: 'security', role: 'griller' }],
      });

      await expect(runAdd('nope')).rejects.toMatchObject(new ProcessExit(1));

      expect(lastError()).toContain('Unknown capability');
      expect(informed()).not.toContain('PHARN_DEBUG');
    });
  });

  it('writes NOTHING when the gate refuses — this is what keeps update honest', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    readSkillsVersion.mockReturnValue('2.0.0');

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('refuses symmetrically when the clone is OLDER than the config', async () => {
    // A rollback or a hand edit. The gate fires on `!==`, never `<`, so this must
    // read the same as the ahead case — never a guessed direction.
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    readSkillsVersion.mockReturnValue('0.9.0');

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(lastError()).toContain('v1.0.0');
    expect(lastError()).toContain('v0.9.0');
    expect(lastError()).toContain('pharn update');
    expect(installCapabilityDirs).not.toHaveBeenCalled();
  });

  it('gates BEFORE the already-installed no-op (named path ordering)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    mockClone();
    readSkillsVersion.mockReturnValue('2.0.0');

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(prompts.outro).not.toHaveBeenCalledWith(
      'a11y is already installed.',
    );
  });

  it('refuses the picker BEFORE the multi-select ever renders', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();
    readSkillsVersion.mockReturnValue('2.0.0');
    setTTY(true, true);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
    // Both paths share ONE versionGate, so the message is structurally identical
    // — assert it here anyway, or the "names both versions + the resolution"
    // invariant is only ever proven on the named path.
    expect(lastError()).toContain('v1.0.0');
    expect(lastError()).toContain('v2.0.0');
    expect(lastError()).toContain('pharn update');
  });

  it('gates BEFORE the all-installed outcome (picker path ordering)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([
        { name: 'a11y', role: 'griller' },
        { name: 'security', role: 'griller' },
        { name: 'n-plus-one', role: 'lens' },
      ]),
    );
    mockClone();
    readSkillsVersion.mockReturnValue('2.0.0');
    setTTY(true, true);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(prompts.outro).not.toHaveBeenCalledWith(
      'All available capabilities are already installed.',
    );
  });

  it('exits(1) and still cleans up when SKILLS_VERSION cannot be read', async () => {
    // readSkillsVersion throws on a missing/invalid file, which is why the gate
    // runs INSIDE the try — outside it the throw would skip the finally.
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();
    readSkillsVersion.mockImplementation(() => {
      throw new Error('SKILLS_VERSION is missing in the fetched repo.');
    });

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Record-store wiring (real filesystem). `add` must extend pharn.records.json
// with the files it just wrote — otherwise the next `pharn update` sees no
// record for them and skips them as `unrecorded` forever. The picker installs
// several capabilities in one run, so the merge must ACCUMULATE: add.ts already
// carries a "thread the config forward or the writes clobber down to the last
// one" bug comment, and a store merged the same way would inherit it.
// ---------------------------------------------------------------------------
describe('runAdd — pharn.records.json', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let proj = '';
  let clone = '';

  const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
  const CAP_NESTED = 'pharn-pipeline/grillers/a11y/evals/cases/basic.md';
  const LENS_FILE = 'pharn-review/n-plus-one/n-plus-one.md';
  const EXISTING = 'pharn-pipeline/grillers/security/security.md';

  // A REAL clone tree on disk, not the '/repo' stub the suites above share: the
  // record keys are now derived from the clone, so a fixture with no clone would
  // record nothing and prove nothing.
  function makeClone(): void {
    clone = join(tmp.path(), 'clone');
    write(join(clone, CAP_FILE), 'a11y upstream');
    write(join(clone, CAP_NESTED), 'a11y eval upstream');
    write(join(clone, LENS_FILE), 'n-plus-one upstream');
  }

  async function seedStore(): Promise<void> {
    write(join(proj, EXISTING), 'security bytes');
    await writeRecords(proj, {
      skillsVersion: '1.0.0',
      commit: null,
      files: { [EXISTING]: sha256File(join(proj, EXISTING)) },
    });
  }

  const config = (): PharnConfig => ({
    pharnVersion: '0.4.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    modules: [],
    installedAt: '2026-07-07T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'security', role: 'griller' }],
    layout: 'flat',
  });

  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    makeClone();
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    loadArchetypeConfigOrExit.mockReturnValue(config());
    fetchRepo.mockResolvedValue({
      dir: clone,
      sha: 'a'.repeat(40),
      cleanup: vi.fn(),
    });
    parseCapabilityIndex.mockReturnValue({
      unknown: [],
      capabilities: [
        { name: 'a11y', role: 'griller', applies: ['ssr'] },
        { name: 'n-plus-one', role: 'lens', applies: ['ssr'] },
        { name: 'security', role: 'griller', applies: 'universal' },
      ],
    });
    // MATCHES config().skillsVersion — it must, or the version gate refuses and
    // none of these merge assertions would be reached. `add` can only ever run at
    // the version the project is already on, so that is the state to test the
    // record merging in. (`commit` still moves: null → the clone's sha.)
    readSkillsVersion.mockReturnValue('1.0.0');
    copyingInstaller();
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  const store = () => {
    const read = readRecords(proj);
    return read.kind === 'ok' ? read.store : null;
  };

  const informed = (): string =>
    vi
      .mocked(prompts.log.info)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');

  it('appends the added capability without dropping pre-existing entries', async () => {
    await seedStore();

    await runAdd('a11y');

    expect(store()!.files).toEqual({
      [EXISTING]: sha256File(join(proj, EXISTING)),
      [CAP_FILE]: sha256File(join(proj, CAP_FILE)),
      [CAP_NESTED]: sha256File(join(proj, CAP_NESTED)),
    });
  });

  it('re-stamps the store to match the config written beside it', async () => {
    await seedStore();
    await runAdd('a11y');
    // The legal same-version-different-commit case: upstream pushed commits
    // without bumping SKILLS_VERSION, so the gate passes and `add` proceeds.
    // skillsVersion must stay put (add no longer advances it — advancing it over
    // unchanged bytes is exactly what made update's early-return lie), while
    // `commit` refreshes. The store must follow the config it sits beside, or the
    // very next update rejects it as written for another state.
    expect(store()!.skillsVersion).toBe('1.0.0');
    expect(store()!.commit).toBe('a'.repeat(40));
    const [, written] = writePharnConfig.mock.calls.at(-1)!;
    expect((written as PharnConfig).skillsVersion).toBe('1.0.0');
    expect((written as PharnConfig).commit).toBe('a'.repeat(40));
  });

  it('leaves the store byte-identical when the version gate refuses', async () => {
    await seedStore();
    const before = readFileSync(join(proj, RECORDS_FILE), 'utf8');
    readSkillsVersion.mockReturnValue('2.0.0'); // upstream released

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(before);
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('the picker accumulates every pick — no clobber down to the last one', async () => {
    await seedStore();
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([
      'griller:a11y',
      'lens:n-plus-one',
    ]);

    await runAdd(undefined);

    expect(Object.keys(store()!.files).sort()).toEqual(
      [EXISTING, CAP_FILE, CAP_NESTED, LENS_FILE].sort(),
    );
  });

  it('does NOT mint a store when none exists — absent stays absent (fail closed)', async () => {
    // Minting a partial store would silently relabel the whole install from
    // "unverifiable" to "unrecorded" while proving nothing about the other files.
    await runAdd('a11y');
    expect(readRecords(proj)).toEqual({ kind: 'absent' });
  });

  it('does NOT rewrite a corrupt store', async () => {
    writeFileSync(join(proj, RECORDS_FILE), 'not json{');
    await runAdd('a11y');
    expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe('not json{');
  });

  it('leaves the store untouched on the already-installed no-op path', async () => {
    await seedStore();
    const before = readFileSync(join(proj, RECORDS_FILE), 'utf8');
    await runAdd('security');
    expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(before);
  });

  // -------------------------------------------------------------------------
  // Destination-drift protection. `add` used to cpSync over whatever was at the
  // destination with no prompt, no per-file skip, and no backup — the only write
  // path with none of the three. The reachable sequence is one `update`
  // manufactures and announces: a dropped-unselected capability's files are left
  // on disk ("update never deletes"), the user edits them, and the later `add`
  // is not a config no-op because the entry is gone.
  // -------------------------------------------------------------------------
  describe('destination-drift backup', () => {
    it('backs up a user-edited leftover file before overwriting it', async () => {
      await seedStore();
      // The leftover dir `update` left behind, with the user's edit in it.
      write(join(proj, CAP_FILE), 'MY EDIT');
      write(join(proj, CAP_NESTED), 'a11y eval upstream'); // untouched → not drift

      await runAdd('a11y');

      const backup = backupRoot(proj)!;
      expect(backup).not.toBeNull();
      // The pre-edit bytes survive at the mirrored project-relative path.
      expect(readFileSync(join(backup, CAP_FILE), 'utf8')).toBe('MY EDIT');
      // Only the DRIFTED file is copied — the identical one is not noise.
      expect(existsSync(join(backup, CAP_NESTED))).toBe(false);
      // The add still happened: the destination now holds the clone's bytes.
      expect(readFileSync(join(proj, CAP_FILE), 'utf8')).toBe('a11y upstream');
      // The backup directory is the user's ONLY pointer back, so it is named.
      expect(informed()).toContain('.pharn-backup');
      expect(informed()).toContain(backup.split('.pharn-backup/')[1]!);
    });

    it('creates NO backup when the leftover files are byte-identical', async () => {
      // A drop-then-re-add of untouched files. Identical is not drift (mirrors
      // update's `identical → no-op`), or every such add would litter
      // .pharn-backup/ with copies of bytes nobody lost.
      await seedStore();
      write(join(proj, CAP_FILE), 'a11y upstream');
      write(join(proj, CAP_NESTED), 'a11y eval upstream');

      await runAdd('a11y');

      expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
      expect(informed()).not.toContain('.pharn-backup');
    });

    it('creates NO backup on a plain first install (nothing to overwrite)', async () => {
      await seedStore();
      await runAdd('a11y');
      expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
    });

    it('records ONLY clone-sourced files; an extra user file survives untouched', async () => {
      // The secondary fix. A dest walk swept this file into the store as
      // pharn-written; if upstream later shipped a file at that path, record ==
      // dest would make `update` read the user's file as cleanly upgradeable
      // instead of `modified`.
      await seedStore();
      const EXTRA = 'pharn-pipeline/grillers/a11y/MY-NOTES.md';
      write(join(proj, EXTRA), 'my notes');

      await runAdd('a11y');

      expect(store()!.files).toEqual({
        [EXISTING]: sha256File(join(proj, EXISTING)),
        [CAP_FILE]: sha256File(join(proj, CAP_FILE)),
        [CAP_NESTED]: sha256File(join(proj, CAP_NESTED)),
      });
      // The copy never touches it, so it is neither backed up nor destroyed.
      expect(readFileSync(join(proj, EXTRA), 'utf8')).toBe('my notes');
      expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
    });

    it('backs up on the picker path too, for every pick that overwrites edits', async () => {
      // The file argues twice elsewhere that a shared code path still needs
      // asserting at BOTH entry points; the backup surface is no exception.
      await seedStore();
      write(join(proj, CAP_FILE), 'MY GRILLER EDIT');
      write(join(proj, LENS_FILE), 'MY LENS EDIT');
      setTTY(true, true);
      vi.mocked(prompts.groupMultiselect).mockResolvedValue([
        'griller:a11y',
        'lens:n-plus-one',
      ]);

      await runAdd(undefined);

      // Two picks, two drifted files, two backup directories — uniqueBackupDir
      // suffixes the second rather than letting it overwrite the first, which is
      // the only thing standing between two same-second picks and a lost edit.
      const roots = readdirSync(join(proj, '.pharn-backup')).sort();
      expect(roots).toHaveLength(2);
      const saved = roots.map((r) => {
        const dir = join(proj, '.pharn-backup', r);
        const rel = existsSync(join(dir, CAP_FILE)) ? CAP_FILE : LENS_FILE;
        return readFileSync(join(dir, rel), 'utf8');
      });
      expect(saved.sort()).toEqual(['MY GRILLER EDIT', 'MY LENS EDIT']);
      expect(readFileSync(join(proj, CAP_FILE), 'utf8')).toBe('a11y upstream');
      expect(readFileSync(join(proj, LENS_FILE), 'utf8')).toBe(
        'n-plus-one upstream',
      );
      // BOTH directories are named, not just the last: each is the only pointer
      // back to that pick's bytes, and the picker prints many lines in a row.
      for (const r of roots) expect(informed()).toContain(r);
    });

    it('REFUSES rather than copy through a symlinked directory in the project', async () => {
      // Greptile P1, reproduced and measured on node v24.13.1: cpSync guards only
      // the SOURCE, so a symlinked INTERMEDIATE directory under the capability dir
      // makes it write straight THROUGH the link — replacing bytes wherever it
      // points, outside the project included. Skipping such a path would be worse
      // than doing nothing: the copy still writes through it while the backup that
      // was supposed to protect it silently omits the file. And it cannot be backed
      // up — createBackup refuses a symlinked component by design.
      await seedStore();
      write(join(proj, 'elsewhere/basic.md'), 'BYTES OUTSIDE THE CAPABILITY');
      mkdirSync(join(proj, 'pharn-pipeline/grillers/a11y'), {
        recursive: true,
      });
      symlinkSync(
        join(proj, 'elsewhere'),
        join(proj, 'pharn-pipeline/grillers/a11y/evals'),
      );
      const storeBefore = readFileSync(join(proj, RECORDS_FILE), 'utf8');

      await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

      // Nothing copied, nothing recorded, nothing configured — and crucially the
      // bytes the link pointed at are untouched.
      expect(installCapabilityDirs).not.toHaveBeenCalled();
      expect(writePharnConfig).not.toHaveBeenCalled();
      expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(storeBefore);
      expect(readFileSync(join(proj, 'elsewhere/basic.md'), 'utf8')).toBe(
        'BYTES OUTSIDE THE CAPABILITY',
      );
      expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
      // The message names the offending COMPONENT and the action that clears it.
      const err = vi.mocked(prompts.log.error).mock.calls.at(-1)![0] as string;
      expect(err).toContain('pharn-pipeline/grillers/a11y/evals');
      expect(err).toContain('symlink');
    });

    it('aborts with the user bytes intact when the backup cannot be written', async () => {
      // createBackup throws BEFORE it touches any original (lib/backup.ts), and
      // it runs BEFORE the copy — so a failed backup must leave the edit alone
      // rather than overwrite it unprotected.
      await seedStore();
      write(join(proj, CAP_FILE), 'MY EDIT');
      write(join(proj, 'elsewhere.md'), 'x');
      symlinkSync(join(proj, 'elsewhere.md'), join(proj, '.pharn-backup'));

      await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

      expect(readFileSync(join(proj, CAP_FILE), 'utf8')).toBe('MY EDIT');
      expect(installCapabilityDirs).not.toHaveBeenCalled();
      expect(writePharnConfig).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// The layout gate. `add` copies at the CLONE's layout, but remove/status/diff all
// address the project at the RECORDED layout (configLayout). When those disagree,
// add writes where nothing will ever look: reproduced live against pharn-oss
// v2.3.4 — `add lens:trust-fence` landed files at ./pharn/pharn-review/trust-fence
// under a `layout: "flat"` config, and the next `remove` answered "its files were
// already gone" while dropping only the config entry, orphaning the directory.
//
// These use REAL clone dirs on disk rather than the '/repo' stub the suites above
// share, because layout.js is deliberately NOT mocked — detectLayout must run its
// real existsSync against a real `pharn/pharn-contracts` marker (or its absence).
// ---------------------------------------------------------------------------
describe('runAdd — the layout gate', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let proj = '';
  let flatClone = '';
  let pharnClone = '';

  const LENS_FILE = 'pharn/pharn-review/trust-fence/trust-fence.md';
  const GRILLER_FILE = 'pharn/pharn-pipeline/grillers/a11y/a11y.md';
  const EXISTING = 'pharn/pharn-pipeline/grillers/security/security.md';

  // A clone is `pharn`-layout iff it carries the pharn/pharn-contracts leaf; an
  // empty dir at that path is the whole marker (lib/layout.ts).
  function makeClones(): void {
    flatClone = join(tmp.path(), 'flat-clone');
    pharnClone = join(tmp.path(), 'pharn-clone');
    mkdirSync(flatClone, { recursive: true });
    mkdirSync(join(pharnClone, 'pharn', 'pharn-contracts'), {
      recursive: true,
    });
    // Real capability content on BOTH clones: `add` derives its record keys and
    // its destination-drift set from the clone, so the pharn-layout happy-path
    // tests below need a tree to derive them from.
    write(join(flatClone, 'pharn-review/trust-fence/trust-fence.md'), 'tf');
    write(join(pharnClone, LENS_FILE), 'trust-fence upstream');
    write(join(pharnClone, GRILLER_FILE), 'a11y upstream');
  }

  function useClone(dir: string): ReturnType<typeof vi.fn> {
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir, sha: 'b'.repeat(40), cleanup });
    return cleanup;
  }

  // layout omitted entirely → configLayout resolves 'flat' (its documented
  // default for an absent OR hand-edited-garbage field), which is what makes the
  // absent-layout pair below a test of that default and not of the raw field.
  const config = (layout?: 'flat' | 'pharn'): PharnConfig => ({
    pharnVersion: '0.4.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    modules: [],
    installedAt: '2026-07-07T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'security', role: 'griller' }],
    ...(layout ? { layout } : {}),
  });

  const lastError = (): string =>
    vi.mocked(prompts.log.error).mock.calls.at(-1)![0] as string;

  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    makeClones();
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    loadArchetypeConfigOrExit.mockReturnValue(config('flat'));
    parseCapabilityIndex.mockReturnValue({
      unknown: [],
      capabilities: [
        { name: 'a11y', role: 'griller', applies: ['ssr'] },
        { name: 'trust-fence', role: 'lens', applies: 'universal' },
        { name: 'security', role: 'griller', applies: 'universal' },
      ],
    });
    readSkillsVersion.mockReturnValue('1.0.0'); // matches — version gate passes
    // vi.clearAllMocks() clears CALLS, not IMPLEMENTATIONS, so the records
    // suite's copying installer would otherwise leak in and cpSync from a clone
    // path these gate fixtures never create.
    installCapabilityDirs.mockReset();
    useClone(pharnClone);
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  it('refuses a named add when the clone layout differs from the recorded one', async () => {
    const cleanup = useClone(pharnClone);

    await expect(runAdd('lens:trust-fence')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    // Names BOTH resolved layouts and the one command that resolves it.
    expect(lastError()).toContain('flat');
    expect(lastError()).toContain('pharn');
    expect(lastError()).toContain('pharn update --force');
    expect(cleanup).toHaveBeenCalled();
  });

  it('refuses symmetrically when the project is pharn and the clone is flat', async () => {
    // A rollback or a hand edit. The gate fires on `!==`, never a direction, so
    // this must read the same as the other way round.
    loadArchetypeConfigOrExit.mockReturnValue(config('pharn'));
    useClone(flatClone);

    await expect(runAdd('lens:trust-fence')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(lastError()).toContain('flat');
    expect(lastError()).toContain('pharn');
    expect(lastError()).toContain('pharn update --force');
  });

  it('writes NOTHING when the layout gate refuses', async () => {
    await expect(runAdd('lens:trust-fence')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    // The orphan the live repro produced: nothing may appear at EITHER layout.
    expect(existsSync(join(proj, 'pharn'))).toBe(false);
    expect(existsSync(join(proj, 'pharn-review'))).toBe(false);
  });

  it('leaves an existing records store byte-identical when it refuses', async () => {
    mkdirSync(join(proj, EXISTING, '..'), { recursive: true });
    writeFileSync(join(proj, EXISTING), 'security bytes');
    await writeRecords(proj, {
      skillsVersion: '1.0.0',
      commit: null,
      files: { [EXISTING]: sha256File(join(proj, EXISTING)) },
    });
    const before = readFileSync(join(proj, RECORDS_FILE), 'utf8');

    await expect(runAdd('lens:trust-fence')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(readFileSync(join(proj, RECORDS_FILE), 'utf8')).toBe(before);
  });

  it('refuses the picker BEFORE the multi-select ever renders', async () => {
    const cleanup = useClone(pharnClone);
    setTTY(true, true);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
    // Both paths share ONE layoutGate, so this is structurally the same message —
    // assert it here anyway, or "names both layouts + the resolution" is only ever
    // proven on the named path.
    expect(lastError()).toContain('flat');
    expect(lastError()).toContain('pharn');
    expect(lastError()).toContain('pharn update --force');
  });

  it('produces the VERSION refusal when BOTH version and layout mismatch', async () => {
    // The realistic case: an old flat project meeting a new pharn clone. The two
    // gates are `??`-chained, so version short-circuits first — and `pharn update`
    // then fixes version AND layout in one pass. Asserted on the distinctive lead
    // of each message rather than a bare word, so either can be reworded freely.
    readSkillsVersion.mockReturnValue('2.0.0');

    await expect(runAdd('lens:trust-fence')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(lastError()).toContain('Skills version mismatch');
    expect(lastError()).toContain('v1.0.0');
    expect(lastError()).toContain('v2.0.0');
    expect(lastError()).not.toContain('Install layout mismatch');
  });

  it('an absent layout field PROCEEDS against a flat clone', async () => {
    // configLayout's documented default for an omitted field is 'flat', so this
    // pair is what pins that default rather than the raw config.layout value.
    loadArchetypeConfigOrExit.mockReturnValue(config()); // no layout key
    useClone(flatClone);

    await runAdd('lens:trust-fence');

    expect(installCapabilityDirs).toHaveBeenCalled();
    const [, written] = writePharnConfig.mock.calls.at(-1)!;
    expect((written as PharnConfig).capabilities).toContainEqual({
      name: 'trust-fence',
      role: 'lens',
      source: 'manual',
    });
  });

  it('an absent layout field REFUSES against a pharn clone', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config()); // no layout key
    useClone(pharnClone);

    await expect(runAdd('lens:trust-fence')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(installCapabilityDirs).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // The pharn↔pharn happy path — its FIRST pin. Every other add fixture is flat,
  // so nothing until now proved add's untouched layout-deriving call sites are
  // right at the pharn layout; the gate only guarantees the two AGREE. Asserting
  // layoutPaths(detectLayout) ≡ layoutPaths(configLayout) would be vacuous, so
  // what is asserted instead is the observable consequence: the record keys.
  // -------------------------------------------------------------------------
  it('installs at the pharn layout and records pharn/-prefixed paths', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config('pharn'));
    const cleanup = useClone(pharnClone);
    // The mocked installer COPIES the pharn-layout clone dir, so the recorded
    // paths are the ones that actually landed rather than a list this test made
    // up — and dest and clone agree, which is what the clone-derived record keys
    // require.
    copyingInstaller('pharn/');
    write(join(proj, EXISTING), 'security bytes');
    await writeRecords(proj, {
      skillsVersion: '1.0.0',
      commit: null,
      files: { [EXISTING]: sha256File(join(proj, EXISTING)) },
    });

    await runAdd('lens:trust-fence');

    // `add` passes NO paths argument — it depends on installCapabilityDirs'
    // default (layoutPaths(detectLayout(repoDir))) to mirror the clone. Pinned
    // explicitly because the installer is mocked here, so nothing else in the
    // suite would notice if that default stopped deriving from the clone.
    expect(installCapabilityDirs).toHaveBeenCalledWith(pharnClone, proj, [
      { name: 'trust-fence', role: 'lens' },
    ]);
    expect(installCapabilityDirs.mock.calls.at(-1)!).toHaveLength(3);

    const read = readRecords(proj);
    const files = read.kind === 'ok' ? read.store.files : null;
    // Exact equality, not a prefix probe: an empty or partial store must fail
    // here. A flat derivation would existsSync `pharn-review/trust-fence`, find
    // nothing, and silently record NOTHING for the capability just installed.
    expect(files).toEqual({
      [EXISTING]: sha256File(join(proj, EXISTING)),
      [LENS_FILE]: sha256File(join(proj, LENS_FILE)),
    });

    const [, written] = writePharnConfig.mock.calls.at(-1)!;
    expect((written as PharnConfig).capabilities).toContainEqual({
      name: 'trust-fence',
      role: 'lens',
      source: 'manual',
    });
    expect(cleanup).toHaveBeenCalled();
  });

  it('the picker accumulates every pick at the pharn layout too', async () => {
    // mergeCapabilityRecords re-derives the layout on EVERY pick, so the
    // accumulation invariant needs pinning at the pharn layout, not just flat.
    loadArchetypeConfigOrExit.mockReturnValue(config('pharn'));
    useClone(pharnClone);
    setTTY(true, true);
    copyingInstaller('pharn/');
    write(join(proj, EXISTING), 'security bytes');
    await writeRecords(proj, {
      skillsVersion: '1.0.0',
      commit: null,
      files: { [EXISTING]: sha256File(join(proj, EXISTING)) },
    });
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([
      'griller:a11y',
      'lens:trust-fence',
    ]);

    await runAdd(undefined);

    const read = readRecords(proj);
    const files = read.kind === 'ok' ? read.store.files : null;
    expect(Object.keys(files!).sort()).toEqual(
      [EXISTING, GRILLER_FILE, LENS_FILE].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Forward compatibility at `add`: the MIN_CLI handshake and the skipped-capability
// warning. `add` is the command the old fail-hard behaviour wedged HARDEST — its
// versionGate points at `pharn update`, whose own first act was the parse that
// threw — so both surfaces are pinned here.
// ---------------------------------------------------------------------------
describe('runAdd — forward compatibility', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    // vi.clearAllMocks() clears CALLS, not IMPLEMENTATIONS, so the real-filesystem
    // installers the records/layout suites install would otherwise leak in here.
    installCapabilityDirs.mockReset();
    writePharnConfig.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  const archConfig = (): PharnConfig => ({
    pharnVersion: '0.4.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [],
    installedAt: '2026-07-07T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'security', role: 'griller' }],
  });

  function mockClone(): ReturnType<typeof vi.fn> {
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', sha: 'sha', cleanup });
    parseCapabilityIndex.mockReturnValue({
      unknown: [],
      capabilities: [{ name: 'a11y', role: 'griller', applies: ['ssr'] }],
    });
    readSkillsVersion.mockReturnValue('1.0.0');
    readMinCli.mockReturnValue({ version: null, warning: null });
    return cleanup;
  }

  const errors = () =>
    vi
      .mocked(prompts.log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
  const warnings = () =>
    vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');

  it('refuses a too-old CLI: exit 1, clone cleaned up, nothing installed', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();
    readMinCli.mockReturnValue({ version: '99.0.0', warning: null });

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(cleanup).toHaveBeenCalled();
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(errors()).toContain('too old');
  });

  // MIN_CLI leads the `??` chain deliberately: `pharn update` — what versionGate
  // names — would be refused for the SAME reason, so pointing the user at it
  // would send them in a circle. Upgrading is the only action that resolves it.
  it('the MIN_CLI refusal WINS over the version gate when both fire', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    readMinCli.mockReturnValue({ version: '99.0.0', warning: null });
    readSkillsVersion.mockReturnValue('2.0.0'); // versionGate would also refuse

    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));

    expect(errors()).toContain('too old');
    expect(errors()).not.toContain('Skills version mismatch');
  });

  it('a garbage MIN_CLI warns but does NOT block the install', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    readMinCli.mockReturnValue({
      version: null,
      warning:
        'MIN_CLI in the fetched repo is not a valid version; continuing.',
    });

    await runAdd('a11y');

    expect(installCapabilityDirs).toHaveBeenCalled();
    expect(warnings()).toContain('MIN_CLI');
  });

  it('names an unparseable upstream capability, and still installs the rest', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    parseCapabilityIndex.mockReturnValue({
      capabilities: [{ name: 'a11y', role: 'griller', applies: ['ssr'] }],
      unknown: [
        {
          name: 'backwards-compat',
          role: 'griller',
          subtree: 'pharn-pipeline/grillers',
          reason: 'missing its markdown',
        },
      ],
    });

    await runAdd('a11y');

    expect(warnings()).toContain('backwards-compat');
    expect(warnings()).toContain('missing its markdown');
    expect(installCapabilityDirs).toHaveBeenCalled();
  });

  // The unparseable capability is not in the index, so `add` cannot address it —
  // and says so with the addresses that DO work, rather than half-installing it.
  it('warns ONCE for a multi-pick picker run, not once per pick', async () => {
    setTTY(true, true);
    loadArchetypeConfigOrExit.mockReturnValue({
      ...archConfig(),
      capabilities: [],
    });
    mockClone();
    parseCapabilityIndex.mockReturnValue({
      capabilities: [
        { name: 'a11y', role: 'griller', applies: ['ssr'] },
        { name: 'n-plus-one', role: 'lens', applies: ['ssr'] },
      ],
      unknown: [
        {
          name: 'backwards-compat',
          role: 'griller',
          subtree: 'pharn-pipeline/grillers',
          reason: 'missing its markdown',
        },
      ],
    });
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([
      'griller:a11y',
      'lens:n-plus-one',
    ]);

    await runAdd(undefined);

    // The index is parsed once and threaded into every pick, so the same fact is
    // stated once — not once per selected capability.
    expect(parseCapabilityIndex).toHaveBeenCalledTimes(1);
    const skipWarnings = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .filter((m) => m.includes('backwards-compat'));
    expect(skipWarnings).toHaveLength(1);
  });

  it('cannot add an unparseable capability by name (fail closed on installing)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    parseCapabilityIndex.mockReturnValue({
      capabilities: [{ name: 'a11y', role: 'griller', applies: ['ssr'] }],
      unknown: [
        {
          name: 'backwards-compat',
          role: 'griller',
          subtree: 'pharn-pipeline/grillers',
          reason: 'missing its markdown',
        },
      ],
    });

    await expect(runAdd('backwards-compat')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(errors()).toContain('Unknown capability');
  });
});
