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
// Atomic replacement of a CLI-owned JSON file — `pharn.config.json` and
// `pharn.records.json` (lib/pharn-config.ts, lib/install-records.ts). One axis
// (P3): write a whole file or leave the old one, nothing in between.
//
// Both files were written with a plain `writeFile`, so a write torn by power
// loss or SIGKILL left truncated JSON on disk. For the records store that fails
// closed (`invalid` → every update decision degrades to `unverifiable`). For the
// config it is worse: `readPharnConfig` collapses malformed JSON to `null` and
// every command then says "No pharn.config.json found. Run `pharn init` first."
// — and that re-init resets hand-edited `models`/`seam` blocks to defaults and
// stamps every capability `source: 'auto'`, destroying manual-add provenance.
// The file exists; the message says it does not.
//
// What this DOES guarantee: the target is replaced or left alone. What it does
// NOT: it makes no PAIR of files atomic (a crash between the records write and
// the config write still leaves a stamp mismatch, which `recordsBaseline`
// already reports by name), it provides NO mutual exclusion between two
// concurrent `pharn` processes (there is no lock here), and it does not `fsync`
// — durability against a power cut at the block layer is a different claim from
// never observing a torn file, and only the second is made (P0).
//
// `copyFileAtomicSync` is the same temp-then-rename replacement for a COPIED
// file, used by `pharn update`'s per-file writer (lib/apply-update.ts, F-19). A
// plain `copyFileSync` onto an existing destination opens it `O_TRUNC` and
// writes INTO its inode, so a destination that is a HARD LINK — a second name
// for a file outside the project, which no symlink walk can see — had the
// outside file overwritten. The rename swaps a new inode in under the
// destination's name; every other name for the old inode keeps its bytes.
// ---------------------------------------------------------------------------

/**
 * How many candidate temp names `writeJsonAtomic` tries before giving up. Each
 * candidate carries a fresh {@link TMP_NONCE_BYTES}-byte random nonce, so an
 * `EEXIST` on an honest run is practically unreachable; the bound exists so a
 * broken random source (or a test stubbing one) fails with a named error
 * instead of looping forever.
 */
export const TMP_CREATE_ATTEMPTS = 8;

/** Random bytes in each temp name's nonce (hex-encoded, so 2x the characters). */
export const TMP_NONCE_BYTES = 16;

/**
 * The temp path `writeJsonAtomic` writes before renaming: a SIBLING of the
 * target, in the same directory, named `<target>.<pid>.<nonce>.tmp`.
 *
 * The sibling placement is a precondition, not a style choice — `rename(2)` is
 * atomic only WITHIN a filesystem, and a cross-device rename fails `EXDEV`
 * rather than degrading to a copy. Keeping the temp beside the target is what
 * makes that unreachable, and it is also what keeps Node's `rename` able to
 * replace an existing destination on win32.
 *
 * The NONCE is what makes the name unpredictable. The target sits in the
 * user's checkout, which may be hostile: a predictable temp name
 * (`<target>.<pid>.tmp` until this was fixed) could be committed in advance as a
 * SYMLINK, and a plain `writeFile` would follow it — truncating whatever file
 * outside the project it pointed at — before the `rename` installed the link
 * over the config. The nonce is defence in depth; the actual floor is the
 * exclusive create in `writeJsonAtomic`, which refuses ANY pre-existing entry
 * at the name, a symlink included, without following it.
 *
 * The pid keeps two concurrent `pharn` processes' temps apart even if a nonce
 * repeated. That is a COLLISION property only — it is NOT mutual exclusion over
 * the target, which nothing here provides.
 */
export function tmpPathFor(target: string, nonce: string): string {
  return `${target}.${process.pid}.${nonce}.tmp`;
}

/** A fresh, unpredictable temp-name nonce. */
function freshNonce(): string {
  return randomBytes(TMP_NONCE_BYTES).toString('hex');
}

/**
 * Create a temp sibling of `target` EXCLUSIVELY and return its path and handle.
 *
 * `wx` is `O_CREAT | O_EXCL`: the open fails `EEXIST` when ANYTHING already sits
 * at the name — a regular file, a directory, a dangling or live symlink — and
 * it never follows a symlink in the last component (POSIX). That, not the
 * nonce, is what keeps a planted link from redirecting the write. On `EEXIST`
 * the next candidate gets a fresh nonce; the pre-existing entry is left exactly
 * as found (it is not ours to delete). Any other open error is thrown as is.
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
 * Copy `from` to `target` by replacement, never in place: read the source,
 * write it to an exclusively created temp sibling (`createExclusiveTempSync` —
 * the same unpredictable `<target>.<pid>.<nonce>.tmp` name and `wx` create as
 * `writeJsonAtomic`, so a link planted at a temp name is never followed), give
 * it the SOURCE's permission bits, then `rename` it over `target`.
 *
 * Bytes and mode are what `copyFileSync` produced (it, too, sets the
 * destination's mode to the source's), so no caller's assertion changes. What
 * changes is the inode: `copyFileSync` truncated and rewrote the destination's
 * own inode, so a destination hard-linked to a file outside the project
 * overwrote that file (F-19). After this, the destination's NAME points at a
 * new inode and every other link keeps the old bytes. A symlinked target is
 * replaced by a regular file, never followed — callers that must refuse a
 * symlinked destination (lib/apply-update.ts) still check before calling.
 *
 * Reads the whole source into memory: every caller copies a file from a clone
 * whose extraction is already byte-capped (lib/tar-extract.ts).
 *
 * On any failure after the temp was created it is unlinked best-effort and the
 * original error rethrown; `target` is then exactly as it was. The `chmod` is
 * best-effort for the same reason `writeJsonAtomic`'s is.
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
 * Serialize `value` to `target` atomically: create a sibling temp exclusively,
 * write it, then rename it over the target. Bytes are exactly what a plain
 * `writeFile` produced — `JSON.stringify(value, null, 2)` plus a trailing
 * newline, utf8 — so no caller's byte assertions change.
 *
 * `rename` swaps in a NEW inode, so the previous file's permission bits would
 * otherwise be discarded and replaced by whatever the umask gives (a `0600`
 * config silently becoming `0644`). When the target is an existing REGULAR file
 * its mode is copied onto the temp first. Best-effort: a `chmod` that fails
 * (win32, an exotic filesystem) must not turn a working write into a failure,
 * so the write proceeds — losing the mode is bad, losing the write is worse.
 *
 * A target that is a SYMLINK is deliberately NOT mode-preserved, and is
 * REPLACED by a regular file rather than written through. That differs from the
 * plain `writeFile` this replaced, which followed the link. It is the same
 * posture the rest of the CLI takes toward symlinks (never followed), and it
 * keeps the write inside the project root — named here rather than left to be
 * discovered. The TEMP is never followed either (see `createExclusiveTemp`).
 *
 * On any failure AFTER the temp was created, it is unlinked BEST-EFFORT and the
 * original error is rethrown. Only a temp THIS call created is ever unlinked —
 * an entry that was already at a candidate name (another process's temp, a
 * planted link) is never touched. The unlink's own error is deliberately
 * swallowed: a cleanup failure must never mask the cause. Best-effort is the
 * honest word — a SIGKILL between the create and the unlink can still leave a
 * temp behind. The guarantee is about the TARGET (replaced or untouched), not
 * about litter.
 */
export async function writeJsonAtomic(
  target: string,
  value: unknown,
): Promise<void> {
  const { tmp, handle } = await createExclusiveTemp(target);
  try {
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
