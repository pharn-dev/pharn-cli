import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  ProcessExit,
  restoreNodeVersion,
  restoreTTY,
  setNodeVersion,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import type { PharnConfig } from '../src/types.js';

// Every clack function is a spy: under `--json` NONE may be reached, because
// each of them writes to stdout.
const spinnerFactory = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), message: vi.fn() },
  outro: vi.fn(),
  cancel: vi.fn(),
  spinner: spinnerFactory,
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({
  fetchRepo: async (source: unknown) => ({
    source,
    ...(await fetchRepo(source)),
  }),
}));
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
vi.mock('../src/lib/skills-version.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/skills-version.js')>(
    '../src/lib/skills-version.js',
  )),
  fetchRemoteSkillsVersion,
}));
const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));
const resolveCapabilities = vi.fn();
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

// The write functions, wrapped: a JSON dry run must reach none of them.
const createBackup = vi.fn();
vi.mock('../src/lib/backup.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/backup.js')>(
    '../src/lib/backup.js',
  );
  createBackup.mockImplementation(actual.createBackup);
  return { ...actual, createBackup };
});
const applyWrites = vi.fn();
vi.mock('../src/lib/apply-update.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/apply-update.js')
  >('../src/lib/apply-update.js');
  applyWrites.mockImplementation(actual.applyWrites);
  return { ...actual, applyWrites };
});
const writeRecordsSpy = vi.fn();
vi.mock('../src/lib/install-records.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/install-records.js')
  >('../src/lib/install-records.js');
  writeRecordsSpy.mockImplementation(actual.writeRecords);
  return { ...actual, writeRecords: writeRecordsSpy };
});
const withProjectLock = vi.fn();
vi.mock('../src/lib/project-lock.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/project-lock.js')
  >('../src/lib/project-lock.js');
  withProjectLock.mockImplementation(actual.withProjectLock);
  return { ...actual, withProjectLock };
});
const loadArchetypeConfigOrExit = vi.fn();
const assertConfigUnchanged = vi.fn();
const writePharnConfigSpy = vi.fn();
vi.mock('../src/lib/pharn-config.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/pharn-config.js')
  >('../src/lib/pharn-config.js');
  writePharnConfigSpy.mockImplementation(actual.writePharnConfig);
  return {
    ...actual,
    assertConfigUnchanged,
    loadArchetypeConfigOrExit,
    writePharnConfig: writePharnConfigSpy,
  };
});

const { LOCK_FILE } = await import('../src/lib/project-lock.js');
const { ReleaseResolveError } = await import('../src/lib/release.js');
const { runUpdate } = await import('../src/commands/update.js');
const prompts = await import('@clack/prompts');
const { readRecords, writeRecords, RECORDS_FILE } =
  await import('../src/lib/install-records.js');
const { contentHash } = await import('../src/lib/hash.js');
const { BACKUP_DIR } = await import('../src/lib/backup.js');
const { writePharnConfig } = await import('../src/lib/pharn-config.js');
const { UPDATE_SCHEMA_VERSION } = await import('../src/lib/update-report.js');

const CAP = { name: 'a11y', role: 'griller' as const };
const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
const DOC = 'CONSTITUTION.md';
const HOOK = '.claude/hooks/set-writes-scope.cjs';
const CMD = '.claude/commands/pharn-plan.md';
const ESC = String.fromCharCode(27);

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function scaffoldClone(repo: string, version: string, marker: string): void {
  write(join(repo, 'SKILLS_VERSION'), `${version}\n`);
  write(join(repo, CAP_FILE), `a11y ${marker}`);
  write(join(repo, DOC), `constitution ${marker}`);
  write(join(repo, HOOK), `hook ${marker}`);
  write(join(repo, CMD), `plan ${marker}`);
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

// The JSON the run printed: exactly ONE stdout write, and it must parse.
interface Parsed {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  raw: string;
}

describe('runUpdate --dry-run --json', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let proj = '';
  let repo = '';
  let cleanup = vi.fn();
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let otherSpies: ReturnType<typeof vi.spyOn>[] = [];

  async function installed(
    over: Partial<PharnConfig> = {},
  ): Promise<PharnConfig> {
    const old = join(tmp.path(), 'old-clone');
    scaffoldClone(old, '1.0.0', 'v1');
    for (const rel of [CAP_FILE, DOC, HOOK, CMD]) {
      write(join(proj, rel), readFileSync(join(old, rel), 'utf8'));
    }
    const config = baseConfig(over);
    await writeRecords(proj, {
      skillsVersion: config.skillsVersion,
      commit: config.commit,
      files: Object.fromEntries(
        [CAP_FILE, DOC, HOOK, CMD].map((rel) => [
          rel,
          contentHash(join(proj, rel)),
        ]),
      ),
    });
    await writePharnConfig(proj, config);
    loadArchetypeConfigOrExit.mockReturnValue(config);
    return config;
  }

  const stderr = (): string =>
    errSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');

  // Run it and parse what it printed.
  async function run(
    opts: {
      force?: boolean;
      ref?: 'latest' | 'main';
      yes?: boolean;
      compact?: boolean;
    } = {},
  ): Promise<Parsed> {
    await runUpdate({ ...opts, dryRun: true, json: true });
    return printed();
  }
  function printed(): Parsed {
    expect(logSpy).toHaveBeenCalledTimes(1);
    const raw = String(logSpy.mock.calls[0]![0]);
    return { json: JSON.parse(raw), raw };
  }

  // The headline contract: nothing but the object on stdout, no clack at all,
  // nothing written.
  function expectOnlyTheObject(): void {
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled();
    expect(prompts.intro).not.toHaveBeenCalled();
    expect(prompts.outro).not.toHaveBeenCalled();
    expect(prompts.note).not.toHaveBeenCalled();
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(prompts.log.info).not.toHaveBeenCalled();
    expect(prompts.log.warn).not.toHaveBeenCalled();
    expect(prompts.log.error).not.toHaveBeenCalled();
    expect(prompts.log.message).not.toHaveBeenCalled();
    expect(spinnerFactory).not.toHaveBeenCalled();
  }

  // The failure contract: stdout EMPTY, a plain stderr line, exit 1.
  async function expectFailure(
    opts: { force?: boolean; ref?: 'latest' | 'main' } = {},
  ): Promise<string> {
    await expect(
      runUpdate({ ...opts, dryRun: true, json: true }),
    ).rejects.toMatchObject(new ProcessExit(1));
    expect(logSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(prompts.log.error).not.toHaveBeenCalled();
    expect(prompts.log.warn).not.toHaveBeenCalled();
    expect(prompts.intro).not.toHaveBeenCalled();
    expect(spinnerFactory).not.toHaveBeenCalled();
    const err = stderr();
    expect(err).not.toBe('');
    // No clack framing glyphs on stderr either.
    expect(err).not.toMatch(/[│┌└◇●▲■]/);
    return err;
  }

  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    repo = join(tmp.path(), 'repo');
    mkdirSync(proj, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    otherSpies = [
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    ];
    cleanup = vi.fn();
    scaffoldClone(repo, '1.1.0', 'v2');
    fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
    resolveCapabilities.mockReturnValue({
      selected: [{ ...CAP, matched: ['ssr'] }],
      skipped: [],
    });
    loadArchetypeConfigOrExit.mockReturnValue(baseConfig());
    setTTY(false, false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    assertConfigUnchanged.mockReset();
    restoreTTY();
    restoreNodeVersion();
    delete process.env.PHARN_DEBUG;
    delete process.env.HTTPS_PROXY;
  });

  describe('status: planned', () => {
    it('prints ONE parseable object and nothing else, with no terminal', async () => {
      await installed();
      const { json, raw } = await run();
      expectOnlyTheObject();
      expect(raw.startsWith('{\n  "schemaVersion": 1,')).toBe(true);
      expect(json.schemaVersion).toBe(UPDATE_SCHEMA_VERSION);
      expect(json).toMatchObject({
        command: 'update',
        dryRun: true,
        status: 'planned',
        force: false,
        channel: 'main',
        channelChange: null,
        source: { kind: 'main', tag: null },
        archetypes: ['ssr'],
        version: {
          installed: '1.0.0',
          latest: '1.1.0',
          recorded: '1.1.0',
          withheld: false,
          pending: null,
        },
      });
      expect(json.plan.writes.sort()).toEqual(
        [CAP_FILE, DOC, HOOK, CMD].sort(),
      );
      expect(json.plan.files.map((f: { label: string }) => f.label)).toEqual(
        expect.arrayContaining(['updated']),
      );
      expect(json.plan.counts).toMatchObject({ updated: 4, skipped: 0 });
      expect(cleanup).toHaveBeenCalled();
      // The loader was asked for its stderr-only mode.
      expect(loadArchetypeConfigOrExit).toHaveBeenCalledWith(proj, {
        json: true,
      });
    });

    it('lists restored files, and skips edits without --force', async () => {
      await installed();
      write(join(proj, DOC), 'MY EDIT');
      rmSync(join(proj, CMD));
      const { json } = await run();
      const byRel = Object.fromEntries(
        json.plan.files.map((f: { rel: string }) => [f.rel, f]),
      );
      expect(byRel[CMD]).toMatchObject({ action: 'write', label: 'restored' });
      expect(byRel[DOC]).toMatchObject({
        action: 'skip',
        label: 'modified',
        forced: false,
        backup: false,
      });
      expect(json.plan.skipped).toEqual([{ label: 'modified', rels: [DOC] }]);
      expect(json.plan.backups).toEqual([]);
      expect(json.version).toMatchObject({
        recorded: '1.0.0',
        withheld: true,
        pending: '1.1.0',
      });
    });

    it('under --force: forced writes with their backups, for modified, unrecorded and unverifiable', async () => {
      await installed();
      write(join(proj, DOC), 'MY EDIT');
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture');
      const { [CMD]: _gone, ...rest } = read.store.files;
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: rest,
      });
      write(join(proj, CMD), 'MY CMD EDIT');
      const { json } = await run({ force: true });
      expect(json.force).toBe(true);
      const forced = json.plan.files.filter(
        (f: { forced: boolean }) => f.forced,
      );
      expect(forced.map((f: { label: string }) => f.label).sort()).toEqual([
        'modified',
        'unrecorded',
      ]);
      expect(json.plan.backups.sort()).toEqual([CMD, DOC].sort());
      expect(json.plan.counts.forced).toBe(2);

      // An unusable store makes every difference `unverifiable`.
      write(join(proj, RECORDS_FILE), '{not json');
      logSpy.mockClear();
      const again = await run({ force: true });
      expect(
        again.json.plan.files.map((f: { label: string }) => f.label),
      ).toContain('unverifiable');
      expect(again.json.plan.recordsNote).toEqual(expect.any(String));
    });

    it('reports a manual capability upstream no longer ships, a models update and hooks upstream wires', async () => {
      await installed({
        archetypes: ['lib'],
        capabilities: [CAP, { name: 'n-plus-one', role: 'lens' }],
      });
      write(join(repo, 'pharn-review/n-plus-one/n-plus-one.md'), 'v2');
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({
          models: { stages: { default: { model: 'sonnet', effort: 'high' } } },
        }),
      );
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
                    args: ['.claude/hooks/x.cjs'],
                  },
                ],
              },
            ],
          },
        }),
      );
      write(join(proj, '.claude/settings.json'), JSON.stringify({ hooks: {} }));
      const { json } = await run();
      expect(json.plan.capabilities.changes).toEqual([
        {
          role: 'lens',
          name: 'n-plus-one',
          source: 'manual',
          reason: 'dropped-gone',
        },
      ]);
      expect(json.plan.models).toMatchObject({ outcome: 'restored' });
      expect(JSON.stringify(json.plan.models)).not.toContain('"next"');
      expect(json.plan.hooks.status).toBe('missing');
      expect(json.plan.hooks.missing[0]).toMatchObject({
        event: 'Stop',
        command: 'node',
        args: ['.claude/hooks/x.cjs'],
      });
    });

    it('names a frozen capability, structured, and keeps it out of the plan', async () => {
      const FROZEN = { name: 'backwards-compat', role: 'griller' as const };
      const FILE =
        'pharn-pipeline/grillers/backwards-compat/backwards-compat.md';
      await installed({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] });
      write(join(repo, FILE), 'WIP');
      parseCapabilityIndex.mockReturnValue({
        capabilities: [],
        unknown: [
          {
            name: FROZEN.name,
            role: FROZEN.role,
            subtree: 'pharn-pipeline/grillers',
            reason: 'bad role',
          },
        ],
      });
      const { json } = await run();
      expect(json.plan.frozenCapabilities).toEqual([
        'griller:backwards-compat',
      ]);
      expect(json.plan.unknownCapabilities).toEqual([
        {
          role: 'griller',
          name: 'backwards-compat',
          subtree: 'pharn-pipeline/grillers',
          reason: 'bad role',
        },
      ]);
      expect(json.plan.writes).not.toContain(FILE);
      // The prose warning goes to stderr, not stdout (and not through clack).
      expect(stderr()).toContain('backwards-compat');
      expectOnlyTheObject();
    });

    it('reports a layout migration and the features README relocation', async () => {
      await installed({ layout: 'pharn' });
      const { json } = await run();
      expect(json.plan).toMatchObject({
        layout: 'flat',
        abandonedLayout: 'pharn',
      });
    });

    it('reports the features README relocation', async () => {
      await installed();
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: { ...read.store.files, 'features/README.md': 'a'.repeat(64) },
      });
      write(join(repo, 'pharn/features/README.md'), 'readme');
      write(join(repo, 'pharn/CONSTITUTION.md'), 'constitution v2');
      write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'a');
      write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'c');
      const again = await run();
      expect(again.json.plan.featuresReadmeRelocation).toBe(true);
    });

    it('records the channel switch and the release tag under --ref latest', async () => {
      await installed();
      const { json } = await run({ ref: 'latest' });
      expect(json.channel).toBe('latest');
      expect(json.channelChange).toEqual({ from: 'main', to: 'latest' });
      expect(json.source).toEqual({ kind: 'release', tag: 'v1.1.0' });
    });

    it('is the same plan the text dry run prints (one planner, one set of numbers)', async () => {
      await installed();
      write(join(proj, DOC), 'MY EDIT');
      await runUpdate({ dryRun: true });
      const outro = String(vi.mocked(prompts.outro).mock.calls.at(-1)![0]);
      vi.mocked(prompts.outro).mockClear();
      vi.mocked(prompts.note).mockClear();
      vi.mocked(prompts.intro).mockClear();
      const { json } = await run();
      expect(json.plan.counts).toEqual({
        updated: 3,
        restored: 0,
        ok: 0,
        forced: 0,
        skipped: 1,
      });
      expect(outro).toContain(
        `would write ${json.plan.writes.length} · back up ${json.plan.backups.length} · unchanged ${json.plan.counts.ok} · skipped ${json.plan.counts.skipped}`,
      );
    });
  });

  describe('status: early returns', () => {
    it('up-to-date: plan null, no fetch of the tarball', async () => {
      await installed({ skillsVersion: '1.1.0' });
      const { json } = await run();
      expectOnlyTheObject();
      expect(json).toMatchObject({
        status: 'up-to-date',
        plan: null,
        version: {
          installed: '1.1.0',
          latest: '1.1.0',
          recorded: null,
          withheld: null,
          pending: null,
        },
      });
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('is planned, not up-to-date, under --force at the current version', async () => {
      await installed({ skillsVersion: '1.1.0' });
      const { json } = await run({ force: true });
      expect(json.status).toBe('planned');
      expect(fetchRepo).toHaveBeenCalled();
    });

    it('is planned when a frozen capability re-opens the gate', async () => {
      await installed({
        skillsVersion: '1.1.0',
        frozenCapabilities: ['griller:old'],
      });
      const { json } = await run();
      expect(json.status).toBe('planned');
    });

    it('is planned when a legacy models block re-opens the gate', async () => {
      await installed({
        skillsVersion: '1.1.0',
        models: { default: 'opus-4-8', stages: {} } as never,
      });
      const { json } = await run();
      expect(json.status).toBe('planned');
    });

    it('is planned, restoring it, when a recorded file is missing at the current version', async () => {
      await installed({ skillsVersion: '1.1.0' });
      rmSync(join(proj, CMD));
      const { json } = await run();
      expect(json.status).toBe('planned');
      expect(
        json.plan.files.find((f: { rel: string }) => f.rel === CMD),
      ).toMatchObject({ action: 'write', label: 'restored' });
    });

    it('is planned when --ref switches the channel at the current version', async () => {
      await installed({ skillsVersion: '1.1.0' });
      const { json } = await run({ ref: 'latest' });
      expect(json.status).toBe('planned');
      expect(json.channelChange).toEqual({ from: 'main', to: 'latest' });
    });

    it('ahead-of-release: plan null, names the tag, exit 0', async () => {
      await installed({ skillsVersion: '2.0.0' });
      const { json } = await run({ ref: 'latest' });
      expectOnlyTheObject();
      expect(json).toMatchObject({
        status: 'ahead-of-release',
        plan: null,
        source: { kind: 'release', tag: 'v1.1.0' },
        version: { installed: '2.0.0', latest: '1.1.0' },
      });
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // F-15: main moved BACK. Not `ahead-of-release` — there is no release here —
    // but its own additive value, with the same exit and `plan: null`.
    it('ahead-of-main: plan null, source main, exit 0', async () => {
      await installed({ skillsVersion: '2.0.0' });
      const { json } = await run();
      expectOnlyTheObject();
      expect(json).toMatchObject({
        schemaVersion: 1,
        status: 'ahead-of-main',
        plan: null,
        channel: 'main',
        source: { kind: 'main', tag: null },
        version: { installed: '2.0.0', latest: '1.1.0' },
      });
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('--force makes an install ahead of main plannable', async () => {
      await installed({ skillsVersion: '2.0.0' });
      const { json } = await run({ force: true });
      expect(json.status).toBe('planned');
    });

    it('--force makes an ahead install plannable', async () => {
      await installed({ skillsVersion: '2.0.0' });
      const { json } = await run({ ref: 'latest', force: true });
      expect(json.status).toBe('planned');
    });
  });

  describe('orphans', () => {
    it('lists a file upstream stopped shipping in plan.orphans, and only on stdout', async () => {
      await installed();
      rmSync(join(repo, CMD));
      write(join(proj, CMD), 'MY EDIT');
      const { json } = await run();
      expectOnlyTheObject();
      expect(json.schemaVersion).toBe(1);
      expect(json.plan.orphans).toEqual([{ path: CMD, state: 'edited' }]);
      // Not a file decision: no entry, no skip, the version is not withheld.
      expect(json.plan.files.map((f: { rel: string }) => f.rel)).not.toContain(
        CMD,
      );
      expect(json.version.withheld).toBe(false);
      // --compact never filters it.
      logSpy.mockClear();
      expect((await run({ compact: true })).json.plan.orphans).toEqual(
        json.plan.orphans,
      );
    });

    it('omits plan.orphans when there is none', async () => {
      await installed();
      const { json } = await run();
      expect(json.plan).not.toHaveProperty('orphans');
    });
  });

  describe('--compact', () => {
    // CAP_FILE and HOOK already match upstream (noop), DOC is a clean upgrade,
    // CMD is an edit that would be skipped.
    async function mixed(): Promise<void> {
      await installed();
      write(join(proj, CAP_FILE), readFileSync(join(repo, CAP_FILE), 'utf8'));
      write(join(proj, HOOK), readFileSync(join(repo, HOOK), 'utf8'));
      write(join(proj, CMD), 'MY EDIT');
    }

    it('omits the noop entries, keeps the rest, and says so', async () => {
      await mixed();
      const full = (await run()).json;
      logSpy.mockClear();
      const { json } = await run({ compact: true });
      expectOnlyTheObject();
      expect(json.compact).toBe(true);
      expect(json.plan.files.map((f: { rel: string }) => f.rel).sort()).toEqual(
        [DOC, CMD].sort(),
      );
      expect(json.plan.filesOmitted).toEqual({ action: 'noop', count: 2 });
      expect(json.plan.filesOmitted.count).toBe(json.plan.counts.ok);
      expect(json.plan.skipped).toEqual([{ label: 'modified', rels: [CMD] }]);
      // Everything but the list and the two markers is the full report.
      const strip = (r: {
        plan: Record<string, unknown>;
        [key: string]: unknown;
      }): unknown => {
        const { compact: _c, plan, ...rest } = r;
        const { files: _f, filesOmitted: _o, ...planRest } = plan;
        return { ...rest, plan: planRest };
      };
      expect(strip(json)).toEqual(strip(full));
    });

    it('the default run carries neither marker', async () => {
      await mixed();
      const { json, raw } = await run();
      expect(json).not.toHaveProperty('compact');
      expect(json.plan).not.toHaveProperty('filesOmitted');
      expect(raw).not.toContain('filesOmitted');
      expect(json.plan.files).toHaveLength(4);
    });

    it('keeps forced entries under --force', async () => {
      await mixed();
      const { json } = await run({ compact: true, force: true });
      const forced = json.plan.files.filter(
        (f: { forced: boolean }) => f.forced,
      );
      expect(forced.map((f: { rel: string }) => f.rel)).toEqual([CMD]);
      expect(
        json.plan.files.some((f: { action: string }) => f.action === 'noop'),
      ).toBe(false);
    });

    it('marks up-to-date, ahead-of-release and ahead-of-main, with a null plan', async () => {
      await installed({ skillsVersion: '1.1.0' });
      const upToDate = (await run({ compact: true })).json;
      expect(upToDate).toMatchObject({
        status: 'up-to-date',
        compact: true,
        plan: null,
      });
      logSpy.mockClear();
      await installed({ skillsVersion: '9.0.0' });
      fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
      const ahead = (await run({ compact: true, ref: 'latest' })).json;
      expect(ahead).toMatchObject({
        status: 'ahead-of-release',
        compact: true,
        plan: null,
      });
      logSpy.mockClear();
      const aheadOfMain = (await run({ compact: true })).json;
      expect(aheadOfMain).toMatchObject({
        status: 'ahead-of-main',
        compact: true,
        plan: null,
      });
    });

    it('without --json, called directly: fail closed, nothing run', async () => {
      await installed();
      await expect(
        runUpdate({ dryRun: true, compact: true }),
      ).rejects.toMatchObject(new ProcessExit(1));
      expect(logSpy).not.toHaveBeenCalled();
      expect(stderr()).toContain('--compact');
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(prompts.intro).not.toHaveBeenCalled();
    });
  });

  describe('failures: stdout empty, stderr plain, exit 1', () => {
    it('a release that cannot be resolved', async () => {
      await installed();
      resolveSource.mockRejectedValueOnce(
        new ReleaseResolveError('no verified release published'),
      );
      expect(await expectFailure({ ref: 'latest' })).toContain(
        'no verified release published',
      );
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('a failed version check on the main channel', async () => {
      await installed();
      fetchRemoteSkillsVersion.mockRejectedValueOnce(new Error('offline'));
      expect(await expectFailure()).toContain('offline');
    });

    it('a fetch failure, with nothing written', async () => {
      await installed();
      const before = snapshotTree(proj);
      fetchRepo.mockRejectedValueOnce(new Error('network down'));
      expect(await expectFailure()).toContain('network down');
      expect(snapshotTree(proj)).toEqual(before);
    });

    it('a MIN_CLI refusal, after the clone is cleaned up', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '99.0.0\n');
      expect(await expectFailure()).toContain('99.0.0');
      expect(cleanup).toHaveBeenCalled();
    });

    it('a garbage MIN_CLI warns on stderr and still prints the plan', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), 'not-a-version\n');
      const { json } = await run();
      expect(json.status).toBe('planned');
      expect(stderr()).toContain('MIN_CLI');
      expectOnlyTheObject();
    });

    it('a planning throw, with the clone cleaned up', async () => {
      await installed();
      rmSync(join(repo, 'SKILLS_VERSION'));
      await expectFailure();
      expect(cleanup).toHaveBeenCalled();
    });

    it('dumps the cause on stderr only under PHARN_DEBUG', async () => {
      await installed();
      process.env.PHARN_DEBUG = '1';
      fetchRepo.mockRejectedValueOnce(new Error('boom-cause'));
      await expectFailure();
      expect(
        errSpy.mock.calls.some(
          (c: unknown[]) =>
            c[0] instanceof Error && c[0].message === 'boom-cause',
        ),
      ).toBe(true);
    });

    it('a Node below the floor, before any config load or network call', async () => {
      await installed();
      setNodeVersion('22.0.0');
      const err = await expectFailure();
      expect(err).toContain('24.2.0');
      expect(loadArchetypeConfigOrExit).not.toHaveBeenCalled();
      expect(resolveSource).not.toHaveBeenCalled();
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('--json without --dry-run, called directly: fail closed, nothing run', async () => {
      await installed();
      await expect(runUpdate({ json: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(logSpy).not.toHaveBeenCalled();
      expect(stderr()).toContain('--dry-run');
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(prompts.intro).not.toHaveBeenCalled();
    });
  });

  describe('diagnostics and untrusted text', () => {
    it('sends the proxy notice to stderr, before any fetch', async () => {
      await installed();
      process.env.HTTPS_PROXY = 'http://proxy.invalid:3128';
      await run();
      expect(stderr()).toMatch(/proxy/i);
      expectOnlyTheObject();
    });

    it('escapes a hostile capability name from upstream in the output text', async () => {
      await installed();
      parseCapabilityIndex.mockReturnValue({
        capabilities: [],
        unknown: [
          {
            name: `evil${ESC}[31m`,
            role: 'lens',
            subtree: 'pharn-review',
            reason: `bad${ESC}]52;c;AAAA`,
          },
        ],
      });
      const { json, raw } = await run();
      expect(raw).not.toContain(ESC);
      expect(json.plan.unknownCapabilities[0].name).toBe(`evil${ESC}[31m`);
    });
  });

  describe('writes nothing', () => {
    it('leaves the whole tree byte-identical and reaches no write function', async () => {
      await installed();
      write(join(proj, DOC), 'MY EDIT');
      write(join(proj, LOCK_FILE), '{"pid":1}');
      const before = snapshotTree(proj);
      const recordWrites = writeRecordsSpy.mock.calls.length;
      const configWrites = writePharnConfigSpy.mock.calls.length;
      await run({ force: true });
      expect(snapshotTree(proj)).toEqual(before);
      expect(existsSync(join(proj, BACKUP_DIR))).toBe(false);
      expect(writeRecordsSpy.mock.calls.length).toBe(recordWrites);
      expect(writePharnConfigSpy.mock.calls.length).toBe(configWrites);
      expect(createBackup).not.toHaveBeenCalled();
      expect(applyWrites).not.toHaveBeenCalled();
      expect(withProjectLock).not.toHaveBeenCalled();
      expect(assertConfigUnchanged).not.toHaveBeenCalled();
    });

    it('accepts --yes as a no-op', async () => {
      await installed();
      const { json } = await run({ yes: true });
      expect(json.status).toBe('planned');
      expect(prompts.confirm).not.toHaveBeenCalled();
    });
  });
});
