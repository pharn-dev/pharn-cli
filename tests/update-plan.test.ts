import {
  chmodSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { snapshotTree, useTmpDir } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));
const resolveCapabilities = vi.fn();
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

const { buildUpdatePlan, CapabilityRemovalError } =
  await import('../src/lib/update-plan.js');
const { writeRecords } = await import('../src/lib/install-records.js');
const { contentHash } = await import('../src/lib/hash.js');

const CAP = { name: 'a11y', role: 'griller' as const };
const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
const DOC = 'CONSTITUTION.md';
const FROZEN = { name: 'backwards-compat', role: 'griller' as const };
const FROZEN_FILE =
  'pharn-pipeline/grillers/backwards-compat/backwards-compat.md';

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
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [CAP],
    layout: 'flat',
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
    write(join(repo, CAP_FILE), 'a11y v2');
    write(join(repo, DOC), 'constitution v2');
  }

  const plan = (cfg: PharnConfig, over: { force?: boolean } = {}) =>
    buildUpdatePlan({
      repoDir: repo,
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
    parseCapabilityIndex.mockReturnValue({ capabilities: [], unknown: [] });
    resolveCapabilities.mockReturnValue({
      selected: [{ ...CAP, matched: ['ssr'] }],
      skipped: [],
    });
  });

  it('reads the project and the clone and writes nothing', async () => {
    await fixture();
    const before = [snapshotTree(proj), snapshotTree(repo)];
    plan(config(), { force: true });
    expect([snapshotTree(proj), snapshotTree(repo)]).toEqual(before);
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
    expect(report.abandonedLayout).toBeNull();
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
      write(join(proj, CAP_FILE), '# a11y\nv1\n');
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
      write(join(repo, CAP_FILE), '# a11y\nv2\n');
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
      write(join(repo, CAP_FILE), '# a11y\nv1\n');
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
      write(join(repo, CAP_FILE), '# a11y\nv2\n');
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
    write(join(repo, FROZEN_FILE), 'WIP');
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
    const warnings: string[] = [];
    const { report, apply } = buildUpdatePlan({
      repoDir: repo,
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
        subtree: 'pharn-pipeline/grillers',
        reason: 'bad role',
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

  it('plans the abandoned layout in both directions, only when something would be written', async () => {
    await fixture();
    write(join(repo, 'pharn/CONSTITUTION.md'), 'constitution v2');
    write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'a');
    write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'c');
    const report = plan(config()).report;
    expect(report.layout).toBe('pharn');
    expect(report.abandonedLayout).toBe('flat');
  });

  describe('orphans (files upstream stopped shipping)', () => {
    const OLD_CMD = '.claude/commands/pharn-old.md';
    const OLD_CAP_FILE = 'pharn-pipeline/grillers/a11y/old.md';

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
      const { report, apply } = plan(config({ skillsVersion: '0.9.0' }));
      expect(report.recordsNote).not.toBeNull();
      expect(report.orphans).toEqual([]);
      expect(apply.orphanRecords).toEqual({});
    });

    it('excludes the files of a capability this run drops', async () => {
      await withOrphans();
      resolveCapabilities.mockReturnValue({ selected: [], skipped: [] });
      const { report, apply } = plan(
        config({ capabilities: [{ ...CAP, source: 'auto' }] }),
      );
      expect(apply.configCapabilities).toEqual([]);
      expect(report.orphans.map((o) => o.path)).toEqual([OLD_CMD]);
    });

    it('excludes the files of a frozen capability (carried as frozenRecords)', async () => {
      await withOrphans();
      parseCapabilityIndex.mockReturnValue({
        capabilities: [],
        unknown: [
          {
            name: CAP.name,
            role: CAP.role,
            subtree: 'pharn-pipeline/grillers',
            reason: 'bad role',
          },
        ],
      });
      const { report, apply } = plan(config());
      expect(report.orphans.map((o) => o.path)).toEqual([OLD_CMD]);
      expect(apply.frozenRecords).toHaveProperty(OLD_CAP_FILE);
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
    const STALE_DIR = 'pharn-review/stale';
    const GONE = { name: 'gone', role: 'lens' as const };

    async function withStale(
      cfg = config({
        capabilities: [
          { ...CAP, source: 'auto' },
          { ...STALE, source: 'auto' },
        ],
      }),
    ): Promise<PharnConfig> {
      await fixture(cfg);
      write(join(proj, `${STALE_DIR}/stale.md`), 'stale v1');
      write(join(proj, `${STALE_DIR}/NOTES.md`), 'my notes');
      await writeRecords(proj, {
        skillsVersion: cfg.skillsVersion,
        commit: cfg.commit,
        files: {
          [CAP_FILE]: contentHash(join(proj, CAP_FILE)),
          [DOC]: contentHash(join(proj, DOC)),
          [`${STALE_DIR}/stale.md`]: contentHash(
            join(proj, `${STALE_DIR}/stale.md`),
          ),
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
      write(join(proj, 'pharn-review/gone/gone.md'), 'old');
      const { report } = plan(
        config({ capabilities: [CAP, { ...GONE, source: 'manual' }] }),
      );
      expect(report.removals).toEqual([
        {
          cap: { ...GONE, source: 'manual' },
          reason: 'dropped-gone',
          dir: 'pharn-review/gone',
          present: true,
          // No record for it → not provably pharn's → backed up.
          backups: ['pharn-review/gone/gone.md'],
        },
      ]);
    });

    it('backs up every file when there is no usable record store', async () => {
      const cfg = await withStale();
      const { report } = plan({ ...cfg, commit: 'c'.repeat(40) }); // stamp mismatch
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
      write(join(proj, 'pharn-review'), 'a file where the subtree would be');
      const { report } = plan(
        config({ capabilities: [CAP, { ...STALE, source: 'auto' }] }),
      );
      expect(report.removals).toEqual([
        expect.objectContaining({ present: false, backups: [] }),
      ]);
    });

    it('addresses the directory at the layout the CONFIG recorded, not the clone’s', async () => {
      const cfg = await withStale();
      write(join(repo, 'pharn/CONSTITUTION.md'), 'constitution v2');
      write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'a');
      write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'c');
      const { report, apply } = plan(cfg);
      expect(report.layout).toBe('pharn');
      expect(report.removals[0]!.dir).toBe(STALE_DIR);
      expect(apply.removalPaths.lenses).toBe('pharn-review');
    });

    it('never removes a frozen (kept, unparsed) capability', async () => {
      const cfg = await withStale();
      parseCapabilityIndex.mockReturnValue({
        capabilities: [],
        unknown: [
          {
            name: STALE.name,
            role: STALE.role,
            subtree: 'pharn-review',
            reason: 'bad role',
          },
        ],
      });
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
