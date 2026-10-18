import {
  chmodSync,
  linkSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  lstatSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  TMP_CREATE_ATTEMPTS,
  TMP_NONCE_BYTES,
  copyFileAtomicSync,
  tmpPathFor,
  writeJsonAtomic,
} from '../src/lib/atomic-write.js';

// The temp name's nonce comes from `randomBytes`. It is wrapped (not replaced)
// so every test gets real randomness unless it pins a nonce to plant something
// at a name pharn will actually try.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

const rb = vi.mocked(randomBytes);
const nonceBuf = (byte: number): Buffer => Buffer.alloc(TMP_NONCE_BYTES, byte);
const nonceHex = (byte: number): string => nonceBuf(byte).toString('hex');
// `randomBytes` is overloaded (sync + callback), so its mocked type resolves to
// the callback overload's `void`; the sync shape is the one atomic-write calls.
const asRandomBytes = (fn: () => Buffer): typeof randomBytes =>
  fn as unknown as typeof randomBytes;
/** The next calls to `randomBytes` return these nonces, in order. */
function queueNonces(...bytes: number[]): void {
  for (const b of bytes)
    rb.mockImplementationOnce(asRandomBytes(() => nonceBuf(b)));
}
/** Every call to `randomBytes` returns this nonce. */
function pinNonce(byte: number): void {
  rb.mockImplementation(asRandomBytes(() => nonceBuf(byte)));
}

describe('writeJsonAtomic', () => {
  const tmp = useTmpDir();
  const target = () => join(tmp.path(), 'state.json');
  const siblings = () => readdirSync(tmp.path()).sort();
  const outsideFile = () => join(tmp.path(), 'outside', 'victim.txt');
  function plantOutside(): string {
    mkdirSync(dirname(outsideFile()), { recursive: true });
    writeFileSync(outsideFile(), 'precious bytes');
    return outsideFile();
  }

  // Restore the real randomness (mockReset returns a vi.fn(impl) to `impl`).
  afterEach(() => {
    rb.mockReset();
  });

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
    expect(dirname(tmpPathFor(target(), 'n'))).toBe(dirname(target()));
  });

  // The pid keeps two concurrent processes apart; the nonce makes the name
  // unpredictable to a checkout that could otherwise pre-plant it. Neither is
  // mutual exclusion over the target — there is no lock here, by design.
  it('derives the temp name from the target, the pid and a nonce', () => {
    expect(tmpPathFor(target(), 'abc123')).toBe(
      `${target()}.${process.pid}.abc123.tmp`,
    );
  });

  it('draws a fresh random nonce for the temp name', async () => {
    await writeJsonAtomic(target(), { v: 1 });
    expect(rb).toHaveBeenCalledTimes(1);
    expect(rb).toHaveBeenCalledWith(TMP_NONCE_BYTES);
  });

  // F-03: the target lives in the user's checkout, which may be hostile. Until
  // this was fixed the temp name was `<target>.<pid>.tmp` — predictable — and
  // it was opened with writeFile's default flag, which FOLLOWS a symlink. A
  // committed link at that name made pharn truncate a file outside the repo and
  // then rename the link over the config.
  describe('a symlink planted at a temp name is never followed', () => {
    it('ignores a symlink at the old predictable name', async () => {
      const outside = plantOutside();
      const legacy = `${target()}.${process.pid}.tmp`;
      symlinkSync(outside, legacy);

      await writeJsonAtomic(target(), { v: 1 });

      expect(readFileSync(outside, 'utf8')).toBe('precious bytes');
      expect(lstatSync(target()).isFile()).toBe(true);
      expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({ v: 1 });
      expect(readlinkSync(legacy)).toBe(outside);
    });

    // The floor is the exclusive create, not the nonce: even a link planted at
    // the EXACT name pharn tries first is refused (EEXIST) without being
    // followed, and the write moves on to a fresh name.
    it('refuses a symlink at the exact name it tries, and retries under a fresh nonce', async () => {
      const outside = plantOutside();
      writeFileSync(target(), `${JSON.stringify({ old: true }, null, 2)}\n`);
      const planted = tmpPathFor(target(), nonceHex(0xaa));
      symlinkSync(outside, planted);
      queueNonces(0xaa, 0xbb);

      await writeJsonAtomic(target(), { v: 2 });

      expect(rb).toHaveBeenCalledTimes(2);
      expect(readFileSync(outside, 'utf8')).toBe('precious bytes');
      expect(lstatSync(target()).isSymbolicLink()).toBe(false);
      expect(lstatSync(target()).isFile()).toBe(true);
      expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({ v: 2 });
      // The planted entry is not ours: it is left exactly as found.
      expect(readlinkSync(planted)).toBe(outside);
      expect(existsSync(tmpPathFor(target(), nonceHex(0xbb)))).toBe(false);
    });

    // A DANGLING link is the sharper case: an O_CREAT that follows it creates
    // the file at the link's destination, wherever that is.
    it('does not create the destination of a dangling symlink at the name', async () => {
      const dest = join(tmp.path(), 'outside', 'created-by-follow.txt');
      mkdirSync(dirname(dest), { recursive: true });
      const planted = tmpPathFor(target(), nonceHex(0xcc));
      symlinkSync(dest, planted);
      queueNonces(0xcc, 0xdd);

      await writeJsonAtomic(target(), { v: 3 });

      expect(existsSync(dest)).toBe(false);
      expect(lstatSync(target()).isFile()).toBe(true);
      expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({ v: 3 });
    });
  });

  describe('when every candidate name is taken', () => {
    it(`gives up after ${TMP_CREATE_ATTEMPTS} attempts with a named EEXIST, touching nothing`, async () => {
      const outside = plantOutside();
      writeFileSync(target(), `${JSON.stringify({ keep: 'me' }, null, 2)}\n`);
      const planted = tmpPathFor(target(), nonceHex(0xee));
      symlinkSync(outside, planted);
      pinNonce(0xee);

      const err = await writeJsonAtomic(target(), { v: 9 }).then(
        () => null,
        (e: unknown) => e as NodeJS.ErrnoException,
      );

      expect(err?.code).toBe('EEXIST');
      expect(err?.message).toMatch(/Could not create a temporary file beside/);
      expect(err?.message).toContain(`${TMP_CREATE_ATTEMPTS} randomly named`);
      expect(rb).toHaveBeenCalledTimes(TMP_CREATE_ATTEMPTS);
      expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({
        keep: 'me',
      });
      expect(readFileSync(outside, 'utf8')).toBe('precious bytes');
      expect(readlinkSync(planted)).toBe(outside);
    });
  });

  describe('when the write fails', () => {
    // A DIRECTORY at the temp name (the nonce pinned so pharn tries only that
    // name) fails the exclusive create for any user — deterministic, unlike a
    // read-only-directory fixture, which a root test runner would silently
    // write straight through.
    it('leaves a pre-existing target unchanged and parseable', async () => {
      writeFileSync(target(), `${JSON.stringify({ keep: 'me' }, null, 2)}\n`);
      pinNonce(0x11);
      mkdirSync(tmpPathFor(target(), nonceHex(0x11)));
      await expect(writeJsonAtomic(target(), { v: 9 })).rejects.toThrow();
      expect(JSON.parse(readFileSync(target(), 'utf8'))).toEqual({
        keep: 'me',
      });
    });

    // A non-empty DIRECTORY at the target makes the RENAME fail (EISDIR) after
    // the temp was created and written — the path where cleanup has work to do.
    // The failure that matters is the rename's: a helper like this usually goes
    // wrong by letting its own best-effort cleanup throw and mask the cause.
    it('rethrows the rename error, never the cleanup error', async () => {
      mkdirSync(join(target(), 'occupied'), { recursive: true });
      await expect(writeJsonAtomic(target(), { v: 9 })).rejects.toMatchObject({
        code: 'EISDIR',
      });
    });

    it('removes the temp it created', async () => {
      mkdirSync(join(target(), 'occupied'), { recursive: true });
      queueNonces(0x22);
      await expect(writeJsonAtomic(target(), { v: 9 })).rejects.toThrow();
      expect(existsSync(tmpPathFor(target(), nonceHex(0x22)))).toBe(false);
      expect(siblings()).toEqual(['state.json']);
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

describe('copyFileAtomicSync (F-19)', () => {
  const tmp = useTmpDir();
  const source = () => join(tmp.path(), 'src', 'upstream.md');
  const dir = () => join(tmp.path(), 'proj');
  const target = () => join(dir(), 'file.md');
  const siblings = () => readdirSync(dir()).sort();
  function setup(): void {
    mkdirSync(dirname(source()), { recursive: true });
    mkdirSync(dir(), { recursive: true });
    writeFileSync(source(), 'upstream bytes');
  }

  afterEach(() => {
    rb.mockReset();
  });

  it('copies the bytes and leaves no temp sibling', () => {
    setup();
    writeFileSync(target(), 'old');
    copyFileAtomicSync(source(), target());
    expect(readFileSync(target(), 'utf8')).toBe('upstream bytes');
    expect(siblings()).toEqual(['file.md']);
  });

  it('replaces a hard-linked target by name; the other link keeps its bytes', () => {
    setup();
    const outside = join(tmp.path(), 'outside.md');
    writeFileSync(outside, 'precious bytes');
    linkSync(outside, target());

    copyFileAtomicSync(source(), target());

    expect(readFileSync(outside, 'utf8')).toBe('precious bytes');
    expect(readFileSync(target(), 'utf8')).toBe('upstream bytes');
    expect(statSync(outside).nlink).toBe(1);
  });

  it('gives the target the SOURCE mode, as copyFileSync did', () => {
    setup();
    chmodSync(source(), 0o750);
    writeFileSync(target(), 'old');
    chmodSync(target(), 0o600);
    copyFileAtomicSync(source(), target());
    expect(statSync(target()).mode & 0o777).toBe(0o750);
  });

  it('refuses a symlink planted at the exact temp name, and retries under a fresh nonce', () => {
    setup();
    const outside = join(tmp.path(), 'outside.md');
    writeFileSync(outside, 'precious bytes');
    const planted = tmpPathFor(target(), nonceHex(0xaa));
    symlinkSync(outside, planted);
    queueNonces(0xaa, 0xbb);

    copyFileAtomicSync(source(), target());

    expect(rb).toHaveBeenCalledTimes(2);
    expect(readFileSync(outside, 'utf8')).toBe('precious bytes');
    expect(readlinkSync(planted)).toBe(outside);
    expect(lstatSync(target()).isFile()).toBe(true);
    expect(readFileSync(target(), 'utf8')).toBe('upstream bytes');
  });

  it(`gives up after ${TMP_CREATE_ATTEMPTS} taken names with a named EEXIST, target unchanged`, () => {
    setup();
    writeFileSync(target(), 'keep me');
    const planted = tmpPathFor(target(), nonceHex(0xee));
    writeFileSync(planted, 'not ours');
    pinNonce(0xee);

    let err: NodeJS.ErrnoException | null = null;
    try {
      copyFileAtomicSync(source(), target());
    } catch (e) {
      err = e as NodeJS.ErrnoException;
    }

    expect(err?.code).toBe('EEXIST');
    expect(err?.message).toMatch(/Could not create a temporary file beside/);
    expect(readFileSync(target(), 'utf8')).toBe('keep me');
    expect(readFileSync(planted, 'utf8')).toBe('not ours');
  });

  it('a failed rename removes the temp it created and leaves the target as it was', () => {
    setup();
    // A DIRECTORY at the target name: the rename fails (EISDIR / ENOTEMPTY …).
    mkdirSync(join(target(), 'inner'), { recursive: true });
    expect(() => copyFileAtomicSync(source(), target())).toThrow();
    expect(statSync(target()).isDirectory()).toBe(true);
    expect(siblings()).toEqual(['file.md']);
  });

  it('a missing source throws before any temp is created', () => {
    mkdirSync(dir(), { recursive: true });
    expect(() =>
      copyFileAtomicSync(join(tmp.path(), 'nope.md'), target()),
    ).toThrow(/ENOENT/);
    expect(siblings()).toEqual([]);
  });
});
