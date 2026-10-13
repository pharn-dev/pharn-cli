import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  ProcessExit,
  restoreTTY,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
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

// The write functions, wrapped so a test can assert none of them is ever
// reached while still running the real implementation for the real-run parity
// comparison.
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
const {
  MODELS_RECORD_KEY,
  modelsRecordHash,
  readRecords,
  writeRecords,
  RECORDS_FILE,
} = await import('../src/lib/install-records.js');
const { contentHash } = await import('../src/lib/hash.js');
const { BACKUP_DIR } = await import('../src/lib/backup.js');
const { writePharnConfig } = await import('../src/lib/pharn-config.js');

const CAP = { name: 'a11y', role: 'griller' as const };
const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
const DOC = 'CONSTITUTION.md';
const HOOK = '.claude/hooks/set-writes-scope.cjs';
const CMD = '.claude/commands/pharn-plan.md';
const LENS_FILE = 'pharn-review/n-plus-one/n-plus-one.md';

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

const text = (v: unknown): string => stripVTControlCharacters(String(v));

describe('runUpdate --dry-run', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let proj = '';
  let repo = '';
  let cleanup = vi.fn();

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

  const noteBody = (title: string): string =>
    text(
      vi.mocked(prompts.note).mock.calls.find((c) => c[1] === title)?.[0] ?? '',
    );
  const outroText = (): string =>
    text(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0] ?? '');
  const logged = (level: 'info' | 'warn'): string =>
    vi
      .mocked(prompts.log[level])
      .mock.calls.map((c) => text(c[0]))
      .join('\n');
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
    loadArchetypeConfigOrExit.mockReturnValue(baseConfig());
    setTTY(true, true);
  });
  afterEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations; a test that armed this must not leak.
    assertConfigUnchanged.mockReset();
    restoreTTY();
  });

  // The headline: a whole-tree snapshot, dotfiles and empty dirs included.
  describe('writes nothing', () => {
    async function dryRunLeavesTreeAlone(
      opts: { force?: boolean; ref?: 'latest' | 'main' },
      prepare: () => Promise<void> | void,
    ): Promise<void> {
      await prepare();
      const lockBefore = existsSync(join(proj, LOCK_FILE));
      const before = snapshotTree(proj);
      const recordWrites = writeRecordsSpy.mock.calls.length;
      const configWrites = writePharnConfigSpy.mock.calls.length;
      await runUpdate({ ...opts, dryRun: true });
      expect(snapshotTree(proj)).toEqual(before);
      expect(existsSync(join(proj, LOCK_FILE))).toBe(lockBefore);
      expect(existsSync(join(proj, BACKUP_DIR))).toBe(false);
      expect(writeRecordsSpy.mock.calls.length).toBe(recordWrites);
      expect(createBackup).not.toHaveBeenCalled();
      expect(applyWrites).not.toHaveBeenCalled();
      expect(writePharnConfigSpy.mock.calls.length).toBe(configWrites);
      expect(withProjectLock).not.toHaveBeenCalled();
      expect(assertConfigUnchanged).not.toHaveBeenCalled();
      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalled();
    }

    it('on a clean upgrade', async () => {
      await dryRunLeavesTreeAlone({}, () => installed().then(() => undefined));
      expect(outroText()).toContain('Nothing was changed');
    });

    it('under --force over modified, unrecorded and unverifiable files', async () => {
      await dryRunLeavesTreeAlone({ force: true }, async () => {
        await installed();
        write(join(proj, DOC), 'MY EDIT');
        write(join(proj, HOOK), 'MY HOOK EDIT');
        // No record for this one → `unrecorded`.
        const read = readRecords(proj);
        if (read.kind !== 'ok') throw new Error('fixture');
        const { [CMD]: _gone, ...rest } = read.store.files;
        await writeRecords(proj, {
          skillsVersion: '1.0.0',
          commit: null,
          files: rest,
        });
        write(join(proj, CMD), 'MY CMD EDIT');
      });
    });

    it('with an unusable records store (unverifiable)', async () => {
      await dryRunLeavesTreeAlone({}, async () => {
        await installed();
        write(join(proj, RECORDS_FILE), '{not json');
        write(join(proj, DOC), 'MY EDIT');
      });
      expect(noteBody('SKIPPED')).toContain('UNVERIFIABLE');
    });

    it('over a membership change and a models update', async () => {
      await dryRunLeavesTreeAlone({}, async () => {
        await installed({
          archetypes: ['lib'],
          capabilities: [CAP, { name: 'n-plus-one', role: 'lens' }],
        });
        write(join(repo, LENS_FILE), 'n-plus-one v2');
        write(
          join(repo, 'pharn.config.json'),
          JSON.stringify({
            models: {
              stages: { default: { model: 'sonnet', effort: 'high' } },
            },
          }),
        );
        resolveCapabilities.mockReturnValue({
          selected: [{ ...CAP, matched: ['ssr'] }],
          skipped: [],
        });
      });
      expect(noteBody('CAPABILITIES')).toContain('lens:n-plus-one');
      expect(noteBody('MODELS')).toContain('would write');
    });

    it('over an orphaned file, which it names and leaves in place', async () => {
      await dryRunLeavesTreeAlone({}, async () => {
        await installed();
        rmFile(join(repo, CMD)); // upstream stopped shipping it
      });
      expect(noteBody('ORPHANED')).toContain('UNCHANGED');
      expect(noteBody('ORPHANED')).toContain(CMD);
    });

    it('over a layout migration, with a live lock file left untouched', async () => {
      await dryRunLeavesTreeAlone({}, async () => {
        await installed();
        write(join(proj, LOCK_FILE), '{"pid":1}');
        write(join(repo, 'pharn/CONSTITUTION.md'), 'constitution v2');
        write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'a');
        write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'c');
      });
      expect(logged('warn')).toContain('would move to the pharn/ layout');
    });
  });

  describe('gates', () => {
    it('runs with no terminal and never asks to confirm', async () => {
      await installed();
      setTTY(false, false);
      await runUpdate({ dryRun: true });
      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(outroText()).toContain('Dry run');
    });

    it('accepts --yes as a no-op', async () => {
      await installed();
      await runUpdate({ dryRun: true, yes: true });
      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(outroText()).toContain('Dry run');
    });

    it('does not consult the config fingerprint or the lock', async () => {
      await installed();
      assertConfigUnchanged.mockImplementation(() => {
        throw new Error('config changed');
      });
      await runUpdate({ dryRun: true });
      expect(assertConfigUnchanged).not.toHaveBeenCalled();
      expect(withProjectLock).not.toHaveBeenCalled();
      expect(outroText()).toContain('Dry run');
    });

    it('says Already up to date at the current version, without fetching the tarball', async () => {
      await installed({ skillsVersion: '1.1.0' });
      await runUpdate({ dryRun: true });
      expect(outroText()).toContain('Already up to date');
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    // The same gate as the real run: a file missing at the current version
    // re-opens it, so the preview plans the restore — and writes nothing.
    it('plans the restore of a file missing at the current version, writing nothing', async () => {
      await installed({ skillsVersion: '1.1.0' });
      rmSync(join(proj, DOC));
      const before = snapshotTree(proj);
      await runUpdate({ dryRun: true });
      expect(outroText()).not.toContain('Already up to date');
      expect(outroText()).toContain('Dry run');
      expect(fetchRepo).toHaveBeenCalled();
      expect(snapshotTree(proj)).toEqual(before);
    });

    it('is not up to date under --force, and shows the re-apply', async () => {
      await installed({ skillsVersion: '1.1.0' });
      scaffoldClone(repo, '1.1.0', 'v2');
      await runUpdate({ dryRun: true, force: true });
      expect(fetchRepo).toHaveBeenCalled();
      expect(outroText()).toContain('Dry run');
    });

    it('reports an install ahead of the release and exits 0', async () => {
      await installed({ skillsVersion: '2.0.0' });
      await runUpdate({ dryRun: true, ref: 'latest' });
      expect(outroText()).toContain('ahead of the latest verified release');
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('reports an install ahead of main (main moved back) and exits 0, nothing written', async () => {
      await installed({ skillsVersion: '2.0.0' });
      const before = snapshotTree(proj);
      await runUpdate({ dryRun: true });
      expect(outroText()).toContain(
        'newer than pharn-oss main (v1.1.0) — main has moved back',
      );
      expect(outroText()).toContain('pharn update --force');
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(snapshotTree(proj)).toEqual(before);
    });

    it('previews the downgrade from main under --force', async () => {
      await installed({ skillsVersion: '2.0.0' });
      await runUpdate({ dryRun: true, force: true });
      expect(fetchRepo).toHaveBeenCalled();
      expect(outroText()).toContain('Dry run');
    });

    it('exits 1 when the release cannot be resolved', async () => {
      await installed();
      resolveSource.mockRejectedValueOnce(
        new ReleaseResolveError('no verified release published'),
      );
      await expect(
        runUpdate({ dryRun: true, ref: 'latest' }),
      ).rejects.toMatchObject(new ProcessExit(1));
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('exits 1 on a fetch failure, with nothing written', async () => {
      await installed();
      const before = snapshotTree(proj);
      fetchRepo.mockRejectedValueOnce(new Error('network down'));
      await expect(runUpdate({ dryRun: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(snapshotTree(proj)).toEqual(before);
    });

    it('refuses on MIN_CLI like the real run: exit 1, clone cleaned up, nothing written', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), '99.0.0\n');
      const before = snapshotTree(proj);
      await expect(runUpdate({ dryRun: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(cleanup).toHaveBeenCalled();
      expect(snapshotTree(proj)).toEqual(before);
      const errored = vi
        .mocked(prompts.log.error)
        .mock.calls.map((c) => String(c[0]))
        .join('\n');
      expect(errored).toContain('99.0.0');
    });

    it('warns on a garbage MIN_CLI and still previews', async () => {
      await installed();
      write(join(repo, 'MIN_CLI'), 'not-a-version\n');
      await runUpdate({ dryRun: true });
      expect(logged('warn')).toContain('MIN_CLI');
      expect(outroText()).toContain('Dry run');
    });

    it('exits 1 and cleans up when planning throws', async () => {
      await installed();
      rmFile(join(repo, 'SKILLS_VERSION'));
      await expect(runUpdate({ dryRun: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(cleanup).toHaveBeenCalled();
    });
  });

  describe('what it reports', () => {
    it('lists restored and updated writes, and counts unchanged', async () => {
      await installed();
      rmFile(join(proj, HOOK));
      await runUpdate({ dryRun: true });
      const plan = noteBody('PLAN');
      expect(plan).toContain('WOULD WRITE — restored');
      expect(plan).toContain(HOOK);
      expect(plan).toContain('WOULD WRITE — updated');
      expect(plan).toContain(DOC);
      expect(outroText()).toContain('would write 4');
      expect(outroText()).toContain('Run `pharn update` to apply');
    });

    it('says nothing would be written when everything is current (under --force)', async () => {
      await installed({ skillsVersion: '1.1.0' });
      for (const rel of [CAP_FILE, DOC, HOOK, CMD]) {
        write(join(proj, rel), readFileSync(join(repo, rel), 'utf8'));
      }
      await runUpdate({ dryRun: true, force: true });
      expect(noteBody('PLAN')).toContain('Nothing would be written');
      expect(outroText()).toContain('Run `pharn update --force` to apply');
    });

    it('lists skip buckets and withholds the version, with the pending record', async () => {
      await installed();
      write(join(proj, DOC), 'MY EDIT');
      await runUpdate({ dryRun: true });
      expect(noteBody('SKIPPED')).toContain('MODIFIED');
      expect(noteBody('SKIPPED')).toContain('Run `pharn update --force`');
      expect(logged('warn')).toContain('would stay recorded as skills v1.0.0');
      expect(logged('info')).toContain('v1.1.0 as pending');
    });

    it('says the version would be recorded on a complete run', async () => {
      await installed();
      await runUpdate({ dryRun: true });
      expect(logged('info')).toContain('Would record skills v1.1.0.');
    });

    it('names the backups --force would make, and the models block it would replace', async () => {
      await installed({
        models: { stages: { default: { model: 'haiku', effort: 'low' } } },
      });
      write(join(proj, DOC), 'MY EDIT');
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({
          models: { stages: { default: { model: 'sonnet', effort: 'high' } } },
        }),
      );
      await runUpdate({ dryRun: true, force: true });
      const plan = noteBody('PLAN');
      expect(plan).toContain('WOULD OVERWRITE (--force) — modified');
      expect(plan).toContain(
        `WOULD BACK UP 2 file(s) to ${BACKUP_DIR}/<timestamp>/`,
      );
      expect(plan).toContain('pharn.config.json');
      expect(noteBody('MODELS')).toContain('Would replace your models block');
    });

    async function recordModels(block: unknown): Promise<void> {
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          ...read.store.files,
          [MODELS_RECORD_KEY]: modelsRecordHash(block),
        },
      });
    }
    const UPSTREAM = {
      stages: { default: { model: 'sonnet', effort: 'high' } },
    };

    it('previews moving a block pharn wrote and the user never changed', async () => {
      const mine = { stages: { default: { model: 'haiku', effort: 'low' } } };
      await installed({ models: mine });
      await recordModels(mine);
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({ models: UPSTREAM }),
      );
      await runUpdate({ dryRun: true });
      expect(noteBody('MODELS')).toContain('Would move your models block');
    });

    it('previews replacing the block an earlier pharn wrote', async () => {
      const legacy = {
        default: { model: 'sonnet-5', effort: 'high' },
        stages: {
          plan: { model: 'opus-4-8', effort: 'max' },
          review: { model: 'opus-4-8', effort: 'high' },
        },
      };
      await installed({ models: legacy });
      await recordModels(legacy);
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({ models: UPSTREAM }),
      );
      await runUpdate({ dryRun: true });
      expect(noteBody('MODELS')).toContain('Would replace the models block');
    });

    it('shows a conversion and a kept block as a preview', async () => {
      await installed({
        models: {
          default: { model: 'sonnet-5', effort: 'high' },
          stages: { plan: { model: 'opus-4-8', effort: 'max' }, mine: 1 },
        },
      });
      await runUpdate({ dryRun: true });
      expect(noteBody('MODELS')).toContain('Would convert your models block');
    });

    it('shows a restored models block as a preview', async () => {
      await installed();
      write(
        join(repo, 'pharn.config.json'),
        JSON.stringify({
          models: { stages: { default: { model: 'sonnet', effort: 'high' } } },
        }),
      );
      await runUpdate({ dryRun: true });
      expect(noteBody('MODELS')).toContain("would write pharn-oss's");
    });

    it('reports hooks upstream wires that the project does not', async () => {
      await installed();
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
      await runUpdate({ dryRun: true });
      expect(noteBody('HOOKS')).toContain('x.cjs');
    });

    it('names a frozen capability and keeps it out of the plan', async () => {
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
      await runUpdate({ dryRun: true });
      expect(noteBody('PLAN')).not.toContain(FILE);
      expect(noteBody('CAPABILITIES')).toContain('griller:backwards-compat');
      expect(logged('info')).toContain('griller:backwards-compat');
      expect(logged('warn')).toContain('backwards-compat');
    });

    it('names a records-store problem', async () => {
      await installed();
      write(join(proj, RECORDS_FILE), '{not json');
      await runUpdate({ dryRun: true });
      expect(logged('warn')).toContain('⚠');
    });

    it('shows the channel it would record on a switch', async () => {
      await installed();
      await runUpdate({ dryRun: true, ref: 'latest' });
      expect(noteBody('PLAN')).toContain('Would record channel: latest');
      expect(existsSync(join(proj, BACKUP_DIR))).toBe(false);
    });

    it('shows a pharn → flat layout migration as a preview', async () => {
      await installed({ layout: 'pharn' });
      await runUpdate({ dryRun: true });
      expect(logged('warn')).toContain('would move to the flat layout');
    });

    it('shows the features README relocation as a preview', async () => {
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
      await runUpdate({ dryRun: true });
      expect(logged('warn')).toContain('features/README.md');
    });
  });

  // The core claim: the plan IS what the real run does.
  describe('parity with the real run', () => {
    function planned(): { writes: string[]; backups: string[] } {
      const lines = noteBody('PLAN')
        .split('\n')
        .map((l) => l.trim());
      const rels = (heading: RegExp): string[] => {
        const out: string[] = [];
        let on = false;
        for (const l of lines) {
          if (heading.test(l)) {
            on = true;
            continue;
          }
          if (l === '' || /^(WOULD|UNCHANGED|Would|Nothing)/.test(l))
            on = false;
          else if (on) out.push(l);
        }
        return out;
      };
      return {
        writes: [...rels(/^WOULD WRITE/), ...rels(/^WOULD OVERWRITE/)].sort(),
        backups: rels(/^WOULD BACK UP/).sort(),
      };
    }

    function changedPaths(before: string[], after: string[]): string[] {
      const was = new Set(before);
      return after
        .filter((e) => !was.has(e) && e.startsWith('f '))
        .map((e) => e.split(' ')[1]!)
        .filter(
          (p) =>
            !p.startsWith(BACKUP_DIR) &&
            p !== 'pharn.config.json' &&
            p !== RECORDS_FILE,
        )
        .sort();
    }

    it('writes and backs up exactly what the preview listed (--force)', async () => {
      await installed();
      write(join(proj, DOC), 'MY EDIT');
      write(join(proj, HOOK), 'MY HOOK EDIT');
      rmFile(join(proj, CMD));
      const before = snapshotTree(proj);

      await runUpdate({ dryRun: true, force: true });
      const plan = planned();
      expect(snapshotTree(proj)).toEqual(before);

      vi.mocked(prompts.note).mockClear();
      await runUpdate({ force: true, yes: true });
      const after = snapshotTree(proj);
      expect(changedPaths(before, after)).toEqual(plan.writes);
      const backupRoot = join(proj, BACKUP_DIR);
      const stamp = readdirSync(backupRoot)[0]!;
      const backedUp = after
        .filter(
          (e) => e.startsWith('f ') && e.includes(`${BACKUP_DIR}/${stamp}/`),
        )
        .map((e) => e.split(' ')[1]!.split(`${BACKUP_DIR}/${stamp}/`)[1]!)
        .sort();
      expect(backedUp).toEqual(plan.backups);
    });

    it('skips exactly what the preview skipped (no --force)', async () => {
      await installed();
      write(join(proj, DOC), 'MY EDIT');
      const before = snapshotTree(proj);

      await runUpdate({ dryRun: true });
      const previewSkipped = noteBody('SKIPPED');
      const plan = planned();

      vi.mocked(prompts.note).mockClear();
      await runUpdate({ yes: true });
      // The listing is identical; only the one line of advice changes tense.
      const listing = (t: string): string => t.split('\n\n')[0]!;
      expect(listing(noteBody('SKIPPED'))).toBe(listing(previewSkipped));
      expect(changedPaths(before, snapshotTree(proj))).toEqual(plan.writes);
      expect(readFileSync(join(proj, DOC), 'utf8')).toBe('MY EDIT');
    });
  });
});

const rmFile = (path: string): void => rmSync(path, { force: true });
