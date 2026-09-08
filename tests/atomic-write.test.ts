import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { tmpPathFor, writeJsonAtomic } from '../src/lib/atomic-write.js';

describe('writeJsonAtomic', () => {
  const tmp = useTmpDir();
  const target = () => join(tmp.path(), 'state.json');
  const siblings = () => readdirSync(tmp.path()).sort();

  it('writes the same bytes a plain writeFile did: 2-space JSON + trailing newline', async () => {
    const value = { b: 2, a: [1, 'x'], nested: { k: null } };
    await writeJsonAtomic(target(), value);
    expect(readFileSync(target(), 'utf8')).toBe(
      `${JSON.stringify(value, null, 2)}\n`,
    );
  });

  it('replaces an existing file in place and leaves no temp sibling', async () => {
    writeFileSync(target(), 'stale');
    await writeJsonAtomic(target(), { v: 2 });
    expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({ v: 2 });
    expect(siblings()).toEqual(['state.json']);
  });

  // rename(2) is atomic only WITHIN a filesystem, and a cross-device rename
  // fails EXDEV rather than degrading — the sibling placement is what makes that
  // unreachable, so it is a precondition worth pinning, not a style choice.
  it('puts the temp file in the target directory (the rename precondition)', () => {
    expect(dirname(tmpPathFor(target()))).toBe(dirname(target()));
  });

  // Two concurrent processes get distinct temp names, so neither can truncate
  // the other's temp. That is a COLLISION property, not mutual exclusion over
  // the target — there is no lock here, by design.
  it('derives the temp name from the target plus the pid', () => {
    expect(tmpPathFor(target())).toBe(`${target()}.${process.pid}.tmp`);
  });

  describe('when the write fails', () => {
    // A DIRECTORY planted at the temp path makes the write throw EISDIR for any
    // user — deterministic, unlike a read-only-directory fixture, which a root
    // test runner would silently write straight through.
    function plantBlocker(): void {
      mkdirSync(tmpPathFor(target()), { recursive: true });
    }

    it('leaves a pre-existing target unchanged and parseable', async () => {
      writeFileSync(target(), `${JSON.stringify({ keep: 'me' }, null, 2)}\n`);
      plantBlocker();
      await expect(writeJsonAtomic(target(), { v: 9 })).rejects.toThrow();
      expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({
        keep: 'me',
      });
    });

    // The failure that matters is the WRITE's. A helper like this usually goes
    // wrong by letting its own best-effort cleanup throw and mask the cause.
    it('rethrows the write error, never the cleanup error', async () => {
      plantBlocker();
      await expect(writeJsonAtomic(target(), { v: 9 })).rejects.toMatchObject({
        code: 'EISDIR',
      });
    });
  });

  // `rename` swaps in a NEW inode, so without this the previous file's mode is
  // discarded and replaced by whatever the umask gives — a 0600 config silently
  // becoming 0644 on the next write.
  describe('permission bits', () => {
    it('preserves the mode of an existing regular file', async () => {
      writeFileSync(target(), '{}');
      chmodSync(target(), 0o600);
      await writeJsonAtomic(target(), { v: 1 });
      expect(statSync(target()).mode & 0o777).toBe(0o600);
    });

    it('preserves a non-default mode across repeated writes', async () => {
      writeFileSync(target(), '{}');
      chmodSync(target(), 0o640);
      await writeJsonAtomic(target(), { v: 1 });
      await writeJsonAtomic(target(), { v: 2 });
      expect(statSync(target()).mode & 0o777).toBe(0o640);
    });

    // A symlinked target is REPLACED by a regular file, not written through —
    // the same posture the rest of the CLI takes toward symlinks, and different
    // from the plain writeFile this helper replaced.
    it('replaces a symlinked target with a regular file instead of following it', async () => {
      const outside = join(tmp.path(), 'elsewhere.json');
      writeFileSync(outside, '{"untouched":true}');
      symlinkSync(outside, target());

      await writeJsonAtomic(target(), { v: 1 });

      // lstat, not stat: stat FOLLOWS the link, so it would report isFile()
      // true even if the link were still there and had been written through.
      expect(lstatSync(target()).isSymbolicLink()).toBe(false);
      expect(lstatSync(target()).isFile()).toBe(true);
      expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({ v: 1 });
      expect(JSON.parse(readFileSync(outside, 'utf8'))).toEqual({
        untouched: true,
      });
    });
  });
});
