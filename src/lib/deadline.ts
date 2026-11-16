// ---------------------------------------------------------------------------
// A hard deadline for a network operation that does not depend on the runtime
// delivering an abort. On Node 20/22 undici holds the caller's signal through
// a WeakRef and, after a GC, may never forward the abort into the response
// body, and its bodyTimeout measures only the gap between chunks — so a slow
// drip could hang a command, holding the project lock. The timer therefore
// aborts the controller (releasing the socket when undici honours it) AND
// rejects on its own through a race (pinned by tests/deadline.test.ts).
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
