# REVIEW — ci-matrix-os-node (M7)

**Floor first (P0, Step 1):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .`, exit **0**. The increment was eligible for review. Everything below the floor line is **advisory**.

Increment under review is `trust: untrusted`. Nothing in it attempted to instruct me; the free-text quoted below is DATA.

---

## floor-gate findings (blocking)

**None.**

Recorded per lens so the absence is a checked result, not silence:

- **L-floor → P0.** Every guarantee the increment states carries a reduction or an `advisory` label (`PLAN.md` guarantee-audit table; the `WHAT IS GUARANTEED` / `WHAT IS NOT` header block in `check-soft-tier.mjs:15-33`). The one claim that was *unproven* at grill time — that `.gitattributes` yields LF bytes on a **Windows checkout**, as distinct from the local renormalize no-op — has since been **discharged empirically**: `Format check` and `Markdown lint` both passed on `windows-latest / node 24` (run `31521684401`). That grill finding is closed by measurement, not by argument.
- **L-eval → P1.** The one new behavior (`check-soft-tier.mjs`) ships 17 cases in `check-soft-tier.test.mjs`, including two `★` live-repo bindings. Verified — not assumed — that `floor.yml`'s glob set actually collects it: `node --test ".dev/**/*.test.mjs"` matches the file. The floor and this lens agree.
- **L-trust → P2.** `check-soft-tier.mjs` copies the offending `value` into output at lines 189/198/205 and **never reads it for a decision**; the verdict is `violations.length > 0`, an integer test. Taint reaches the report, not the verdict.
- **L-axis → P3.** `check-soft-tier.mjs` imports `node:fs` and `node:path` only — **no floor script imports another**, the isolation invariant `check-run-pins.mjs` names as a safety property, preserved. Its prose references to sibling scanners cite *why the duplication exists* (P4 citation), matching the precedent `check-run-pins.mjs` sets in its own R2; the test's `spawnSync` of the sibling is a cross-check, not a runtime dependency, and mirrors `check-run-pins.test.mjs:441`.

---

## advisory findings

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: "src/lib/apply-update.ts:50"
  problem: "The R1 fix's correctness branch is unreachable on POSIX, so no local gate can exercise it — its sole regression test is a CI cell introduced by this very PR, which makes the fix's protection contingent on a config this same change is establishing."
  evidence: "`parentBlocks` returns true only when a parent component exists and is not a directory; on POSIX `lstatSync` raises ENOTDIR and short-circuits before it is consulted."
```

This is the finding I would most want a human to weigh. `npm test`'s 643 cases say **nothing** about the R1 fix — they passed identically before it. The proof is one Windows cell. Concretely: if the Windows cell is later dropped, or never added to branch protection's required list (see the operational note below — a state this sandbox **cannot read**), then the fix silently becomes unverified and can regress with no signal. The bug it fixes survived undetected for exactly that reason.

Options for the human, none of which I took unilaterally since HALT 1 scoped R1 to `src/lib/apply-update.ts` with no test edits:

1. **Accept as-is** — the matrix *is* the regression suite for this class, which is the increment's thesis. Cheapest, and coherent.
2. **Export `parentBlocks` and unit-test it directly** — reachable on POSIX (create a file, ask about a path beneath it). Costs a widened module surface for testability.
3. **Inject the classification** so the ENOENT/ENOTDIR divergence can be simulated. Most faithful, most invasive.

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/ci-matrix-os-node/PLAN.md:39"
  problem: "The increment ships four separable concerns — a CI matrix, a byte policy, a new floor gate, and a product bug fix — so a revert of any one is a revert of all four."
  evidence: "## Files lists ci.yml, .gitattributes, check-soft-tier.mjs(+test), CHANGELOG.md, and src/lib/apply-update.ts."
```

Each addition was human-approved (the gate at GATE 1, the fix at HALT 1), and the fix could not have been found without the matrix, so the coupling is causally honest rather than accidental. Flagged only so a future bisect sees it; already noted in the PR description.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".claude/commands/pharn-dev-verify.md"
  problem: "The verify stage's documented gate set does not cover this repo's .mjs tests, so an increment whose tests live in .mjs can reach a PASS verdict with its own tests never executed."
  evidence: "the command doc states npm test \"auto-collects via its `**/*.test.mjs` glob\", while vitest.config.ts:6 sets include: ['tests/**/*.test.ts']."
```

Caught during this run and worked around by composing a `floor-tests` gate into the map (sanctioned — the stage states the gate **set** is advisory orchestration). But the workaround is mine, not a floor lock: a future run using the documented set would report PASS over an unexecuted test file. **Outside this increment's whitelist — reported, not fixed.**

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".claude/commands/pharn-dev-regress.md"
  problem: "The regress stage's Bash orchestration is shell-dependent and can record a gate as red when that gate never executed, which check-regress then excludes as PRE-EXISTING — silently removing it from the comparison while the stage still reports no-regressions."
  evidence: "`node --test $TESTS` passes all 46 paths as one argument under zsh (no word-splitting), yielding \"Could not find '<all 46 paths>'\" and exit 1."
```

Hit twice in this run (zsh word-splitting, then macOS `xargs -a`). The verdict core is tested and correct; the hazard is upstream of it, in the exit codes the command's Bash hands over. **A capture that never ran is indistinguishable from one that ran and failed, by exit code alone** — and the failure direction is the dangerous one, because a bogus red at *base* silently deletes a gate from the comparison. Mitigated in this run by asserting each log carries a real completion signal before recording its code. **Outside the whitelist — reported, not fixed.**

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".claude/commands/pharn-dev-regress.md"
  problem: "The style-gate skip rule enumerates shared style configs but omits .gitattributes, which changes the very bytes on disk that the style gates read."
  evidence: "skip unless inside touches `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`."
```

Handled conservatively this run by running all three style gates rather than arguing a platform-dependent "no flip possible". One-line enumeration fix; the human's call.

---

## Proposed lesson for canon (P7 — proposed only; `/pharn-dev-review` never writes canon)

**Candidate:** *An exit code is not evidence that a check ran.* When a stage's verdict is computed from captured exit codes, capture a **liveness assertion** alongside each one (a real completion signal in the log) before recording it. A harness that fails to invoke a gate produces the same integer as a gate that ran and failed — and where a red at baseline is treated as "pre-existing, exclude", a never-run gate silently **deletes itself from the comparison** while the stage still reports success.

**Provenance:** this increment (`ci-matrix-os-node`, commits `9ef438c`, `489e8a4`); observed twice in one `/pharn-dev-regress` run — zsh not word-splitting `$TESTS`, then macOS `xargs` lacking `-a`. Both produced `tests: 1` at baseline; the true value was `0` (748 tests, 748 pass).

Not written here. Promotion is a separate human-gated `/pharn-dev-memory-promote` run under its own scope.

---

## Verdict

**GREEN — 0 floor-gate findings.** 5 advisory findings (3 important, 2 minor), of which **3 concern the dev-loop's own stage commands**, not this increment's product code, and are outside its whitelist.

Advisory means advisory: none of the above blocks the increment, and this review computes no proceed/stop — that is the human's at the post-review gate.
