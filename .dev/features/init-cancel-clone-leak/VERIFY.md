# VERIFY — init-cancel-clone-leak

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**. `npm run build` clean.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**The RED demonstration runs backwards, and the reason is worth reading.** The original bug is
literally unobservable in this harness: `stubProcessExit` throws `ProcessExit` rather than
terminating, and `init`'s surrounding `catch` converts that throw into the failure/exit-1 path — so a
pre-fix test would have seen exit 1, not a leaked clone. That is exactly why the refactor, not a new
test, is what makes the lifecycle testable.

So the regression was induced instead: `cancelAndExit()` re-introduced into the stage.

```
× never exits the process on any path
× a cancelled prompt (Ctrl+C) RETURNS `cancel` — it must not exit
AssertionError: promise rejected "ProcessExit: process.exit(0)" instead of resolving
  Tests  2 failed | 32 passed (34)
```

Restored → 34 passed. The pins observe the defect at the layer where the harness can see it.

**What PASS does not cover.** "User-visible behavior is byte-identical" is asserted for the message
and the exit code, but `decline` and `cancel` are deliberately distinct values that both map to
`cancelled` — there is nothing for a user to tell apart, by construction rather than by test.
