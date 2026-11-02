import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyGitignore,
  backupDirIgnored,
  decidedEntries,
  GITIGNORE_COMMENT,
  gitignoreAddition,
  gitignoreLines,
  gitignorePending,
  gitignoreReport,
  planGitignore,
  PHARN_GITIGNORE_ENTRIES,
} from '../src/lib/gitignore.js';
import { useTmpDir } from './helpers.js';

// pharn's lines in the project's `.gitignore` (lib/gitignore.ts): append-only,
// spelling-aware, idempotent, never through a symlink.

const BLOCK = `${GITIGNORE_COMMENT}\npharn/.run/\npharn/.backup/\n`;

const decided = (text: string) => [...decidedEntries(Buffer.from(text))];

describe('decidedEntries — the covered test (a membership test on fixed literals)', () => {
  it.each([
    'pharn/.run/',
    '/pharn/.run/',
    'pharn/.run',
    '/pharn/.run',
    'pharn/.run/**',
    'pharn/.run/*',
    '**/pharn/.run/',
    '**/pharn/.run',
    '.run/',
    '.run',
    '**/.run/',
    'pharn/.run/   ',
    'pharn/.run/\t',
    'pharn/.run/\r',
  ])('%j covers pharn/.run/', (line) => {
    expect(decided(`node_modules\n${line}\n`)).toEqual(['pharn/.run/']);
  });

  it.each(['/pharn/.backup/', 'pharn/.backup', 'pharn/.backup/**', '.backup/'])(
    '%j covers pharn/.backup/',
    (line) => {
      expect(decided(`${line}\n`)).toEqual(['pharn/.backup/']);
    },
  );

  it.each([
    ['a leading space (git reads it as part of the pattern)', '  pharn/.run/'],
    ['a comment', '# pharn/.run/'],
    ['a root-anchored basename', '/.run/'],
    ['an anchored basename via /*', '.run/*'],
    ['another directory', 'pharn/.runs/'],
    ['a deeper path', 'src/pharn/.run/'],
    [
      'a broader pattern (not recognised; pharn appends its own line)',
      'pharn/',
    ],
  ])('%s does not count', (_label, line) => {
    expect(decided(`${line}\n`)).toEqual([]);
  });

  it('a negation is the user’s decision: the entry counts as decided', () => {
    expect(decided('!pharn/.run/\n!/pharn/.backup\n')).toEqual([
      'pharn/.run/',
      'pharn/.backup/',
    ]);
  });
});

describe('gitignoreAddition — what is appended', () => {
  it('no file: the comment and both entries, LF', () => {
    const { entries, append } = gitignoreAddition(null);
    expect(entries).toEqual([...PHARN_GITIGNORE_ENTRIES]);
    expect(append.toString()).toBe(BLOCK);
  });

  it('an empty file: the same block, no separator', () => {
    expect(gitignoreAddition(Buffer.alloc(0)).append.toString()).toBe(BLOCK);
  });

  it('an existing LF file without the entries: the block after it', () => {
    const { append } = gitignoreAddition(Buffer.from('node_modules\n'));
    expect(append.toString()).toBe(BLOCK);
  });

  it('a file without a trailing newline: one line ending first', () => {
    const { append } = gitignoreAddition(Buffer.from('node_modules'));
    expect(append.toString()).toBe(`\n${BLOCK}`);
  });

  it('only the missing entry is added', () => {
    const { entries, append } = gitignoreAddition(Buffer.from('/pharn/.run\n'));
    expect(entries).toEqual(['pharn/.backup/']);
    expect(append.toString()).toBe(`${GITIGNORE_COMMENT}\npharn/.backup/\n`);
  });

  it('the comment is written once: a file that holds it gets the entry alone', () => {
    const { append } = gitignoreAddition(
      Buffer.from(`${GITIGNORE_COMMENT}\npharn/.run/\n`),
    );
    expect(append.toString()).toBe('pharn/.backup/\n');
  });

  it('a CRLF file gets CRLF lines, and no bare LF', () => {
    const { append } = gitignoreAddition(Buffer.from('a\r\nb\r\n'));
    expect(append.toString()).toBe(
      `${GITIGNORE_COMMENT}\r\npharn/.run/\r\npharn/.backup/\r\n`,
    );
    expect(append.toString().replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('a CRLF file without a trailing newline gets a CRLF separator', () => {
    const { append } = gitignoreAddition(Buffer.from('a\r\nb'));
    expect(append.toString().startsWith('\r\n# PHARN')).toBe(true);
  });

  it('both entries decided: nothing', () => {
    const { entries, append } = gitignoreAddition(
      Buffer.from('pharn/.run/**\n.backup\n'),
    );
    expect(entries).toEqual([]);
    expect(append.length).toBe(0);
  });
});

describe('applyGitignore — the write (append-only, idempotent)', () => {
  const tmp = useTmpDir();
  const file = () => join(tmp.path(), '.gitignore');

  it('creates a missing .gitignore with the block', async () => {
    expect(planGitignore(tmp.path())).toEqual({
      action: 'create',
      entries: ['pharn/.run/', 'pharn/.backup/'],
    });
    expect(await applyGitignore(tmp.path())).toEqual({
      action: 'create',
      entries: ['pharn/.run/', 'pharn/.backup/'],
    });
    expect(readFileSync(file(), 'utf8')).toBe(BLOCK);
  });

  it('a created .gitignore gets the ordinary umask mode, not owner-only', async () => {
    await applyGitignore(tmp.path());
    const probe = join(tmp.path(), 'probe');
    writeFileSync(probe, '');
    expect(statSync(file()).mode & 0o777).toBe(statSync(probe).mode & 0o777);
  });

  it('appends to an existing file: its exact bytes stay the prefix', async () => {
    // Non-UTF-8 bytes too: the file is never decoded and re-encoded.
    const old = Buffer.concat([
      Buffer.from('node_modules\n# caf'),
      Buffer.from([0xe9, 0xff]),
      Buffer.from('\ndist/\n'),
    ]);
    writeFileSync(file(), old);
    expect(await applyGitignore(tmp.path())).toEqual({
      action: 'append',
      entries: ['pharn/.run/', 'pharn/.backup/'],
    });
    const now = readFileSync(file());
    expect(now.subarray(0, old.length).equals(old)).toBe(true);
    expect(now.subarray(old.length).toString()).toBe(BLOCK);
  });

  it('keeps a CRLF file CRLF', async () => {
    writeFileSync(file(), 'node_modules\r\ndist/\r\n');
    await applyGitignore(tmp.path());
    expect(readFileSync(file(), 'utf8')).toBe(
      `node_modules\r\ndist/\r\n${GITIGNORE_COMMENT}\r\npharn/.run/\r\npharn/.backup/\r\n`,
    );
  });

  it.each([
    ['pharn/.run/\npharn/.backup/\n'],
    ['/pharn/.run/\n/pharn/.backup/\n'],
    ['pharn/.run\npharn/.backup\n'],
    ['pharn/.run/**\npharn/.backup/**\n'],
    ['!pharn/.run/\n.backup/\n'],
  ])('entries already present (%j): nothing is written', async (text) => {
    writeFileSync(file(), text);
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(file(), past, past);
    expect(planGitignore(tmp.path())).toEqual({ action: 'none' });
    expect(await applyGitignore(tmp.path())).toEqual({ action: 'none' });
    expect(readFileSync(file(), 'utf8')).toBe(text);
    expect(statSync(file()).mtime.getTime()).toBe(past.getTime());
  });

  it('a second run is a no-op (bytes and mtime unchanged)', async () => {
    writeFileSync(file(), 'node_modules\n');
    await applyGitignore(tmp.path());
    const once = readFileSync(file());
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(file(), past, past);
    expect(await applyGitignore(tmp.path())).toEqual({ action: 'none' });
    expect(readFileSync(file()).equals(once)).toBe(true);
    expect(statSync(file()).mtime.getTime()).toBe(past.getTime());
  });

  it('git itself ignores both directories afterwards', async () => {
    writeFileSync(file(), 'node_modules\n');
    await applyGitignore(tmp.path());
    execFileSync('git', ['init', '-q'], { cwd: tmp.path() });
    for (const rel of ['pharn/.run/x/stage.json', 'pharn/.backup/20260101/a']) {
      // check-ignore exits 0 when the path is ignored, and throws otherwise.
      execFileSync('git', ['check-ignore', '-q', '--no-index', rel], {
        cwd: tmp.path(),
      });
    }
  });

  it('a symlinked .gitignore is refused: neither the link nor its target changes', async () => {
    const outside = join(tmp.path(), 'outside');
    writeFileSync(outside, 'node_modules\n');
    symlinkSync(outside, file());
    const plan = planGitignore(tmp.path());
    expect(plan).toEqual({
      action: 'refused',
      reason: 'symlink',
      entries: ['pharn/.run/', 'pharn/.backup/'],
    });
    expect(gitignorePending(plan)).toBe(false);
    expect(await applyGitignore(tmp.path())).toEqual(plan);
    expect(readFileSync(outside, 'utf8')).toBe('node_modules\n');
  });

  it('a directory at .gitignore is refused', async () => {
    mkdirSync(file());
    expect(await applyGitignore(tmp.path())).toMatchObject({
      action: 'refused',
      reason: 'not-a-file',
    });
  });

  it('a FIFO at .gitignore is refused without hanging', async () => {
    execFileSync('mkfifo', [file()]);
    expect(await applyGitignore(tmp.path())).toMatchObject({
      action: 'refused',
      reason: 'not-a-file',
    });
  });

  it('a hard-linked .gitignore is replaced: the other name keeps the old bytes', async () => {
    const other = join(tmp.path(), 'other-name');
    writeFileSync(file(), 'node_modules\n');
    linkSync(file(), other);
    await applyGitignore(tmp.path());
    expect(readFileSync(file(), 'utf8')).toBe(`node_modules\n${BLOCK}`);
    expect(readFileSync(other, 'utf8')).toBe('node_modules\n');
  });

  it('keeps an existing file’s mode', async () => {
    writeFileSync(file(), 'node_modules\n');
    chmodSync(file(), 0o640);
    await applyGitignore(tmp.path());
    expect(statSync(file()).mode & 0o777).toBe(0o640);
  });

  it('a failed write is returned, never thrown, and leaves the file as it was', async () => {
    writeFileSync(file(), 'node_modules\n');
    // The temp sibling cannot be created in a read-only directory. (Inert for
    // uid 0 — this suite must not run as root.)
    chmodSync(tmp.path(), 0o555);
    try {
      expect(await applyGitignore(tmp.path())).toEqual({
        action: 'failed',
        code: 'EACCES',
        entries: ['pharn/.run/', 'pharn/.backup/'],
      });
    } finally {
      chmodSync(tmp.path(), 0o755);
    }
    expect(readFileSync(file(), 'utf8')).toBe('node_modules\n');
  });
});

describe('backupDirIgnored — whether the backup notice may skip its advice', () => {
  const tmp = useTmpDir();

  it('false without a .gitignore, true once it covers pharn/.backup/', () => {
    expect(backupDirIgnored(tmp.path())).toBe(false);
    writeFileSync(join(tmp.path(), '.gitignore'), '/pharn/.backup\n');
    expect(backupDirIgnored(tmp.path())).toBe(true);
  });

  it('true when the run’s plan adds it', () => {
    expect(backupDirIgnored(tmp.path(), planGitignore(tmp.path()))).toBe(true);
  });

  it('false when the plan is a refusal', () => {
    mkdirSync(join(tmp.path(), '.gitignore'));
    expect(backupDirIgnored(tmp.path(), planGitignore(tmp.path()))).toBe(false);
  });
});

describe('gitignoreLines / gitignoreReport — the one wording and the JSON form', () => {
  const both = ['pharn/.run/', 'pharn/.backup/'] as const;

  it('says nothing, and has no JSON key, when nothing changes', () => {
    expect(gitignoreLines({ action: 'none' })).toBeNull();
    expect(gitignoreReport({ action: 'none' })).toBeNull();
  });

  it('past and future tense for create and append', () => {
    expect(gitignoreLines({ action: 'create', entries: [...both] })).toEqual({
      text: "Created .gitignore with pharn/.run/, pharn/.backup/ (PHARN's run state and update backups).",
      warn: false,
    });
    expect(
      gitignoreLines(
        { action: 'append', entries: ['pharn/.backup/'] },
        { preview: true },
      ),
    ).toEqual({
      text: ".gitignore: would add pharn/.backup/ (PHARN's run state and update backups).",
      warn: false,
    });
  });

  it('a refusal or a failed write is a warning naming the lines to add by hand', () => {
    expect(
      gitignoreLines({
        action: 'refused',
        reason: 'symlink',
        entries: [...both],
      }),
    ).toEqual({
      text: ".gitignore was not updated: it is a symlink, and pharn never writes through one. Add these lines yourself so PHARN's run state is never committed: pharn/.run/, pharn/.backup/",
      warn: true,
    });
    expect(
      gitignoreLines({ action: 'failed', code: 'EACCES', entries: [...both] })
        ?.text,
    ).toContain('writing it failed (EACCES)');
  });

  it('projects a plan field by field', () => {
    expect(gitignoreReport({ action: 'append', entries: [...both] })).toEqual({
      action: 'append',
      entries: [...both],
    });
    expect(
      gitignoreReport({
        action: 'refused',
        reason: 'unreadable',
        entries: [...both],
      }),
    ).toEqual({ action: 'refused', reason: 'unreadable', entries: [...both] });
  });
});
