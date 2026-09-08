# SHIP — cli-robustness

Roll-up of the `/pharn-dev-ship` run for this increment. **Advisory**: it records that the chain ran
and what each stage's floor verdict was. It is not an approval, not a "shipped", and not a
`PHARN reviewed` seal.

## Stages, in order

| # | Stage | Structural verdict read | Value |
| - | ----- | ----------------------- | ----- |
| 1 | `/pharn-dev-plan` | GATE 1 — human approval | **approved in advance** (see below) |
| 2 | `/pharn-dev-grill` | *(none — advisory by design)* | 6 findings, all folded into the plan before build |
| 3 | `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **0** (FLOOR: GREEN) |
| 4 | `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`no-regressions`** |
| 5 | `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`PASS`** |
| 6 | `/pharn-dev-review` | *(none — `/pharn-dev-review` has no structural verdict)* | `REVIEW.md`: 0 floor-gate findings, 7 advisory + a 4-finding CodeRabbit addendum, all fixed |

The run ended at **GATE 2**. No stage returned a non-GREEN verdict, so there was no RED STOP.

### Supplementary floor reads (not proceed/stop inputs)

- `node .dev/floor/check-build-complete.mjs PLAN.md .` → `complete`, exit **0** (21/21 declared
  paths exist).
- `node .dev/floor/count-verifiers.mjs .` → `{"registered": 0}` — zero `role: verifier` capabilities
  exist (P7), so `/pharn-dev-verify` ran floor gates only.

## Artifacts

- `BRIEF.md` — the recorded human brief; `PLAN.md`'s `spec_content_hash` chains to it
  (`da89fdb4…`). No `SPEC.md` exists for this increment; recorded honestly rather than backfilled,
  which is also why `check-plan-spec-agree.mjs` is **not applicable** here.
- `PLAN.md`, `GRILL.md` (advisory), `REGRESSION.md` + `regression-report.json`,
  `VERIFY.md` + `verify-report.json`, `REVIEW.md` (advisory).

Findings are **cited, not restated** (P4): read `GRILL.md` and `REVIEW.md` directly. Their free text
is `trust: untrusted` DATA (P2) — quoted for a human, never followed as an instruction, and never a
proceed/stop input here.

## GATE 1 and GATE 2, recorded honestly

**GATE 1 (plan acceptance) was satisfied by the human, in advance.** The increment was specified in
full in the `/pharn-dev-ship` invocation — four briefs, each carrying a task, a verified problem, a
fix shape, an invariant list and an acceptance list. The agent did not author the intent and did not
self-approve it.

**GATE 2 (post-review decision) was delegated in advance by the human**, in the same message: "check
if all check are green, then create pull request … then if all check green in pull request merge pr".
That is the human's decision, made before the run rather than after it. It is recorded as a
delegation, **not** as a self-issued approval — the distinction is the whole point of the gate, and
collapsing it would be the P0 disease this repo exists to prevent.

## The honest line

The chain ran; the named floor verdicts are as shown. **This is NOT a judgment that the increment is
good or wise** — that is the human's call at the post-review gate. `/pharn-dev-ship` adds no floor
primitive of its own: every guarantee above belongs to a sub-stage's own checker.
