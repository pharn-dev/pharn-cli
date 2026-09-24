# PLAN — fetch-hard-deadline (PHARN-09: the network timeouts must hold even when undici drops the abort)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: a small shared `withDeadline(ms, message, work)` in `src/lib/deadline.ts` races the whole
  fetch-and-read against a timer that (a) aborts the request's controller and (b) REJECTS on its own, so
  the caller is released at the deadline whether or not the abort reaches the body stream; the three
  fetch sites (`downloadArchive`, `fetchCommitSha`, `fetchRemoteSkillsVersion`) use it, and the body
  readers cancel their stream on abort so the socket is released too.
- layer(s): the CLI itself (`src/lib/deadline.ts` new, `src/lib/repo.ts`, `src/lib/skills-version.ts`)
- constitution_refs: [P0, P1, P2, P3]

## Discovery — verified this run (P6)

Reproduced in the review: minimal `downloadArchive` equivalent (`for await` over `res.body`,
`AbortController`, 3 s timer, server dripping 1 byte / 250 ms): no GC → `AbortError` at 3.0 s; one
forced `gc()` → "NOT ABORTED after 10 s" on Node 22.22.2 and 20.20.2 (undici 6.x holds the caller's
signal via a `WeakRef`); Node 24 unaffected. The helper agent reproduced it on the real `fetchRepo`
(still downloading at 75 s with a 60 s cap) and `fetchCommitSha` (no answer after 20 s). Timing-
dependent in the wild → Low. `SECURITY.md` / `THREAT-MODEL.md` promise the timeout covers a streamed
body. The engines floor is `>=20.12.0`, so Node 20/22 are supported targets.

## Files

- `src/lib/deadline.ts` — `withDeadline<T>(ms, onTimeout: () => Error, work: (signal) => Promise<T>)`:
  one `AbortController`, one timer that aborts AND rejects, `Promise.race`, timer cleared in `finally`,
  the losing `work` promise's rejection swallowed (no unhandled rejection) — layer CLI/lib
- `src/lib/repo.ts` — `downloadArchive` and `fetchCommitSha` run under `withDeadline`; the archive body
  is read through an explicit reader that is cancelled on abort; `fetchCommitSha` still returns `null`
  on timeout (best-effort) — layer CLI/lib
- `src/lib/skills-version.ts` — `fetchRemoteSkillsVersion` under `withDeadline`; the timeout error keeps
  the existing "Could not reach <url>" shape — layer CLI/lib
- `tests/deadline.test.ts` — work that never settles is rejected at the deadline with the given error
  and the signal is aborted; work that settles first wins and the timer is cleared; a late rejection of
  the losing work is not unhandled
- `tests/repo.test.ts` — a download whose body stream IGNORES the abort signal (the post-GC undici
  shape) still rejects at `CLONE_TIMEOUT_MS`; `fetchCommitSha` with a never-settling body → `null`
- `tests/repo-signals.test.ts` — its fake download bodies become real web `ReadableStream`s (the shape
  `fetch` returns; the download now reads through `getReader()`)
- `tests/skills-version.test.ts` — same "abort not wired to the body" case → rejects at 8 s naming the URL

## Contracts satisfied

- `SECURITY.md` / `THREAT-MODEL.md` (8 s / 60 s timeouts cover the streamed body) and CLAUDE.md "Remote
  fetches use `redirect: 'error'`, an 8s timeout, and a 256KB body cap" — now independent of whether
  the runtime delivers the abort to the stream.

## Evals to write (P1)

- listed above; the "abort ignored by the body" cases hang on the base source (vitest timeout = fail).

## Guarantee audit (P0)

- "a fetch returns control to pharn within its timeout" → floor: the timer's own `reject` in a
  `Promise.race` — it does not depend on undici honouring the signal.
- "the socket is released at the deadline" → best effort (reader.cancel + controller.abort); advisory.

## Trust audit (P2)

- No change to what remote bytes are accepted; only when a read is abandoned.

## Determinism audit (P5)

- Timer-based; tests use fake timers.

## Open questions (HALT)

- none
