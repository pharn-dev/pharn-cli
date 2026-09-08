import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// The advisory single-writer lock.
//
// Nothing serialized the four commands that write project state, and the damage
// is subtler than a torn file. Two runs in one project interleave like this: A
// backs up and overwrites F; B — which planned against the pre-A snapshot —
// overwrites F again from its own clone and persists records claiming F's hash;
// A then persists ITS records and config last, recording a hash for F that B's
// copy replaced. The store now disagrees with disk UNDER A MATCHING STAMP, which
// is precisely the state the stamp check exists to detect.
//
// The stamp cannot catch it: it only detects an interleave that SPLITS one
// process's records/config pair. Skipped and unchanged files carry plan-time
// hashes straight through to persist with no re-read of disk, so when one pair
// lands last and intact the result is a silently-wrong drift baseline — no
// crash, no warning, and `update`'s entire ability to tell "pharn wrote this"
// from "the user edited this" quietly compromised.
//
// The contract is FAIL FAST with a named refusal, never wait: no retry loop, no
// backoff. A second pharn process should tell you what is running, not queue
// behind it.
//
// Two hazards pull in opposite directions, and both are handled:
//
//   - Wedging. A holder that is SIGKILLed or loses power never releases, and a
//     lock that outlives its owner forever would make the project unusable. So a
//     STALE lock is broken.
//   - Stealing. Break too eagerly and the lock is decorative. So a lock is only
//     broken on evidence: it is malformed, it is older than STALE_MS, or its pid
//     is provably dead ON THIS HOST.
//
// Zero-cost for readers by construction: `list` and `status` never call this, so
// `status --strict` stays runnable in CI while an update holds the lock.
//
// One axis (P3): serializing project writes. Sidecar file, never a config field
// (P7). Node stdlib only.
// ---------------------------------------------------------------------------

export const LOCK_FILE = '.pharn.lock';

/**
 * How long a lock may sit before age alone justifies breaking it.
 *
 * This is a backstop for the cases process-liveness cannot answer — a holder on
 * another host, or a pid the OS has recycled. It is deliberately generous: the
 * held window is short by design (every call site acquires AFTER its last prompt
 * and after the network fetch), so a lock this old is overwhelmingly a corpse
 * rather than a slow run. Breaking a live lock is the worse error, so when the
 * two hazards trade off, age errs toward waiting.
 */
export const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

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

function lockPath(cwd: string): string {
  return safeJoin(cwd, LOCK_FILE);
}

/**
 * Parse a lock file's contents, or `null` when it is not a well-formed payload.
 *
 * The lock file is LOCAL but user-editable — untrusted input (P2), read the way
 * `readRecords` reads its store: every failure mode collapses to "not a usable
 * payload" and none of them throws. `null` means STALE, so a corrupt lock can
 * never wedge a project.
 *
 * `pid` is shape-checked here, BEFORE it can reach `process.kill` — a
 * hand-edited lock must not be able to turn `pharn` into a primitive for
 * signalling an arbitrary process.
 */
function parsePayload(raw: string): LockPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { pid, host, command, startedAt } = parsed as Record<string, unknown>;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0)
    return null;
  if (typeof host !== 'string' || host === '') return null;
  if (typeof startedAt !== 'string') return null;
  if (Number.isNaN(Date.parse(startedAt))) return null;
  return {
    pid,
    host,
    command: typeof command === 'string' ? command : 'unknown',
    startedAt,
  };
}

/** Read the lock file, or `null` when it is absent or unreadable. */
function readPayload(cwd: string): LockPayload | null {
  try {
    return parsePayload(readFileSync(lockPath(cwd), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Is the process named by `held` provably gone?
 *
 * Only answerable for a lock taken on THIS host: a pid means nothing across
 * machines, so a foreign-host lock is never broken on liveness grounds — only
 * age can retire it. `kill(pid, 0)` sends no signal; it tests existence.
 * `EPERM` means the process exists but belongs to another user, which is very
 * much alive.
 */
function isDead(held: LockPayload): boolean {
  if (held.host !== hostname()) return false;
  try {
    process.kill(held.pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function isStale(held: LockPayload | null): boolean {
  if (held === null) return true; // malformed or unreadable — never wedge on it
  if (Date.now() - Date.parse(held.startedAt) > STALE_MS) return true;
  return isDead(held);
}

function refusal(held: LockPayload | null): string {
  const who =
    held === null
      ? 'another pharn process'
      : `pharn ${held.command} (pid ${held.pid} on ${held.host}, since ${held.startedAt})`;
  return (
    `Another pharn process is writing to this project: ${who}.\n` +
    `Wait for it to finish, or delete ${LOCK_FILE} if you are sure no pharn process is running.`
  );
}

/** Create the lock file atomically, or return false when one already exists. */
function tryCreate(cwd: string, command: string): boolean {
  let fd: number;
  try {
    // 'wx' is O_CREAT | O_EXCL | O_WRONLY — atomic create-or-fail on every POSIX
    // filesystem and on Windows. The atomicity IS the lock.
    fd = openSync(lockPath(cwd), 'wx');
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
 * Release our own lock. Idempotent, never throws, and re-reads before unlinking
 * so it can never delete a lock ANOTHER process legitimately took after ours
 * was broken or vanished.
 */
function release(cwd: string): void {
  try {
    const held = readPayload(cwd);
    if (held !== null && (held.pid !== process.pid || held.host !== hostname()))
      return;
    rmSync(lockPath(cwd), { force: true });
  } catch {
    /* cleanup must never replace the real outcome */
  }
}

/**
 * Hold the project lock for the duration of `fn`.
 *
 * Acquire, run, release in a `finally`, re-throwing whatever `fn` threw. On a
 * live lock this throws `ProjectLockedError` WITHOUT running `fn` and without
 * touching the existing lock file.
 *
 * Call sites acquire AFTER their last prompt and after the network fetch, and
 * release in the same `finally` that disposes of the clone: holding across an
 * unanswered `confirm` would block an agent hook for as long as a human takes to
 * answer, and a short held window is what lets STALE_MS stay short.
 */
export async function withProjectLock<T>(
  cwd: string,
  command: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!tryCreate(cwd, command)) {
    const held = readPayload(cwd);
    if (!isStale(held)) throw new ProjectLockedError(refusal(held));
    // Break it and retry EXACTLY once. A second EEXIST means another process
    // won the race for the same stale lock — that one is live, so refuse rather
    // than loop.
    try {
      rmSync(lockPath(cwd), { force: true });
    } catch {
      throw new ProjectLockedError(refusal(held));
    }
    if (!tryCreate(cwd, command)) {
      throw new ProjectLockedError(refusal(readPayload(cwd)));
    }
  }
  try {
    return await fn();
  } finally {
    release(cwd);
  }
}
