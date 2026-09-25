# PLAN — signal-lock-release (a real SIGINT/SIGTERM releases the lock; no response body outlives its command)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: (1) a SIGINT or SIGTERM received while `.pharn.lock` is held releases the lock before
  the process dies. A small shared fatal-signal registry does this, used by both the temp-clone
  cleanup and the lock. (2) `fetchCommitSha` cancels a non-2xx body, and reads a 2xx body through
  its own reader, cancelled on the deadline, so no body keeps the process alive after the command
  has finished. `downloadArchive`'s non-2xx throw cancels its body too.
- layer(s): the CLI itself (`src/lib/fatal-signal.ts` new, `src/lib/repo.ts`,
  `src/lib/project-lock.ts`)
- constitution_refs: [P0, P1, P3, P5, P6]

## Discovery — verified this run (P6)

- F13 reproduced on HEAD `abb274a` with a tsx probe (scratchpad `plan-C/probe13.mts`). It holds
  `withProjectLock`, runs `fetchRepo` (stubbed fetch) and signals itself. SIGTERM exits 143 and
  SIGINT exits 130, and in both cases `.pharn.lock` is left behind.
  - Cause: `repo.ts:66-78` handles SIGINT/SIGTERM by removing the clones, calling
    `process.removeAllListeners(sig)`, and re-raising with the default action. The default action
    ends the process without emitting `exit`. The lock is released only from an `exit` listener
    (`project-lock.ts:502-515`) or its `finally`, so neither runs.
  - Without a fetch (`remove`, or `add`/`update` before `fetchRepo`) there is no handler at all.
    The default action strands the lock there too.
  - The next run on the same host reclaims the lock via the dead-pid check. A different host (a bind
    mount) waits `STALE_MS` = 6 h (`project-lock.ts:84`).
- F12, read on HEAD (`repo.ts:239-270`): on `!res.ok`, `fetchCommitSha` returns `null` without
  touching the body. On 2xx it calls `res.json()`, a read with no reader of its own, so nothing
  cancels it at the 8 s deadline. `withDeadline` answers the caller, but the socket keeps the event
  loop alive (`deadline.ts:1-20` documents why the abort alone is not enough on Node 20/22).
  - A null SHA is a degraded mode, not an exit, so the command finishes normally. `index.ts` calls
    `process.exit` only on failure, so the process lives until the body ends: 30 s in the review's
    403-drip measurement.
  - `downloadArchive` (`:192-194`) also throws on `!res.ok` with the body untouched. That is benign
    today only because every caller then exits 1.
- Only `tests/repo.test.ts` (6) and `tests/repo-signals.test.ts` (2) stub the SHA response with
  `json:`. The command tests mock `repo.js` wholesale.
- The docs say a `SIGKILL`ed run cannot release (`docs/troubleshooting.md:369`). They make no claim
  either way about SIGINT/SIGTERM.

## Files

- `src/lib/fatal-signal.ts` (new) — layer CLI/lib. `onFatalSignal(fn): () => void`, a
  once-installed SIGINT/SIGTERM handler (SIGHUP deliberately NOT handled — see the amendment under
  Open questions) that works in four steps:
  1. Runs every registered cleanup synchronously, last-registered first, each in its own try/catch.
  2. Clears the set.
  3. Calls `removeAllListeners(sig)`.
  4. Re-raises `sig`, so the exit status stays 130/143.

  The re-raise moves here from `repo.ts` unchanged. One axis: dying cleanly on a fatal signal.

- `src/lib/repo.ts` — layer CLI/lib. The clone cleanup registers through `onFatalSignal`; its
  `exit` listener stays as it is. `fetchCommitSha` gets two fixes:
  - On a non-2xx status it calls `res.body?.cancel()` (errors ignored) and returns `null`.
  - On 2xx it reads the body through its own reader, with an abort listener that calls
    `reader.cancel()` (the `downloadArchive` pattern), then parses the JSON.

  `downloadArchive` cancels the body before its non-2xx throw.

- `src/lib/project-lock.ts` — layer CLI/lib. `withProjectLock` registers `release(cwd)` plus the
  same "interrupted while writing" stderr line as the `exit` path, for the lock's lifetime, and
  deregisters in its `finally`.
- `tests/project-lock.test.ts` — layer tests. Child-process cases (the `tsx` pattern already used
  there):
  - The lock is held with no fetch, and the process sends itself SIGTERM. It exits 143, the lock is
    gone, and stderr names the interruption. FAILS on base.
  - The same with SIGINT after a stubbed `fetchRepo`. It exits 130, and both the lock and the clone
    are gone. FAILS on base.
  - After a normal release, a later SIGTERM leaves alone a lock file another process created (the
    `release` re-read, plus the deregistration).
- `tests/fatal-signal.test.ts` (new) — layer tests. In-process, with `process.kill` stubbed:
  cleanups run in reverse order, a throwing cleanup does not stop the rest, a deregistered cleanup
  does not run, and the handlers install once.
- `tests/repo.test.ts` — layer tests:
  - A 403 whose body stream records `cancel` → the cancel was called. FAILS on base.
  - A 2xx body that never ends → at the 8 s deadline the reader was cancelled and the result is
    `null`. FAILS on base.
  - A `downloadArchive` 500 → the body was cancelled. FAILS on base.
  - The existing `json:` stubs become stream bodies.
- `tests/repo-signals.test.ts` — layer tests. Its SHA stub becomes a stream body. The clone-removal
  and exit-130 assertions stay as they are.
- `docs/troubleshooting.md` — layer docs. The lock section: Ctrl-C, `timeout` and `docker stop`
  (SIGINT/SIGTERM) release the lock and exit 130/143. SIGKILL, power loss and a hangup (SIGHUP)
  still cannot release.
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed`, two entries

## Contracts satisfied

- The lock's contract in `docs/reference/pharn-records.md` ("a second pharn process refuses instead
  of interleaving"). It stops costing a 6 h wait after an ordinary interrupt (cited, P4).
- `deadline.ts`'s stated rule, "callers additionally cancel their body reader on abort". It now
  holds for every fetch in `repo.ts`.

## Evals to write (P1)

- Listed under Files. Five cases FAIL on the base.

## Guarantee audit (P0)

- "a SIGINT/SIGTERM delivered while the lock is held releases it" → floor: child-process tests
  observing the exit status and the lock file. The residual is named: SIGKILL, power loss, and a
  signal that arrives before `withProjectLock` registers.
- "a non-2xx or timed-out SHA response cannot keep the process alive" → floor: cancel-spy tests over
  both paths. Wall-clock exit timing is not asserted (flaky). The mechanism is.
- "the exit status stays truthful (130/143)" → floor: the existing `repo-signals` test plus the
  new ones.

## Trust audit (P2)

- The response bodies are untrusted, and they are now consumed less: cancelled, never drained. No
  new data reaches output.

## Determinism audit (P5)

- A fixed signal list and set membership. No fallback path.

## Open questions (HALT)

None open. Resolved at GATE 1 (human, 2026-09-25): every question below → **(a)**, the
recommended answer. Kept for the record:

1. SIGHUP (terminal closed while `update` holds the lock): (a) handle it too, re-raised as exit 129 —
   recommended. The failure is the same stranded lock. (b) SIGINT/SIGTERM only, as measured.

**Amendment during build (human, 2026-09-25): question 1 → (b).** Measured before review: a
`process.on('SIGHUP')` listener overrides the `SIG_IGN` that `nohup` sets. Node 22 ran the handler
even under `trap '' HUP`. So handling SIGHUP would make a hangup interrupt a `nohup pharn update`
mid-write, where today it keeps running. Asked again with that finding, the human chose
SIGINT/SIGTERM only. A hangup's stale lock is still reclaimed automatically on the same machine
(dead-pid check).
