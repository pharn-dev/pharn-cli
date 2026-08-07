import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  backupTimestamp,
  BACKUP_DIR,
  createBackup,
} from '../src/lib/backup.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

const AT = new Date(2026, 7, 7, 9, 15, 0); // 2026-08-07 09:15:00 local

describe('backupTimestamp', () => {
  it('formats YYYYMMDD-HHMMSS, zero-padded', () => {
    expect(backupTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe(
      '20260102-030405',
    );
    expect(backupTimestamp(AT)).toBe('20260807-091500');
  });
});

describe('createBackup', () => {
  const tmp = useTmpDir();

  it('copies each file into .pharn-backup/<ts>/ preserving its relative path', () => {
    const proj = tmp.path();
    write(join(proj, 'CONSTITUTION.md'), 'my edit');
    write(join(proj, 'pharn-review/a/a.md'), 'nested edit');

    const dir = createBackup(
      proj,
      ['CONSTITUTION.md', 'pharn-review/a/a.md'],
      AT,
    );

    expect(dir).toBe(`${BACKUP_DIR}/20260807-091500`);
    expect(readFileSync(join(proj, dir, 'CONSTITUTION.md'), 'utf8')).toBe(
      'my edit',
    );
    expect(readFileSync(join(proj, dir, 'pharn-review/a/a.md'), 'utf8')).toBe(
      'nested edit',
    );
  });

  it('leaves the originals in place — a backup copies, it never moves', () => {
    const proj = tmp.path();
    write(join(proj, 'a.md'), 'original');
    createBackup(proj, ['a.md'], AT);
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('original');
  });

  it('NEVER writes into an existing timestamp dir — it uniquifies instead', () => {
    // Two --force runs inside the same second must not let the second destroy
    // the only surviving copy of the user's edits.
    const proj = tmp.path();
    write(join(proj, 'a.md'), 'first');
    const first = createBackup(proj, ['a.md'], AT);

    write(join(proj, 'a.md'), 'second');
    const second = createBackup(proj, ['a.md'], AT);

    expect(second).toBe(`${first}-2`);
    expect(readFileSync(join(proj, first, 'a.md'), 'utf8')).toBe('first');
    expect(readFileSync(join(proj, second, 'a.md'), 'utf8')).toBe('second');
  });

  it('refuses to write through a symlinked .pharn-backup (safeJoin is lexical only)', () => {
    // proj and the symlink target are siblings inside the tmp dir, so the escape
    // is real but stays inside the fixture.
    const proj = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside-target');
    mkdirSync(proj, { recursive: true });
    mkdirSync(outside, { recursive: true });
    write(join(proj, 'a.md'), 'secret');
    symlinkSync(outside, join(proj, BACKUP_DIR));

    expect(() => createBackup(proj, ['a.md'], AT)).toThrow(/symlink/i);
    expect(existsSync(join(outside, '20260807-091500'))).toBe(false);
  });

  it('refuses to back up a source that is a symlink', () => {
    const proj = tmp.path();
    write(join(proj, 'real.md'), 'r');
    symlinkSync(join(proj, 'real.md'), join(proj, 'link.md'));
    expect(() => createBackup(proj, ['link.md'], AT)).toThrow(/symlink/i);
  });

  it('refuses a source whose PARENT is a symlink (lstat only guards the leaf)', () => {
    const proj = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside-src');
    mkdirSync(proj, { recursive: true });
    write(join(outside, 'a.md'), 'bytes from outside the project');
    symlinkSync(outside, join(proj, 'linked-dir'));

    expect(() => createBackup(proj, ['linked-dir/a.md'], AT)).toThrow(
      /symlink/i,
    );
  });

  it('throws (rather than silently skipping) when a source disappeared', () => {
    expect(() => createBackup(tmp.path(), ['ghost.md'], AT)).toThrow(
      /disappeared/,
    );
  });

  it('THROWS when the backup root cannot be created, so the caller can abort before touching originals', () => {
    // A plain FILE at .pharn-backup makes mkdir fail — a real, deterministic
    // failure seam with no injection needed.
    const proj = tmp.path();
    write(join(proj, BACKUP_DIR), 'i am a file, not a directory');
    write(join(proj, 'a.md'), 'user bytes');

    expect(() => createBackup(proj, ['a.md'], AT)).toThrow();
    // The original is untouched — that is the property the update relies on.
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('user bytes');
  });

  it('creates the directory even for an empty file list (callers skip that case)', () => {
    const proj = tmp.path();
    const dir = createBackup(proj, [], AT);
    expect(existsSync(join(proj, dir))).toBe(true);
  });
});
