import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { contentHash } from '../src/lib/hash.js';
import { layoutPaths, resolveTrustedDocs } from '../src/lib/layout.js';
import { isInstallRootPath } from '../src/lib/orphans.js';
import { planUninstall } from '../src/lib/uninstall-plan.js';
import {
  deleteRootDocs,
  pendingRootMigration,
  planRootMigration,
  rootMigrationNoteLines,
  versionMajor,
  type RootMigration,
} from '../src/lib/root-migration.js';
import type { PharnConfig } from '../src/types.js';

// The old root footprint of a pharn-layout install (lib/root-migration.ts):
// the root docs pharn wrote, the user's data it only hints at (never moves —
// CORE-158), and two notices.

const tmp = useTmpDir();

function put(root: string, rel: string, body: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

const hashOf = (body: string): string =>
  createHash('sha256').update(body).digest('hex');

/** A clone: `newDocs` → both docs under pharn/, else at the root. */
function clone(version: string, newDocs: boolean): string {
  const dir = join(tmp.path(), 'clone');
  put(dir, 'SKILLS_VERSION', `${version}\n`);
  put(dir, 'pharn/pharn-contracts/x.md', 'x');
  put(dir, 'pharn/CONSTITUTION.md', 'c');
  put(dir, newDocs ? 'pharn/THREAT-MODEL.md' : 'THREAT-MODEL.md', 'threat');
  put(dir, newDocs ? 'pharn/LIMITS.md' : 'LIMITS.md', 'limits');
  return dir;
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

function plan(
  proj: string,
  repo: string,
  version: string,
  records: Record<string, string> | null = RECORDED,
): RootMigration | null {
  return planRootMigration({
    projectRoot: proj,
    repoDir: repo,
    layout: 'pharn',
    installedLayout: 'pharn',
    skillsVersion: version,
    records,
  });
}

describe('resolveTrustedDocs — the ordered probe', () => {
  it('an old clone keeps THREAT-MODEL/LIMITS at the root', () => {
    expect(resolveTrustedDocs(clone('6.9.0', false), 'pharn')).toEqual([
      'pharn/CONSTITUTION.md',
      'pharn/ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
    ]);
  });

  it('a new clone has them under pharn/', () => {
    expect(resolveTrustedDocs(clone('7.0.0', true), 'pharn')).toEqual(
      layoutPaths('pharn').docs,
    );
  });

  it('the flat layout has no fallback', () => {
    expect(resolveTrustedDocs(clone('7.0.0', true), 'flat')).toEqual(
      layoutPaths('flat').docs,
    );
  });

  it('old root records stay install paths (the FLAT list), the new ones too', () => {
    for (const rel of [
      'THREAT-MODEL.md',
      'LIMITS.md',
      'pharn/THREAT-MODEL.md',
      'pharn/LIMITS.md',
    ])
      expect(isInstallRootPath(rel)).toBe(true);
  });
});

describe('planRootMigration — docs', () => {
  it('is null for a flat clone', () => {
    const repo = clone('7.0.0', true);
    expect(
      planRootMigration({
        projectRoot: project(),
        repoDir: repo,
        layout: 'flat',
        installedLayout: 'pharn',
        skillsVersion: '7.0.0',
        records: RECORDED,
      }),
    ).toBeNull();
  });

  it('is null for a flat install moving to the pharn layout (its root tree is left, not retired)', () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    expect(
      planRootMigration({
        projectRoot: proj,
        repoDir: clone('7.0.0', true),
        layout: 'pharn',
        installedLayout: 'flat',
        skillsVersion: '7.0.0',
        records: RECORDED,
      }),
    ).toBeNull();
  });

  it('is null below SKILLS 7 when the clone still keeps both docs at the root', () => {
    expect(plan(project(), clone('6.9.0', false), '6.9.0')).toBeNull();
  });

  it('a record-equal root doc is deleted; an edited one kept', () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(proj, 'LIMITS.md', 'my limits');
    expect(plan(proj, clone('7.0.0', true), '7.0.0')?.docs).toEqual([
      { rel: 'THREAT-MODEL.md', action: 'delete' },
      { rel: 'LIMITS.md', action: 'keep-edited' },
    ]);
  });

  it('a symlinked root doc is unverifiable (left alone), an absent one absent', () => {
    const proj = project();
    put(tmp.path(), 'outside.md', 'threat');
    symlinkSync(join(tmp.path(), 'outside.md'), join(proj, 'THREAT-MODEL.md'));
    expect(plan(proj, clone('7.0.0', true), '7.0.0')?.docs).toEqual([
      { rel: 'THREAT-MODEL.md', action: 'unverifiable' },
      { rel: 'LIMITS.md', action: 'absent' },
    ]);
  });

  it('a root doc with no usable record is not provably pharn’s: kept', () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    expect(plan(proj, clone('7.0.0', true), '7.0.0', null)?.docs).toEqual([
      { rel: 'THREAT-MODEL.md', action: 'unverifiable' },
      { rel: 'LIMITS.md', action: 'absent' },
    ]);
  });

  it('agrees with uninstall’s own classifier', () => {
    const proj = project();
    put(proj, 'THREAT-MODEL.md', 'threat');
    expect(planUninstall(proj, RECORDED).delete).toEqual(['THREAT-MODEL.md']);
  });
});

describe('deleteRootDocs', () => {
  it('deletes only once the pharn/ copy landed as the clone ships it', () => {
    const proj = project();
    const repo = clone('7.0.0', true);
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(proj, 'LIMITS.md', 'limits');
    put(proj, 'pharn/THREAT-MODEL.md', 'threat'); // landed
    put(proj, 'pharn/LIMITS.md', 'not what upstream ships'); // did not
    const docs = plan(proj, repo, '7.0.0')!.docs;
    expect(deleteRootDocs(proj, repo, docs)).toEqual({
      deleted: ['THREAT-MODEL.md'],
      kept: ['LIMITS.md'],
    });
    expect(readFileSync(join(proj, 'LIMITS.md'), 'utf8')).toBe('limits');
  });

  it('never follows a symlinked pharn/ copy, and keeps the root file', () => {
    const proj = project();
    const repo = clone('7.0.0', true);
    put(proj, 'THREAT-MODEL.md', 'threat');
    put(tmp.path(), 'elsewhere/THREAT-MODEL.md', 'threat');
    symlinkSync(
      join(tmp.path(), 'elsewhere/THREAT-MODEL.md'),
      join(proj, 'pharn/THREAT-MODEL.md'),
    );
    const result = deleteRootDocs(proj, repo, [
      { rel: 'THREAT-MODEL.md', action: 'delete' },
      { rel: 'LIMITS.md', action: 'keep-edited' },
      { rel: 'NOT-A-DOC.md', action: 'delete' },
    ]);
    expect(result).toEqual({
      deleted: [],
      kept: ['THREAT-MODEL.md', 'NOT-A-DOC.md'],
    });
  });

  it('a failed unlink keeps the doc and does not throw', () => {
    const proj = project();
    const repo = clone('7.0.0', true);
    put(proj, 'pharn/LIMITS.md', 'limits');
    // Planned as a delete, but gone before the unlink (ENOENT).
    expect(
      deleteRootDocs(proj, repo, [{ rel: 'LIMITS.md', action: 'delete' }]),
    ).toEqual({ deleted: [], kept: ['LIMITS.md'] });
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
  const hintOf = (m: RootMigration | null, from: string) =>
    m?.userData.find((x) => x.from === from);

  for (const item of ITEMS) {
    describe(item.name, () => {
      it('absent → no hint', () => {
        expect(
          hintOf(plan(project(), clone('7.0.0', true), '7.0.0'), item.from),
        ).toBeUndefined();
      });

      it('present, destination free → a `free` hint; nothing is moved', () => {
        const proj = project();
        item.make(proj, strip(item.from));
        expect(
          hintOf(plan(proj, clone('7.0.0', true), '7.0.0'), item.from),
        ).toEqual({ from: item.from, to: item.to, destination: 'free' });
        expect(existsSync(join(proj, strip(item.from)))).toBe(true);
        expect(existsSync(join(proj, strip(item.to)))).toBe(false);
      });

      it('both present → an `exists` hint; both left as they are', () => {
        const proj = project();
        item.make(proj, strip(item.from));
        item.make(proj, strip(item.to));
        expect(
          hintOf(plan(proj, clone('7.0.0', true), '7.0.0'), item.from)
            ?.destination,
        ).toBe('exists');
      });

      it('a symlinked source is still hinted at (pharn proves nothing either way)', () => {
        const proj = project();
        const elsewhere = `elsewhere-${strip(item.to).replace('/', '-')}`;
        item.make(tmp.path(), elsewhere);
        symlinkSync(join(tmp.path(), elsewhere), join(proj, strip(item.from)));
        expect(
          hintOf(plan(proj, clone('7.0.0', true), '7.0.0'), item.from)
            ?.destination,
        ).toBe('free');
      });
    });
  }

  it('a destination that cannot be checked counts as existing (never a command that nests or fails)', () => {
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj);
    put(proj, 'pharn', 'a file where pharn/ belongs'); // lstat → ENOTDIR
    put(proj, 'memory-bank/a.md', 'a');
    expect(
      hintOf(plan(proj, clone('7.0.0', true), '7.0.0'), 'memory-bank/'),
    ).toEqual({
      from: 'memory-bank/',
      to: 'pharn/memory-bank/',
      destination: 'exists',
    });
  });

  it('lists the two paths in a fixed order, whatever their type', () => {
    const proj = project();
    mkdirSync(join(proj, 'pharn.spec-template.md')); // a directory
    put(proj, 'memory-bank', 'a file');
    expect(
      plan(proj, clone('7.0.0', true), '7.0.0')!.userData.map((h) => h.from),
    ).toEqual(['memory-bank/', 'pharn.spec-template.md']);
  });

  it('is inert below 7: no hints, no notices, even with everything present', () => {
    const proj = project();
    put(proj, 'memory-bank/a.md', 'a');
    put(proj, 'pharn.spec-template.md', 't');
    put(proj, '.pharn/scratch.json', '{}');
    put(proj, '.gitignore', '.pharn/\n');
    // A 6.x clone that already ships the docs under pharn/: docs only.
    expect(plan(proj, clone('6.9.0', true), '6.9.0')).toEqual({
      docs: [
        { rel: 'THREAT-MODEL.md', action: 'absent' },
        { rel: 'LIMITS.md', action: 'absent' },
      ],
      userData: [],
      scratchNotice: false,
      gitignoreHints: [],
    });
  });
});

describe('scratch notice and .gitignore hints', () => {
  it('only ci.yml in .pharn/ → no notice; anything else → notice', () => {
    const proj = project();
    put(proj, '.pharn/ci.yml', 'x');
    expect(plan(proj, clone('7.0.0', true), '7.0.0')?.scratchNotice).toBe(
      false,
    );
    put(proj, '.pharn/writes-scope.json', '{}');
    expect(plan(proj, clone('7.0.0', true), '7.0.0')?.scratchNotice).toBe(true);
  });

  it('a symlinked .pharn is never listed', () => {
    const proj = project();
    put(tmp.path(), 'scratch/x.json', '{}');
    symlinkSync(join(tmp.path(), 'scratch'), join(proj, '.pharn'));
    expect(plan(proj, clone('7.0.0', true), '7.0.0')?.scratchNotice).toBe(
      false,
    );
  });

  it('names each replacement once, whatever spelling the old line used', () => {
    const proj = project();
    put(
      proj,
      '.gitignore',
      '# .pharn-backup\n/.pharn/**\n.pharn.lock*\n  .pharn-backup/  \n!.pharn\n',
    );
    expect(plan(proj, clone('7.0.0', true), '7.0.0')?.gitignoreHints).toEqual([
      'pharn/.run/',
      'pharn/.backup/',
      'pharn/.lock*',
    ]);
  });

  it('no .gitignore → no hints', () => {
    expect(
      plan(project(), clone('7.0.0', true), '7.0.0')?.gitignoreHints,
    ).toEqual([]);
  });
});

describe('pendingRootMigration — the bounded re-open signal', () => {
  const cfg = (over: Partial<PharnConfig> = {}): PharnConfig =>
    ({
      pharnVersion: '0.14.0',
      skillsVersion: '7.0.0',
      repo: 'pharn-dev/pharn-oss',
      commit: null,
      modules: [],
      layout: 'pharn',
      capabilities: [],
      ...over,
    }) as PharnConfig;

  it('fires for a record-equal root doc whose pharn/ copy is not recorded', () => {
    const proj = project();
    put(proj, 'LIMITS.md', 'limits');
    expect(pendingRootMigration(proj, cfg(), RECORDED)).toBe('LIMITS.md');
  });

  it('does not fire when a pharn/ copy is already there, even unrecorded (the run would skip it)', () => {
    const proj = project();
    put(proj, 'LIMITS.md', 'limits');
    put(proj, 'pharn/LIMITS.md', 'a hand-placed copy');
    put(proj, 'THREAT-MODEL.md', 'mine');
    expect(pendingRootMigration(proj, cfg(), RECORDED)).toBeNull();
  });

  it('never fires for user data at the root: pharn does not move it (CORE-158)', () => {
    const proj = project();
    put(proj, 'memory-bank/a.md', 'a');
    put(proj, 'pharn.spec-template.md', 't');
    expect(pendingRootMigration(proj, cfg(), null)).toBeNull();
    expect(pendingRootMigration(proj, cfg(), RECORDED)).toBeNull();
    // The doc half still fires beside it.
    put(proj, 'LIMITS.md', 'limits');
    expect(pendingRootMigration(proj, cfg(), RECORDED)).toBe('LIMITS.md');
  });

  it('does not fire for an edited doc (its record survives — no endless re-open)', () => {
    const proj = project();
    put(proj, 'LIMITS.md', 'mine');
    expect(pendingRootMigration(proj, cfg(), RECORDED)).toBeNull();
  });

  it('does not fire once the pharn/ copy is recorded, below 7, for flat, or without records', () => {
    const proj = project();
    put(proj, 'LIMITS.md', 'limits');
    const both = {
      ...RECORDED,
      'pharn/LIMITS.md': hashOf('limits'),
      'pharn/THREAT-MODEL.md': 'x',
    };
    expect(pendingRootMigration(proj, cfg(), both)).toBeNull();
    expect(
      pendingRootMigration(proj, cfg({ skillsVersion: '6.9.0' }), RECORDED),
    ).toBeNull();
    expect(
      pendingRootMigration(proj, cfg({ skillsVersion: 'garbage' }), RECORDED),
    ).toBeNull();
    expect(
      pendingRootMigration(proj, cfg({ layout: 'flat' }), RECORDED),
    ).toBeNull();
    expect(pendingRootMigration(proj, cfg(), null)).toBeNull();
  });
});

describe('the ROOT MIGRATION note', () => {
  const m: RootMigration = {
    docs: [
      { rel: 'THREAT-MODEL.md', action: 'delete' },
      { rel: 'LIMITS.md', action: 'keep-edited' },
      { rel: 'X.md', action: 'unverifiable' },
      { rel: 'Y.md', action: 'absent' },
    ],
    userData: [
      { from: 'memory-bank/', to: 'pharn/memory-bank/', destination: 'free' },
      {
        from: 'pharn.spec-template.md',
        to: 'pharn/spec-template.md',
        destination: 'exists',
      },
    ],
    scratchNotice: true,
    gitignoreHints: ['pharn/.run/'],
  };

  it('previews in the future tense', () => {
    const lines = rootMigrationNoteLines(m, null)!.join('\n');
    expect(lines).toContain('WOULD DELETE THREAT-MODEL.md');
    expect(lines).toContain('kept LIMITS.md — you edited it');
    expect(lines).toContain('(listed under ORPHANED)');
    expect(lines).toContain('kept X.md — pharn cannot prove');
    expect(lines).not.toContain('Y.md');
    expect(lines).not.toContain('WOULD MOVE');
    expect(lines).toContain('runtime scratch now lives in pharn/.run/');
    expect(lines).toContain('Replace them with: pharn/.run/');
  });

  it('hints at a free destination with git mv (or mv), never moving it', () => {
    const lines = rootMigrationNoteLines(m, null)!;
    expect(lines.find((l) => l.includes('memory-bank/ is at'))).toBe(
      "  memory-bank/ is at the project root; PHARN 7 reads pharn/memory-bank/. pharn does not move it. If it is PHARN's, move it: git mv memory-bank pharn/memory-bank (or mv, if git does not track it).",
    );
  });

  it('says to merge by hand when the destination exists, with no command that would nest it', () => {
    const lines = rootMigrationNoteLines(m, null)!;
    expect(lines.find((l) => l.includes('pharn.spec-template.md is at'))).toBe(
      "  pharn.spec-template.md is at the project root, and pharn/spec-template.md already exists (or cannot be checked); PHARN 7 reads pharn/spec-template.md. pharn does not move or merge them. If the root copy is PHARN's, merge it into pharn/spec-template.md by hand, then delete pharn.spec-template.md.",
    );
    expect(lines.join('\n')).not.toContain('git mv pharn.spec-template.md');
    const both = rootMigrationNoteLines(
      {
        docs: [],
        userData: [
          {
            from: 'memory-bank/',
            to: 'pharn/memory-bank/',
            destination: 'exists',
          },
        ],
        scratchNotice: false,
        gitignoreHints: [],
      },
      null,
    )!.join('\n');
    expect(both).toContain('merge it into pharn/memory-bank/ by hand');
    expect(both).not.toContain('git mv');
    expect(both).not.toMatch(/\bmv memory-bank\b/);
  });

  it('reports what the writer did, and prints the same hints', () => {
    const done = rootMigrationNoteLines(m, {
      deleted: ['THREAT-MODEL.md'],
      kept: [],
    })!;
    expect(done.join('\n')).toContain(
      'deleted THREAT-MODEL.md — pharn now keeps it at pharn/THREAT-MODEL.md',
    );
    const hints = (lines: string[]): string[] =>
      lines.filter((l) => l.includes(' is at the project root'));
    expect(hints(done)).toEqual(hints(rootMigrationNoteLines(m, null)!));
    expect(hints(done)).toHaveLength(2);
    const failed = rootMigrationNoteLines(m, {
      deleted: [],
      kept: ['THREAT-MODEL.md'],
    })!.join('\n');
    expect(failed).toContain(
      'kept THREAT-MODEL.md — pharn/THREAT-MODEL.md did not land',
    );
  });

  it('says nothing when everything is absent', () => {
    expect(
      rootMigrationNoteLines(
        {
          docs: [{ rel: 'LIMITS.md', action: 'absent' }],
          userData: [],
          scratchNotice: false,
          gitignoreHints: [],
        },
        null,
      ),
    ).toBeNull();
    expect(versionMajor('12.3.4')).toBe(12);
    expect(versionMajor('nope')).toBeNull();
  });
});

describe('the probe feeds the install manifest and the copy', () => {
  it('records the content the probe found', () => {
    const repo = clone('7.0.0', true);
    expect(contentHash(join(repo, 'pharn/LIMITS.md'))).toBe(hashOf('limits'));
  });
});
