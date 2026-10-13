import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { snapshotTree, useTmpDir } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));
const resolveCapabilities = vi.fn();
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

const { buildUpdatePlan } = await import('../src/lib/update-plan.js');
const { writeRecords } = await import('../src/lib/install-records.js');
const { sha256File } = await import('../src/lib/hash.js');

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
        [CAP_FILE]: sha256File(join(proj, CAP_FILE)),
        [DOC]: sha256File(join(proj, DOC)),
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
          [CAP_FILE]: sha256File(join(proj, CAP_FILE)),
          [DOC]: sha256File(join(proj, DOC)),
          [OLD_CMD]: sha256File(join(proj, OLD_CMD)),
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
        [OLD_CMD]: sha256File(join(proj, OLD_CMD)),
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
});
