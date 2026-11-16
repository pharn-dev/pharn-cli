import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  applyWrites,
  ApplyError,
  changedSince,
  changedSincePlan,
  readDiskState,
  writtenBeforeFailureLines,
} from '../src/lib/apply-update.js';
import { contentHash } from '../src/lib/hash.js';

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
      hash: contentHash(join(proj, 'a.md')),
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
      // The LEAF phrasing, kept deliberately: both readers print `rel` beside
      // the reason, so naming the component here would stutter
      // ("link.md — link.md is a symlink").
      reason: 'the path is a symlink',
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

  // ---------------------------------------------------------------------------
  // The PARENT twins of the three leaf cases above. `lstat` refuses to
  // dereference only the FINAL component — every ancestor is resolved — so a
  // link one level up used to be read straight through, and the classifier
  // answered `file` (or `absent`) for a path that lives outside the install.
  // ---------------------------------------------------------------------------

  it('a file under a symlinked PARENT → unreadable, even when the bytes match', () => {
    // The sharpest arm: reading through the link returns exactly the bytes an
    // update would have written, so `{kind:'file'}` here would classify the path
    // ok and silently bless a file the install does not own.
    const proj = tmp.path();
    write(join(proj, 'elsewhere/a11y.md'), 'identical');
    mkdirSync(join(proj, 'grillers'), { recursive: true });
    symlinkSync(join(proj, 'elsewhere'), join(proj, 'grillers/a11y'));

    const state = readDiskState(proj, 'grillers/a11y/a11y.md');

    expect(state).toMatchObject({
      kind: 'unreadable',
      // The reason names the offending COMPONENT, not the leaf.
      reason: expect.stringContaining('grillers/a11y'),
    });
    expect(state).not.toMatchObject({ kind: 'file' });
  });

  it('a file under a DANGLING parent symlink → unreadable, not absent', () => {
    // `absent` would be row 1 = restore it, which writes THROUGH the link the
    // moment its target appears.
    const proj = tmp.path();
    mkdirSync(join(proj, 'grillers'), { recursive: true });
    symlinkSync(join(proj, 'ghost-dir'), join(proj, 'grillers/a11y'));

    expect(readDiskState(proj, 'grillers/a11y/a11y.md')).toMatchObject({
      kind: 'unreadable',
    });
  });

  it('reports the walk’s FIRST offender, not the component nearest the file', () => {
    // What this pins beyond tests/symlink-guard.test.ts's own ordering case: the
    // reason readDiskState returns is the walk's answer, not one re-derived here.
    const proj = tmp.path();
    write(join(proj, 'target/inner-target/c.md'), 'x');
    symlinkSync(
      join(proj, 'target/inner-target'),
      join(proj, 'target/inner-link'),
    );
    symlinkSync(join(proj, 'target'), join(proj, 'outer'));

    const state = readDiskState(proj, 'outer/inner-link/c.md');

    expect(state).toMatchObject({
      kind: 'unreadable',
      reason: expect.stringContaining('outer'),
    });
    expect(state).not.toMatchObject({
      reason: expect.stringContaining('inner-link'),
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
    const { written } = applyWrites({
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

  // F-19: a hard link is invisible to the symlink walk (lstat sees a regular
  // file), and `copyFileSync` wrote INTO the destination's inode — so the
  // outside name for that inode was overwritten too.
  it('a HARD-LINKED destination is replaced by name; the outside link keeps its bytes', () => {
    const { repo, proj } = fixture();
    const outside = join(tmp.path(), 'outside-secret.md');
    write(outside, 'outside bytes');
    linkSync(outside, join(proj, 'a.md'));

    const { written } = applyWrites({
      projectRoot: proj,
      expected: expected(repo),
      writes: ['a.md'],
    });

    expect(written).toEqual(['a.md']);
    expect(readFileSync(outside, 'utf8')).toBe('outside bytes');
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('upstream a');
    expect(statSync(outside).nlink).toBe(1);
    expect(statSync(join(proj, 'a.md')).ino).not.toBe(statSync(outside).ino);
  });

  it('leaves no temp sibling behind and gives the file the source mode', () => {
    const { repo, proj } = fixture();
    chmodSync(join(repo, 'a.md'), 0o755);
    write(join(proj, 'a.md'), 'old');
    chmodSync(join(proj, 'a.md'), 0o600);

    applyWrites({
      projectRoot: proj,
      expected: expected(repo),
      writes: ['a.md'],
    });

    // copyFileSync's mode semantics (the destination takes the source's bits).
    expect(statSync(join(proj, 'a.md')).mode & 0o777).toBe(0o755);
    expect(readdirSync(proj).filter((n) => n.endsWith('.tmp'))).toEqual([]);
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

  // The changed-since-plan compare: `seen` is what the caller's plan saw.
  describe('seen', () => {
    it('writes a file still at the hash it had at plan time', () => {
      const { repo, proj } = fixture();
      write(join(proj, 'a.md'), 'user a');
      const seenHash = contentHash(join(proj, 'a.md'));

      const result = applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['a.md'],
        seen: new Map([['a.md', seenHash]]),
      });

      expect(result).toEqual({ written: ['a.md'], changed: [] });
      expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('upstream a');
    });

    it('does NOT write a file edited since the plan; it is returned in `changed`', () => {
      const { repo, proj } = fixture();
      write(join(proj, 'a.md'), 'seen bytes');
      const seenHash = contentHash(join(proj, 'a.md'));
      write(join(proj, 'a.md'), 'edited while the prompt was open');

      const result = applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['a.md', 'deep/nested/b.md'],
        seen: new Map([['a.md', seenHash]]),
      });

      expect(result).toEqual({
        written: ['deep/nested/b.md'],
        changed: ['a.md'],
      });
      expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe(
        'edited while the prompt was open',
      );
    });

    it('a file that APPEARED where the plan saw none is changed', () => {
      const { repo, proj } = fixture();
      write(join(proj, 'a.md'), 'created since the plan');

      const result = applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['a.md'],
        seen: new Map([['a.md', null]]),
      });

      expect(result).toEqual({ written: [], changed: ['a.md'] });
      expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe(
        'created since the plan',
      );
    });

    it('a file that VANISHED since the plan is written (nothing to lose)', () => {
      const { repo, proj } = fixture();

      const result = applyWrites({
        projectRoot: proj,
        expected: expected(repo),
        writes: ['a.md'],
        seen: new Map([['a.md', 'a hash of bytes that are gone']]),
      });

      expect(result).toEqual({ written: ['a.md'], changed: [] });
      expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('upstream a');
    });

    it('a path now UNREADABLE is not `changed`: the write itself refuses it', () => {
      const { repo, proj } = fixture();
      const outside = join(tmp.path(), 'outside.md');
      write(outside, 'outside');
      symlinkSync(outside, join(proj, 'a.md'));

      expect(() =>
        applyWrites({
          projectRoot: proj,
          expected: expected(repo),
          writes: ['a.md'],
          seen: new Map([['a.md', null]]),
        }),
      ).toThrow(ApplyError);
      expect(readFileSync(outside, 'utf8')).toBe('outside');
    });
  });
});

// update's write-time check (C5.2): which planned files changed while its
// confirm was open, decided before the first write.
describe('changedSince / changedSincePlan', () => {
  const tmp = useTmpDir();

  it('reports an edited and an appeared file, in plan order; not an unchanged, vanished or unplanned one', () => {
    const proj = join(tmp.path(), 'proj');
    const repo = join(tmp.path(), 'repo');
    for (const rel of ['edited.md', 'same.md', 'vanished.md'])
      write(join(proj, rel), `old ${rel}`);
    for (const rel of ['edited.md', 'same.md', 'vanished.md', 'appeared.md'])
      write(join(repo, rel), `new ${rel}`);
    const seen = new Map<string, string | null>([
      ['appeared.md', null],
      ['edited.md', contentHash(join(proj, 'edited.md'))],
      ['same.md', contentHash(join(proj, 'same.md'))],
      ['vanished.md', contentHash(join(proj, 'vanished.md'))],
    ]);
    const expected = new Map(
      [...seen.keys()].map((rel) => [rel, join(repo, rel)]),
    );
    write(join(proj, 'edited.md'), 'my edit');
    write(join(proj, 'appeared.md'), 'mine');
    rmSync(join(proj, 'vanished.md'));
    write(join(proj, 'unplanned.md'), 'not in seen');

    const writes = [...seen.keys(), 'unplanned.md'];
    expect(changedSince(proj, seen, writes, expected)).toEqual([
      'appeared.md',
      'edited.md',
    ]);
    expect(changedSincePlan(proj, seen, 'unplanned.md')).toBe(false);
    expect(changedSincePlan(proj, seen, 'vanished.md')).toBe(false);
    expect(changedSincePlan(proj, seen, 'same.md')).toBe(false);
  });

  it('leaves out a file now byte-identical to the source it would be written from', () => {
    const proj = join(tmp.path(), 'proj');
    const repo = join(tmp.path(), 'repo');
    write(join(repo, 'a.md'), 'upstream bytes');
    const seen = new Map<string, string | null>([['a.md', null]]);
    write(join(proj, 'a.md'), 'upstream bytes');
    expect(changedSincePlan(proj, seen, 'a.md')).toBe(true);
    expect(
      changedSince(
        proj,
        seen,
        ['a.md'],
        new Map([['a.md', join(repo, 'a.md')]]),
      ),
    ).toEqual([]);
    // No source to compare with: reported.
    expect(changedSince(proj, seen, ['a.md'], new Map())).toEqual(['a.md']);
  });

  it('applyWrites leaves such a file unwritten and returns it in `changed`', () => {
    const proj = join(tmp.path(), 'proj');
    const repo = join(tmp.path(), 'repo');
    write(join(repo, 'a.md'), 'upstream');
    write(join(proj, 'a.md'), 'old');
    const seen = new Map([['a.md', contentHash(join(proj, 'a.md'))]]);
    write(join(proj, 'a.md'), 'edited');
    const result = applyWrites({
      projectRoot: proj,
      expected: new Map([['a.md', join(repo, 'a.md')]]),
      writes: ['a.md'],
      seen,
    });
    expect(result).toEqual({ written: [], changed: ['a.md'] });
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('edited');
  });
});

describe('writtenBeforeFailureLines', () => {
  it('names one file in the singular', () => {
    expect(writtenBeforeFailureLines(['a.md'])).toEqual([
      '1 file was written before the failure; no records or config were written:',
      '  a.md',
    ]);
  });

  it('shows the first ten paths, then "and N more"', () => {
    const rels = Array.from({ length: 13 }, (_, i) => `f${i}.md`);
    const lines = writtenBeforeFailureLines(rels);
    expect(lines[0]).toBe(
      '13 files were written before the failure; no records or config were written:',
    );
    expect(lines.slice(1, 11)).toEqual(rels.slice(0, 10).map((r) => `  ${r}`));
    expect(lines.slice(11)).toEqual(['  and 3 more']);
  });

  it('strips unsafe characters from a clone-derived path', () => {
    expect(writtenBeforeFailureLines(['a\u001b[31m.md'])[1]).toBe('  a[31m.md');
  });
});
