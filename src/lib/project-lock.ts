import { randomBytes } from 'node:crypto';
import {
  closeSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
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
// matching stamp — and `update` then misreads user edits as pharn's bytes (or
// the reverse). No crash, no warning; only serializing the writers prevents it.
//
// Contract: FAIL FAST with a named refusal — no retry loop, no backoff.
//
// A STALE lock is broken (so a SIGKILLed holder cannot wedge the project), but
// only on evidence: malformed (or `startedAt` more than FUTURE_SKEW_MS ahead)
// and older than MALFORMED_GRACE_MS; from ANOTHER host and older than STALE_MS;
// or from THIS host with a provably dead pid or a `startedAt` before the last
// boot. Age never breaks a live holder on this host — a prompt held under the
// lock may sit as long as a human takes.
//
// Named residuals:
//   - PID RECYCLING: a dead run's pid reused by another process reads as live
//     until the next reboot or a manual delete of `pharn/.lock`. Errs toward
//     refusing, never stealing.
//   - CLOCK STEPS: a large forward step after boot can make a live lock look
//     pre-boot (broken); a backward step of more than FUTURE_SKEW_MS makes it
//     look future-dated (broken after MALFORMED_GRACE_MS).
//   - HOSTNAME CHANGE: a hostname that changes mid-run makes the holder's own
//     lock look foreign — breakable by STALE_MS, and left in place by `release`.
//
// Readers (`list`, `status`) never take it, so `status --strict` stays runnable
// while an update holds the lock. Sidecar file, never a config field.
// ---------------------------------------------------------------------------

/**
 * The directory the lock lives in — `pharn/` for EVERY layout, so there is one
 * place a writer looks (a flat-layout project gets `pharn/` only while it holds
 * something; see `withProjectLock`).
 */
export const LOCK_DIR = 'pharn';
/** The lock file, project-relative. */
export const LOCK_FILE = `${LOCK_DIR}/.lock`;
const LOCK_NAME = '.lock';

/**
 * The root lock file pharn 0.13.0 and older take. Kept for ONE release: a LIVE
 * one refuses this run, a STALE one is broken by the same rules. Remove with
 * LEGACY_CORPSE_RE once no supported CLI writes it.
 */
export const LEGACY_LOCK_FILE = '.pharn.lock';

/**
 * A broken lock's corpse name, `.lock.<pid>.<8 hex>` (see `breakStaleLock`).
 * The random half keeps corpses from colliding across hosts on a shared
 * filesystem. The regex is the sweep's allowlist: the only names this file may
 * unlink are ones it can prove it wrote.
 */
const CORPSE_RE = /^\.lock\.[0-9]+\.[0-9a-f]{8}$/;
// The legacy root lock's corpses, swept only when a stale legacy lock is broken.
const LEGACY_CORPSE_RE = /^\.pharn\.lock\.[0-9]+\.[0-9a-f]{8}$/;

/**
 * Where a lock lives. Two sites exist — current and legacy root — and every
 * function below takes the site, so both are judged by ONE set of rules.
 */
interface LockSite {
  dir: string;
  name: string;
  corpseRe: RegExp;
  display: string;
}

function currentSite(cwd: string): LockSite {
  return {
    dir: safeJoin(cwd, LOCK_DIR),
    name: LOCK_NAME,
    corpseRe: CORPSE_RE,
    display: LOCK_FILE,
  };
}

function legacySite(cwd: string): LockSite {
  return {
    dir: cwd,
    name: LEGACY_LOCK_FILE,
    corpseRe: LEGACY_CORPSE_RE,
    display: LEGACY_LOCK_FILE,
  };
}

/**
 * How long a lock FROM ANOTHER HOST may sit before age alone justifies breaking
 * it — a pid means nothing across machines, so age is the only evidence.
 * Generous because bare `pharn add` holds the lock across its multi-select;
 * breaking a live lock is the worse error. Also the corpse sweep's age rule.
 */
export const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * How long an unparseable lock file is presumed LIVE: `tryCreate` writes its
 * payload after the O_EXCL create, so a live lock is briefly empty. Older than
 * this, a corrupt lock is stale, so it cannot wedge the project.
 */
export const MALFORMED_GRACE_MS = 10 * 1000;

/**
 * How far in the future a lock's `startedAt` may be before it is judged like a
 * malformed lock. Without it a future `startedAt` could never age out and, with
 * a live (e.g. recycled) pid, would wedge the project. The allowance is for
 * clock disagreement between hosts. Residual: a host whose clock runs more than
 * this far ahead writes locks that may be broken while its run is still live.
 */
export const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Raised when another pharn process holds the lock. Exit 1, with a named reason. */
export class ProjectLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectLockedError';
  }
}

/**
 * Raised under the lock when the project state a command planned against has
 * changed since it was read. A subclass so every `ProjectLockedError` catch
 * site reports it the same way: a named refusal, exit 1, nothing written.
 */
export class ProjectChangedError extends ProjectLockedError {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectChangedError';
  }
}

interface LockPayload {
  pid: number;
  host: string;
  command: string;
  startedAt: string;
}

function lockPath(site: LockSite): string {
  return safeJoin(site.dir, site.name);
}

/**
 * Parse a lock file's contents, or `null` when it is not a well-formed payload.
 * The file is user-editable, so nothing here throws. `pid` is shape-checked
 * BEFORE it can reach `process.kill`, so a hand-edited lock cannot make pharn
 * signal an arbitrary process.
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

/**
 * A file's raw bytes, or `null` when they cannot be read. The break path needs
 * the BYTES to prove the file it moved is the file it judged.
 */
function readRawAt(path: string): string | null {
  // Bounded and non-blocking: a FIFO at the lock path reads as unreadable
  // instead of hanging every writer in open(2).
  const read = readBoundedFile(path);
  return read.kind === 'ok' ? read.bytes.toString('utf8') : null;
}

/** Read the lock file, or `null` when it is absent or unreadable. */
function readPayload(site: LockSite): LockPayload | null {
  const raw = readRawAt(lockPath(site));
  return raw === null ? null : parsePayload(raw);
}

/**
 * Is the process named by `held` provably gone? Only answerable for a lock
 * taken on THIS host (the host check keeps a foreign pid from ever being
 * probed). `kill(pid, 0)` tests existence; `EPERM` means alive, another user's.
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

/** The lock file's age in ms, or `null` when it cannot be stat'ed. */
function lockAgeMs(site: LockSite): number | null {
  try {
    return Date.now() - statSync(lockPath(site)).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * When this host last booted, in epoch ms — or `null` unless `os.uptime()` is a
 * finite number above 0. With an uptime of 0 every lock would read as pre-boot
 * and a live one would be broken; `null` skips the boot check (the refusing
 * side).
 */
function bootMs(): number | null {
  let up: number;
  try {
    up = uptime();
  } catch {
    return null;
  }
  return Number.isFinite(up) && up > 0 ? Date.now() - up * 1000 : null;
}

function isStale(held: LockPayload | null, ageMs: number | null): boolean {
  // Malformed, unreadable or future-dated: young → presumed a holder
  // mid-tryCreate; old or not stat-able → stale. The future check lives here,
  // not in parsePayload, so release() can still recognise its own lock after a
  // backward clock step.
  const started = held === null ? 0 : Date.parse(held.startedAt);
  if (held === null || started - Date.now() > FUTURE_SKEW_MS)
    return ageMs === null || ageMs >= MALFORMED_GRACE_MS;
  // Another host: age is the only evidence.
  if (held.host !== hostname()) return Date.now() - started > STALE_MS;
  // This host: a lock started before the last boot cannot be held by a running
  // process, whatever its pid now names. The margin errs toward refusing.
  const boot = bootMs();
  if (boot !== null && started < boot - FUTURE_SKEW_MS) return true;
  // Otherwise liveness alone decides, whatever the age.
  return isDead(held);
}

/**
 * The refusal for a directory at the lock path, or null when there is none
 * (anything else there is judged by the payload rules). pharn never creates a
 * directory there, so one is the user's and must not be moved aside. lstat, so
 * a symlink to a directory is not followed (the break moves only the link).
 */
function directoryRefusal(site: LockSite): string | null {
  try {
    if (!lstatSync(lockPath(site)).isDirectory()) return null;
  } catch {
    return null;
  }
  return (
    `${site.display} is a directory, not a pharn lock file. pharn will not move or delete it, and cannot take the project lock while it is there.\n` +
    'Remove it yourself (or rename it) and re-run.'
  );
}

function refusal(held: LockPayload | null, site: LockSite): string {
  const who =
    held === null
      ? 'another pharn process'
      : `pharn ${held.command} (pid ${held.pid} on ${held.host}, since ${held.startedAt})`;
  return (
    `Another pharn process is writing to this project: ${who}.\n` +
    `Wait for it to finish, or delete ${site.display} if you are sure no pharn process is running.`
  );
}

/** Create the lock file atomically, or return false when one already exists. */
function tryCreate(site: LockSite, command: string): boolean {
  let fd: number;
  try {
    // 'wx' = O_CREAT | O_EXCL: atomic create-or-fail. The atomicity IS the lock.
    fd = openSync(lockPath(site), 'wx');
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
 * Reap corpses a killed run left behind (a SIGKILL between `breakStaleLock`'s
 * rename and its `finally`). ADVISORY: runs only on the break path, and a
 * project can hold a stranded corpse until a later break runs.
 *
 * Bounded, since this deletes what it did not just create: only names matching
 * the site's corpse regex (a user file named like a corpse WOULD go — the
 * accepted cost), only past STALE_MS (a young corpse may be a racing breaker
 * mid-verify), only on the break path (the uncontended acquire stays cheap).
 * `rmSync` removes a corpse-named symlink, never its target. Every failure is
 * swallowed: tidying may not replace the acquire's outcome.
 */
function sweepCorpses(site: LockSite): void {
  let names: string[];
  try {
    names = readdirSync(site.dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!site.corpseRe.test(name)) continue;
    try {
      const corpse = safeJoin(site.dir, name);
      if (Date.now() - statSync(corpse).mtimeMs > STALE_MS)
        rmSync(corpse, { force: true });
    } catch {
      /* one unreadable entry must not abort the sweep */
    }
  }
}

/**
 * Break a lock already judged stale, and take it — or throw the refusal.
 *
 * Three ordered steps, so a breaker can never delete another breaker's fresh,
 * live lock:
 *   1. `rename(lock → corpse)` — atomic, so of two breakers exactly one moves
 *      the file. This elects who breaks; it confers no ownership.
 *   2. Re-verify the moved bytes against the bytes judged stale — the winner of
 *      step 1 may have moved a lock another breaker had just created.
 *   3. `tryCreate` — O_EXCL is the only thing that confers the lock, which is
 *      why a loser refuses instead of retrying.
 *
 * Residuals of step 2: it assumes two live payloads are never byte-identical
 * (same host, pid and millisecond across containers would defeat it), and
 * `null === null` passes, so an unreadable lock replaced by another unreadable
 * one slips through — kept, since refusing to break what cannot be read would
 * reinstate the wedge.
 */
function breakStaleLock(
  site: LockSite,
  command: string,
  observedRaw: string | null,
  take: boolean,
): void {
  const corpse = safeJoin(
    site.dir,
    `${site.name}.${process.pid}.${randomBytes(4).toString('hex')}`,
  );
  try {
    // Residual: `rename` silently replaces a FILE already at the corpse name
    // (our pid + 32 random bits, so ~1 in 4.3e9) — a strict subset of what the
    // sweep already accepts. Do NOT make the destination create-or-fail and
    // treat THAT as the single-winner step: racers draw different names, so
    // both would win. Only `rename`'s source-unlink elects one winner.
    renameSync(lockPath(site), corpse);
  } catch {
    // Another breaker moved it first, or we cannot move it: either way we do
    // not hold the lock, so refuse. Never loop.
    throw new ProjectLockedError(refusal(readPayload(site), site));
  }
  try {
    if (readRawAt(corpse) !== observedRaw) {
      // We moved a lock we had no right to move: put it back. `link(2)` is
      // create-or-fail, so the restore never clobbers a lock taken in the gap.
      try {
        linkSync(corpse, lockPath(site));
      } catch {
        // Residual: name occupied, or no hard links (FAT/exFAT). The corpse is
        // dropped below while its owner believes it still holds the lock.
      }
      throw new ProjectLockedError(refusal(readPayload(site), site));
    }
    // The legacy root lock is only ever broken, never taken.
    if (take && !tryCreate(site, command))
      throw new ProjectLockedError(refusal(readPayload(site), site));
    sweepCorpses(site);
  } finally {
    // Drop our corpse on every in-process path (after a restore, the inode
    // still has the lock-path name). Never recursive: a directory raced in at
    // the lock path is moved aside, never deleted.
    try {
      rmSync(corpse, { force: true });
    } catch {
      /* tidying must never replace the real outcome */
    }
  }
}

/**
 * Release our own lock. Idempotent, never throws; unlinks only a payload that
 * parses AND names this pid on this host, so it never deletes another run's
 * lock. An unparseable file can only be another run's (between its create and
 * its write), so it is left for the grace rule. Residual: a lock broken and
 * re-taken between the read and the unlink is still deleted.
 */
function release(site: LockSite): void {
  try {
    const held = readPayload(site);
    if (held === null || held.pid !== process.pid || held.host !== hostname())
      return;
    rmSync(lockPath(site), { force: true });
  } catch {
    /* cleanup must never replace the real outcome */
  }
}

/**
 * Hold the project lock for the duration of `fn`; release in a `finally`. On a
 * live lock this throws `ProjectLockedError` without running `fn` and without
 * touching the existing lock file.
 *
 * Rule for callers: bounded work (a fetch) may be held across, a prompt may not
 * — it would block other writers for as long as a human takes. `add`'s picker
 * is the deliberate exception: its loop persists on every pick, so one lock
 * spans the selection (safe, since age never breaks a live same-host holder).
 */
export async function withProjectLock<T>(
  cwd: string,
  command: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const site = currentSite(cwd);
  // Remembered so release removes a pharn/ THIS call created, if still empty.
  let created = ensureLockDir(cwd);
  const tidy = (): void => {
    release(site);
    if (created) removeLockDirIfEmpty(cwd);
  };
  try {
    try {
      acquire(site, command);
    } catch (err) {
      // Another run removed its empty pharn/ between our check and our create.
      // Not contention: make it once more and retry once.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      created = ensureLockDir(cwd) || created;
      acquire(site, command);
    }
  } catch (err) {
    if (created) removeLockDirIfEmpty(cwd);
    throw err;
  }
  try {
    checkLegacyLock(cwd);
  } catch (err) {
    tidy();
    throw err;
  }
  // `finally` does not run on `process.exit`; an `exit` listener does. The
  // exit(0) that reaches here is clack's Ctrl-C during a spinner (raw stdin) —
  // pharn itself never exits mid-command — so release synchronously and turn
  // the 0 into 130 with one honest line.
  const onExit = (code: number): void => {
    tidy();
    if (code === 0) {
      process.exitCode = 130;
      sayInterrupted(command);
    }
  };
  process.on('exit', onExit);
  // A real signal (SIGINT, SIGTERM) emits no `exit`, so neither the listener
  // nor the `finally` runs; fatal-signal.ts runs this first, then re-raises.
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

/** Take the lock at `site`, breaking a stale one — or throw the refusal. */
function acquire(site: LockSite, command: string): void {
  if (tryCreate(site, command)) return;
  const dirRefusal = directoryRefusal(site);
  if (dirRefusal !== null) throw new ProjectLockedError(dirRefusal);
  // Read the bytes ONCE: the staleness judgement and the break's re-verify
  // must be about the SAME payload.
  const observedRaw = readRawAt(lockPath(site));
  const held = observedRaw === null ? null : parsePayload(observedRaw);
  if (!isStale(held, lockAgeMs(site)))
    throw new ProjectLockedError(refusal(held, site));
  breakStaleLock(site, command, observedRaw, true);
}

/**
 * Make sure `pharn/` is a real directory; true when this call created it.
 * Refused when `pharn` is a symlink (every later write would land wherever it
 * points) or not a directory. EEXIST from a concurrent creator is success once
 * the directory checks out.
 */
function ensureLockDir(cwd: string): boolean {
  const check = (): boolean => {
    if (findSymlinkComponent(cwd, LOCK_DIR) !== null) {
      throw new ProjectLockedError(
        `${LOCK_DIR} is a symbolic link. pharn keeps its lock, backups and install under ${LOCK_DIR}/ and will not write through a link that may point outside the project.
` + `Replace it with a real directory and re-run.`,
      );
    }
    const stat = lstatSync(safeJoin(cwd, LOCK_DIR), { throwIfNoEntry: false });
    if (stat !== undefined && !stat.isDirectory()) {
      throw new ProjectLockedError(
        `${LOCK_DIR} exists and is not a directory. pharn keeps its lock, backups and install under ${LOCK_DIR}/.
` + `Move it out of the way and re-run.`,
      );
    }
    return stat !== undefined;
  };
  if (check()) return false;
  try {
    mkdirSync(safeJoin(cwd, LOCK_DIR));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    check();
    return false;
  }
}

/**
 * Remove `pharn/` when empty (non-recursive `rmdirSync`: the kernel refuses a
 * directory that holds anything). Never replaces the run's real outcome.
 */
function removeLockDirIfEmpty(cwd: string): void {
  try {
    rmdirSync(safeJoin(cwd, LOCK_DIR));
  } catch {
    /* not empty, already gone, or not ours to judge */
  }
}

/**
 * The one-release check of the legacy ROOT lock, run while holding
 * `pharn/.lock`: absent or a directory → nothing; LIVE → refuse; STALE →
 * broken like a current lock, never re-created. Residual: an old CLI does not
 * know `pharn/.lock`, so it is not refused by this run's lock.
 */
function checkLegacyLock(cwd: string): void {
  const legacy = legacySite(cwd);
  let stat;
  try {
    stat = lstatSync(lockPath(legacy), { throwIfNoEntry: false });
  } catch {
    return;
  }
  if (stat === undefined || stat.isDirectory()) return;
  const observedRaw = readRawAt(lockPath(legacy));
  const held = observedRaw === null ? null : parsePayload(observedRaw);
  if (!isStale(held, lockAgeMs(legacy)))
    throw new ProjectLockedError(refusal(held, legacy));
  breakStaleLock(legacy, 'legacy', observedRaw, false);
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
