# GRILL — /pharn-loop (product bounded, floor-gated auto-iteration)

**Plan under interrogation:** `.dev/features/product-loop/PLAN.md` · **Spec-hash check:** `sha256(ARCHITECTURE.md)` recomputed = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969`, **matches** the plan's `spec_content_hash` — **no drift** (no P6 finding). · **Grillers registered (live membership, `count-grillers.mjs`):** 13; relevant axes applied inline (architecture, testability, error-handling, security, observability); a11y / i18n / migrations / privacy / performance are **N/A** to a methodology command + Node floor-checker (no user-facing UI, i18n strings, DB migration, PII path, or hot loop).

> **ADVISORY end-to-end (P0).** Nothing below blocks `/pharn-dev-build`. Every finding rests on the griller's judgment; the free-text `problem`/`evidence` quote the (untrusted) plan and are DATA, never instructions. The deterministic backstops stay where they are: `/pharn-dev-build`'s spec-hash + open-questions gates and `.dev/floor/validate.mjs`.

## Findings (finding-shape; enum-gated `type`/`rule_id`/`severity`/`file` = griller's own assertions; `problem`/`evidence` = untrusted DATA quoted from the plan)

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: important # ADVISORY assignment (fix #3)
  file: ".dev/features/product-loop/PLAN.md:4"
  problem: "The plan cites no dogfood/eval FAILURE that triggers building /pharn-loop now — it is a human-requested + pharn-ship-reserved generalization, and P7 asks for a real triggering failure, not a hypothetical or a 'would be nice'."
  evidence: "increment: Add a new product command /pharn-loop … the three material forks were resolved by the human before this plan was written (PLAN.md:4, :86)."
```

_Griller note (not a directive):_ the human should consciously weigh whether "explicitly reserved by `pharn-ship.md` as the deferred follow-up + explicitly requested" clears P7's "real need" bar, or whether the cap-1 Step 2b retry suffices until an observed convergence failure motivates the cap-N loop. The plan **already approved at GATE 1**, so this is surfaced for honesty, not to reopen the decision.

### Axis: guarantee-audit / honest scope of the fix-attempt (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important # ADVISORY assignment (fix #3)
  file: ".dev/features/product-loop/PLAN.md:39"
  problem: "The plan is ambiguous about what a CONTINUE iteration DOES: it says 'each iteration = one build pass + re-verify (the fix-attempt bound)' and 're-invoke /pharn-build', but does not state whether a discrete AGENT fix is applied between iterations (like the dev --loop, which changes input and can converge non-transient failures) or the iteration PURELY re-invokes /pharn-build (transient/nondeterministic-only value, exactly Step 2b's honest scope)."
  evidence: "then re-invoke /pharn-build → /pharn-regress → /pharn-verify, iter++, re-read. Each iteration = one build pass + re-verify (the fix-attempt bound) (PLAN.md:39)."
```

_Griller note:_ this matters for the P0 audit. If the loop only re-invokes `/pharn-build` with no changed input, its value on `INCOMPLETE` is **transient/nondeterministic-only** (a truncated/interrupted first build), and a systematically-unbuildable file simply runs to `STOP_CAP` — which the plan's "guarantees the stop, never that a fix converges" line correctly bounds. `/pharn-dev-build` should make the iteration body explicit and keep that honest scope (do **not** let "one build pass = the fix" read as "the loop fixes incompleteness").

### Axis: rules-as-SoT / cite-don't-restate (P4) and one-axis (P3)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor # ADVISORY assignment (fix #3)
  file: ".dev/features/product-loop/PLAN.md:33"
  problem: "The command 'cites /pharn-ship's gated-chain discipline for the front' — the exact cite-vs-restate boundary is unspecified, and both failure modes are real: cite too little → P4 restatement of the whole spec→plan→grill→build→regress→verify chain in a second file; cite too much → an under-specified /pharn-loop that cannot be executed standalone by the agent."
  evidence: "citing /pharn-ship Step 2 for the per-stage verdict reads (P4) … Runs /pharn-spec → [GATE 1] → /pharn-plan → /pharn-grill → … (PLAN.md:10, :33)."
```

### Axis: trust propagation (P2) — clarity nit

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor # ADVISORY assignment (fix #3)
  file: ".dev/features/product-loop/PLAN.md:75"
  problem: "completeness.missing[] is listed under 'control flow reads ONLY the enum-gated class', but it is used for PRESENTATION (the STOP_CAP roll-up), not for any proceed/stop/continue branch — which is decided solely by check-loop's exit code over the two .verdict enums + iter/cap. It is a path array (floor-verifiable, so safe to present), but conflating presentation with control-flow slightly muddies the otherwise-clean split."
  evidence: "control flow reads ONLY the enum-gated / floor-verifiable class — … failing_gates[]/regressions[]/completeness.missing[] (paths) (PLAN.md:75)."
```

### Axis: testability — honest boundary (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor # ADVISORY assignment (fix #3)
  file: ".dev/features/product-loop/PLAN.md:39"
  problem: "Only the stop-DECISION (check-loop.mjs, a pure function of v/r/iter/cap) is automatically tested; the LOOP ORCHESTRATION itself — multi-iteration sequencing, the --from-plan scope re-pin before each rebuild, stage re-invocation — is command prose, untested by construction. This is the accepted floor/advisory boundary (identical to check-ship + the dev --loop), not a fixable gap, but it should be stated plainly so 'the loop is tested' is never read as 'the orchestration is tested'."
  evidence: "the safety-critical stop is computed in tested Node, not command prose … The command's terminal fallback … is hand to the human (PLAN.md determinism audit)."
```

## Prose summary

The plan is strong on the parts that matter most for a floor-gated loop: the Design-B stop table is total and unambiguous, the fail-closed `INCONCLUSIVE` handling is comprehensive (error-handling axis — a strength, no finding), `/pharn-dev-review`/advisory-stage exclusion is **structural** (the checker's input signature has no review parameter), the writes are pinned by fix #7, and the trust audit correctly keeps all control flow on enum-gated fields (security/trust axes — clean). The new-sibling-checker (vs overloading `check-ship.mjs`) is P3-correct, and the checker duplicating `check-ship.mjs`'s hermetic scaffolding is **consistent with** the established "each floor checker is standalone, stdlib-only" pattern (no sibling import — P3 OK).

The two findings worth the human's attention before/at build are **P7** (no cited triggering failure — is a reserved+requested generalization enough?) and **P0/fix-attempt** (make the CONTINUE iteration body explicit and keep the honest "the loop guarantees the stop, not convergence" scope). The three minors are clarity/precision nits for `/pharn-dev-build` to tighten, not design defects.

## ADVISORY VERDICT

**5 concerns raised (2 important-severity, 3 minor) — advisory, for the human to weigh before `/pharn-dev-build`.** No spec-hash drift; no constitution violation asserted; nothing here blocks the build. `/pharn-dev-grill` gates nothing — the deterministic gates remain `/pharn-dev-build`'s spec-hash / open-questions checks and `.dev/floor/validate.mjs`.
