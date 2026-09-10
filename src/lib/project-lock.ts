import { randomBytes } from 'node:crypto';
import {
  closeSync,
  linkSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
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
 * A broken lock's corpse: `.pharn.lock.<pid>.<8 hex>`, the name `breakStaleLock`
 * renames a stale lock to before it verifies and replaces it.
 *
 * The random half matters. A name fixed per pid would collide across hosts on a
 * shared filesystem (pids are only unique per machine), and a colliding corpse is
 * one breaker overwriting the bytes another is about to verify — reintroducing at
 * the corpse exactly the unchecked overwrite this whole file exists to remove.
 *
 * The regex is the sweep's allowlist, and it is deliberately tighter than the
 * prefix: `readdirSync` returns the user's own filenames, and the only names this
 * file may ever unlink are ones it can prove it wrote.
 */
const CORPSE_RE = /^\.pharn\.lock\.[0-9]+\.[0-9a-f]{8}$/;

/**
 * How long a lock may sit before age alone justifies breaking it.
 *
 * This is a backstop for the cases process-liveness cannot answer — a holder on
 * another host, or a pid the OS has recycled. It is deliberately generous
 * because not every held window is bounded: `pharn init` holds the lock across
 * both of its prompts and bare `pharn add` holds it across its multi-select, so
 * a lock a few minutes old may well be a human still reading (see
 * `withProjectLock` for where each command acquires, and why). Six hours is far
 * past any plausible prompt and still far short of "forever". Breaking a live
 * lock is the worse error, so when the two hazards trade off, age errs toward
 * waiting.
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

/**
 * A file's raw bytes, or `null` when they cannot be read.
 *
 * Separate from `readPayload` because the break path needs the BYTES, not the
 * parsed object: what it has to prove is that the file it moved is the file it
 * judged, and only the raw text can carry that. Collapsing every read failure to
 * `null` is the same never-wedge rule `parsePayload` follows.
 */
function readRawAt(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Read the lock file, or `null` when it is absent or unreadable. */
function readPayload(cwd: string): LockPayload | null {
  const raw = readRawAt(lockPath(cwd));
  return raw === null ? null : parsePayload(raw);
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
 * Reap corpses a killed run left behind.
 *
 * `breakStaleLock`'s `finally` covers every in-process exit, so the only way to
 * strand a corpse is a SIGKILL or a power cut in the two syscalls between the
 * rename and the tidy. Rare — but "rare" accumulates, and a growing pile of
 * `.pharn.lock.*` files in someone's project root is a bad way to pay for a lock
 * they never see. So a successful break also sweeps.
 *
 * ADVISORY, not a guarantee, and the distinction is not pedantic: this runs only
 * on the break path, only past STALE_MS, and swallows every failure it meets, so
 * a project CAN hold a stranded corpse indefinitely if no later break ever runs.
 * What is structural is the `finally` below — that covers every in-process path.
 * This only reaps what a killed process left.
 *
 * Three bounds, because this is the one place this file DELETES something it did
 * not just create:
 *
 *   - Only names matching CORPSE_RE. `readdirSync` hands back the user's own
 *     filenames, so the regex is an allowlist, not a filter — a file the user
 *     happens to have named `.pharn.lock.<digits>.<8 hex>` WOULD be removed, and
 *     that is the deliberate (and remote) cost of sweeping at all.
 *   - Only past STALE_MS. A corpse seconds old may belong to a breaker racing us
 *     right now, mid-verify. STALE_MS is already this file's age-of-death.
 *   - Only on the break path. The uncontended acquire stays two syscalls; nobody
 *     pays a directory listing for a lock that was never contended.
 *
 * `statSync` follows symlinks, so a corpse-named symlink is aged by its target —
 * but `rmSync` then removes only the LINK, never what it points at. Every step
 * swallows its own failure: tidying may not replace the outcome of the acquire
 * it runs inside.
 */
function sweepCorpses(cwd: string): void {
  let names: string[];
  try {
    names = readdirSync(cwd);
  } catch {
    return;
  }
  for (const name of names) {
    if (!CORPSE_RE.test(name)) continue;
    try {
      const corpse = safeJoin(cwd, name);
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
 * The old shape was `rmSync(lock, { force: true })` then `tryCreate`, and the
 * delete never re-checked what it was deleting. Two processes could each judge
 * the same corpse stale, and the second one's delete would land on the FIRST
 * one's freshly-created, live lock:
 *
 *     B: rm → B: create (B holds) → C: rm (B's LIVE lock) → C: create (C holds too)
 *
 * Two holders, from the one path in this file that did not verify. So the break
 * is now three ordered steps, and it matters which of them linearizes what:
 *
 *   1. `rename(lock → corpse)`. `rename(2)` unlinks the source and links the
 *      destination in ONE step, so of two processes renaming the same source
 *      exactly one succeeds and the other gets ENOENT. This is the linearization
 *      point OF THE BREAK — who gets to take this particular file out of the
 *      canonical name. It confers nothing else.
 *   2. Re-verify. The rename hands the file to one process but does NOT promise
 *      it is the file that was judged: a breaker that won step 1 an instant
 *      earlier may already have created its own LIVE lock, and that is what this
 *      rename moved. Byte-equality against the bytes read before the judgement is
 *      what turns "I moved a file" into "I moved the file I judged".
 *   3. `tryCreate`. Unchanged, and still the linearization point OF OWNERSHIP —
 *      O_EXCL is the only thing in this file that confers the lock. The rename
 *      does not; that separation is why a loser refuses instead of retrying.
 *
 * Four residuals, named rather than implied (P0). Two are properties of step 2
 * and are listed here; the other two sit at the calls they are about — the
 * rename's clobbering destination, and the restoring `link` that can lose:
 *
 *   - Step 2 rests on two live payloads never being byte-identical. On one host
 *     that is exact (distinct pids); across hosts it rests on distinct hostnames.
 *     Two containers sharing a volume AND a hostname AND a pid AND a millisecond
 *     would defeat it. ADVISORY, not floor — vanishingly narrow, not impossible.
 *   - `null === null` also passes step 2, so an unreadable lock replaced in the
 *     gap by another unreadable lock would slip through. Kept deliberately: the
 *     alternative — refusing to break what cannot be read — reinstates the wedge,
 *     which is the worse of the two hazards. A `tryCreate` writes a readable
 *     file, so reaching this needs a second failure that is not this code's.
 */
function breakStaleLock(
  cwd: string,
  command: string,
  observedRaw: string | null,
): void {
  const corpse = safeJoin(
    cwd,
    `${LOCK_FILE}.${process.pid}.${randomBytes(4).toString('hex')}`,
  );
  try {
    // RESIDUAL (one of the four above): `rename` REPLACES its destination
    // silently — the very fact the restore below uses `link` to dodge. So if
    // something already sits at the corpse name, this destroys it, and none of
    // `sweepCorpses`' three bounds covers that. The age gate in particular does
    // not: a corpse-shaped file created a minute ago is exposed here though the
    // sweep would spare it. Stated because it is a distinct hole, not a rounding
    // of the one already named there.
    //
    // Left open, deliberately. The name carries OUR pid and 32 bits drawn this
    // call, so even a file already shaped like a corpse AND already carrying our
    // pid is hit about once in 4.3e9 breaks — whereas the sweep deletes ANY
    // corpse-shaped file past STALE_MS with probability ~1. This is a strict
    // subset of an exposure the file already accepts, smaller by nine orders of
    // magnitude; closing it while the sweep stands would be theatre. If this
    // class of collision ever matters, the lever is the SWEEP, not the rename.
    // Narrower still: only file-over-file clobbers. A directory at the corpse
    // name gives EISDIR and a directory at `.pharn.lock` gives ENOTDIR, and both
    // land in the refusal below (measured, node v24.13.1).
    //
    // THE TRAP, for whoever revisits this: do NOT make the destination
    // create-or-fail (`link`, or `O_EXCL` + redraw) and treat THAT as the
    // single-winner step. Two racers draw DIFFERENT names, so both reservations
    // succeed and both would believe they had won. `rename`'s source-unlink is
    // what elects one winner; nothing that leaves the source in place can
    // replace it. A reservation could sit harmlessly BEFORE the rename, but it
    // buys 2^-32 for a redraw loop in the one file whose contract is "no retry
    // loop, no backoff".
    renameSync(lockPath(cwd), corpse);
  } catch {
    // ENOENT — another breaker moved it first and is creating its own lock right
    // now. Any other errno — we simply cannot move it. The errno is not
    // classified because it does not change the answer: we do not hold the lock,
    // so we refuse. Never loop; that is this file's contract.
    throw new ProjectLockedError(refusal(readPayload(cwd)));
  }
  try {
    if (readRawAt(corpse) !== observedRaw) {
      // We moved a lock we had no right to move. Put it back under its canonical
      // name: `link(2)` is create-or-fail (EEXIST when the destination exists),
      // so the restore can never clobber a lock a third process took in the gap.
      // Then refuse as though we had simply found it live — which, but for our
      // own rename, is what happened.
      try {
        linkSync(corpse, lockPath(cwd));
      } catch {
        // The name is already occupied, or the filesystem has no hard links
        // (FAT/exFAT). The corpse is dropped below and its owner keeps believing
        // it holds a lock whose file is gone — a two-writer window this fix
        // narrows but does not close. Named, not hidden.
      }
      throw new ProjectLockedError(refusal(readPayload(cwd)));
    }
    if (!tryCreate(cwd, command))
      throw new ProjectLockedError(refusal(readPayload(cwd)));
    sweepCorpses(cwd);
  } finally {
    // Every in-process path drops our corpse. On the restore path `linkSync` has
    // already given the inode a second name, so unlinking this one leaves the
    // file at `.pharn.lock`. Best-effort: a `.pharn.lock` that was a DIRECTORY
    // cannot be rmSync'd without `recursive`, and this file will not recursively
    // delete something a user put there — it moves it aside and leaves it.
    try {
      rmSync(corpse, { force: true });
    } catch {
      /* tidying must never replace the real outcome */
    }
  }
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
 * Where the four commands acquire, and why they differ — all of them release in
 * the same `finally` that disposes of the clone:
 *
 *   - `add` (named) and `update` — BEFORE the fetch, so a run that is going to be
 *     refused pays for no tarball. `update`'s is still AFTER its confirm, which is
 *     the half that is not negotiable; the named `add` has no prompt at all.
 *   - `add` (picker) — also before the fetch, and it DOES hold across
 *     `groupMultiselect`: one lock spans the whole selection loop, because that
 *     loop persists config and records on every pick and a per-pick lock would
 *     leave a gap to interleave into.
 *   - `remove` — no network at all, so there is nothing to sit in front of. The
 *     named path has no prompt; the picker acquires after its one destructive
 *     confirm.
 *   - `init` — after BOTH prompts, which means after the fetch too. Both of its
 *     prompts sit between the fetch and the install, so the only slot ahead of the
 *     fetch is also ahead of them.
 *
 * The rule the list obeys: bounded work may be held across, unbounded work may
 * not. A fetch is capped by construction (repo.ts: 8s resolve, 60s download); a
 * prompt is capped only by human attention, and holding one would block an agent
 * hook for as long as a human takes to answer. `add`'s picker is the deliberate
 * exception, and together with `init`'s prompts it is why STALE_MS is a generous
 * six hours rather than minutes.
 */
export async function withProjectLock<T>(
  cwd: string,
  command: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!tryCreate(cwd, command)) {
    // Read the bytes ONCE and carry them into the break: the staleness judgement
    // here and the re-verify there must be about the SAME payload, or the break
    // is exactly the unchecked delete it replaced.
    const observedRaw = readRawAt(lockPath(cwd));
    const held = observedRaw === null ? null : parsePayload(observedRaw);
    if (!isStale(held)) throw new ProjectLockedError(refusal(held));
    breakStaleLock(cwd, command, observedRaw);
  }
  try {
    return await fn();
  } finally {
    release(cwd);
  }
}
