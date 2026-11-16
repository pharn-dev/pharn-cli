// ---------------------------------------------------------------------------
// Dying cleanly on a fatal signal — the one place pharn handles SIGINT and
// SIGTERM. Node's default action ends the process WITHOUT running `exit`
// listeners or `finally` blocks, yet the temp clone must be removed and the
// project lock released (a stranded lock blocks a shared-directory host for
// the six-hour staleness window).
//
// Each owner registers a synchronous cleanup for as long as it owns something.
// On a signal every cleanup runs, newest first, then `removeAllListeners`
// (another listener, e.g. clack's spinner, would swallow the signal) and the
// signal is re-raised with its default disposition, so the exit status stays
// truthful (130 / 143). Handlers install on the FIRST registration, not at
// import.
//
// NOT SIGHUP: a listener overrides the SIG_IGN `nohup` sets (measured: Node ran
// the handler even under `trap '' HUP`), which would interrupt a `nohup pharn
// update` mid-write; tests/fatal-signal.test.ts pins that none is added. A
// plain hangup can leave the lock; the next run on this host reclaims it.
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
    // Defensive: if the re-raise ever throws, exit with the status the signal
    // would have produced — running on with every listener removed is not an
    // option.
    process.exit(128 + SIGNAL_NUMBER[sig]);
  }
}
