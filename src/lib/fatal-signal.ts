// ---------------------------------------------------------------------------
// Dying cleanly on a fatal signal — the one place pharn handles SIGINT and
// SIGTERM.
//
// Node's default action for these signals ends the process WITHOUT emitting
// `exit`, so no `exit` listener and no `finally` runs on one. Two things must
// run anyway: removing the temp clone (lib/repo.ts) and releasing the project
// lock (lib/project-lock.ts). The lock is the costly one: `pharn update --yes`
// cancelled in CI, or killed by `timeout` / `docker stop`, left .pharn.lock in
// the project, and a host sharing that directory waited out the lock's six-hour
// staleness window before it could write again.
//
// So each owner registers a synchronous cleanup here for as long as it owns
// something. On a signal every registered cleanup runs, newest first, and then
// the signal is re-raised with its default disposition, so the exit status
// stays truthful: 130 SIGINT, 143 SIGTERM — never the 0 an interrupted install
// once reported to the script that invoked it.
//
// NOT SIGHUP, on purpose. A listener overrides the SIG_IGN that `nohup` sets —
// measured: Node ran a SIGHUP handler even under `trap '' HUP` — so handling it
// would make a hangup INTERRUPT a `nohup pharn update` mid-write, where today it
// keeps running. A hangup without nohup still ends the run by default and can
// leave the lock; the next run on the same host reclaims it (dead pid).
//
// `removeAllListeners` comes before the re-raise: any other listener on the
// signal (@clack/prompts' spinner handler prints and returns) would otherwise
// swallow it, and the process would run on.
//
// The handlers install on the FIRST registration, not at import, so a run that
// never owns a clone or a lock keeps Node's default disposition untouched.
//
// One axis (P3): what happens between a fatal signal and the process's end.
// ---------------------------------------------------------------------------

const FATAL_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
type FatalSignal = (typeof FATAL_SIGNALS)[number];

/** POSIX signal numbers — the exit status is 128 + n. */
const SIGNAL_NUMBER: Record<FatalSignal, number> = {
  SIGINT: 2,
  SIGTERM: 15,
};

/** Registration order; `die` walks it backwards. */
const cleanups = new Set<() => void>();
let installed = false;

/**
 * Run `cleanup` if a fatal signal arrives before the returned deregister
 * function is called. `cleanup` must be synchronous — nothing after the
 * re-raise runs — and should not throw; a throw is swallowed so it cannot
 * replace the real exit reason or stop the cleanups after it.
 */
export function onFatalSignal(cleanup: () => void): () => void {
  install();
  // A fresh wrapper per registration, so registering the same function twice
  // is two registrations, each removed by its own deregister.
  const entry = (): void => cleanup();
  cleanups.add(entry);
  return () => {
    cleanups.delete(entry);
  };
}

function install(): void {
  if (installed) return;
  installed = true;
  for (const sig of FATAL_SIGNALS) process.on(sig, () => die(sig));
}

function die(sig: FatalSignal): void {
  const pending = [...cleanups].reverse();
  // Cleared first: a second signal arriving mid-cleanup must not run any of
  // them twice.
  cleanups.clear();
  for (const cleanup of pending) {
    try {
      cleanup();
    } catch {
      /* a cleanup must never replace the real exit reason */
    }
  }
  process.removeAllListeners(sig);
  try {
    process.kill(process.pid, sig);
  } catch {
    // Defensive: every platform Node supports can deliver these two to itself
    // (win32 emulates both). But if the re-raise ever throws, end the process
    // with the status the signal would have produced — running on with every
    // listener removed is not an option.
    process.exit(128 + SIGNAL_NUMBER[sig]);
  }
}
