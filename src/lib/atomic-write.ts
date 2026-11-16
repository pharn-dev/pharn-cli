import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fchmodSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { chmod, lstat, open, rename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Atomic replacement of a file pharn writes in the project: the target is
// replaced whole or left alone — a torn config would read as "not installed"
// and invite a destructive re-init.
//
// NOT guaranteed: no PAIR of files is atomic (records then config), there is no
// mutual exclusion (that is lib/project-lock.ts), and there is no `fsync` —
// "never observe a torn file" is the claim, not durability against power loss.
//
// Every write goes to a fresh inode and is renamed in, never written in place,
// so a HARD-LINKED destination's other names keep their bytes
// (`copyFileAtomicSync` replaces `copyFileSync`, which wrote into the inode).
// ---------------------------------------------------------------------------

/**
 * How many candidate temp names are tried before giving up — a bound so a
 * broken random source fails with a named error instead of looping.
 */
export const TMP_CREATE_ATTEMPTS = 8;

/** Random bytes in each temp name's nonce (hex-encoded, so 2x the characters). */
export const TMP_NONCE_BYTES = 16;

/**
 * The temp path written before renaming: `<target>.<pid>.<nonce>.tmp`, a
 * SIBLING of the target because `rename(2)` is atomic only within a filesystem.
 * The nonce makes the name unpredictable in a possibly hostile checkout; the
 * real floor is the exclusive create, which refuses any pre-existing entry
 * (a planted symlink included) without following it. The pid only separates
 * concurrent processes' temps — it is not mutual exclusion.
 */
export function tmpPathFor(target: string, nonce: string): string {
  return `${target}.${process.pid}.${nonce}.tmp`;
}

/** A fresh, unpredictable temp-name nonce. */
function freshNonce(): string {
  return randomBytes(TMP_NONCE_BYTES).toString('hex');
}

/**
 * Create a temp sibling of `target` EXCLUSIVELY (`wx` = `O_CREAT | O_EXCL`:
 * fails on anything at the name and never follows a final symlink). On
 * `EEXIST` the next candidate gets a fresh nonce; the existing entry is left
 * as found.
 */
async function createExclusiveTemp(
  target: string,
): Promise<{ tmp: string; handle: FileHandle }> {
  for (let attempt = 0; attempt < TMP_CREATE_ATTEMPTS; attempt++) {
    const tmp = tmpPathFor(target, freshNonce());
    try {
      return { tmp, handle: await open(tmp, 'wx') };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw tempNamesExhausted(target);
}

/** The named EEXIST both temp creators throw once every candidate was taken. */
function tempNamesExhausted(target: string): NodeJS.ErrnoException {
  const err = new Error(
    `Could not create a temporary file beside ${target}: ${TMP_CREATE_ATTEMPTS} randomly named candidates all already existed. Nothing was written; ${target} is unchanged.`,
  ) as NodeJS.ErrnoException;
  err.code = 'EEXIST';
  return err;
}

/** The synchronous twin of `createExclusiveTemp`: same names, same `wx`. */
function createExclusiveTempSync(target: string): { tmp: string; fd: number } {
  for (let attempt = 0; attempt < TMP_CREATE_ATTEMPTS; attempt++) {
    const tmp = tmpPathFor(target, freshNonce());
    try {
      return { tmp, fd: openSync(tmp, 'wx', 0o600) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw tempNamesExhausted(target);
}

/**
 * Copy `from` to `target` by replacement, never in place: write an exclusive
 * temp sibling with the SOURCE's permission bits, then `rename` it over
 * `target`. A symlinked target is replaced, never followed (callers that must
 * refuse one check first). Reads the whole source into memory — callers copy
 * from a byte-capped clone. On failure the temp is unlinked best-effort and
 * `target` is unchanged.
 */
export function copyFileAtomicSync(from: string, target: string): void {
  const bytes = readFileSync(from);
  const mode = statSync(from).mode & 0o777;
  const { tmp, fd } = createExclusiveTempSync(target);
  try {
    try {
      writeFileSync(fd, bytes);
    } catch (err) {
      try {
        closeSync(fd);
      } catch {
        /* the write's error is the cause */
      }
      throw err;
    }
    try {
      fchmodSync(fd, mode);
    } catch {
      /* best-effort: losing the mode is bad, losing the write is worse */
    }
    closeSync(fd);
    renameSync(tmp, target);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* a cleanup failure must never mask the cause */
    }
    throw err;
  }
}

/**
 * Serialize `value` to `target` atomically as `JSON.stringify(value, null, 2)`
 * plus a trailing newline (see `writeFileAtomic`).
 */
export async function writeJsonAtomic(
  target: string,
  value: unknown,
): Promise<void> {
  await writeFileAtomic(target, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Write `data` to `target` atomically (a string as utf8, a Buffer byte for
 * byte): exclusive temp, then `rename`. An existing REGULAR file's mode is
 * copied onto the temp (best-effort — losing the mode beats losing the write);
 * a NEW target gets the umask's mode. A symlinked target is replaced by a
 * regular file, never written through. On failure only a temp THIS call
 * created is unlinked, best-effort (a SIGKILL can still leave one behind).
 */
export async function writeFileAtomic(
  target: string,
  data: string | Buffer,
): Promise<void> {
  const { tmp, handle } = await createExclusiveTemp(target);
  try {
    try {
      if (typeof data === 'string') await handle.writeFile(data, 'utf8');
      else await handle.writeFile(data);
    } catch (err) {
      // The write's error is the cause; a close error here must not mask it.
      await handle.close().catch(() => {});
      throw err;
    }
    await handle.close();
    const prev = await lstat(target).catch(() => null);
    if (prev?.isFile()) await chmod(tmp, prev.mode & 0o777).catch(() => {});
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
