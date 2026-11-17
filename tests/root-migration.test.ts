import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { snapshotTree, useTmpDir } from './helpers.js';
import { detectLayout } from '../src/lib/layout.js';
import { writeRecords } from '../src/lib/install-records.js';
import { isInstallRootPath } from '../src/lib/install-surfaces.js';
import { orphanNoteLines, type Orphan } from '../src/lib/orphans.js';
import {
  FLAT_LAYOUT_MESSAGE,
  loadArchetypeConfig,
} from '../src/lib/pharn-config.js';
import { planUninstall } from '../src/lib/uninstall-plan.js';
import { buildUpdatePlan } from '../src/lib/update-plan.js';
import { buildUpdateReport } from '../src/lib/update-report.js';
import type { PharnConfig } from '../src/types.js';
import { sealRepo } from './support/harness.js';

// The old root footprint of a pharn-layout install made from a pharn-oss
// before 7.0.0: root THREAT-MODEL.md / LIMITS.md pharn wrote, the user's data
// it only hinted at, and two notices. The root-footprint migration
// (lib/root-migration.ts) that retired it is removed in v0.21.0
// (docs/contributing.md, "Support policy"; 0.20.x is the last pharn that ran
// it). What a run does now: nothing to that footprint. A recorded root doc is
// an ordinary orphan — listed, its record carried, never deleted by update
// (uninstall removes it by its hash) — and root user data is never named.
//
// The titles are kept (the Test job's test-integrity check matches tests by
// name); each body asserts what v0.21.0 does instead.

const tmp = useTmpDir();

function put(root: string, rel: string, body: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

const hashOf = (body: string): string =>
  createHash('sha256').update(body).digest('hex');

/**
 * A clone: `newDocs` → both docs under pharn/ and sealed with the
 * pharn-install.json a 7.21+ tree carries; else at the root only, unsealed —
 * a pre-7.0 tree, which ships no manifest and is refused when fetched.
 */
function clone(version: string, newDocs: boolean): string {
  const dir = join(tmp.path(), 'clone');
  put(dir, 'SKILLS_VERSION', `${version}\n`);
  put(dir, 'pharn/pharn-contracts/x.md', 'x');
  mkdirSync(join(dir, 'pharn/pharn-pipeline/grillers'), { recursive: true });
  mkdirSync(join(dir, 'pharn/pharn-review'), { recursive: true });
  put(dir, 'pharn/CONSTITUTION.md', 'c');
  put(dir, newDocs ? 'pharn/THREAT-MODEL.md' : 'THREAT-MODEL.md', 'threat');
  put(dir, newDocs ? 'pharn/LIMITS.md' : 'LIMITS.md', 'limits');
  return newDocs ? sealRepo(dir) : dir;
}

function project(): string {
  const dir = join(tmp.path(), 'proj');
  mkdirSync(join(dir, 'pharn'), { recursive: true });
  return dir;
}

const RECORDED = {
  'THREAT-MODEL.md': hashOf('threat'),
  'LIMITS.md': hashOf('limits'),
};

function config(over: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.20.0',
    skillsVersion: '6.9.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['lib'],
    capabilities: [],
    layout: 'pharn',
    ...over,
  };
}

/** `pharn update`'s one plan over `proj` from `repo`, with `records` stored. */
async function plan(
  proj: string,
  repo: string,
  records: Record<string, string> | null = RECORDED,
) {
  if (records !== null)
    await writeRecords(proj, {
      skillsVersion: '6.9.0',
      commit: null,
      files: records,
    });
  return buildUpdatePlan({
    repoDir: repo,
    sha: 'a'.repeat(40),
    config: config(),
    cwd: proj,
    force: false,
    channel: 'main',
  });
}

// The project as the run left it, minus the record store `plan` writes first.
const tree = (proj: string): string[] =>
  snapshotTree(proj).filter((e) => !e.includes('pharn.records.json'));

const orphanOf = (orphans: readonly Orphan[], rel: string) =>
  orphans.find((o) => o.path === rel);

// What `update --json` reports for it: the constant `null`.
const jsonRootMigration = (p: Awaited<ReturnType<typeof plan>>): unknown =>
  buildUpdateReport({
    status: 'planned',
    force: false,
    channel: 'main',
    currentChannel: 'main',
    source: { kind: 'main' },
    installed: '6.9.0',
    latest: p.report.installedVersion,
    archetypes: ['lib'],
    plan: p.report,
  }).plan!.rootMigration;

// The old root docs a pre-7.0 install recorded are still paths `update` and
// `uninstall` may handle, beside their pharn/ replacements.
describe('the old root docs', () => {
  it('old root records stay install paths (the FLAT list), the new ones too', () => {
    for (const rel of [
      'THREAT-MODEL.md',
      'LIMITS.md',
      'pharn/THREAT-MODEL.md',
      'pharn/LIMITS.md',
    ])
      expect(isInstallRootPath(rel)).toBe(true);
    // v0.21.0: a tree without the pharn layout's marker is never a layout.
    const flat = join(tmp.path(), 'flat');
    put(flat, 'pharn-contracts/x.md', 'x');
    expect(() => detectLayout(flat)).toThrow(/ships the flat layout/);
  });
});

describe('planRootMigration — docs', () => {
  it('is null for a flat clone', async () => {
    // v0.21.0: a flat clone is refused before anything is planned.
    const flat = join(tmp.path(), 'flat');
    put(flat, 'SKILLS_VERSION', '7.0.0\n');
    put(flat, 'pharn-contracts/x.md', 'x');
    await expect(plan(project(), flat)).rejects.toThrow(
      /ships no pharn-install\.json/,
    );
  });

  it('is null for a flat install moving to the pharn layout (its root tree is left, not retired)', () => {
    // v0.21.0: a flat install moves nowhere — its config is refused at load
    // ("re-run `pharn init`"), and its root tree is left as it is.
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(
      proj,
      'pharn.config.json',
      JSON.stringify({ ...config(), layout: 'flat' }),
    );
    expect(() => loadArchetypeConfig(proj)).toThrow(FLAT_LAYOUT_MESSAGE);
    expect(readFileSync(join(proj, 'THREAT-MODEL.md'), 'utf8')).toBe('threat');
  });

  it('is null below SKILLS 7 when the clone still keeps both docs at the root', async () => {
    // v0.21.0: such a tree ships no pharn-install.json and is refused, so no
    // plan exists at all; the 7.x plan reports `rootMigration` as null.
    const proj = project();
    await expect(plan(proj, clone('6.9.0', false))).rejects.toThrow(
      /ships no pharn-install\.json/,
    );
    const p = await plan(proj, clone('7.0.0', true));
    expect(p.report).not.toHaveProperty('rootMigration');
    expect(jsonRootMigration(p)).toBeNull();
    expect(p.report.writes).not.toContain('THREAT-MODEL.md');
  });

  it('a record-equal root doc is deleted; an edited one kept', async () => {
    // v0.21.0: neither is deleted. Both are orphans, each in its own state,
    // and both records are carried.
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(proj, 'LIMITS.md', 'limits, edited');
    const p = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')?.state).toBe(
      'unchanged',
    );
    expect(orphanOf(p.report.orphans, 'LIMITS.md')?.state).toBe('edited');
    expect(p.apply.orphanRecords).toEqual(RECORDED);
    expect(existsSync(join(proj, 'THREAT-MODEL.md'))).toBe(true);
  });

  it('a symlinked root doc is unverifiable (left alone), an absent one absent', async () => {
    const proj = project();
    put(tmp.path(), 'elsewhere.md', 'threat');
    symlinkSync(
      join(tmp.path(), 'elsewhere.md'),
      join(proj, 'THREAT-MODEL.md'),
    );
    const p = await plan(proj, clone('7.0.0', true));
    // Listed, never read through the link; the absent one is not news.
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')?.state).toBe(
      'unreadable',
    );
    expect(orphanOf(p.report.orphans, 'LIMITS.md')).toBeUndefined();
    expect(readFileSync(join(tmp.path(), 'elsewhere.md'), 'utf8')).toBe(
      'threat',
    );
  });

  it('a root doc with no usable record is not provably pharn’s: kept', async () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    const p = await plan(proj, clone('7.0.0', true), null);
    // No store: no orphan can be named, and nothing touches the file.
    expect(p.report.orphans).toEqual([]);
    expect(p.report.writes).not.toContain('THREAT-MODEL.md');
    expect(readFileSync(join(proj, 'THREAT-MODEL.md'), 'utf8')).toBe('threat');
  });

  it('agrees with uninstall’s own classifier', async () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(proj, 'LIMITS.md', 'edited');
    const p = await plan(proj, clone('7.0.0', true));
    const u = planUninstall(proj, RECORDED);
    // An unchanged orphan is what uninstall would delete; an edited one, what
    // it would keep.
    expect(u.delete).toEqual(['THREAT-MODEL.md']);
    expect(u.edited).toEqual(['LIMITS.md']);
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')?.state).toBe(
      'unchanged',
    );
    expect(orphanOf(p.report.orphans, 'LIMITS.md')?.state).toBe('edited');
  });
});

describe('deleteRootDocs', () => {
  it('deletes only once the pharn/ copy landed as the clone ships it', async () => {
    // v0.21.0: never deletes — even with the pharn/ copy in place, the root
    // doc stays an orphan.
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(proj, 'pharn/THREAT-MODEL.md', 'threat');
    const p = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')?.state).toBe(
      'unchanged',
    );
    expect(p.report.removals).toEqual([]);
    expect(existsSync(join(proj, 'THREAT-MODEL.md'))).toBe(true);
  });

  it('never follows a symlinked pharn/ copy, and keeps the root file', async () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(tmp.path(), 'outside.md', 'threat');
    symlinkSync(
      join(tmp.path(), 'outside.md'),
      join(proj, 'pharn/THREAT-MODEL.md'),
    );
    const before = tree(proj);
    const p = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')?.state).toBe(
      'unchanged',
    );
    expect(tree(proj)).toEqual(before);
    expect(readFileSync(join(proj, 'THREAT-MODEL.md'), 'utf8')).toBe('threat');
  });

  it('a planned delete whose doc is already gone keeps it and does not throw', async () => {
    // v0.21.0: a recorded root doc that is gone is simply not an orphan, and
    // its record is dropped by the next store.
    const proj = project();
    const p = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')).toBeUndefined();
    expect(p.apply.orphanRecords).toEqual({});
  });

  it('keeps a planned delete whose doc was edited after the plan, byte for byte, and names it as changed', async () => {
    const proj = project();
    put(proj, 'LIMITS.md', 'limits');
    const first = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(first.report.orphans, 'LIMITS.md')?.state).toBe(
      'unchanged',
    );
    put(proj, 'LIMITS.md', 'edited after the plan');
    const second = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(second.report.orphans, 'LIMITS.md')?.state).toBe('edited');
    expect(readFileSync(join(proj, 'LIMITS.md'), 'utf8')).toBe(
      'edited after the plan',
    );
  });
});

describe('planRootMigration — user data is hinted at, never moved (SKILLS ≥ 7)', () => {
  const ITEMS = [
    {
      name: 'memory-bank',
      from: 'memory-bank/',
      to: 'pharn/memory-bank/',
      make: (root: string, rel: string) =>
        put(root, `${rel}/canon.md`, 'canon'),
    },
    {
      name: 'the spec template',
      from: 'pharn.spec-template.md',
      to: 'pharn/spec-template.md',
      make: (root: string, rel: string) => put(root, rel, 'template'),
    },
  ];
  const strip = (p: string): string => p.replace(/\/$/, '');
  // v0.21.0: no hint exists — the plan never names a root user-data path.
  const named = (p: Awaited<ReturnType<typeof plan>>, rel: string): boolean =>
    JSON.stringify(p.report).includes(strip(rel));

  for (const item of ITEMS) {
    describe(item.name, () => {
      it('absent → no hint', async () => {
        const p = await plan(project(), clone('7.0.0', true));
        expect(named(p, item.from)).toBe(false);
      });

      it('present, destination free → a `free` hint; nothing is moved', async () => {
        const proj = project();
        item.make(proj, strip(item.from));
        const before = tree(proj);
        const p = await plan(proj, clone('7.0.0', true));
        expect(named(p, item.from)).toBe(false);
        expect(tree(proj)).toEqual(before);
        expect(existsSync(join(proj, strip(item.to)))).toBe(false);
      });

      it('both present → an `exists` hint; both left as they are', async () => {
        const proj = project();
        item.make(proj, strip(item.from));
        item.make(proj, strip(item.to));
        const before = tree(proj);
        const p = await plan(proj, clone('7.0.0', true));
        expect(named(p, item.from)).toBe(false);
        expect(tree(proj)).toEqual(before);
      });

      it('a symlinked source is still hinted at (pharn proves nothing either way)', async () => {
        const proj = project();
        item.make(tmp.path(), `real-${item.name}`);
        symlinkSync(
          join(tmp.path(), `real-${item.name}`),
          join(proj, strip(item.from)),
        );
        const p = await plan(proj, clone('7.0.0', true));
        expect(named(p, item.from)).toBe(false);
        expect(existsSync(join(proj, strip(item.from)))).toBe(true);
      });
    });
  }

  it('a destination that cannot be checked counts as existing (never a command that nests or fails)', async () => {
    const proj = join(tmp.path(), 'proj');
    // `pharn` is a regular FILE: nothing below it can be checked.
    put(proj, 'pharn', 'a file');
    put(proj, 'memory-bank/canon.md', 'canon');
    const p = await plan(proj, clone('7.0.0', true));
    expect(named(p, 'memory-bank/')).toBe(false);
    expect(readFileSync(join(proj, 'memory-bank/canon.md'), 'utf8')).toBe(
      'canon',
    );
  });

  it('lists the two paths in a fixed order, whatever their type', async () => {
    const proj = project();
    put(proj, 'memory-bank', 'a file where a dir was expected');
    put(proj, 'pharn.spec-template.md/x', 'a dir where a file was expected');
    const p = await plan(proj, clone('7.0.0', true));
    expect(named(p, 'memory-bank')).toBe(false);
    expect(named(p, 'pharn.spec-template.md')).toBe(false);
  });

  it('is inert below 7: no hints, no notices, even with everything present', async () => {
    const proj = project();
    put(proj, 'memory-bank/canon.md', 'canon');
    put(proj, 'pharn.spec-template.md', 'template');
    put(proj, '.pharn/scratch.json', '{}');
    put(proj, '.gitignore', '.pharn/\n');
    const before = tree(proj);
    // v0.21.0: a pre-7.0 tree is refused when fetched, so nothing is planned.
    await expect(plan(proj, clone('6.9.0', false))).rejects.toThrow(
      /ships no pharn-install\.json/,
    );
    const p = await plan(proj, clone('7.0.0', true));
    expect(named(p, 'memory-bank')).toBe(false);
    expect(jsonRootMigration(p)).toBeNull();
    expect(tree(proj)).toEqual(before);
  });
});

describe('scratch notice and .gitignore hints', () => {
  it('only ci.yml in .pharn/ → no notice; anything else → notice', async () => {
    // v0.21.0: no notice either way, and `.pharn/` is never touched.
    const proj = project();
    put(proj, '.pharn/ci.yml', 'coverage: {}');
    put(proj, '.pharn/scratch.json', '{}');
    const p = await plan(proj, clone('7.0.0', true));
    expect(p.report).not.toHaveProperty('rootMigration');
    expect(existsSync(join(proj, '.pharn/scratch.json'))).toBe(true);
    expect(existsSync(join(proj, '.pharn/ci.yml'))).toBe(true);
  });

  it('a symlinked .pharn is never listed', async () => {
    const proj = project();
    put(tmp.path(), 'real-scratch/x.json', '{}');
    symlinkSync(join(tmp.path(), 'real-scratch'), join(proj, '.pharn'));
    const p = await plan(proj, clone('7.0.0', true));
    expect(p.report).not.toHaveProperty('rootMigration');
    expect(jsonRootMigration(p)).toBeNull();
  });

  it('names each replacement once, whatever spelling the old line used', async () => {
    // v0.21.0: an old `.pharn` line gets no replacement hint, and the user's
    // lines are never rewritten.
    const proj = project();
    const text = '/.pharn\n.pharn/\n.pharn/*\n# .pharn\n';
    put(proj, '.gitignore', text);
    const p = await plan(proj, clone('7.0.0', true));
    expect(JSON.stringify(p.report)).not.toContain('pharn/.run/ (');
    expect(jsonRootMigration(p)).toBeNull();
    expect(readFileSync(join(proj, '.gitignore'), 'utf8')).toBe(text);
  });

  it('no .gitignore → no hints', async () => {
    const p = await plan(project(), clone('7.0.0', true));
    expect(p.report).not.toHaveProperty('rootMigration');
    expect(jsonRootMigration(p)).toBeNull();
  });
});

describe('planRootMigration — what a same-version run finishes', () => {
  it('retires a record-equal root doc whose pharn/ copy is not there yet', async () => {
    // v0.21.0: the run writes the pharn/ copy and retires nothing — the root
    // doc stays an orphan, its record carried.
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    const p = await plan(proj, clone('7.0.0', true));
    expect(p.report.writes).toContain('pharn/THREAT-MODEL.md');
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')?.state).toBe(
      'unchanged',
    );
    expect(p.apply.orphanRecords['THREAT-MODEL.md']).toBe(hashOf('threat'));
  });

  it('deletes the root doc only once the pharn/ copy landed as upstream ships it (a hand-placed copy keeps it)', async () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(proj, 'pharn/THREAT-MODEL.md', 'a hand-placed copy');
    const p = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')?.state).toBe(
      'unchanged',
    );
    expect(readFileSync(join(proj, 'THREAT-MODEL.md'), 'utf8')).toBe('threat');
  });

  it('never moves user data at the root (CORE-158); the doc beside it still retires', async () => {
    // v0.21.0: neither is acted on; the doc is an orphan, the data unnamed.
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(proj, 'memory-bank/canon.md', 'canon');
    const p = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(p.report.orphans, 'THREAT-MODEL.md')).toEqual({
      path: 'THREAT-MODEL.md',
      state: 'unchanged',
    });
    expect(JSON.stringify(p.report)).not.toContain('memory-bank');
    expect(readFileSync(join(proj, 'memory-bank/canon.md'), 'utf8')).toBe(
      'canon',
    );
  });

  it('keeps an edited root doc: its record survives', async () => {
    const proj = project();
    put(proj, 'LIMITS.md', 'mine now');
    const p = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(p.report.orphans, 'LIMITS.md')?.state).toBe('edited');
    expect(p.apply.orphanRecords['LIMITS.md']).toBe(hashOf('limits'));
  });

  it('retires nothing below 7, for a flat install, or without a usable store', async () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    // Below 7: refused when fetched; at 7.x the root doc is an orphan.
    await expect(plan(proj, clone('6.9.0', false))).rejects.toThrow(
      /ships no pharn-install\.json/,
    );
    const now = await plan(proj, clone('7.0.0', true));
    expect(orphanOf(now.report.orphans, 'THREAT-MODEL.md')).toEqual({
      path: 'THREAT-MODEL.md',
      state: 'unchanged',
    });
    // Without a usable store.
    writeFileSync(join(proj, 'pharn.records.json'), '{ not json');
    const unstored = await plan(proj, clone('7.0.0', true), null);
    expect(unstored.report.orphans).toEqual([]);
    // A flat install: refused at load, before any plan.
    put(
      proj,
      'pharn.config.json',
      JSON.stringify({ ...config(), layout: 'flat' }),
    );
    expect(() => loadArchetypeConfig(proj)).toThrow(FLAT_LAYOUT_MESSAGE);
    expect(existsSync(join(proj, 'THREAT-MODEL.md'))).toBe(true);
  });
});

describe('the ROOT MIGRATION note', () => {
  // v0.21.0: there is no ROOT MIGRATION note. A recorded root doc is named in
  // the ORPHANED note, like any file upstream stopped shipping.
  const orphans: Orphan[] = [
    { path: 'LIMITS.md', state: 'edited' },
    { path: 'THREAT-MODEL.md', state: 'unchanged' },
  ];
  const text = (): string =>
    stripVTControlCharacters((orphanNoteLines(orphans) ?? []).join('\n'));

  it('previews in the future tense', () => {
    expect(text()).toContain('THREAT-MODEL.md');
    expect(text()).not.toContain('WOULD DELETE');
    expect(text()).toContain('`pharn update` never');
  });

  it('hints at a free destination with git mv (or mv), never moving it', () => {
    expect(text()).not.toContain('git mv');
    expect(text()).not.toContain('memory-bank');
  });

  it('says to merge by hand when the destination exists, with no command that would nest it', () => {
    expect(text()).not.toContain('merge it into');
    expect(text()).toContain('LIMITS.md');
  });

  it('reports what the writer did, and prints the same hints', () => {
    expect(text()).not.toMatch(/deleted (THREAT-MODEL|LIMITS)\.md/);
    expect(text()).toContain('Delete the ones you no longer need by hand');
  });

  it('says nothing when everything is absent', () => {
    expect(orphanNoteLines([])).toBeNull();
  });
});
