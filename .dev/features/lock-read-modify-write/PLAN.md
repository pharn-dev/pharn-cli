# PLAN — lock-read-modify-write (PHARN-03: the project lock must cover the config snapshot and admit one holder)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: (a) `add` / `update` / `remove` re-read `pharn.config.json` as the first step INSIDE the
  project lock and refuse (exit 1, nothing written) when it differs from the snapshot they planned
  against; (b) a lock file that exists but is not a parseable payload and is younger than a short
  grace window is treated as LIVE (a holder mid-`tryCreate`), not stale.
- layer(s): the CLI itself (`src/lib/project-lock.ts`, `src/lib/pharn-config.ts`, `src/commands/{add,update,remove}.ts`)
- constitution_refs: [P0, P1, P3, P5, P6]

## Discovery — verified this run (P6)

Base = `main` after PHARN-02. Reproduced in the review:

- (a) `repro/stale-config`: `remove` picker waits at its confirm; a concurrent `add a11y` succeeds; the
  confirmed `remove` writes its pre-prompt snapshot → `a11y` vanishes from the config, its files and 13
  records stay, both exit 0. `update` has the same shape (config read `update.ts:81`, confirm, lock
  `:292`); `remove` named/picker read `:50`, lock `:275`/`:380`; `add` read `:65`, lock `:174`/`:297`.
- (b) `repro/lock-race`: `tryCreate` (`project-lock.ts`) opens with `O_EXCL` then writes the payload,
  so the file is briefly EMPTY; `parsePayload('') → null`, `isStale(null) → true`, and a concurrent
  process breaks the live lock. 8 processes × 150 rounds → 15 rounds with 2–5 simultaneous holders.

## Files

- `src/lib/project-lock.ts` — `ProjectChangedError extends ProjectLockedError` (so every existing
  catch site reports it as a named refusal + exit 1 with cleanup); `isStale` takes the lock file's
  mtime and returns `false` for an unparseable payload younger than `MALFORMED_GRACE_MS` (10 s) —
  an older or unreadable-and-unstattable one is still broken (never wedge) — layer CLI/lib
- `src/lib/pharn-config.ts` — `assertConfigUnchanged(cwd, snapshot, command)`: re-reads the config and
  throws `ProjectChangedError` when it is absent or its parsed form differs (`JSON.stringify` of two
  `readPharnConfig` results over the same schema) — layer CLI/lib
- `src/commands/add.ts` — call `assertConfigUnchanged` first inside both `withProjectLock` callbacks — layer CLI/command
- `src/commands/update.ts` — same, first inside its `withProjectLock` callback — layer CLI/command
- `src/commands/remove.ts` — same, in both lock callbacks — layer CLI/command
- `tests/project-lock.test.ts` — empty lock with fresh mtime → refused, fn not run, lock untouched;
  empty lock with mtime past the grace → broken and acquired (the multi-process race is measured
  out-of-suite with the review's `repro/lock-race` harness, 150 rounds × 8 processes, before/after)
- `tests/pharn-config.test.ts` — `assertConfigUnchanged`: identical → no throw; changed / deleted →
  `ProjectChangedError` naming the file and the command
- `tests/remove.test.ts` — picker: config rewritten (a capability added) between load and confirm →
  exit 1, nothing deleted, the concurrently-added entry preserved
- `tests/update.test.ts` — config changed between load and lock → exit 1, nothing written
- `tests/add.test.ts` — config changed between load and lock → exit 1, nothing written
- `tests/project-lock-commands.test.ts` — its `pharn-config.js` mock gains a no-op `assertConfigUnchanged` stub
- `README.md` — "One writer at a time" paragraph: a run whose config changed underneath it refuses (P4)
- `CLAUDE.md` — project-lock / command paragraphs (P4)

## Contracts satisfied

- README "One writer at a time… a second run refuses" and the `project-lock.ts` header's stated threat
  (planning against a stale snapshot) — now true for the prompt window too.

## Evals to write (P1)

- listed per test file above; each must fail on the base source.

## Guarantee audit (P0)

- "a command never persists a config planned against a stale snapshot" → floor: exact comparison of
  the re-read config against the snapshot, under the O_EXCL lock. Residual (named): an edit landing
  AFTER the re-check but while the lock is held by a non-pharn writer (a human editor) is not covered.
- "a live lock is never broken while its payload is being written" → floor: mtime-age comparison
  against `MALFORMED_GRACE_MS`. Residual (advisory): a holder stalled > 10 s between `open` and
  `write` (practically impossible for a two-syscall window) could still be broken.
- "zero overlapping holders" → demonstrated by the stress test (advisory evidence, not a proof).

## Trust audit (P2)

- The lock file and config are local, user-editable; mtime is read via `statSync` only. No new
  untrusted remote input.

## Determinism audit (P5)

- Branches: string equality of two serialized configs; integer age compare. Terminal = named refusal.

## Open questions (HALT)

- none
