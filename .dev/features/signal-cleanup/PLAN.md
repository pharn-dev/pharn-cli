# PLAN — clean up the temp clone on exit and on a signal

- spec_content_hash: e54e80f12935e4ac8347968cf8aca9be7ddc173d49b452233b6525d7b83ecff8 # fix #4
- increment: Register each temp clone in a process-wide set and drain it from once-only `exit`/`SIGINT`/`SIGTERM` handlers, re-raising the signal so an interrupted run reports 130/143 instead of 0. A backstop UNDER each caller's `finally`, never a replacement.
- layer(s): `src/lib`, `tests`, `docs`
- constitution_refs: [P0, P3, P5, P7]

## Discovery (P6 — read live this run)

- `grep -rn "process.on" src/` → **zero hits**. No process-level handler anywhere.
- `src/lib/repo.ts` — `mkdtempSync` then a `cleanup` closure; disposal is entirely caller-side.
- **Spec drift, corrected:** the spec describes `{ force: true, cache: false }` degit options and a
  "degit ref". `5.3a` (#146) merged first and removed degit — `fetchRepo` now downloads from
  codeload and extracts with `lib/tar-extract.ts`. The lifecycle problem is unchanged (a
  `mkdtempSync` dir disposed by a closure), so the fix applies as written; only the surrounding
  prose in the spec is stale.
- `docs/commands/init.md:108` already promises "The temp clone is always cleaned up (even on cancel
  or error)" — a claim that was **false** for both exits below.

## The two exits a `finally` never sees

1. **`process.exit()`.** Node does not run `finally`. Not a corner case: while a clack spinner is up
   — exactly the clone window — `@clack/core`'s `block()` raw-modes stdin, so Ctrl-C arrives as a
   **keypress** and clack calls `process.exit(0)`. The clone leaks and the run **reports success**.
2. **A signal.** In a piped run `@clack/prompts` installs a `SIGINT` listener that only prints, so
   the signal is swallowed and the process continues.

## Files

- `tests/support/tar-fixture.ts` — NEW: the archive builder, shared with the child process — layer `tests`
- `tests/repo-signals.test.ts` — NEW — layer `tests`
- `src/lib/repo.ts` — the registry + handlers — layer `lib`
- `docs/commands/init.md`, `CHANGELOG.md` — layer `docs`

## Evals to write (P1)

- Exactly ONE `exit` listener is added, however many clones are fetched (once-only).
- The `exit` handler removes a live clone.
- `cleanup()` deregisters, so a later handler run does not rm a path this process no longer owns.
- **In a real child process:** SIGINT mid-run removes the clone, is not swallowed by a print-only
  clack-like listener, and the process exits **130 / by signal** — never 0.

## Guarantee audit (P0)

- "an interrupted run cleans up and exits truthfully" → **FLOOR**, and only the child-process test can
  show it: the defect IS the exit code, so an in-process test that cannot observe exit status would
  not be testing the defect. Verified to fail with the handlers disabled (`expected true to be false`
  — the dir survived).
- "handlers install once" → **FLOOR**, via fresh module instances per test.
- "Ctrl-C during a spinner is rescued" → **PARTIAL.** The child test raises a real SIGINT. The
  raw-mode keypress path (clack calling `process.exit(0)`) is covered by the `exit` handler, which is
  tested by invoking it — but no test drives a pty. Stated, not claimed.
- "no clone can ever leak" → **NOT CLAIMED.** `SIGKILL` runs nothing, and a hard crash leaves the dir.

## Trust audit (P2)

No new input. The registry holds only paths this process created via `mkdtempSync`. `rmQuiet`
swallows errors because a handler that throws would replace the real exit reason.

## Determinism audit (P5)

Set membership and a boolean latch.

## Out of scope (P7)

- **The startup sweep of stale `pharn-XXXXXX` dirs** (the spec's optional secondary item). It is a
  new deletion surface outside the project, keyed on a name pattern, for a set that no longer grows
  now the leak is closed. Declined deliberately; the same call as `5.3b`'s.
- The `cancelAndExit` structural fix — that is `4.04`, which keeps its own work. The `exit` handler
  happens to cover that path as a **byproduct**; nothing here leans on it.
- Any change to resolution, the SHA validation, or the `FetchedRepo` shape.

## Open questions (HALT)

- None.
