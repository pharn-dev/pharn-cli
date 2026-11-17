import { randomBytes } from 'node:crypto';
import {
  closeSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { hostname, uptime } from 'node:os';
import { readBoundedFile } from './bounded-read.js';
import { onFatalSignal } from './fatal-signal.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// The advisory single-writer lock for the commands that write project state.
//
// Why: two interleaved runs can each persist records claiming a hash for a file
// the other one replaced, leaving `pharn.records.json` silently wrong under a
// matching stamp. Only serializing the writers prevents it.
//
// Contract: FAIL FAST with a named refusal — no retry loop, no backoff. A STALE
// lock is broken (a SIGKILLed holder cannot wedge the project), only on
// evidence: unparseable or future-dated (FUTURE_SKEW_MS) and older than
// MALFORMED_GRACE_MS; from ANOTHER host and older than STALE_MS; or from THIS
// host with a dead pid or a `startedAt` before the last boot. Age never breaks
// a live holder on this host: a prompt held under the lock may sit for hours.
//
// Named residuals:
//   - PID RECYCLING: a dead run's pid reused by another process reads as live
//     until the next reboot or a manual delete. Errs toward refusing.
//   - CLOCK STEPS: a large forward step after boot can make a live lock look
//     pre-boot; a backward step past FUTURE_SKEW_MS makes it look future-dated.
//   - HOSTNAME CHANGE: the holder's own lock looks foreign — breakable after
//     STALE_MS, and left in place by `release`.
//   - STRANDED CORPSE: a SIGKILL between the break's rename and its cleanup
//     leaves `pharn/.lock.<pid>.<hex>`. Nothing deletes a name this call did
//     not create, so it stays until the user removes it; it is never read.
//
// Readers (`list`, `status`) never take it. Sidecar file, never a config field.
// ---------------------------------------------------------------------------

/** The directory the lock lives in: `pharn/`, for every layout. */
export const LOCK_DIR = 'pharn';
/** The lock file, project-relative. */
export const LOCK_FILE = `${LOCK_DIR}/.lock`;

/** How old a lock FROM ANOTHER HOST must be before age alone breaks it. */
export const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * How long an unparseable lock is presumed LIVE: `tryCreate` writes the payload
 * after the O_EXCL create, so a live lock is briefly empty.
 */
export const MALFORMED_GRACE_MS = 10 * 1000;

/**
 * How far ahead a `startedAt` may be before it is judged like a malformed lock
 * (else a future date with a live, recycled pid would never age out). The
 * allowance is for clock disagreement between hosts.
 */
export const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Raised when another pharn process holds the lock. Exit 1, with a named reason. */
export class ProjectLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectLockedError';
  }
}

interface LockPayload {
  pid: number;
  host: string;
  command: string;
  startedAt: string;
}

/**
 * A well-formed payload, or `null`. The file is user-editable, so nothing here
 * throws, and `pid` is shape-checked before it can reach `process.kill`.
 */
function parsePayload(raw: string | null): LockPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? '');
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { pid, host, command, startedAt } = parsed as Record<string, unknown>;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0)
    return null;
  if (typeof host !== 'string' || host === '') return null;
  if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt)))
    return null;
  const cmd = typeof command === 'string' ? command : 'unknown';
  return { pid, host, command: cmd, startedAt };
}

/** Raw bytes, or `null`. Bounded and non-blocking: a FIFO never hangs open(2). */
function readRaw(path: string): string | null {
  const read = readBoundedFile(path);
  return read.kind === 'ok' ? read.bytes.toString('utf8') : null;
}

/** `f()`, or `null` when it throws: for probes whose failure is an answer. */
function orNull<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}

/** Last boot in epoch ms, or `null` (skip the boot check) unless uptime > 0. */
function bootMs(): number | null {
  const up = orNull(uptime) ?? 0;
  return Number.isFinite(up) && up > 0 ? Date.now() - up * 1000 : null;
}

function isStale(held: LockPayload | null, ageMs: number | null): boolean {
  // Malformed, unreadable or future-dated: young → a holder mid-tryCreate. The
  // future check is here, not in parsePayload, so release() still knows its
  // own lock after a backward clock step.
  const started = held === null ? 0 : Date.parse(held.startedAt);
  if (held === null || started - Date.now() > FUTURE_SKEW_MS)
    return ageMs === null || ageMs >= MALFORMED_GRACE_MS;
  // Another host: a pid means nothing there, so age is the only evidence.
  if (held.host !== hostname()) return Date.now() - started > STALE_MS;
  // Started before the last boot: no running process holds it. The margin
  // errs toward refusing.
  const boot = bootMs();
  if (boot !== null && started < boot - FUTURE_SKEW_MS) return true;
  // Otherwise liveness alone decides; EPERM means alive, another user's.
  try {
    process.kill(held.pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function refusal(held: LockPayload | null): string {
  const who =
    held === null
      ? 'another pharn process'
      : `pharn ${held.command} (pid ${held.pid} on ${held.host}, since ${held.startedAt})`;
  // Every writer holds the lock across its prompts, so the holder may be idle
  // at one. Static wording: the payload records no prompt state.
  return `Another pharn process is writing to this project: ${who}. It may be waiting for input in another terminal.\nWait for it to finish, or delete ${LOCK_FILE} if you are sure no pharn process is running.`;
}

const locked = (lock: string): ProjectLockedError =>
  new ProjectLockedError(refusal(parsePayload(readRaw(lock))));

/** Create the lock atomically, or return false when one already exists. */
function tryCreate(lock: string, command: string): boolean {
  let fd: number;
  try {
    // 'wx' = O_CREAT | O_EXCL: atomic create-or-fail. The atomicity IS the lock.
    fd = openSync(lock, 'wx');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
  try {
    const payload: LockPayload = {
      pid: process.pid,
      host: hostname(),
      command,
      startedAt: new Date().toISOString(),
    };
    writeSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Break a lock judged stale and take it, or throw the refusal. Ordered so a
 * breaker never deletes another breaker's fresh lock:
 *   1. `rename(lock → corpse)`: of two breakers exactly one moves the file. It
 *      elects who breaks; it confers no ownership.
 *   2. Re-verify the moved bytes against the bytes judged stale: the winner may
 *      have moved a lock another breaker had just created. If so, `link(2)` it
 *      back (create-or-fail, so it never clobbers a lock taken in the gap).
 *   3. `tryCreate`: O_EXCL alone confers the lock, so a loser refuses.
 * Residuals: two live payloads are assumed never byte-identical, and
 * `null === null` passes (refusing what cannot be read would reinstate the
 * wedge). A restore that fails (name taken, no hard links on FAT) drops the
 * corpse while its owner believes it holds the lock.
 */
function breakStaleLock(
  lock: string,
  command: string,
  observed: string | null,
): void {
  const corpse = `${lock}.${process.pid}.${randomBytes(4).toString('hex')}`;
  try {
    renameSync(lock, corpse);
  } catch {
    throw locked(lock); // another breaker moved it first, or we cannot: never loop
  }
  try {
    if (readRaw(corpse) !== observed) {
      try {
        linkSync(corpse, lock);
      } catch {
        /* the named residual above */
      }
      throw locked(lock);
    }
    if (!tryCreate(lock, command)) throw locked(lock);
  } finally {
    // Never recursive: a directory raced in at the lock path is moved aside,
    // never deleted. Tidying must never replace the real outcome.
    try {
      rmSync(corpse, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Take the lock, breaking a stale one, or throw the refusal. */
function acquire(lock: string, command: string): void {
  if (tryCreate(lock, command)) return;
  // pharn never creates a directory here, so one is the user's and must not be
  // moved aside. lstat: a symlink to a directory is judged as a payload; an
  // unreadable path too.
  if (orNull(() => lstatSync(lock).isDirectory()) === true)
    throw new ProjectLockedError(
      `${LOCK_FILE} is a directory, not a pharn lock file. pharn will not move or delete it, and cannot take the project lock while it is there.\nRemove it yourself (or rename it) and re-run.`,
    );
  // Read the bytes ONCE: the judgement and the break's re-verify must be about
  // the same payload.
  const observed = readRaw(lock);
  const held = parsePayload(observed);
  const mtime = orNull(() => statSync(lock).mtimeMs);
  if (!isStale(held, mtime === null ? null : Date.now() - mtime))
    throw new ProjectLockedError(refusal(held));
  breakStaleLock(lock, command, observed);
}

/**
 * Release our own lock. Idempotent, never throws; unlinks only a payload that
 * names this pid on this host (an unparseable one is another run's, mid-create).
 * Residual: a lock broken and re-taken between the read and the unlink goes.
 */
function release(lock: string): void {
  try {
    const held = parsePayload(readRaw(lock));
    if (held?.pid === process.pid && held.host === hostname())
      rmSync(lock, { force: true });
  } catch {
    /* cleanup must never replace the real outcome */
  }
}

/**
 * Make sure `pharn/` is a real directory; true when this call created it. A
 * symlink is refused (every later write would land where it points), as is a
 * non-directory. EEXIST from a concurrent creator is success once it checks out.
 */
function ensureLockDir(cwd: string): boolean {
  const dir = safeJoin(cwd, LOCK_DIR);
  const check = (): boolean => {
    if (findSymlinkComponent(cwd, LOCK_DIR) !== null)
      throw new ProjectLockedError(
        `${LOCK_DIR} is a symbolic link. pharn keeps its lock, backups and install under ${LOCK_DIR}/ and will not write through a link that may point outside the project.\nReplace it with a real directory and re-run.`,
      );
    const stat = lstatSync(dir, { throwIfNoEntry: false });
    if (stat !== undefined && !stat.isDirectory())
      throw new ProjectLockedError(
        `${LOCK_DIR} exists and is not a directory. pharn keeps its lock, backups and install under ${LOCK_DIR}/.\nMove it out of the way and re-run.`,
      );
    return stat !== undefined;
  };
  if (check()) return false;
  try {
    mkdirSync(dir);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    check();
    return false;
  }
}

/** Remove `pharn/` when empty: non-recursive, so the kernel refuses otherwise. */
function removeLockDirIfEmpty(cwd: string): void {
  try {
    rmdirSync(safeJoin(cwd, LOCK_DIR));
  } catch {
    /* not empty, already gone, or not ours to judge */
  }
}

/** The one honest line an interrupted writer prints. Never throws. */
function sayInterrupted(command: string): void {
  try {
    process.stderr.write(
      `pharn ${command} was interrupted while writing to this project — it may be partially updated. Re-run \`pharn ${command}\`.\n`,
    );
  } catch {
    /* the exit status already tells the truth */
  }
}

/**
 * Hold the project lock for the duration of `fn`; release in a `finally`. On a
 * live lock this throws `ProjectLockedError` without running `fn` and without
 * touching the existing lock file.
 *
 * Rule for callers: take it FIRST, before the config is read or the network
 * touched, and hold it across the fetch, the plan, every prompt and the writes.
 */
export async function withProjectLock<T>(
  cwd: string,
  command: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const lock = safeJoin(cwd, LOCK_FILE);
  // Remembered so release removes a pharn/ THIS call created, if still empty.
  let created = ensureLockDir(cwd);
  try {
    try {
      acquire(lock, command);
    } catch (err) {
      // Another run removed its empty pharn/ between our check and our create.
      // Not contention: make it once more and retry once.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      created = ensureLockDir(cwd) || created;
      acquire(lock, command);
    }
  } catch (err) {
    if (created) removeLockDirIfEmpty(cwd);
    throw err;
  }
  const tidy = (): void => {
    release(lock);
    if (created) removeLockDirIfEmpty(cwd);
  };
  // `finally` does not run on `process.exit`; an `exit` listener does. The
  // exit(0) that reaches here is clack's Ctrl-C during a spinner (pharn itself
  // never exits mid-command), so release and turn the 0 into 130.
  const onExit = (code: number): void => {
    tidy();
    if (code === 0) {
      process.exitCode = 130;
      sayInterrupted(command);
    }
  };
  process.on('exit', onExit);
  // A real signal emits no `exit`; fatal-signal.ts runs this, then re-raises.
  const offSignal = onFatalSignal(() => {
    tidy();
    sayInterrupted(command);
  });
  try {
    return await fn();
  } finally {
    offSignal();
    process.off('exit', onExit);
    tidy();
  }
}
