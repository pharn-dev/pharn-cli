import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
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
  applyRootMoves,
  deleteRootDocs,
  moveBlocks,
  pendingRootMigration,
  planRootMigration,
  rootMigrationFailed,
  rootMigrationNoteLines,
  versionMajor,
  type RootMigration,
} from '../src/lib/root-migration.js';
import type { PharnConfig } from '../src/types.js';

// The old root footprint of a pharn-layout install (lib/root-migration.ts):
// the root docs pharn wrote, the user's data that moves, and two notices.

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
  return (
    planRootMigration({
      projectRoot: proj,
      repoDir: repo,
      layout: 'pharn',
      installedLayout: 'pharn',
      skillsVersion: version,
      records,
    })?.report ?? null
  );
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

describe('planRootMigration — user-data moves (SKILLS ≥ 7)', () => {
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
  const moveOf = (m: RootMigration | null, from: string) =>
    m?.moves.find((x) => x.from === from)?.action;

  for (const item of ITEMS) {
    describe(item.name, () => {
      it('absent → absent', () => {
        expect(
          moveOf(plan(project(), clone('7.0.0', true), '7.0.0'), item.from),
        ).toBe('absent');
      });

      it('destination free → move, backed up and renamed', () => {
        const proj = project();
        item.make(proj, strip(item.from));
        const planned = planRootMigration({
          projectRoot: proj,
          repoDir: clone('7.0.0', true),
          layout: 'pharn',
          installedLayout: 'pharn',
          skillsVersion: '7.0.0',
          records: RECORDED,
        })!;
        expect(moveOf(planned.report, item.from)).toBe('move');
        expect(planned.backups).toContain(
          item.from.endsWith('/') ? `${strip(item.from)}/canon.md` : item.from,
        );
        const result = applyRootMoves(proj, planned.report.moves);
        expect(result.failed).toEqual([]);
        expect(result.moved.map((m) => m.from)).toEqual([item.from]);
        expect(() =>
          readFileSync(
            join(
              proj,
              item.from.endsWith('/') ? `${strip(item.to)}/canon.md` : item.to,
            ),
          ),
        ).not.toThrow();
      });

      it('both exist → conflict, nothing moved, the run fails', () => {
        const proj = project();
        item.make(proj, strip(item.from));
        item.make(proj, strip(item.to));
        const m = plan(proj, clone('7.0.0', true), '7.0.0')!;
        expect(moveOf(m, item.from)).toBe('conflict');
        expect(applyRootMoves(proj, m.moves).moved).toEqual([]);
        expect(rootMigrationFailed(m, null)).toBe(true);
      });

      it('a symlinked source → refused-symlink', () => {
        const proj = project();
        item.make(tmp.path(), `elsewhere-${strip(item.to).replace('/', '-')}`);
        symlinkSync(
          join(tmp.path(), `elsewhere-${strip(item.to).replace('/', '-')}`),
          join(proj, strip(item.from)),
        );
        expect(
          moveOf(plan(proj, clone('7.0.0', true), '7.0.0'), item.from),
        ).toBe('refused-symlink');
      });

      it('a symlinked destination parent (pharn/) → refused-symlink', () => {
        const proj = join(tmp.path(), 'proj');
        mkdirSync(join(tmp.path(), 'outside'), { recursive: true });
        mkdirSync(proj);
        symlinkSync(join(tmp.path(), 'outside'), join(proj, 'pharn'));
        item.make(proj, strip(item.from));
        expect(
          moveOf(plan(proj, clone('7.0.0', true), '7.0.0'), item.from),
        ).toBe('refused-symlink');
      });
    });
  }

  it('the wrong type, or an unreadable directory, is refused as unreadable — the run does not fail', () => {
    const proj = project();
    mkdirSync(join(proj, 'pharn.spec-template.md')); // a directory, not a file
    put(proj, 'memory-bank', 'a file, not a directory');
    const m = plan(proj, clone('7.0.0', true), '7.0.0')!;
    expect(m.moves.map((x) => x.action)).toEqual(['unreadable', 'unreadable']);
    expect(rootMigrationFailed(m, null)).toBe(true);
    expect(rootMigrationNoteLines(m, null)!.join('\n')).toContain(
      'it cannot be read, or it is not a directory',
    );
  });

  it('a memory-bank/ it cannot list is unreadable, not a crash', () => {
    if (process.getuid?.() === 0) return; // root reads anything
    const proj = project();
    put(proj, 'memory-bank/a.md', 'a');
    chmodSync(join(proj, 'memory-bank'), 0o000);
    try {
      expect(plan(proj, clone('7.0.0', true), '7.0.0')!.moves[0]!.action).toBe(
        'unreadable',
      );
    } finally {
      chmodSync(join(proj, 'memory-bank'), 0o755);
    }
  });

  it('re-checks under the lock: a destination that appeared since fails the move', () => {
    const proj = project();
    put(proj, 'memory-bank/a.md', 'a');
    const m = plan(proj, clone('7.0.0', true), '7.0.0')!;
    put(proj, 'pharn/memory-bank/b.md', 'b');
    const result = applyRootMoves(proj, m.moves);
    expect(result.moved).toEqual([]);
    expect(result.failed[0]?.reason).toContain('pharn/memory-bank now exists');
    expect(rootMigrationFailed(m, { deleted: [], kept: [], ...result })).toBe(
      true,
    );
  });

  it('re-checks under the lock: a source swapped for a link is not moved', () => {
    const proj = project();
    put(proj, 'pharn.spec-template.md', 't');
    const m = plan(proj, clone('7.0.0', true), '7.0.0')!;
    renameSync(join(proj, 'pharn.spec-template.md'), join(tmp.path(), 't.md'));
    symlinkSync(join(tmp.path(), 't.md'), join(proj, 'pharn.spec-template.md'));
    expect(applyRootMoves(proj, m.moves).failed[0]?.reason).toContain(
      'symbolic link',
    );
  });

  it('is inert below 7: no moves, no notices, even with everything present', () => {
    const proj = project();
    put(proj, 'memory-bank/a.md', 'a');
    put(proj, '.pharn/scratch.json', '{}');
    put(proj, '.gitignore', '.pharn/\n');
    // A 6.x clone that already ships the docs under pharn/: docs only.
    expect(plan(proj, clone('6.9.0', true), '6.9.0')).toEqual({
      docs: [
        { rel: 'THREAT-MODEL.md', action: 'absent' },
        { rel: 'LIMITS.md', action: 'absent' },
      ],
      moves: [],
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

  it('fires for user data still at the root with its destination free — and stops once moved or blocked', () => {
    const proj = project();
    put(proj, 'memory-bank/a.md', 'a');
    expect(pendingRootMigration(proj, cfg(), null)).toBe('memory-bank/');
    put(proj, 'pharn/memory-bank/b.md', 'b'); // a conflict the run cannot finish
    expect(pendingRootMigration(proj, cfg(), null)).toBeNull();
    put(proj, 'pharn.spec-template.md', 't');
    expect(pendingRootMigration(proj, cfg(), null)).toBe(
      'pharn.spec-template.md',
    );
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
    moves: [
      { from: 'memory-bank/', to: 'pharn/memory-bank/', action: 'move' },
      {
        from: 'pharn.spec-template.md',
        to: 'pharn/spec-template.md',
        action: 'conflict',
      },
      { from: 'a/', to: 'pharn/a/', action: 'refused-symlink' },
      { from: 'b/', to: 'pharn/b/', action: 'absent' },
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
    expect(lines).toContain('WOULD MOVE memory-bank/ → pharn/memory-bank/');
    expect(lines).toContain('pharn never merges them');
    expect(lines).toContain(
      'NOT MOVED a/ — it, or the way to pharn/a/, is a symbolic link',
    );
    expect(lines).not.toContain('b/');
    expect(lines).toContain('runtime scratch now lives in pharn/.run/');
    expect(lines).toContain('Replace them with: pharn/.run/');
  });

  it('reports what the writer did', () => {
    const move = m.moves[0]!;
    const done = rootMigrationNoteLines(m, {
      deleted: ['THREAT-MODEL.md'],
      kept: [],
      moved: [move],
      failed: [],
    })!.join('\n');
    expect(done).toContain(
      'deleted THREAT-MODEL.md — pharn now keeps it at pharn/THREAT-MODEL.md',
    );
    expect(done).toContain('moved memory-bank/ → pharn/memory-bank/');
    const failed = rootMigrationNoteLines(m, {
      deleted: [],
      kept: ['THREAT-MODEL.md'],
      moved: [],
      failed: [{ move, reason: 'EXDEV: cross-device link not permitted' }],
    })!.join('\n');
    expect(failed).toContain(
      'kept THREAT-MODEL.md — pharn/THREAT-MODEL.md did not land',
    );
    expect(failed).toContain('NOT MOVED memory-bank/: EXDEV');
  });

  it('says nothing when everything is absent', () => {
    expect(
      rootMigrationNoteLines(
        {
          docs: [{ rel: 'LIMITS.md', action: 'absent' }],
          moves: [],
          scratchNotice: false,
          gitignoreHints: [],
        },
        null,
      ),
    ).toBeNull();
    expect(rootMigrationFailed(null, null)).toBe(false);
  });

  it('only conflict, refused-symlink and unreadable block', () => {
    expect(
      ['move', 'absent', 'conflict', 'refused-symlink', 'unreadable'].map((a) =>
        moveBlocks(a as never),
      ),
    ).toEqual([false, false, true, true, true]);
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
