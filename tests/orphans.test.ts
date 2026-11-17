import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';

// A pass-through `node:fs` that logs every path the classifier hands to the
// filesystem (lstat for the component walk, readFileSync for the hash), so a
// test can prove which record keys were ever READ.
const fsReads = vi.hoisted(() => [] as string[]);
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const lstatSync = ((path: string, ...rest: unknown[]) => {
    fsReads.push(String(path));
    return (real.lstatSync as (...a: unknown[]) => unknown)(path, ...rest);
  }) as typeof real.lstatSync;
  const readFileSync = ((path: string, ...rest: unknown[]) => {
    fsReads.push(String(path));
    return (real.readFileSync as (...a: unknown[]) => unknown)(path, ...rest);
  }) as typeof real.readFileSync;
  return {
    ...real,
    default: { ...real, lstatSync, readFileSync },
    lstatSync,
    readFileSync,
  };
});

import {
  findOrphans,
  isInstallRootPath as reexportedIsInstallRootPath,
  MAX_ORPHANS_PER_GROUP,
  orphanNoteLines,
  type Orphan,
} from '../src/lib/orphans.js';
import { MODELS_RECORD_KEY } from '../src/lib/install-records.js';
import {
  isInstallRootPath,
  isPharnOwnedPath,
} from '../src/lib/install-surfaces.js';
import { contentHash } from '../src/lib/hash.js';
import type { InstalledCapability } from '../src/types.js';

const A11Y: InstalledCapability = { name: 'a11y', role: 'griller' };
const N1: InstalledCapability = { name: 'n-plus-one', role: 'lens' };

function write(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

describe('isInstallRootPath', () => {
  it('orphans.ts re-exports the install-surfaces predicate itself', () => {
    expect(reexportedIsInstallRootPath).toBe(isInstallRootPath);
  });

  it.each([
    // capability files, both layouts
    'pharn-pipeline/grillers/a11y/a11y.md',
    'pharn-review/n-plus-one/evals/cases/x.md',
    'pharn/pharn-pipeline/grillers/a11y/a11y.md',
    'pharn/pharn-review/n-plus-one/n-plus-one.md',
    // fixed surfaces, both layouts
    'pharn-contracts/finding-shape.md',
    'pharn/pharn-contracts/finding-shape.md',
    'pharn-core/seam/x.md',
    'pharn/pharn-core/seam/x.md',
    '.dev/floor/validate.mjs',
    'pharn/floor/validate.mjs',
    'CONSTITUTION.md',
    'pharn/CONSTITUTION.md',
    'LIMITS.md',
    'PHARN-LICENSE',
    'pharn/LICENSE',
    'features/README.md',
    'pharn/features/README.md',
    '.claude/commands/pharn-old.md',
    '.claude/hooks/old-hook.cjs',
    // An ESM hook is an install path too (F-10): the install copies `.mjs` hooks.
    '.claude/hooks/old-hook.mjs',
    // The review lens agent, same path in both layouts (CORE-272).
    '.claude/agents/pharn-review-lens.md',
  ])('%s is a path an install can write', (rel) => {
    expect(isInstallRootPath(rel)).toBe(true);
  });

  it.each([
    'src/index.ts',
    'README.md',
    'package.json',
    'pharn.config.json',
    'pharn.records.json',
    MODELS_RECORD_KEY,
    '.claude/settings.json',
    '.claude/settings.local.json',
    '.claude/commands/pharn-dev-plan.md',
    '.claude/commands/my-command.md',
    '.claude/commands/sub/pharn-x.md',
    '.claude/commands/pharn-x.txt',
    '.claude/hooks/sub/x.cjs',
    '.claude/hooks/x.js',
    '.claude/hooks/x.test.cjs',
    '.claude/hooks/x.test.mjs',
    '.claude/hooks/sub/x.mjs',
    '.claude/agents/pharn-dev-reviewer.md',
    '.claude/agents/my-agent.md',
    '.claude/agents/sub/pharn-x.md',
    'pharn/.claude/agents/pharn-review-lens.md',
    // directly under a capability subtree, not inside a capability dir
    'pharn-review/README.md',
    'pharn/pharn-pipeline/grillers/notes.md',
    // a capability dir itself, not a file inside it
    'pharn-review/a11y/',
    'pharn-pipeline/grillers//x.md',
    // a prefix that only LOOKS like a root
    'pharn-contracts-old/x.md',
    '.dev/floorplan/x.md',
    'pharn/floorx/y.mjs',
  ])('%s is never an install path', (rel) => {
    expect(isInstallRootPath(rel)).toBe(false);
  });
});

// The outer bound a pharn-install.json dest must lie in (CORE-194), which the
// record-key bound above also accepts, so a file in a surface the CLI names
// nowhere can be updated, orphaned and uninstalled.
const NEW_SURFACE_KEYS = [
  '.claude/skills/pharn-x/SKILL.md',
  '.claude/skills/pharn-x/references/deep/notes.md',
  '.claude/commands/pharn-x/part.md',
  '.claude/output-styles/pharn-terse.md',
  'pharn/pharn-new/x.md',
  'pharn/pharn-core/new/x.md',
  'pharn/floor/lib/x.mjs',
  'pharn/pharn-pipeline/other/x.md',
];
const NEVER_OWNED = [
  'pharn/memory-bank/lesson.md',
  'pharn/spec-template.md',
  'pharn/features/my-feature/SPEC.md',
  'pharn/.backup/20260101-000000/x.md',
  'pharn/.lock',
  'pharn/notes.md',
  'pharn/pharn-dev-x/y.md',
  'pharn/pharn-new',
  'pharn/pharn-/x.md',
  '.claude/skills/my-skill/SKILL.md',
  '.claude/skills/pharn-x/.hidden',
  '.claude/skills/pharn-dev-x/SKILL.md',
  '.claude/pharn-x.md',
  '.claude/Skills/pharn-x/SKILL.md',
  '.claude/skills/pharn-x.txt',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.git/hooks/pre-commit',
  'pharn/.git/config',
  '.claude/.git/pharn-x/y',
  'README.md',
  'pharn',
  '',
];

describe('isPharnOwnedPath — the outer bound', () => {
  const tmp = useTmpDir();

  it.each(NEW_SURFACE_KEYS)('%s is pharn-owned, and an install path', (rel) => {
    expect(isPharnOwnedPath(rel)).toBe(true);
    expect(isInstallRootPath(rel)).toBe(true);
  });

  it.each(NEVER_OWNED)('%s is never pharn-owned', (rel) => {
    expect(isPharnOwnedPath(rel)).toBe(false);
    expect(isInstallRootPath(rel)).toBe(false);
  });

  it('holds every path of the pharn layout the CLI names, hooks included', () => {
    for (const rel of [
      'pharn/CONSTITUTION.md',
      'pharn/LICENSE',
      'pharn/features/README.md',
      'pharn/pharn-contracts/finding-shape.md',
      'pharn/pharn-review/n-plus-one/n-plus-one.md',
      '.claude/commands/pharn-plan.md',
      '.claude/agents/pharn-review-lens.md',
      '.claude/hooks/guard.cjs',
      '.claude/hooks/guard.mjs',
    ])
      expect(isPharnOwnedPath(rel)).toBe(true);
    for (const rel of [
      '.claude/hooks/guard.test.cjs',
      '.claude/hooks/Guard.cjs',
      '.claude/hooks/guard.js',
      'pharn/pharn-review/README.md',
    ])
      expect(isPharnOwnedPath(rel)).toBe(false);
  });

  it('reports a recorded new-surface file upstream no longer ships as an orphan', () => {
    const root = join(tmp.path(), 'p');
    write(root, NEW_SURFACE_KEYS[0]!, 'skill\n');
    const scan = findOrphans({
      projectRoot: root,
      records: {
        [NEW_SURFACE_KEYS[0]!]: contentHash(join(root, NEW_SURFACE_KEYS[0]!)),
      },
      expected: new Map(),
      capabilities: [],
      frozen: [],
    });
    expect(scan.orphans).toEqual([
      { path: NEW_SURFACE_KEYS[0], state: 'unchanged' },
    ]);
  });
});

describe('findOrphans', () => {
  const tmp = useTmpDir();

  const run = (
    records: Record<string, string> | null,
    over: {
      expected?: string[];
      capabilities?: InstalledCapability[];
      frozen?: InstalledCapability[];
    } = {},
  ) =>
    findOrphans({
      projectRoot: tmp.path(),
      records,
      expected: new Map((over.expected ?? []).map((rel) => [rel, '/src'])),
      capabilities: over.capabilities ?? [A11Y, N1],
      frozen: over.frozen ?? [],
    });

  it('reports a recorded, unexpected file at its recorded hash as unchanged', () => {
    write(tmp.path(), '.claude/commands/pharn-old.md', 'old');
    const hash = contentHash(join(tmp.path(), '.claude/commands/pharn-old.md'));
    const scan = run({ '.claude/commands/pharn-old.md': hash });
    expect(scan.orphans).toEqual([
      { path: '.claude/commands/pharn-old.md', state: 'unchanged' },
    ]);
    // Its record is carried with the PREVIOUS hash.
    expect(scan.records).toEqual({ '.claude/commands/pharn-old.md': hash });
  });

  it('a recorded agent upstream stopped shipping is an orphan (CORE-272)', () => {
    const rel = '.claude/agents/pharn-old-agent.md';
    write(tmp.path(), rel, 'agent');
    const hash = contentHash(join(tmp.path(), rel));
    expect(run({ [rel]: hash }).orphans).toEqual([
      { path: rel, state: 'unchanged' },
    ]);
  });

  it('a CRLF copy of a recorded orphan is still unchanged (F-16: line endings are not an edit)', () => {
    const rel = '.claude/commands/pharn-old.md';
    write(tmp.path(), rel, '# old\nbody\n');
    const hash = contentHash(join(tmp.path(), rel));
    write(tmp.path(), rel, '# old\r\nbody\r\n');
    const scan = run({ [rel]: hash });
    expect(scan.orphans).toEqual([{ path: rel, state: 'unchanged' }]);
    expect(scan.records).toEqual({ [rel]: hash });
  });

  it('reports an edited orphan as edited and carries the old record', () => {
    write(tmp.path(), '.dev/floor/gone.mjs', 'MY EDIT');
    const scan = run({ '.dev/floor/gone.mjs': 'a'.repeat(64) });
    expect(scan.orphans).toEqual([
      { path: '.dev/floor/gone.mjs', state: 'edited' },
    ]);
    expect(scan.records).toEqual({ '.dev/floor/gone.mjs': 'a'.repeat(64) });
  });

  it('a recorded file that is gone is neither reported nor carried', () => {
    const scan = run({ '.claude/hooks/gone.cjs': 'a'.repeat(64) });
    expect(scan).toEqual({ orphans: [], records: {} });
  });

  it('a path still in the expected set is never an orphan', () => {
    write(tmp.path(), 'CONSTITUTION.md', 'x');
    const scan = run(
      { 'CONSTITUTION.md': 'a'.repeat(64) },
      { expected: ['CONSTITUTION.md'] },
    );
    expect(scan).toEqual({ orphans: [], records: {} });
  });

  it('no usable records → nothing reported, nothing carried', () => {
    write(tmp.path(), '.claude/commands/pharn-old.md', 'old');
    expect(run(null)).toEqual({ orphans: [], records: {} });
  });

  it('the models record key is never an orphan', () => {
    const scan = run({ [MODELS_RECORD_KEY]: 'a'.repeat(64) });
    expect(scan).toEqual({ orphans: [], records: {} });
  });

  // CORE-166: init records the settings.json it wrote fresh, and that record
  // outlives the manifest (which never holds the file) — but it is not an
  // install-root path, so it is never named as an orphan, even while present.
  it('the .claude/settings.json record is never an orphan, even while the file exists', () => {
    write(tmp.path(), '.claude/settings.json', '{}');
    const scan = run({
      '.claude/settings.json': contentHash(
        join(tmp.path(), '.claude/settings.json'),
      ),
    });
    expect(scan).toEqual({ orphans: [], records: {} });
  });

  it('never reads a key outside the install roots, even when the file exists', () => {
    write(tmp.path(), 'src/auth.ts', 'secret');
    write(tmp.path(), 'README.md', 'readme');
    write(tmp.path(), '.claude/settings.json', '{}');
    const hash = contentHash(join(tmp.path(), 'src/auth.ts'));
    fsReads.length = 0;
    const scan = run({
      'src/auth.ts': hash,
      'README.md': 'a'.repeat(64),
      '.claude/settings.json': 'a'.repeat(64),
      // One install path, so the read log is shown to be live.
      '.claude/hooks/gone.cjs': 'a'.repeat(64),
    });
    expect(scan).toEqual({ orphans: [], records: {} });
    // Only the install path was ever handed to the filesystem.
    const touched = fsReads.map((p) =>
      p.startsWith(tmp.path()) ? p.slice(tmp.path().length + 1) : p,
    );
    expect(touched.length).toBeGreaterThan(0);
    for (const p of touched)
      expect(
        p === '.claude' ||
          p === '.claude/hooks' ||
          p === '.claude/hooks/gone.cjs',
        p,
      ).toBe(true);
  });

  it('a file of an installed capability upstream stopped shipping is an orphan (both layouts)', () => {
    write(tmp.path(), 'pharn-pipeline/grillers/a11y/old.md', 'x');
    write(tmp.path(), 'pharn/pharn-review/n-plus-one/old.md', 'y');
    const scan = run({
      'pharn-pipeline/grillers/a11y/old.md': 'a'.repeat(64),
      'pharn/pharn-review/n-plus-one/old.md': 'b'.repeat(64),
    });
    expect(scan.orphans.map((o) => o.path)).toEqual([
      'pharn-pipeline/grillers/a11y/old.md',
      'pharn/pharn-review/n-plus-one/old.md',
    ]);
  });

  it('files of a capability that is NOT installed (dropped) are excluded', () => {
    write(tmp.path(), 'pharn-pipeline/grillers/dropped/dropped.md', 'x');
    write(tmp.path(), 'pharn/pharn-review/gone-lens/gone-lens.md', 'y');
    const scan = run({
      'pharn-pipeline/grillers/dropped/dropped.md': 'a'.repeat(64),
      'pharn/pharn-review/gone-lens/gone-lens.md': 'b'.repeat(64),
    });
    expect(scan).toEqual({ orphans: [], records: {} });
  });

  it('the role is part of the identity: a lens dir named like an installed griller is excluded', () => {
    write(tmp.path(), 'pharn-review/a11y/a11y.md', 'x');
    const scan = run({ 'pharn-review/a11y/a11y.md': 'a'.repeat(64) });
    expect(scan).toEqual({ orphans: [], records: {} });
  });

  it('files of a frozen capability are excluded (carried elsewhere)', () => {
    write(tmp.path(), 'pharn-pipeline/grillers/a11y/old.md', 'x');
    const scan = run(
      { 'pharn-pipeline/grillers/a11y/old.md': 'a'.repeat(64) },
      { frozen: [A11Y] },
    );
    expect(scan).toEqual({ orphans: [], records: {} });
  });

  it('old-layout copies left behind by a layout switch are orphans', () => {
    write(tmp.path(), 'pharn-contracts/finding-shape.md', 'c');
    write(tmp.path(), 'pharn-pipeline/grillers/a11y/a11y.md', 'g');
    const scan = run(
      {
        'pharn-contracts/finding-shape.md': 'a'.repeat(64),
        'pharn-pipeline/grillers/a11y/a11y.md': 'b'.repeat(64),
      },
      {
        expected: [
          'pharn/pharn-contracts/finding-shape.md',
          'pharn/pharn-pipeline/grillers/a11y/a11y.md',
        ],
      },
    );
    expect(scan.orphans.map((o) => o.path)).toEqual([
      'pharn-contracts/finding-shape.md',
      'pharn-pipeline/grillers/a11y/a11y.md',
    ]);
  });

  it('something other than a regular file at the path is unreadable, named, and its record kept', () => {
    mkdirSync(join(tmp.path(), '.claude/commands/pharn-dir.md'), {
      recursive: true,
    });
    write(tmp.path(), 'elsewhere/target.md', 't');
    mkdirSync(join(tmp.path(), '.claude/hooks'), { recursive: true });
    symlinkSync(
      join(tmp.path(), 'elsewhere/target.md'),
      join(tmp.path(), '.claude/hooks/linked.cjs'),
    );
    const scan = run({
      '.claude/commands/pharn-dir.md': 'a'.repeat(64),
      '.claude/hooks/linked.cjs': 'b'.repeat(64),
    });
    expect(scan.orphans).toEqual([
      {
        path: '.claude/commands/pharn-dir.md',
        state: 'unreadable',
        reason: 'the path is not a regular file',
      },
      {
        path: '.claude/hooks/linked.cjs',
        state: 'unreadable',
        reason: 'the path is a symlink',
      },
    ]);
    expect(Object.keys(scan.records).sort()).toEqual([
      '.claude/commands/pharn-dir.md',
      '.claude/hooks/linked.cjs',
    ]);
  });

  it('never hashes THROUGH a symlinked parent', () => {
    write(tmp.path(), 'outside/floor/x.mjs', 'outside');
    mkdirSync(join(tmp.path(), '.dev'), { recursive: true });
    symlinkSync(
      join(tmp.path(), 'outside/floor'),
      join(tmp.path(), '.dev/floor'),
    );
    const scan = run({ '.dev/floor/x.mjs': 'a'.repeat(64) });
    expect(scan.orphans).toEqual([
      {
        path: '.dev/floor/x.mjs',
        state: 'unreadable',
        reason: '.dev/floor is a symlink',
      },
    ]);
  });

  it.skipIf(process.getuid?.() === 0)(
    'an unreadable file is reported unreadable, not edited',
    () => {
      write(tmp.path(), '.claude/hooks/locked.cjs', 'x');
      chmodSync(join(tmp.path(), '.claude/hooks/locked.cjs'), 0o000);
      try {
        const scan = run({ '.claude/hooks/locked.cjs': 'a'.repeat(64) });
        expect(scan.orphans).toEqual([
          {
            path: '.claude/hooks/locked.cjs',
            state: 'unreadable',
            reason: 'the file could not be read',
          },
        ]);
      } finally {
        chmodSync(join(tmp.path(), '.claude/hooks/locked.cjs'), 0o644);
      }
    },
  );

  it('sorts by code unit, whatever the record order', () => {
    for (const rel of ['pharn/LICENSE', '.dev/floor/b.mjs', 'LIMITS.md'])
      write(tmp.path(), rel, rel);
    const scan = run({
      'pharn/LICENSE': 'a'.repeat(64),
      'LIMITS.md': 'a'.repeat(64),
      '.dev/floor/b.mjs': 'a'.repeat(64),
    });
    expect(scan.orphans.map((o) => o.path)).toEqual([
      '.dev/floor/b.mjs',
      'LIMITS.md',
      'pharn/LICENSE',
    ]);
  });
});

describe('orphanNoteLines', () => {
  const plain = (lines: string[] | null): string =>
    stripVTControlCharacters((lines ?? []).join('\n'));

  it('returns null when there is nothing to report', () => {
    expect(orphanNoteLines([])).toBeNull();
  });

  it('groups by state, unchanged first, with the delete-by-hand hint', () => {
    const orphans: Orphan[] = [
      { path: 'b.md', state: 'edited' },
      { path: 'a.md', state: 'unchanged' },
      { path: 'c.md', state: 'unreadable', reason: 'the path is a symlink' },
    ];
    const text = plain(orphanNoteLines(orphans));
    const unchanged = text.indexOf('UNCHANGED');
    const edited = text.indexOf('EDITED');
    const unreadable = text.indexOf('UNREADABLE');
    expect(unchanged).toBeGreaterThan(-1);
    expect(edited).toBeGreaterThan(unchanged);
    expect(unreadable).toBeGreaterThan(edited);
    expect(text).toContain('unchanged since pharn wrote it');
    expect(text).toContain(
      'changed since pharn wrote it — review before deleting',
    );
    expect(text).toContain('c.md — the path is a symlink');
    expect(text).toContain('git rm');
    // A true statement: `uninstall` deletes unchanged orphans, so the note
    // names the command that never does (docs/reference/deletes.md).
    expect(text).toContain('`pharn update` never\n  deletes them');
    expect(text).not.toContain('pharn never deletes');
    expect(text).not.toMatch(/\bsafe\b/i);
    expect(text).not.toContain('more —');
  });

  it(`caps each group at ${MAX_ORPHANS_PER_GROUP} paths and points at the full list`, () => {
    const orphans: Orphan[] = Array.from(
      { length: MAX_ORPHANS_PER_GROUP + 5 },
      (_, i) => ({
        path: `f${String(i).padStart(3, '0')}.md`,
        state: 'unchanged' as const,
      }),
    );
    const text = plain(orphanNoteLines(orphans));
    expect(text).toContain(
      `f${String(MAX_ORPHANS_PER_GROUP - 1).padStart(3, '0')}.md`,
    );
    expect(text).not.toContain(
      `f${String(MAX_ORPHANS_PER_GROUP).padStart(3, '0')}.md`,
    );
    expect(text).toContain('… and 5 more');
    expect(text).toContain('pharn status --json');
  });

  it('strips terminal control characters from a path (records keys are hand-editable)', () => {
    const esc = '\u001b';
    const text = (
      orphanNoteLines([
        { path: `.claude/hooks/x${esc}[2J.cjs`, state: 'unchanged' },
      ]) ?? []
    ).join('\n');
    expect(text).not.toContain(esc + '[2J');
    expect(text).toContain('.claude/hooks/x[2J.cjs');
  });
});
