# PLAN — stop init leaking the clone when the user cancels at the overwrite confirm

- spec_content_hash: f7a7e9f98215ead129e100eaae0b1a31e2e4d9efa72f5376a1f7b36ec8526b6a # fix #4
- increment: `confirmWriteTargets` exits from inside init's `try`, so the `finally` that disposes of the temp clone never runs. Make it return a three-state value; let `init` take the exit AFTER the finally, exactly as the archetype summary already does one prompt earlier. User-visible behavior byte-identical.
- layer(s): `src/steps`, `src/commands`, `src/lib`, `tests`
- constitution_refs: [P0, P3, P5, P7]

## Discovery (P6 — read live this run)

- `src/steps/overwrite-check.ts` — delegates to `confirmWarning`, whose cancel branch is
  `if (isCancel(result)) cancelAndExit();` → `process.exit(0)`.
- `src/commands/init.ts` — the boolean `&&` gate sits inside the `try`; `finally { repo.cleanup() }`
  follows it, and the single `if (outcome === 'cancelled') cancelAndExit();` sits AFTER the finally.
- `src/steps/archetype-summary.ts` — the prompt one step earlier already returns `'cancel'` as a
  VALUE, with a comment saying why: "never process.exit … so the caller can clean up the fetched temp
  clone in a finally BEFORE exiting". The pattern to mirror already exists in-repo (P4).
- `grep -rn confirmWarning src/` → `overwrite-check.ts` is its **only** caller.
- **Reachability:** `conflictingWriteTargets` includes `pharn.config.json`, so *any* re-install makes
  the conflict set non-empty and reaches the prompt. This is not an edge case.
- **Spec drift:** the spec says "degit temp clone". `5.3a` removed degit; the clone is now a
  codeload tarball extracted into the same `mkdtempSync` dir. The lifecycle defect is identical.
- **`5.2c` interaction (merged since the spec):** `fetchRepo` now also drains live clones from an
  `exit` handler, which incidentally covers this path. That is a **backstop, not this fix** — the
  spec says so explicitly, and leaning on it would leave `init`'s stated design rule violated.

## Files

- `tests/overwrite-check.test.ts` — the three-state contract + a "never exits on any path" guard — layer `tests`
- `tests/init.test.ts` — the missing CANCEL-at-confirm lifecycle case — layer `tests`
- `tests/confirm.test.ts` — drop the `confirmWarning` block with the symbol — layer `tests`
- `src/steps/overwrite-check.ts` — `WriteTargetsAction`; direct clack — layer `steps`
- `src/commands/init.ts` — only `'proceed'` installs — layer `commands`
- `src/lib/confirm.ts` — delete `confirmWarning` (dead-symbol discipline) — layer `lib`
- `CHANGELOG.md` — layer `docs`

## Evals to write (P1)

- Ctrl+C **resolves** `'cancel'` rather than rejecting with `ProcessExit`.
- A table-driven guard: `true → proceed`, `false → decline`, `CANCEL → cancel`, none exiting.
- `init` calls `repo.cleanup()` exactly once when the confirm is cancelled — the case the suite
  never had.
- The decline path is unchanged (still exit 0, still one cleanup).

## Guarantee audit (P0)

- "the clone is cleaned up on cancel" → **FLOOR**: `expect(cleanup).toHaveBeenCalledTimes(1)` on the
  cancel path, shown RED by re-introducing `cancelAndExit()` in the stage.
- "this stage never exits" → **FLOOR**, via the three-way table.
- "user-visible behavior is unchanged" → **PARTIAL.** The message and exit code are asserted, but
  `decline` and `cancel` are deliberately distinct values that both map to `cancelled` — nothing
  proves a human could not tell them apart, because there is nothing to tell apart by construction.
- **The harness could not model the old bug faithfully**, which is worth stating: `stubProcessExit`
  throws `ProcessExit`, which init's `catch` would convert into the failure/exit-1 path — unlike a
  real `process.exit`. So the pre-fix test could not have been written as "assert the leak"; the
  refactor is what makes the lifecycle honestly testable.

## Trust audit (P2)

Unchanged: the listed paths still come from the untrusted clone, are `safeJoin`-contained, and are
displayed as data.

## Determinism audit (P5)

The branch stays `conflicts.length > 0`; the terminal fallback is still the confirm's default No.
`decline` and `cancel` are kept distinct rather than collapsed — collapsing them into a boolean is
precisely how the exit crept in.

## Out of scope (P7)

- `warnAndConfirm` — also has no `src/` callers, but removing it is a separate cleanup.
- The `exit`/signal backstop (`5.2c`) — complementary, not a substitute.
- Any change to what init installs, its messages, or its exit codes.

## Open questions (HALT)

- None.
