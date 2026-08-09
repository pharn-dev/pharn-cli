import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const installCapabilityDirs = vi.fn();
vi.mock('../src/lib/install-capabilities.js', () => ({
  installCapabilityDirs,
}));

const readSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', () => ({ readSkillsVersion }));

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

  const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
  const LENS_FILE = 'pharn-review/n-plus-one/n-plus-one.md';
  const EXISTING = 'pharn-pipeline/grillers/security/security.md';

  // The mocked installer writes real files, so the recorded paths are the ones
  // that actually landed rather than a list the test invented.
  function installWrites(): void {
    installCapabilityDirs.mockImplementation(
      (_repo: string, root: string, caps: { name: string }[]) => {
        for (const c of caps) {
          const rel = c.name === 'n-plus-one' ? LENS_FILE : CAP_FILE;
          mkdirSync(join(root, rel, '..'), { recursive: true });
          writeFileSync(join(root, rel), `${c.name} bytes`);
        }
        return caps;
      },
    );
  }

  async function seedStore(): Promise<void> {
    mkdirSync(join(proj, EXISTING, '..'), { recursive: true });
    writeFileSync(join(proj, EXISTING), 'security bytes');
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
    proj = tmp.path();
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    loadArchetypeConfigOrExit.mockReturnValue(config());
    fetchRepo.mockResolvedValue({
      dir: '/repo',
      sha: 'a'.repeat(40),
      cleanup: vi.fn(),
    });
    parseCapabilityIndex.mockReturnValue({
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
    installWrites();
  });
  afterEach(() => vi.clearAllMocks());

  const store = () => {
    const read = readRecords(proj);
    return read.kind === 'ok' ? read.store : null;
  };

  it('appends the added capability without dropping pre-existing entries', async () => {
    await seedStore();

    await runAdd('a11y');

    expect(store()!.files).toEqual({
      [EXISTING]: sha256File(join(proj, EXISTING)),
      [CAP_FILE]: sha256File(join(proj, CAP_FILE)),
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
      [EXISTING, CAP_FILE, LENS_FILE].sort(),
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
      capabilities: [
        { name: 'a11y', role: 'griller', applies: ['ssr'] },
        { name: 'trust-fence', role: 'lens', applies: 'universal' },
        { name: 'security', role: 'griller', applies: 'universal' },
      ],
    });
    readSkillsVersion.mockReturnValue('1.0.0'); // matches — version gate passes
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
    // The mocked installer writes real files at the pharn layout, so the recorded
    // paths are the ones that actually landed rather than a list this test made up.
    installCapabilityDirs.mockImplementation(
      (_repo: string, root: string, caps: { name: string }[]) => {
        for (const _c of caps) {
          mkdirSync(join(root, LENS_FILE, '..'), { recursive: true });
          writeFileSync(join(root, LENS_FILE), 'trust-fence bytes');
        }
        return caps;
      },
    );
    mkdirSync(join(proj, EXISTING, '..'), { recursive: true });
    writeFileSync(join(proj, EXISTING), 'security bytes');
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
    const GRILLER_FILE = 'pharn/pharn-pipeline/grillers/a11y/a11y.md';
    installCapabilityDirs.mockImplementation(
      (_repo: string, root: string, caps: { name: string }[]) => {
        for (const c of caps) {
          const rel = c.name === 'a11y' ? GRILLER_FILE : LENS_FILE;
          mkdirSync(join(root, rel, '..'), { recursive: true });
          writeFileSync(join(root, rel), `${c.name} bytes`);
        }
        return caps;
      },
    );
    mkdirSync(join(proj, EXISTING, '..'), { recursive: true });
    writeFileSync(join(proj, EXISTING), 'security bytes');
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
