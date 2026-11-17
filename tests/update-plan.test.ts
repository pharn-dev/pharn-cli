import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it, beforeEach } from 'vitest';
import { snapshotTree, useTmpDir } from './helpers.js';
import { sealRepo } from './support/harness.js';
import type { PharnConfig } from '../src/types.js';

// The clone is a real tree, sealed with the pharn-install.json its files make
// (sealRepo reads each capability's `applies` into it), and the real resolver
// selects from its index against the config's archetypes. A griller every
// `ssr` project selects:
const capDoc = (body: string): string =>
  `---\nrole: griller\napplies: ["ssr"]\n---\n${body}`;
// One upstream ships but this CLI cannot install (an `applies` token outside
// its enum): the index lists it as unknown, so update keeps it frozen.
const UNPARSABLE = '---\nrole: griller\napplies: ["mobile"]\n---\nWIP\n';

const { buildUpdatePlan, CapabilityRemovalError } =
  await import('../src/lib/update-plan.js');
const { writeRecords } = await import('../src/lib/install-records.js');
const { contentHash } = await import('../src/lib/hash.js');

const CAP = { name: 'a11y', role: 'griller' as const };
const CAP_FILE = 'pharn/pharn-pipeline/grillers/a11y/a11y.md';
const DOC = 'pharn/CONSTITUTION.md';
const FROZEN = { name: 'backwards-compat', role: 'griller' as const };
const FROZEN_FILE =
  'pharn/pharn-pipeline/grillers/backwards-compat/backwards-compat.md';

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function config(over: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.4.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [CAP],
    layout: 'pharn',
    ...over,
  };
}

describe('buildUpdatePlan', () => {
  const tmp = useTmpDir();
  let proj = '';
  let repo = '';

  // The project holds the v1 bytes of CAP_FILE and DOC, recorded; the clone
  // holds v2.
  async function fixture(cfg = config()): Promise<void> {
    write(join(proj, CAP_FILE), 'a11y v1');
    write(join(proj, DOC), 'constitution v1');
    await writeRecords(proj, {
      skillsVersion: cfg.skillsVersion,
      commit: cfg.commit,
      files: {
        [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
        [DOC]: contentHash(join(proj, DOC)),
      },
    });
    write(join(repo, 'SKILLS_VERSION'), '1.1.0\n');
    write(join(repo, CAP_FILE), capDoc('a11y v2'));
    write(join(repo, DOC), 'constitution v2');
  }

  // Sealed at plan time, so a test's later change to the clone is declared.
  const plan = (cfg: PharnConfig, over: { force?: boolean } = {}) =>
    buildUpdatePlan({
      repoDir: sealRepo(repo),
      sha: 'a'.repeat(40),
      config: cfg,
      cwd: proj,
      force: over.force ?? false,
      channel: 'main',
    });

  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    repo = join(tmp.path(), 'repo');
    mkdirSync(proj, { recursive: true });
    // The pharn layout's marker: the manifest declares that layout.
    mkdirSync(join(repo, 'pharn/pharn-contracts'), { recursive: true });
  });

  it('reads the project and the clone and writes nothing', async () => {
    await fixture();
    sealRepo(repo);
    const before = [snapshotTree(proj), snapshotTree(repo)];
    plan(config(), { force: true });
    expect([snapshotTree(proj), snapshotTree(repo)]).toEqual(before);
  });

  // C5.2: what the writer compares each file with before writing it — the
  // destination's hash when this plan read it, or null for an absent one.
  it('records what each planned write found on disk (`apply.seen`), and only the writes', async () => {
    await fixture();
    rmSync(join(proj, DOC));
    const { report, apply } = plan(config());
    expect(report.writes.sort()).toEqual([CAP_FILE, DOC].sort());
    expect(apply.seen).toEqual(
      new Map<string, string | null>([
        [CAP_FILE, contentHash(join(proj, CAP_FILE))],
        [DOC, null],
      ]),
    );
  });

  it('has a JSON-safe report (survives a round trip unchanged)', async () => {
    await fixture();
    const { report } = plan(config());
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('plans a clean upgrade: writes, no withheld version, nothing pending', async () => {
    await fixture();
    const { report, apply } = plan(config());
    expect(report.writes.sort()).toEqual([CAP_FILE, DOC].sort());
    expect(report.versionWithheld).toBe(false);
    expect(report.recordedVersion).toBe('1.1.0');
    expect(report.pendingSkillsVersion).toBeNull();
    expect(apply.nextSkillsVersion).toBe('1.1.0');
    expect(apply.nextCommit).toBe('a'.repeat(40));
    expect(report.backups).toEqual([]);
    expect(report.layout).toBe('pharn');
    expect(report.unknownWarning).toBeNull();
    expect(report.unknownCapabilities).toEqual([]);
  });

  // F-16: the recorded files were re-checked-out with CRLF line endings
  // (core.autocrlf=true). That is not an edit: nothing is skipped and the
  // version is not withheld.
  describe('CRLF line endings in the project', () => {
    const toCrlf = (rel: string): void => {
      const lf = readFileSync(join(proj, rel), 'utf8');
      write(join(proj, rel), lf.replace(/\n/g, '\r\n'));
    };

    async function multilineFixture(): Promise<void> {
      write(join(proj, CAP_FILE), capDoc('# a11y\nv1\n'));
      write(join(proj, DOC), '# C\nv1\n');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
          [DOC]: contentHash(join(proj, DOC)),
        },
      });
      write(join(repo, 'SKILLS_VERSION'), '1.1.0\n');
    }

    it('upstream moved on: a CRLF copy of the recorded bytes is upgraded, never skipped', async () => {
      await multilineFixture();
      write(join(repo, CAP_FILE), capDoc('# a11y\nv2\n'));
      write(join(repo, DOC), '# C\nv2\n');
      toCrlf(CAP_FILE);
      toCrlf(DOC);
      const { report } = plan(config());
      expect(report.skipped).toEqual([]);
      expect(report.writes.sort()).toEqual([CAP_FILE, DOC].sort());
      expect(report.versionWithheld).toBe(false);
      expect(report.recordedVersion).toBe('1.1.0');
    });

    it('upstream unchanged: a CRLF copy is a no-op (ok), and the version is not withheld', async () => {
      await multilineFixture();
      write(join(repo, CAP_FILE), capDoc('# a11y\nv1\n'));
      write(join(repo, DOC), '# C\nv1\n');
      toCrlf(CAP_FILE);
      toCrlf(DOC);
      const { report } = plan(config());
      expect(report.skipped).toEqual([]);
      expect(report.writes).toEqual([]);
      expect(report.counts.ok).toBe(2);
      expect(report.versionWithheld).toBe(false);
    });

    it('a real edit in a CRLF file is still a modified skip', async () => {
      await multilineFixture();
      write(join(repo, CAP_FILE), capDoc('# a11y\nv2\n'));
      write(join(repo, DOC), '# C\nv2\n');
      toCrlf(CAP_FILE);
      write(join(proj, DOC), '# C\r\nMY EDIT\r\n');
      const { report } = plan(config());
      expect(report.skipped).toEqual([{ label: 'modified', rels: [DOC] }]);
      expect(report.writes).toEqual([CAP_FILE]);
      expect(report.versionWithheld).toBe(true);
    });
  });

  it('withholds the version on a kept edit, recording it as pending', async () => {
    await fixture();
    write(join(proj, DOC), 'MY EDIT');
    const { report, apply } = plan(config());
    expect(report.versionWithheld).toBe(true);
    expect(report.recordedVersion).toBe('1.0.0');
    expect(report.pendingSkillsVersion).toBe('1.1.0');
    expect(apply.nextCommit).toBeNull();
    expect(report.skipped).toEqual([{ label: 'modified', rels: [DOC] }]);
  });

  // CORE-162: the state a withheld run leaves — every file but the kept edit
  // at 1.1.0 and recorded, 1.1.0 pending — is a plan that changes nothing.
  describe('changesNothing', () => {
    const settled = config({
      capabilities: [{ ...CAP, source: 'auto' }],
      pendingSkillsVersion: '1.1.0',
    });

    async function afterWithheldRun(): Promise<void> {
      await fixture();
      writeFileSync(join(proj, '.gitignore'), 'pharn/.run/\npharn/.backup/\n');
      const docRecord = contentHash(join(proj, DOC));
      write(join(proj, CAP_FILE), capDoc('a11y v2'));
      write(join(proj, DOC), 'MY EDIT');
      await writeRecords(proj, {
        skillsVersion: '1.0.0',
        commit: null,
        files: {
          [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
          [DOC]: docRecord,
        },
      });
    }

    it('holds for a kept edit over a settled install', async () => {
      await afterWithheldRun();
      const { report } = plan(settled);
      expect(report.skipped).toEqual([{ label: 'modified', rels: [DOC] }]);
      expect(report.writes).toEqual([]);
      expect(report.stateChanges).toEqual({ config: false, records: false });
      expect(report.changesNothing).toBe(true);
    });

    it('does not hold when the config would change (pending not yet recorded)', async () => {
      await afterWithheldRun();
      const { pendingSkillsVersion: _p, ...noPending } = settled;
      const { report } = plan(noPending as PharnConfig);
      expect(report.stateChanges).toEqual({ config: true, records: false });
      expect(report.changesNothing).toBe(false);
    });

    it('does not hold when the store would change (an upstream file not yet recorded)', async () => {
      await afterWithheldRun();
      // CAP_FILE is already at upstream but unrecorded: the run records it.
      const read = (await import('../src/lib/install-records.js')).readRecords(
        proj,
      );
      const files = read.kind === 'ok' ? { ...read.store.files } : {};
      delete files[CAP_FILE];
      await writeRecords(proj, { skillsVersion: '1.0.0', commit: null, files });
      const { report } = plan(settled);
      expect(report.writes).toEqual([]);
      expect(report.stateChanges).toEqual({ config: false, records: true });
      expect(report.changesNothing).toBe(false);
    });

    it('does not hold when a file would be written', async () => {
      const { report } = await (async () => {
        await fixture();
        writeFileSync(
          join(proj, '.gitignore'),
          'pharn/.run/\npharn/.backup/\n',
        );
        return plan(settled);
      })();
      expect(report.writes.length).toBeGreaterThan(0);
      expect(report.changesNothing).toBe(false);
    });

    // CORE-166: the settings.json record init wrote. Carried while the file
    // exists (no change); the user deleted the file → the next planned run is
    // a store-only change that drops it; once dropped, the plan changes
    // nothing again — the drop is one-shot, never a loop or a prompt per run.
    describe('the .claude/settings.json record (CORE-166)', () => {
      const SETTINGS = '.claude/settings.json';

      async function withSettingsRecord(present: boolean): Promise<void> {
        await afterWithheldRun();
        write(join(proj, SETTINGS), '{"hooks":{}}');
        const read = (
          await import('../src/lib/install-records.js')
        ).readRecords(proj);
        const files = read.kind === 'ok' ? { ...read.store.files } : {};
        files[SETTINGS] = contentHash(join(proj, SETTINGS));
        await writeRecords(proj, {
          skillsVersion: '1.0.0',
          commit: null,
          files,
        });
        if (!present) rmSync(join(proj, SETTINGS));
      }

      it('carries the record while the file exists: no change, never an orphan', async () => {
        await withSettingsRecord(true);
        const { report, apply } = plan(settled);
        expect(apply.settingsRecords).toEqual({
          [SETTINGS]: contentHash(join(proj, SETTINGS)),
        });
        expect(report.orphans).toEqual([]);
        expect(apply.prettierignorePaths).not.toContain(SETTINGS);
        expect(report.stateChanges).toEqual({ config: false, records: false });
        expect(report.changesNothing).toBe(true);
      });

      it('drops it once the file is gone, then changes nothing on the next run', async () => {
        await withSettingsRecord(false);
        const first = plan(settled);
        expect(first.apply.settingsRecords).toEqual({});
        expect(first.report.stateChanges).toEqual({
          config: false,
          records: true,
        });
        expect(first.report.changesNothing).toBe(false);

        // The store that run writes (its records), then plan again.
        const { nextRecordStore } = await import('../src/lib/update-next.js');
        await writeRecords(proj, nextRecordStore(first.apply, { written: {} }));
        const second = plan(settled);
        expect(second.report.stateChanges).toEqual({
          config: false,
          records: false,
        });
        expect(second.report.changesNothing).toBe(true);
      });
    });
  });

  // `update` has no same-version shortcut: it plans every run, so the planner
  // alone decides "up to date" — and restores what a same-version run finds
  // missing.
  it('at the same version: an install matching upstream changes nothing, and a deleted file is restored', async () => {
    const sha = 'a'.repeat(40);
    const current = config({
      skillsVersion: '1.1.0',
      commit: sha,
      capabilities: [{ ...CAP, source: 'auto' }],
    });
    await fixture(current);
    write(join(proj, CAP_FILE), capDoc('a11y v2'));
    write(join(proj, DOC), 'constitution v2');
    writeFileSync(join(proj, '.gitignore'), 'pharn/.run/\npharn/.backup/\n');
    await writeRecords(proj, {
      skillsVersion: '1.1.0',
      commit: sha,
      files: {
        [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
        [DOC]: contentHash(join(proj, DOC)),
      },
    });

    const settled = plan(current).report;
    expect(settled.writes).toEqual([]);
    expect(settled.stateChanges).toEqual({ config: false, records: false });
    expect(settled.changesNothing).toBe(true);

    rmSync(join(proj, DOC));
    const restoring = plan(current).report;
    expect(restoring.writes).toEqual([DOC]);
    expect(restoring.counts.restored).toBe(1);
    expect(restoring.changesNothing).toBe(false);
  });

  it('records no pending version when the skip is not a user edit', async () => {
    await fixture();
    // A directory where a regular file is expected → `unreadable`.
    write(join(proj, DOC), 'x');
    const { rmSync } = await import('node:fs');
    rmSync(join(proj, DOC));
    mkdirSync(join(proj, DOC));
    const { report } = plan(config());
    expect(report.versionWithheld).toBe(true);
    expect(report.pendingSkillsVersion).toBeNull();
  });

  it('under --force turns the skips into backed-up writes, adding the config only for a forced models block', async () => {
    await fixture();
    write(join(proj, DOC), 'MY EDIT');
    const forced = plan(config(), { force: true }).report;
    expect(forced.backups).toEqual([DOC]);
    expect(forced.versionWithheld).toBe(false);

    write(
      join(repo, 'pharn.config.json'),
      JSON.stringify({
        models: { stages: { default: { model: 'sonnet', effort: 'high' } } },
      }),
    );
    const withModels = plan(
      config({
        models: { stages: { default: { model: 'haiku', effort: 'low' } } },
      }),
      { force: true },
    ).report;
    expect(withModels.backups).toEqual([DOC, 'pharn.config.json']);
  });

  it('keeps a frozen capability in the config but out of the manifest, and lists it', async () => {
    await fixture(
      config({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] }),
    );
    write(join(repo, FROZEN_FILE), UNPARSABLE);
    const warnings: string[] = [];
    const { report, apply } = buildUpdatePlan({
      repoDir: sealRepo(repo),
      sha: null,
      config: config({ capabilities: [CAP, { ...FROZEN, source: 'auto' }] }),
      cwd: proj,
      force: false,
      channel: 'main',
      onUnknownWarning: (w) => warnings.push(w),
    });
    expect(apply.expected.has(FROZEN_FILE)).toBe(false);
    expect(apply.configCapabilities.map((c) => c.name)).toContain(FROZEN.name);
    expect(report.frozenCapabilities).toEqual(['griller:backwards-compat']);
    expect(warnings).toHaveLength(1);
    expect(report.unknownWarning).toBe(warnings[0]);
    // The structured twin of the warning: what the fetch boundary refused.
    expect(report.unknownCapabilities).toEqual([
      expect.objectContaining({
        role: 'griller',
        name: 'backwards-compat',
        subtree: 'pharn/pharn-pipeline/grillers',
        reason: expect.stringContaining('"mobile"'),
      }),
    ]);
  });

  it('keeps a previously frozen capability listed while one of its files is skipped', async () => {
    const cfg = config({
      frozenCapabilities: ['griller:a11y'],
      capabilities: [{ ...CAP, source: 'auto' }],
    });
    await fixture(cfg);
    write(join(proj, CAP_FILE), 'MY EDIT');
    expect(plan(cfg).report.frozenCapabilities).toEqual(['griller:a11y']);
    write(join(proj, CAP_FILE), 'a11y v1');
    expect(plan(cfg).report.frozenCapabilities).toEqual([]);
  });

  // src/types.ts: `frozenCapabilities` is optional (omitted when none) and
  // every `update` re-checks it — there is no same-version shortcut to skip.
  it('re-checks frozenCapabilities at the same version too, and clears one that parses again', async () => {
    expectTypeOf<PharnConfig['frozenCapabilities']>().toEqualTypeOf<
      string[] | undefined
    >();
    const cfg = config({
      skillsVersion: '1.1.0',
      frozenCapabilities: ['griller:a11y'],
      capabilities: [{ ...CAP, source: 'auto' }],
    });
    await fixture(cfg);
    const { report } = plan(cfg);
    expect(report.currentVersion).toBe(report.installedVersion);
    expect(report.frozenCapabilities).toEqual([]);
    expect(report.stateChanges.config).toBe(true);
    expect(report.changesNothing).toBe(false);
  });

  // v0.21.0: there is no layout move to plan. The plan records the clone's one
  // layout, and a tree without the pharn layout's marker is refused.
  it('plans the abandoned layout in both directions, only when something would be written', async () => {
    await fixture();
    const report = plan(config()).report;
    expect(report.layout).toBe('pharn');
    expect(report).not.toHaveProperty('abandonedLayout');
    rmSync(join(repo, 'pharn/pharn-contracts'), { recursive: true });
    expect(() => plan(config())).toThrow(/pharn\/pharn-contracts/);
  });

  // An install that recorded the root features/README.md, updated from a clone
  // whose manifest installs it under pharn/, is told the file moved.
  it('reports the features/README.md relocation only when the records hold the root copy', async () => {
    await fixture();
    write(join(repo, 'pharn/features/README.md'), 'features\n');
    expect(plan(config()).report.featuresReadmeRelocation).toBe(false);

    write(join(proj, 'features/README.md'), 'features\n');
    await writeRecords(proj, {
      skillsVersion: '1.0.0',
      commit: null,
      files: {
        [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
        [DOC]: contentHash(join(proj, DOC)),
        'features/README.md': contentHash(join(proj, 'features/README.md')),
      },
    });
    expect(plan(config()).report.featuresReadmeRelocation).toBe(true);

    rmSync(join(repo, 'pharn/features/README.md'));
    expect(plan(config()).report.featuresReadmeRelocation).toBe(false);
  });

  describe('orphans (files upstream stopped shipping)', () => {
    const OLD_CMD = '.claude/commands/pharn-old.md';
    const OLD_CAP_FILE = 'pharn/pharn-pipeline/grillers/a11y/old.md';

    async function withOrphans(cfg = config()): Promise<void> {
      await fixture(cfg);
      write(join(proj, OLD_CMD), 'old command');
      write(join(proj, OLD_CAP_FILE), 'old a11y file');
      await writeRecords(proj, {
        skillsVersion: cfg.skillsVersion,
        commit: cfg.commit,
        files: {
          [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
          [DOC]: contentHash(join(proj, DOC)),
          [OLD_CMD]: contentHash(join(proj, OLD_CMD)),
          [OLD_CAP_FILE]: 'f'.repeat(64),
        },
      });
    }

    it('reports them, carries their records, and leaves the decision table alone', async () => {
      await withOrphans();
      const { report, apply } = plan(config());
      expect(report.orphans).toEqual([
        { path: OLD_CMD, state: 'unchanged' },
        { path: OLD_CAP_FILE, state: 'edited' },
      ]);
      expect(apply.orphanRecords).toEqual({
        [OLD_CMD]: contentHash(join(proj, OLD_CMD)),
        [OLD_CAP_FILE]: 'f'.repeat(64),
      });
      // Never in the manifest the 6-row table iterates: no file entry, no skip,
      // no withheld version.
      expect(report.files.map((f) => f.rel)).not.toContain(OLD_CMD);
      expect(report.skipped).toEqual([]);
      expect(report.versionWithheld).toBe(false);
      expect(apply.plan.nextRecords).not.toHaveProperty(OLD_CMD);
    });

    it('is empty (and carries nothing) without a usable store', async () => {
      await withOrphans();
      // A corrupt store — a stamp mismatch no longer makes one unusable
      // (CORE-161).
      writeFileSync(join(proj, 'pharn.records.json'), '{ not json');
      const { report, apply } = plan(config());
      expect(report.recordsNote).not.toBeNull();
      expect(report.orphans).toEqual([]);
      expect(apply.orphanRecords).toEqual({});
    });

    it('excludes the files of a capability this run drops', async () => {
      await withOrphans();
      const { report, apply } = plan(
        config({
          archetypes: ['lib'],
          capabilities: [{ ...CAP, source: 'auto' }],
        }),
      );
      expect(apply.configCapabilities).toEqual([]);
      expect(report.orphans.map((o) => o.path)).toEqual([OLD_CMD]);
    });

    it('excludes the files of a frozen capability (carried as frozenRecords)', async () => {
      await withOrphans();
      write(join(repo, CAP_FILE), UNPARSABLE);
      const { report, apply } = plan(config());
      expect(report.orphans.map((o) => o.path)).toEqual([OLD_CMD]);
      expect(apply.frozenRecords).toHaveProperty(OLD_CAP_FILE);
    });
  });

  describe('the executable-unit hold', () => {
    const OLD_FLOOR = 'pharn/floor/reconcile-baseline.mjs';
    const NEW_FLOOR = 'pharn/floor/worktree-fingerprint.mjs';

    // A pharn-layout install at 6.0.0 with an EDITED floor file and a root
    // memory-bank/; the clone is 7.0.0 and adds a floor file.
    async function unitFixture(skillsVersion = '6.0.0'): Promise<PharnConfig> {
      const cfg = config({ layout: 'pharn', capabilities: [], skillsVersion });
      write(join(proj, OLD_FLOOR), 'baseline v6, edited');
      write(join(proj, 'pharn/CONSTITUTION.md'), 'constitution v6');
      write(join(proj, 'memory-bank/notes.md'), 'mine');
      await writeRecords(proj, {
        skillsVersion: cfg.skillsVersion,
        commit: cfg.commit,
        files: {
          [OLD_FLOOR]: 'f'.repeat(64),
          'pharn/CONSTITUTION.md': contentHash(
            join(proj, 'pharn/CONSTITUTION.md'),
          ),
        },
      });
      write(join(repo, 'SKILLS_VERSION'), '7.0.0\n');
      mkdirSync(join(repo, 'pharn/pharn-contracts'), { recursive: true });
      write(join(repo, 'pharn/pharn-contracts/c.md'), 'contract');
      write(join(repo, OLD_FLOOR), 'baseline v7');
      write(join(repo, NEW_FLOOR), 'fingerprint v7');
      write(join(repo, 'pharn/CONSTITUTION.md'), 'constitution v7');
      return cfg;
    }

    // CORE-159 inverts the 0.18.0 decision this test pinned ("records nothing
    // pending"): a hold caused only by the user's own edit leaves every file
    // outside the unit at 7.0.0, and `add` writes capability directories only
    // (outside the unit), so the pending version is recorded for it.
    it('holds the new floor file, withholds the version, records the pending version', async () => {
      const cfg = await unitFixture();
      const { report, apply } = plan(cfg);
      expect(report.executableUnit).toEqual({
        blocking: [{ rel: OLD_FLOOR, label: 'modified' }],
        held: [NEW_FLOOR],
      });
      expect(report.writes).not.toContain(NEW_FLOOR);
      // A non-unit file still upgrades.
      expect(report.writes).toContain('pharn/CONSTITUTION.md');
      expect(report.versionWithheld).toBe(true);
      expect(report.recordedVersion).toBe('6.0.0');
      // The only blocker is the user's edit, so `add` may install at 7.0.0.
      expect(report.pendingSkillsVersion).toBe('7.0.0');
      expect(apply.nextSkillsVersion).toBe('6.0.0');
      expect(NEW_FLOOR in apply.plan.nextRecords).toBe(false);
    });

    it('records the pending version for an unrecorded blocker too', async () => {
      const cfg = await unitFixture();
      await writeRecords(proj, {
        skillsVersion: cfg.skillsVersion,
        commit: cfg.commit,
        files: {
          'pharn/CONSTITUTION.md': contentHash(
            join(proj, 'pharn/CONSTITUTION.md'),
          ),
        },
      });
      const { report } = plan(cfg);
      expect(report.executableUnit?.blocking).toEqual([
        { rel: OLD_FLOOR, label: 'unrecorded' },
      ]);
      expect(report.pendingSkillsVersion).toBe('7.0.0');
    });

    it('records the pending version beside a kept edit outside the unit', async () => {
      const cfg = await unitFixture();
      write(join(proj, 'pharn/CONSTITUTION.md'), 'my constitution');
      const { report } = plan(cfg);
      expect(report.skipped.map((g) => g.label)).toEqual(['modified', 'held']);
      expect(report.pendingSkillsVersion).toBe('7.0.0');
    });

    it('records nothing pending when a blocker is unreadable', async () => {
      const cfg = await unitFixture();
      rmSync(join(proj, OLD_FLOOR));
      mkdirSync(join(proj, OLD_FLOOR));
      const { report } = plan(cfg);
      expect(report.executableUnit?.blocking).toEqual([
        { rel: OLD_FLOOR, label: 'unreadable' },
      ]);
      expect(report.versionWithheld).toBe(true);
      expect(report.pendingSkillsVersion).toBeNull();
    });

    it('records nothing pending when a blocker is unverifiable (no usable store)', async () => {
      const cfg = await unitFixture();
      rmSync(join(proj, 'pharn.records.json'));
      const { report } = plan(cfg);
      expect(report.executableUnit?.blocking).toEqual([
        { rel: OLD_FLOOR, label: 'unverifiable' },
      ]);
      expect(report.pendingSkillsVersion).toBeNull();
    });

    // CORE-159 × CORE-162: a held run whose ONLY state change is recording
    // the pending version still changes the config, so it must write; once
    // that version is recorded, the same plan changes nothing.
    it('a held run that only records the pending version is a change; once recorded it is not', async () => {
      const cfg = await unitFixture();
      const DOC7 = 'pharn/CONSTITUTION.md';
      const CONTRACT = 'pharn/pharn-contracts/c.md';
      write(join(proj, DOC7), 'constitution v7');
      write(join(proj, CONTRACT), 'contract');
      writeFileSync(join(proj, '.gitignore'), 'pharn/.run/\npharn/.backup/\n');
      await writeRecords(proj, {
        skillsVersion: cfg.skillsVersion,
        commit: cfg.commit,
        files: {
          [OLD_FLOOR]: 'f'.repeat(64),
          [DOC7]: contentHash(join(proj, DOC7)),
          [CONTRACT]: contentHash(join(proj, CONTRACT)),
        },
      });
      const first = plan(cfg).report;
      expect(first.executableUnit?.held).toEqual([NEW_FLOOR]);
      expect(first.writes).toEqual([]);
      expect(first.pendingSkillsVersion).toBe('7.0.0');
      expect(first.stateChanges).toEqual({ config: true, records: false });
      expect(first.changesNothing).toBe(false);

      const settled = plan({ ...cfg, pendingSkillsVersion: '7.0.0' }).report;
      expect(settled.stateChanges).toEqual({ config: false, records: false });
      expect(settled.changesNothing).toBe(true);
    });

    it('names a recorded unit file that is missing and held as missing', async () => {
      const HOOK = '.claude/hooks/guard.cjs';
      const cfg = await unitFixture();
      write(join(repo, HOOK), 'hook v7');
      await writeRecords(proj, {
        skillsVersion: cfg.skillsVersion,
        commit: cfg.commit,
        files: {
          [OLD_FLOOR]: 'f'.repeat(64),
          [HOOK]: 'e'.repeat(64),
          'pharn/CONSTITUTION.md': contentHash(
            join(proj, 'pharn/CONSTITUTION.md'),
          ),
        },
      });
      const { report } = plan(cfg);
      expect(report.executableUnit).toEqual({
        blocking: [{ rel: OLD_FLOOR, label: 'modified' }],
        held: [HOOK, NEW_FLOOR],
        // The new upstream floor file was never installed: not "missing".
        missing: [HOOK],
      });
    });

    it('holds the root migration with the unit (the old floor reads the old paths)', async () => {
      // v0.21.0: there is no root migration to hold. Held or not, the plan
      // never names, moves or backs up the root memory-bank/.
      const cfg = await unitFixture();
      const { report } = plan(cfg);
      expect(report.executableUnit).not.toBeNull();
      expect(report).not.toHaveProperty('rootMigration');
      write(join(proj, OLD_FLOOR), 'baseline v7');
      const unheld = plan(cfg);
      expect(unheld.report.executableUnit).toBeNull();
      expect(unheld.report).not.toHaveProperty('rootMigration');
      expect(unheld.report.writes).not.toContain('memory-bank/notes.md');
      expect(unheld.report.backups).not.toContain('memory-bank/notes.md');
    });

    it('--force holds nothing', async () => {
      const cfg = await unitFixture();
      const { report } = plan(cfg, { force: true });
      expect(report.executableUnit).toBeNull();
      expect(report.writes).toContain(NEW_FLOOR);
      expect(report.backups).toContain(OLD_FLOOR);
    });

    it('holds nothing when the run does not move the version', async () => {
      const cfg = await unitFixture('7.0.0');
      const { report } = plan(cfg);
      expect(report.executableUnit).toBeNull();
      // Same version: restoring the missing file puts back same-version bytes.
      expect(report.writes).toContain(NEW_FLOOR);
    });
  });

  it('shares one path for the real run and the preview: report fields mirror apply', async () => {
    await fixture();
    const { report, apply } = plan(config());
    expect(report.writes).toEqual(apply.plan.writes);
    expect(report.counts).toEqual(apply.plan.counts);
    expect(readFileSync(join(repo, DOC), 'utf8')).toBe('constitution v2');
  });
  // F-04: a capability the merge DROPS from the config must not stay on disk —
  // PHARN's commands find capabilities by scanning the directories, so a
  // dropped-but-present directory keeps running. The planner names each one,
  // with the files a delete would lose; it deletes nothing itself.
  describe('removals (capabilities dropped from the config)', () => {
    const STALE = { name: 'stale', role: 'lens' as const };
    const STALE_DIR = 'pharn/pharn-review/stale';
    const GONE = { name: 'gone', role: 'lens' as const };

    async function withStale(
      cfg = config({
        capabilities: [
          { ...CAP, source: 'auto' },
          { ...STALE, source: 'auto' },
        ],
      }),
      dir = STALE_DIR,
    ): Promise<PharnConfig> {
      await fixture(cfg);
      write(join(proj, `${dir}/stale.md`), 'stale v1');
      write(join(proj, `${dir}/NOTES.md`), 'my notes');
      await writeRecords(proj, {
        skillsVersion: cfg.skillsVersion,
        commit: cfg.commit,
        files: {
          [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
          [DOC]: contentHash(join(proj, DOC)),
          [`${dir}/stale.md`]: contentHash(join(proj, `${dir}/stale.md`)),
        },
      });
      return cfg;
    }

    it('plans none when membership does not shrink', async () => {
      await fixture();
      expect(plan(config()).report.removals).toEqual([]);
    });

    it('plans a dropped-unselected capability: present, backing up only what pharn cannot prove it wrote', async () => {
      const cfg = await withStale();
      const before = snapshotTree(proj);
      const { report } = plan(cfg);
      expect(report.removals).toEqual([
        {
          cap: { ...STALE, source: 'auto' },
          reason: 'dropped-unselected',
          dir: STALE_DIR,
          present: true,
          backups: [`${STALE_DIR}/NOTES.md`],
        },
      ]);
      // Planning deletes and backs up nothing.
      expect(snapshotTree(proj)).toEqual(before);
    });

    it('plans a dropped-gone capability (a manual add upstream no longer ships) the same way', async () => {
      await fixture();
      write(join(proj, 'pharn/pharn-review/gone/gone.md'), 'old');
      const { report } = plan(
        config({ capabilities: [CAP, { ...GONE, source: 'manual' }] }),
      );
      expect(report.removals).toEqual([
        {
          cap: { ...GONE, source: 'manual' },
          reason: 'dropped-gone',
          dir: 'pharn/pharn-review/gone',
          present: true,
          // No record for it → not provably pharn's → backed up.
          backups: ['pharn/pharn-review/gone/gone.md'],
        },
      ]);
    });

    // CORE-161: the store's stamp does not gate — a recorded hash proves
    // authorship, so a stamp mismatch still spares the unchanged recorded file.
    it('backs up only what pharn cannot prove it wrote, even when the store is stamped for another state', async () => {
      const cfg = await withStale();
      const { report } = plan({ ...cfg, commit: 'c'.repeat(40) }); // stamp mismatch
      expect(report.removals[0]!.backups).toEqual([`${STALE_DIR}/NOTES.md`]);
    });

    it('backs up every file when there is no usable record store', async () => {
      const cfg = await withStale();
      writeFileSync(join(proj, 'pharn.records.json'), '{ not json');
      const { report } = plan(cfg);
      expect(report.removals[0]!.backups).toEqual([
        `${STALE_DIR}/NOTES.md`,
        `${STALE_DIR}/stale.md`,
      ]);
    });

    it('marks an already-gone directory not present, with nothing to back up', async () => {
      await fixture();
      const { report } = plan(
        config({ capabilities: [CAP, { ...STALE, source: 'auto' }] }),
      );
      expect(report.removals).toEqual([
        expect.objectContaining({ present: false, backups: [] }),
      ]);
    });

    it('reads a path below a regular file as not present, not as an error', async () => {
      await fixture();
      write(
        join(proj, 'pharn/pharn-review'),
        'a file where the subtree would be',
      );
      const { report } = plan(
        config({ capabilities: [CAP, { ...STALE, source: 'auto' }] }),
      );
      expect(report.removals).toEqual([
        expect.objectContaining({ present: false, backups: [] }),
      ]);
    });

    it('addresses the directory at the layout the CONFIG recorded, not the clone’s', async () => {
      // v0.21.0: config and clone share the one layout, so a removal is
      // addressed under pharn/ — never at a root path a flat install used.
      const cfg = await withStale();
      write(join(proj, 'pharn-review/stale/stale.md'), 'a flat-era copy');
      const { report, apply } = plan(cfg);
      expect(report.layout).toBe('pharn');
      expect(report.removals[0]!.dir).toBe(STALE_DIR);
      expect(apply.removalPaths.lenses).toBe('pharn/pharn-review');
    });

    it('never removes a frozen (kept, unparsed) capability', async () => {
      const cfg = await withStale();
      write(join(repo, `${STALE_DIR}/stale.md`), UNPARSABLE);
      expect(plan(cfg).report.removals).toEqual([]);
    });

    it('plans a duplicated config entry once', async () => {
      const cfg = await withStale(
        config({
          capabilities: [
            CAP,
            { ...STALE, source: 'auto' },
            { ...STALE, source: 'auto' },
          ],
        }),
      );
      expect(plan(cfg).report.removals).toHaveLength(1);
    });

    it('refuses the whole plan when the directory sits behind a symlinked component', async () => {
      const cfg = await withStale(
        config({
          layout: 'pharn',
          capabilities: [
            { ...CAP, source: 'auto' },
            { ...STALE, source: 'auto' },
          ],
        }),
      );
      const outside = join(tmp.path(), 'outside');
      write(join(outside, 'pharn-review/stale/stale.md'), 'not ours');
      rmSync(join(proj, 'pharn'), { recursive: true });
      symlinkSync(outside, join(proj, 'pharn'));
      expect(() => plan(cfg)).toThrow(CapabilityRemovalError);
      expect(() => plan(cfg)).toThrow(/pharn is a symbolic link/);
    });

    it.skipIf(process.getuid?.() === 0)(
      'refuses the whole plan when a file in the directory cannot be read',
      async () => {
        const cfg = await withStale();
        const file = join(proj, `${STALE_DIR}/stale.md`);
        chmodSync(file, 0o000);
        try {
          expect(() => plan(cfg)).toThrow(CapabilityRemovalError);
          expect(() => plan(cfg)).toThrow(/Nothing was changed/);
        } finally {
          chmodSync(file, 0o644);
        }
      },
    );
  });
});
