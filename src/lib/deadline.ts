// ---------------------------------------------------------------------------
// A hard deadline for a network operation — one that does not depend on the
// runtime delivering an abort.
//
// Every fetch here used the same shape: an AbortController, a setTimeout that
// calls `abort()`, and a `finally` that clears it. That shape relies on undici
// forwarding the abort into the RESPONSE BODY stream. On Node 20/22 (undici 6)
// it holds the caller's signal through a WeakRef; measured, after one full GC a
// server dripping one byte every 250 ms kept a 3 s-capped read alive past 10 s
// (Node 24 is unaffected). undici's own bodyTimeout (300 s) measures the gap
// BETWEEN chunks, so a slow drip never trips it: `init`/`add`/`update`/`status`
// could hang indefinitely — `add`/`update` while holding the project lock.
//
// So the timer here does two things: it aborts the controller (the polite path,
// which releases the socket whenever undici honours it) AND rejects on its own
// through a Promise.race, which returns control to pharn at the deadline
// regardless. Callers additionally cancel their body reader on abort (their
// own listener on their own signal — no WeakRef involved).
//
// One axis (P3): bounding how long a network operation may take.
// ---------------------------------------------------------------------------

/**
 * Run `work` with a signal that is aborted after `ms`, and settle no later than
 * that: at the deadline the returned promise rejects with `onTimeout()` even if
 * `work` never settles. A `work` rejection after the deadline is swallowed — the
 * caller has already been answered.
 */
export async function withDeadline<T>(
  ms: number,
  onTimeout: () => Error,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(onTimeout());
    }, ms);
  });
  const running = work(controller.signal);
  // The loser of the race must never surface as an unhandled rejection.
  running.catch(() => undefined);
  try {
    return await Promise.race([running, expired]);
  } finally {
    clearTimeout(timer);
  }
}
