import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { MODELS_RECORD_KEY } from '../src/lib/install-records.js';
import {
  applyPrettierignore,
  decidedPrettierEntries,
  planPrettierignore,
  PRETTIER_CONFIG_FILES,
  PRETTIERIGNORE_COMMENT,
  prettierignoreEntries,
  prettierignoreLines,
  prettierignorePending,
  prettierignoreReport,
  usesPrettier,
} from '../src/lib/prettierignore.js';
import { useTmpDir } from './helpers.js';

// pharn's lines in the project's `.prettierignore` (lib/prettierignore.ts):
// only when the project uses Prettier, derived from the paths pharn writes,
// append-only, idempotent, never through a symlink.

// A pharn-layout install's recorded paths, as the manifest keys them.
const PHARN_KEYS = [
  'pharn/pharn-review/a11y/a11y.md',
  'pharn/pharn-review/a11y/evals/cases/one.md',
  'pharn/pharn-pipeline/grillers/testability/testability.md',
  'pharn/pharn-contracts/finding-shape.md',
  'pharn/pharn-core/seam/seam.md',
  'pharn/floor/validate.mjs',
  'pharn/floor/lib/x.mjs',
  'pharn/CONSTITUTION.md',
  'pharn/LICENSE',
  'pharn/features/README.md',
  '.claude/commands/pharn-ship.md',
  '.claude/hooks/protect-trusted-paths.cjs',
  MODELS_RECORD_KEY,
];

const PHARN_ENTRIES = [
  '/.claude/commands/pharn-ship.md',
  '/.claude/hooks/protect-trusted-paths.cjs',
  '/pharn.config.json',
  '/pharn.records.json',
  '/pharn/CONSTITUTION.md',
  '/pharn/LICENSE',
  '/pharn/features/',
  '/pharn/floor/',
  '/pharn/pharn-contracts/',
  '/pharn/pharn-core/',
  '/pharn/pharn-pipeline/grillers/',
  '/pharn/pharn-review/',
];

const block = (entries: readonly string[]) =>
  `${PRETTIERIGNORE_COMMENT}\n${entries.join('\n')}\n`;

describe('usesPrettier — a membership test on three signals', () => {
  const tmp = useTmpDir();
  const write = (rel: string, text = '') => {
    mkdirSync(dirname(join(tmp.path(), rel)), { recursive: true });
    writeFileSync(join(tmp.path(), rel), text);
  };

  it('no signal: false', () => {
    write('package.json', '{"devDependencies":{"eslint":"9"}}');
    expect(usesPrettier(tmp.path())).toBe(false);
  });

  it('a .prettierignore of any type: true', () => {
    mkdirSync(join(tmp.path(), '.prettierignore'));
    expect(usesPrettier(tmp.path())).toBe(true);
  });

  it.each(PRETTIER_CONFIG_FILES)('a %s config file: true', (name) => {
    write(name);
    expect(usesPrettier(tmp.path())).toBe(true);
  });

  it.each([
    '{"devDependencies":{"prettier":"3"}}',
    '{"dependencies":{"prettier":"3"}}',
    '{"prettier":"@acme/prettier-config"}',
  ])('package.json %s: true', (text) => {
    write('package.json', text);
    expect(usesPrettier(tmp.path())).toBe(true);
  });

  it.each([
    '{"peerDependencies":{"prettier":"3"}}',
    '{"devDependencies":["prettier"]}',
    '["prettier"]',
    'not json',
    '{"devDependencies":{"prettier-plugin-x":"1"}}',
    'null',
    '3',
    '"prettier"',
    '{"dependencies":null}',
  ])('package.json %s: false, never a throw', (text) => {
    write('package.json', text);
    expect(usesPrettier(tmp.path())).toBe(false);
  });

  it('a nested config does not count (root only)', () => {
    write('packages/a/.prettierrc');
    expect(usesPrettier(tmp.path())).toBe(false);
  });
});

describe('prettierignoreEntries — derived from the paths pharn writes', () => {
  it('pharn layout: surface dirs, the features dir, loose files and the two state files', () => {
    expect(prettierignoreEntries(PHARN_KEYS)).toEqual(PHARN_ENTRIES);
  });

  it('flat layout: the root features/ dir is NOT covered, only its README', () => {
    expect(
      prettierignoreEntries([
        'pharn-review/a11y/a11y.md',
        '.dev/floor/validate.mjs',
        'CONSTITUTION.md',
        'PHARN-LICENSE',
        'features/README.md',
      ]),
    ).toEqual([
      '/.dev/floor/',
      '/CONSTITUTION.md',
      '/PHARN-LICENSE',
      '/features/README.md',
      '/pharn-review/',
      '/pharn.config.json',
      '/pharn.records.json',
    ]);
  });

  it('a pre-7.0 clone’s root docs are file entries', () => {
    expect(prettierignoreEntries(['LIMITS.md'])).toContain('/LIMITS.md');
  });

  it('drops every key that is not an install path or fails the segment check', () => {
    expect(
      prettierignoreEntries([
        'src/app.ts',
        '../outside.md',
        '.claude/commands/pharn-*.md',
        '.claude/commands/pharn-a\nb.md',
        '.claude/commands/my-own.md',
        '.claude/commands/pharn-dev-plan.md',
        '.claude/hooks/x.test.cjs',
        'pharn/memory-bank/lessons.md',
        'pharn/features/my-feature/SPEC.md',
        MODELS_RECORD_KEY,
      ]),
    ).toEqual([]);
  });

  it('nothing pharn writes: no entries, not even the state files', () => {
    expect(prettierignoreEntries([])).toEqual([]);
  });
});

describe('decidedPrettierEntries — the covered test', () => {
  const decided = (text: string, entries = PHARN_ENTRIES) => [
    ...decidedPrettierEntries(Buffer.from(text), entries),
  ];

  it.each([
    '/pharn/pharn-review/',
    'pharn/pharn-review',
    'pharn/pharn-review/**',
    'pharn/pharn-review/*',
    'pharn-review/',
    '**/pharn-review',
  ])('%j covers /pharn/pharn-review/', (line) => {
    expect(decided(line, ['/pharn/pharn-review/'])).toEqual([
      '/pharn/pharn-review/',
    ]);
  });

  it.each(['pharn/', '/pharn', 'pharn/**', 'pharn/*', 'pharn'])(
    'the ancestor %j covers every pharn/ entry and nothing else',
    (line) => {
      expect(decided(line)).toEqual(
        PHARN_ENTRIES.filter((e) => e.startsWith('/pharn/')),
      );
    },
  );

  it('a floating ancestor segment covers a nested surface', () => {
    expect(
      decided('pharn-pipeline/', ['/pharn/pharn-pipeline/grillers/']),
    ).toEqual(['/pharn/pharn-pipeline/grillers/']);
  });

  it('a file entry: exact or floating basename; a directory-only pattern does not cover it', () => {
    expect(decided('pharn.config.json', ['/pharn.config.json'])).toHaveLength(
      1,
    );
    expect(decided('/pharn.config.json', ['/pharn.config.json'])).toHaveLength(
      1,
    );
    expect(decided('CONSTITUTION.md', ['/pharn/CONSTITUTION.md'])).toHaveLength(
      1,
    );
    expect(decided('/pharn.config.json/', ['/pharn.config.json'])).toEqual([]);
    expect(decided('pharn.config.json/**', ['/pharn.config.json'])).toEqual([]);
  });

  it('a negation is the user’s decision — exact or an ancestor', () => {
    expect(
      decided('!/pharn/pharn-review/', ['/pharn/pharn-review/']),
    ).toHaveLength(1);
    expect(decided('!pharn/')).toEqual(
      PHARN_ENTRIES.filter((e) => e.startsWith('/pharn/')),
    );
  });

  it('a negation INSIDE a directory entry is the user’s exception: the entry counts as decided', () => {
    expect(
      decided('!pharn/pharn-review/a11y/', ['/pharn/pharn-review/']),
    ).toEqual(['/pharn/pharn-review/']);
    expect(
      decided('!/pharn/pharn-review/a11y/a11y.md', ['/pharn/pharn-review/']),
    ).toEqual(['/pharn/pharn-review/']);
  });

  it('a narrower line that only ignores part of an entry does not cover it', () => {
    expect(
      decided('pharn/pharn-review/a11y/', ['/pharn/pharn-review/']),
    ).toEqual([]);
    // A negation inside a FILE entry's name is not "inside" it.
    expect(decided('!pharn.config.json.bak', ['/pharn.config.json'])).toEqual(
      [],
    );
  });

  it('comments, globs and unrelated lines do not count', () => {
    expect(
      decided('# /pharn/\n*.md\npharn-*\n/pharn-other/\nreview\n'),
    ).toEqual([]);
  });
});

describe('applyPrettierignore — the write (append-only, idempotent)', () => {
  const tmp = useTmpDir();
  const file = () => join(tmp.path(), '.prettierignore');
  const usePrettier = () =>
    writeFileSync(join(tmp.path(), '.prettierrc'), '{}\n');

  it('a project without Prettier: nothing planned, nothing written', async () => {
    expect(planPrettierignore(tmp.path(), PHARN_KEYS)).toEqual({
      action: 'none',
    });
    expect(await applyPrettierignore(tmp.path(), PHARN_KEYS)).toEqual({
      action: 'none',
    });
    expect(() => statSync(file())).toThrow();
  });

  it('creates a missing .prettierignore when Prettier is in use', async () => {
    usePrettier();
    expect(planPrettierignore(tmp.path(), PHARN_KEYS)).toEqual({
      action: 'create',
      entries: PHARN_ENTRIES,
    });
    expect(await applyPrettierignore(tmp.path(), PHARN_KEYS)).toEqual({
      action: 'create',
      entries: PHARN_ENTRIES,
    });
    expect(readFileSync(file(), 'utf8')).toBe(block(PHARN_ENTRIES));
  });

  it('appends only what is missing; the old bytes stay the prefix', async () => {
    const old = Buffer.concat([
      Buffer.from('dist/\n/pharn/pharn-review/\n'),
      Buffer.from([0xff, 0xfe, 0x0a]),
    ]);
    writeFileSync(file(), old);
    const outcome = await applyPrettierignore(tmp.path(), PHARN_KEYS);
    const missing = PHARN_ENTRIES.filter((e) => e !== '/pharn/pharn-review/');
    expect(outcome).toEqual({ action: 'append', entries: missing });
    const now = readFileSync(file());
    expect(now.subarray(0, old.length).equals(old)).toBe(true);
    expect(now.subarray(old.length).toString()).toBe(block(missing));
  });

  it('a file that ignores pharn/ entirely gets only the root entries', async () => {
    writeFileSync(file(), 'pharn/\n');
    expect(planPrettierignore(tmp.path(), PHARN_KEYS)).toEqual({
      action: 'append',
      entries: PHARN_ENTRIES.filter((e) => !e.startsWith('/pharn/')),
    });
  });

  it('keeps a CRLF file CRLF', async () => {
    writeFileSync(file(), 'dist/\r\n');
    await applyPrettierignore(tmp.path(), PHARN_KEYS);
    const text = readFileSync(file(), 'utf8');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('a second run is a no-op (bytes and mtime unchanged)', async () => {
    usePrettier();
    await applyPrettierignore(tmp.path(), PHARN_KEYS);
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(file(), past, past);
    const before = readFileSync(file());
    const plan = planPrettierignore(tmp.path(), PHARN_KEYS);
    expect(plan).toEqual({ action: 'none' });
    expect(prettierignorePending(plan)).toBe(false);
    expect(await applyPrettierignore(tmp.path(), PHARN_KEYS)).toEqual({
      action: 'none',
    });
    expect(readFileSync(file()).equals(before)).toBe(true);
    expect(statSync(file()).mtimeMs).toBe(past.getTime());
  });

  it('a symlinked .prettierignore is refused: neither the link nor its target changes', async () => {
    const outside = join(tmp.path(), 'outside');
    writeFileSync(outside, 'dist/\n');
    symlinkSync(outside, file());
    const plan = planPrettierignore(tmp.path(), PHARN_KEYS);
    expect(plan).toEqual({
      action: 'refused',
      reason: 'symlink',
      entries: PHARN_ENTRIES,
    });
    expect(prettierignorePending(plan)).toBe(false);
    expect(await applyPrettierignore(tmp.path(), PHARN_KEYS)).toEqual(plan);
    expect(readFileSync(outside, 'utf8')).toBe('dist/\n');
  });

  it('a directory or a FIFO at .prettierignore is refused without hanging', async () => {
    mkdirSync(file());
    expect(await applyPrettierignore(tmp.path(), PHARN_KEYS)).toMatchObject({
      action: 'refused',
      reason: 'not-a-file',
    });
    const fifo = join(tmp.path(), 'other');
    mkdirSync(fifo);
    execFileSync('mkfifo', [join(fifo, '.prettierignore')]);
    expect(await applyPrettierignore(fifo, PHARN_KEYS)).toMatchObject({
      action: 'refused',
      reason: 'not-a-file',
    });
  });

  it('a failed write is returned, never thrown, and leaves the file as it was', async () => {
    writeFileSync(file(), 'dist/\n');
    chmodSync(tmp.path(), 0o555);
    try {
      expect(await applyPrettierignore(tmp.path(), PHARN_KEYS)).toEqual({
        action: 'failed',
        code: 'EACCES',
        entries: PHARN_ENTRIES,
      });
    } finally {
      chmodSync(tmp.path(), 0o755);
    }
    expect(readFileSync(file(), 'utf8')).toBe('dist/\n');
  });

  it('Prettier itself ignores every pharn path afterwards, and nothing of the user’s', async () => {
    usePrettier();
    await applyPrettierignore(tmp.path(), PHARN_KEYS);
    const ignored = async (rel: string) =>
      (
        await prettier.getFileInfo(join(tmp.path(), rel), {
          ignorePath: file(),
        })
      ).ignored;
    for (const rel of [
      ...PHARN_KEYS.filter((k) => k !== MODELS_RECORD_KEY),
      'pharn/features/my-feature/SPEC.md',
      'pharn.config.json',
      'pharn.records.json',
    ])
      expect(await ignored(rel), rel).toBe(true);
    for (const rel of [
      'src/app.ts',
      'README.md',
      '.claude/commands/my-own.md',
      'pharn/memory-bank/lessons.md',
      'docs/pharn/pharn-review/x.md',
    ])
      expect(await ignored(rel), rel).toBe(false);
  });
});

describe('prettierignoreLines / prettierignoreReport — the one wording and the JSON form', () => {
  it('says nothing, and has no JSON key, when nothing changes', () => {
    expect(prettierignoreLines({ action: 'none' })).toBeNull();
    expect(prettierignoreReport({ action: 'none' })).toBeNull();
  });

  it('past, future and status wording; a long list is capped in text only', () => {
    const many = Array.from({ length: 12 }, (_, i) => `/p${i}`);
    const append = { action: 'append' as const, entries: many };
    expect(prettierignoreLines(append)?.text).toMatch(
      /^Added 12 paths to \.prettierignore \(\/p0, .* and 2 more\)/,
    );
    expect(prettierignoreLines(append, { preview: true })?.text).toMatch(
      /^\.prettierignore: would add 12 paths/,
    );
    expect(prettierignoreLines(append, { status: true })?.text).toMatch(
      /does not cover — 12 paths .* pharn update adds them\.$/,
    );
    expect(
      prettierignoreLines(
        { action: 'create', entries: ['/a'] },
        { preview: true },
      )?.text,
    ).toMatch(/^\.prettierignore: would create it with 1 path \(\/a\)/);
    expect(prettierignoreReport(append)).toEqual(append);
  });

  it('a refusal or a failed write is a warning naming every line to add', () => {
    const many = Array.from({ length: 12 }, (_, i) => `/p${i}`);
    const refused = prettierignoreLines({
      action: 'refused',
      reason: 'symlink',
      entries: many,
    });
    expect(refused?.warn).toBe(true);
    expect(refused?.text).toContain('/p11');
    expect(
      prettierignoreLines(
        { action: 'failed', code: 'EACCES', entries: ['/a'] },
        {},
      )?.text,
    ).toMatch(/was not updated: writing it failed \(EACCES\)/);
    expect(
      prettierignoreReport({
        action: 'refused',
        reason: 'unreadable',
        entries: ['/a'],
      }),
    ).toEqual({ action: 'refused', reason: 'unreadable', entries: ['/a'] });
  });
});
