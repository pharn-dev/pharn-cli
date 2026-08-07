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
  applyWrites,
  ApplyError,
  readDiskState,
} from '../src/lib/apply-update.js';
import { sha256File } from '../src/lib/hash.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('readDiskState — the disk side of the decision table', () => {
  const tmp = useTmpDir();

  it('absent → absent', () => {
    expect(readDiskState(tmp.path(), 'nope.md')).toEqual({ kind: 'absent' });
  });

  it('a regular file → its sha256', () => {
    const proj = tmp.path();
    write(join(proj, 'a.md'), 'bytes');
    expect(readDiskState(proj, 'a.md')).toEqual({
      kind: 'file',
      hash: sha256File(join(proj, 'a.md')),
    });
  });

  it('a directory where a file is expected → unreadable, NOT absent', () => {
    // "absent" would mean row 1 = overwrite it; that must not happen by accident.
    const proj = tmp.path();
    mkdirSync(join(proj, 'a.md'), { recursive: true });
    expect(readDiskState(proj, 'a.md')).toMatchObject({ kind: 'unreadable' });
  });

  it('a symlink → unreadable, so it is never hashed or written through', () => {
    const proj = tmp.path();
    write(join(proj, 'real.md'), 'r');
    symlinkSync(join(proj, 'real.md'), join(proj, 'link.md'));
    expect(readDiskState(proj, 'link.md')).toMatchObject({
      kind: 'unreadable',
    });
  });

  it('a DANGLING symlink → unreadable, not absent (the row-1 overwrite trap)', () => {
    const proj = tmp.path();
    symlinkSync(join(proj, 'ghost-target.md'), join(proj, 'dangling.md'));
    expect(readDiskState(proj, 'dangling.md')).toMatchObject({
      kind: 'unreadable',
    });
  });

  it('NEVER throws when a parent component is a regular file (ENOTDIR, not ENOENT)', () => {
    // lstat's `throwIfNoEntry:false` suppresses ENOENT only, so this used to
    // crash the whole run instead of producing the named skip.
    const proj = tmp.path();
    write(join(proj, 'blocker'), 'a file where a directory belongs');
    expect(() => readDiskState(proj, 'blocker/child.md')).not.toThrow();
    expect(readDiskState(proj, 'blocker/child.md')).toMatchObject({
      kind: 'unreadable',
    });
  });
});

describe('applyWrites', () => {
  const tmp = useTmpDir();

  function fixture(): { repo: string; proj: string } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    write(join(repo, 'a.md'), 'upstream a');
    write(join(repo, 'deep/nested/b.md'), 'upstream b');
    return { repo, proj };
  }

  function expected(repo: string): Map<string, string> {
    return new Map([
      ['a.md', join(repo, 'a.md')],
      ['deep/nested/b.md', join(repo, 'deep/nested/b.md')],
    ]);
  }

  it('copies the planned writes verbatim and returns them in order', () => {
    const { repo, proj } = fixture();
    const written = applyWrites({
      projectRoot: proj,
      expected: expected(repo),
      writes: ['a.md', 'deep/nested/b.md'],
    });
    expect(written).toEqual(['a.md', 'deep/nested/b.md']);
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('upstream a');
  });

  it('creates missing parent directories (copyFileSync does not — cpSync used to)', () => {
    const { repo, proj } = fixture();
    // The whole directory is absent: this is the row-1 restore after a user rm -rf.
    expect(existsSync(join(proj, 'deep'))).toBe(false);
    applyWrites({
      projectRoot: proj,
      expected: expected(repo),
      writes: ['deep/nested/b.md'],
    });
    expect(readFileSync(join(proj, 'deep/nested/b.md'), 'utf8')).toBe(
      'upstream b',
    );
  });

  it('writes nothing it was not asked to write', () => {
    const { repo, proj } = fixture();
    applyWrites({
      projectRoot: proj,
      expected: expected(repo),
      writes: ['a.md'],
    });
    expect(existsSync(join(proj, 'deep/nested/b.md'))).toBe(false);
  });

  it('refuses to write through a symlinked DESTINATION file', () => {
    const { repo, proj } = fixture();
    const outside = join(tmp.path(), 'outside.md');
    write(outside, 'do not clobber me');
    symlinkSync(outside, join(proj, 'a.md'));

    expect(() =>
      applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['a.md'],
      }),
    ).toThrow(ApplyError);
    expect(readFileSync(outside, 'utf8')).toBe('do not clobber me');
  });

  it('refuses to write through a symlinked PARENT directory', () => {
    const { repo, proj } = fixture();
    const outside = join(tmp.path(), 'outside-dir');
    mkdirSync(join(outside, 'nested'), { recursive: true });
    symlinkSync(outside, join(proj, 'deep'));

    expect(() =>
      applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['deep/nested/b.md'],
      }),
    ).toThrow(ApplyError);
    expect(existsSync(join(outside, 'nested/b.md'))).toBe(false);
  });

  it('a dangling destination symlink is refused rather than followed', () => {
    const { repo, proj } = fixture();
    const outside = join(tmp.path(), 'not-yet-there.md');
    symlinkSync(outside, join(proj, 'a.md'));

    expect(() =>
      applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['a.md'],
      }),
    ).toThrow(ApplyError);
    expect(existsSync(outside)).toBe(false);
  });

  it('on failure the ApplyError CARRIES the paths already written, so they can still be recorded', () => {
    const { repo, proj } = fixture();
    // Second write fails (its parent is a symlink); the first already landed.
    const outside = join(tmp.path(), 'outside-dir2');
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(proj, 'deep'));

    try {
      applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['a.md', 'deep/nested/b.md'],
      });
      expect.unreachable('applyWrites should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApplyError);
      expect((err as ApplyError).written).toEqual(['a.md']);
    }
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('upstream a');
  });

  it('a planned write with no source is an internal error, not a silent skip', () => {
    const { repo, proj } = fixture();
    expect(() =>
      applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['unknown.md'],
      }),
    ).toThrow(/no source/i);
  });
});
