import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  findOrphans,
  isInstallRootPath,
  MAX_ORPHANS_PER_GROUP,
  orphanNoteLines,
  type Orphan,
} from '../src/lib/orphans.js';
import { MODELS_RECORD_KEY } from '../src/lib/install-records.js';
import { sha256File } from '../src/lib/hash.js';
import type { InstalledCapability } from '../src/types.js';

const A11Y: InstalledCapability = { name: 'a11y', role: 'griller' };
const N1: InstalledCapability = { name: 'n-plus-one', role: 'lens' };

function write(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

describe('isInstallRootPath', () => {
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
    // directly under a capability subtree, not inside a capability dir
    'pharn-review/README.md',
    'pharn/pharn-pipeline/grillers/notes.md',
    // a prefix that only LOOKS like a root
    'pharn-contracts-old/x.md',
    '.dev/floorplan/x.md',
    'pharn/floorx/y.mjs',
  ])('%s is never an install path', (rel) => {
    expect(isInstallRootPath(rel)).toBe(false);
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
    const hash = sha256File(join(tmp.path(), '.claude/commands/pharn-old.md'));
    const scan = run({ '.claude/commands/pharn-old.md': hash });
    expect(scan.orphans).toEqual([
      { path: '.claude/commands/pharn-old.md', state: 'unchanged' },
    ]);
    // Its record is carried with the PREVIOUS hash.
    expect(scan.records).toEqual({ '.claude/commands/pharn-old.md': hash });
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

  it('never reads a key outside the install roots, even when the file exists', () => {
    write(tmp.path(), 'src/auth.ts', 'secret');
    write(tmp.path(), 'README.md', 'readme');
    const hash = sha256File(join(tmp.path(), 'src/auth.ts'));
    const scan = run({
      'src/auth.ts': hash,
      'README.md': 'a'.repeat(64),
      '.claude/settings.json': 'a'.repeat(64),
    });
    expect(scan).toEqual({ orphans: [], records: {} });
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
    expect(text).toMatch(/never deletes/);
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
