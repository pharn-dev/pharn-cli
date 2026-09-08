import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { scanDest } from '../src/lib/dest-drift.js';

// ---------------------------------------------------------------------------
// The destination-drift set — the files `pharn add`'s copy is about to overwrite
// with DIFFERENT bytes, and therefore the exact set it backs up first. The whole
// point is the two-sided membership test: existing-but-identical must NOT be
// drift (or every re-add would litter .pharn-backup/), and existing-but-different
// must be, or the user's edit is destroyed with no copy anywhere.
// ---------------------------------------------------------------------------

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('scanDest', () => {
  const tmp = useTmpDir();

  function trees(): { repo: string; proj: string } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(repo, { recursive: true });
    mkdirSync(proj, { recursive: true });
    return { repo, proj };
  }

  const REL = 'pharn-review/a11y/a11y.md';
  const NESTED = 'pharn-review/a11y/evals/cases/basic.md';

  it('reports a destination whose bytes differ from the clone', () => {
    const { repo, proj } = trees();
    write(join(repo, REL), 'upstream');
    write(join(proj, REL), 'MY EDIT');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([REL]);
  });

  it('does NOT report byte-identical bytes — identical is not drift', () => {
    // The drop-then-re-add of untouched files. Backing these up would fill
    // .pharn-backup/ with copies of bytes nobody ever lost, and would make the
    // report cry wolf on the one signal that is supposed to mean "you edited
    // this". Mirrors update's decision table row `identical → no-op`.
    const { repo, proj } = trees();
    write(join(repo, REL), 'same bytes');
    write(join(proj, REL), 'same bytes');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('does NOT report a destination that does not exist', () => {
    // Nothing to lose: the copy CREATES this file. The overwhelmingly common
    // case — a fresh add — must produce no backup directory at all.
    const { repo, proj } = trees();
    write(join(repo, REL), 'upstream');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('does NOT report a rel the clone does not carry', () => {
    // The extra file a user left inside a leftover capability directory. The copy
    // never touches it, so it is never drift — and it is never backed up either.
    const { repo, proj } = trees();
    write(join(proj, REL), 'mine');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('reports every drifted rel, sorted, and skips the clean ones', () => {
    const { repo, proj } = trees();
    write(join(repo, NESTED), 'upstream nested');
    write(join(proj, NESTED), 'edited nested');
    write(join(repo, REL), 'same');
    write(join(proj, REL), 'same');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL, NESTED] })
        .drifted,
    ).toEqual([NESTED]);
  });

  it('sorts its output deterministically (P5)', () => {
    const { repo, proj } = trees();
    for (const rel of [NESTED, REL]) {
      write(join(repo, rel), 'upstream');
      write(join(proj, rel), 'edited');
    }

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [NESTED, REL] })
        .drifted,
    ).toEqual([REL, NESTED]);
  });

  it('marks a symlinked DESTINATION file UNSAFE — never drift', () => {
    // sha256File reads through a link (lib/hash.ts), so hashing it would compare
    // — and then back up — the LINK TARGET's bytes. And cpSync REPLACES the link
    // with a regular file, so the user loses it silently. Neither outcome is a
    // backup, so the path is refused rather than skipped.
    const { repo, proj } = trees();
    write(join(repo, REL), 'upstream');
    write(join(proj, 'outside.md'), 'somebody elses file');
    mkdirSync(join(proj, REL, '..'), { recursive: true });
    symlinkSync(join(proj, 'outside.md'), join(proj, REL));

    const scan = scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] });
    expect(scan.drifted).toEqual([]);
    expect(scan.unsafe).toEqual([{ rel: REL, link: REL }]);
  });

  it('marks a symlinked destination PARENT component UNSAFE, naming the link', () => {
    // THE case that makes this a refusal instead of a skip. Measured on node
    // v24.13.1: with a symlinked intermediate directory, cpSync writes straight
    // THROUGH it — bytes wherever the link points, outside the project included,
    // are replaced. Skipping would leave the copy doing exactly that while the
    // backup meant to protect the file silently omitted it.
    const { repo, proj } = trees();
    write(join(repo, NESTED), 'upstream');
    write(join(proj, 'elsewhere/basic.md'), 'somebody elses file');
    mkdirSync(join(proj, 'pharn-review/a11y'), { recursive: true });
    symlinkSync(join(proj, 'elsewhere'), join(proj, 'pharn-review/a11y/evals'));

    const scan = scanDest({ repoDir: repo, projectRoot: proj, rels: [NESTED] });
    expect(scan.drifted).toEqual([]);
    // The offending COMPONENT is named, not just the file — that is what the
    // user has to act on, and it is not derivable from the rel alone.
    expect(scan.unsafe).toEqual([
      { rel: NESTED, link: 'pharn-review/a11y/evals' },
    ]);
  });

  it('reports every unsafe rel, sorted, alongside an unrelated drifted one', () => {
    const { repo, proj } = trees();
    write(join(repo, REL), 'upstream');
    write(join(proj, REL), 'MY EDIT');
    write(join(repo, NESTED), 'upstream nested');
    write(join(proj, 'elsewhere/basic.md'), 'x');
    mkdirSync(join(proj, 'pharn-review/a11y'), { recursive: true });
    symlinkSync(join(proj, 'elsewhere'), join(proj, 'pharn-review/a11y/evals'));

    const scan = scanDest({
      repoDir: repo,
      projectRoot: proj,
      rels: [NESTED, REL],
    });
    // Both partitions are populated independently: an unsafe path does not
    // suppress the drift set, so `add` can name the refusal AND still be correct
    // about what it would otherwise have backed up.
    expect(scan.drifted).toEqual([REL]);
    expect(scan.unsafe.map((u) => u.rel)).toEqual([NESTED]);
  });

  it('does NOT hash through a symlinked CLONE file', () => {
    // The untrusted side. installCapabilityDirs' noSymlinks filter never copies
    // one, so it can never be the source of an overwrite either.
    const { repo, proj } = trees();
    write(join(repo, 'outside.md'), 'clone-external bytes');
    mkdirSync(join(repo, REL, '..'), { recursive: true });
    symlinkSync(join(repo, 'outside.md'), join(repo, REL));
    write(join(proj, REL), 'MY EDIT');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('does NOT hash through a symlinked CLONE parent component', () => {
    // The untrusted side gets the same per-component walk the project side does:
    // lstat refuses to dereference only the final component, so a leaf-only check
    // would read a file from outside the clone through a symlinked parent.
    const { repo, proj } = trees();
    write(join(repo, 'elsewhere/a11y.md'), 'clone-external bytes');
    mkdirSync(join(repo, 'pharn-review'), { recursive: true });
    symlinkSync(join(repo, 'elsewhere'), join(repo, 'pharn-review/a11y'));
    write(join(proj, REL), 'MY EDIT');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('does NOT report a destination that is a directory', () => {
    const { repo, proj } = trees();
    write(join(repo, REL), 'upstream');
    mkdirSync(join(proj, REL), { recursive: true });

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('does NOT report a rel whose ancestor is a regular FILE (the ENOTDIR walk)', () => {
    // findSymlinkComponent is not total: throwIfNoEntry suppresses ENOENT only, so
    // a component below a regular file raises ENOTDIR out of the walk. This scan's
    // terminal for that is SKIP — nothing at `rel` exists to lose, and letting it
    // through would hand createBackup (which does NOT wrap its own walk) a path
    // that makes it fatal.
    const { repo, proj } = trees();
    write(join(repo, REL), 'upstream');
    write(
      join(proj, 'pharn-review/a11y'),
      'a FILE where the cap dir should be',
    );

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('does NOT report a rel whose CLONE-side ancestor is a regular file', () => {
    const { repo, proj } = trees();
    write(
      join(repo, 'pharn-review/a11y'),
      'a FILE where the cap dir should be',
    );
    write(join(proj, REL), 'MY EDIT');

    expect(
      scanDest({ repoDir: repo, projectRoot: proj, rels: [REL] }).drifted,
    ).toEqual([]);
  });

  it('refuses a rel that escapes the project root (safeJoin containment)', () => {
    // A containment violation is LOUD, never a silent skip — both safeJoins run
    // before either walk, so the skip-on-unreadable catch above cannot bury it.
    const { repo, proj } = trees();
    expect(() =>
      scanDest({ repoDir: repo, projectRoot: proj, rels: ['../escape.md'] }),
    ).toThrow();
  });

  it('is a no-op on an empty rel list', () => {
    const { repo, proj } = trees();
    expect(scanDest({ repoDir: repo, projectRoot: proj, rels: [] })).toEqual({
      drifted: [],
      unsafe: [],
    });
  });
});
