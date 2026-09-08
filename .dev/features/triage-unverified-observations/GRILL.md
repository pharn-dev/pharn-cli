# GRILL — triage-unverified-observations (advisory; gates nothing)

## F1 — a triage prompt's failure mode is doing the work instead of the verification

**Problem.** Nine items with named fixes invite going straight to the fixes. But the spec's whole
point is that these were never adversarially verified, so some are wrong — and item 2's fix would
have been actively harmful: one line to add `RECORDS_FILE` to the conflict set, which breaks an
existing pin that exists on purpose.

**Reduction.** Verify-first for every item, with the verdict table in `PLAN.md` written before any
edit. Four of nine ended as "no action, here is why", which the spec explicitly calls a valid outcome.

## F2 — a one-sided bound test is not a bound test (item 1)

**Problem.** "A signal at depth 25 is not found" passes just as well if the walk stopped at depth 1,
or never ran. Half the pins in this class are decorative for exactly that reason.

**Reduction.** Both sides — 24 found, 25 not — and both were mutation-verified: `MAX_DEPTH = 30`
reddens one, `MAX_DEPTH = 12` reddens the other. Neither passes vacuously.

## F3 — the MAX_ENTRIES pin must not become a machine benchmark (item 1)

**Problem.** The literal reading of "pin MAX_ENTRIES" is a 50,000-file fixture. That is slow, flaky
on CI disks, and tests the wrong thing.

**Reduction.** The property is that skipped entries are **not counted** — 200 files in a `.next/`
plus one real signal proves it, and the spec says outright not to build 50k.

## F4 — items 5, 6 and 8 all tempt the one edit that breaks every PR

**Problem.** Each has an obvious fix that touches CI: matrix the `Test` job for node 20, add a
`windows-latest` matrix leg, add a PR-title lint job. Matrixing renames the reported context
(`Test` → `Test (20)`), and every PR then blocks on a required check nothing produces — the exact
historical incident `tests/ci-workflow.test.ts` exists to prevent.

**Reduction.** Nothing under `.github/` is touched. The gaps are documented **with the trap written
down**, so the next person does not rediscover it the expensive way.

## F5 — item 7's evidence had drifted, but the claim had not

**Problem.** The spec cites `enforce-writes-scope.cjs:71` and `:184`. Live, the constant is at `:113`
and its use at `:311`. A triage that trusts line numbers reports "cannot reproduce".

**Reduction.** Re-read the file; the constant and its fallback use are both exactly as described. The
issue quotes the live lines and notes the drift.

## Verdict

**Advisory: proceed.** F1 is the one that changed the outcome — item 2's "fix" would have made a
sentence true by breaking a test that was right.
