# SHIP — status-proxy-notice

Gated `/pharn-dev-ship` run (no `--loop`). Increment: hoist `status`'s proxy notice above the
`--no-drift` guard so it precedes every fetch the command can make, and invert the test that pinned
its absence.

## Stages run, in order

| #   | stage              | outcome                                                        |
| --- | ------------------ | -------------------------------------------------------------- |
| 1   | `/pharn-dev-plan`     | `PLAN.md` written; **GATE 1** satisfied — pre-approved by the human, including the test inversion. Plan stayed within the four approved items. |
| 2   | `/pharn-dev-grill`    | `GRILL.md` — 4 concerns (0 blocking, 2 important, 2 minor). Advisory; gated nothing. Both important findings adopted into the plan before build. |
| 3   | `/pharn-dev-build`    | 3 files written (exactly the plan's `## Files`); floor GREEN |
| 4   | `/pharn-dev-regress`  | `no-regressions` |
| 5   | `/pharn-dev-verify`   | `PASS` |
| 6   | `/pharn-dev-review`   | `REVIEW.md` — GREEN, 0 floor-gate findings, 2 advisory |

**Where the run ended: GATE 2** — the post-review human gate. No stage returned a non-GREEN verdict,
so the chain was never STOPped early.

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code: **`0`**
  (`FLOOR: GREEN — 0 capabilities checked in .`)
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict`: **`"no-regressions"`**
  (helper exit 0; outside gates `tests` 0→0, `validate` 0→0; base `558b8dd`)
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict`: **`"PASS"`**
  (helper exit 0; `failing_gates: []`; gates `test` / `validate` / `lint` / `format:check` /
  `lint:md` / `typecheck` all 0)

Each was read from the stage's own deterministic output. None rests on agent judgment.

## Pointers (cited, not restated — P4)

- `.dev/features/status-proxy-notice/REVIEW.md` — the four lenses and the 2 advisory findings.
- `.dev/features/status-proxy-notice/GRILL.md` — advisory, pre-build.
- `.dev/features/status-proxy-notice/VERIFY.md` — includes the mutation check and a recorded flake.
- `.dev/features/status-proxy-notice/REGRESSION.md` — includes a dev-loop tooling false positive.

## Deviations and post-review actions worth the human's attention

1. **Grill findings adopted before build (2).** A failure-path test case was added — every other
   planned case exercised a *successful* fetch, leaving the scenario the notice exists for (a
   proxy-only network where the fetch **fails**) untested. And a P0 label was corrected: the plan had
   credited a `toHaveBeenCalledTimes` count with pinning "exactly one call site in the source", which
   a count cannot see; it is now labeled advisory.
2. **One advisory review finding was acted on after `/pharn-dev-review`.** The `CHANGELOG` headline
   claimed parity with "every other network-bearing command", which is not yet true — `update` still
   does not warn before its first fetch. Narrowed to "as `init` and `add` already did". `npm run check`
   was re-run after that edit: **exit 0**, 1126 tests. The second (minor) finding — `LIMITS.md:117`
   staying overstated — is **not** actionable here: that file is floor-write-protected and owned
   upstream.
3. **Left open, deliberately** (detailed in `REVIEW.md`): `src/commands/update.ts` carries the same
   defect class and is sibling-owned; the `check-regress.mjs scope` / `enforce-writes-scope.cjs`
   disagreement about `.pharn/**`; and a pre-existing 5000ms-timeout flake in
   `tests/lint-gate.test.ts` under parallel load.

## Standing decision

The chain ran; the named floor verdicts are as shown. **This is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** No merge, no push, no
`PHARN ✓ reviewed` seal was applied by this run.
