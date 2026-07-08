# GRILL — seam-config-block (ADVISORY)

Plan: `.dev/features/seam-config-block/PLAN.md`. Spec-hash check: **MATCH** —
`sha256(ARCHITECTURE.md)` = `bca940a5…d729d3c4e` equals the plan's `spec_content_hash` (no spec
drift). Registered grillers: **0** (`node .dev/floor/count-grillers.mjs .` → `{"registered":0}`), so
only the inline Step-2 axes ran. This log is **advisory end-to-end** — it gates nothing; `/pharn-dev-build`'s
floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`
remain the only deterministic backstops.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/seam-config-block/PLAN.md:94"
  problem: "A cheap FLOOR cross-check is available but omitted — DEFAULT_SEAM_CONFIG's conformance to the canonical seam-config contract is left purely advisory when the existing deterministic .dev/floor/check-seam-config.mjs could verify it."
  evidence: "\"The CLI validator's enums equal pharn-contracts/seam-config.md + check-seam-config.mjs\" → advisory. No automated cross-artifact check exists … a manual consistency invariant."
```

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/seam-config-block/PLAN.md:88"
  problem: "\"DEFAULT_SEAM_CONFIG is asserted valid by an eval\" is guaranteed only against the CLI's OWN validator — the same validator the plan admits may drift from the SoT — so the assertion is weaker than it reads unless cross-checked against the floor contract."
  evidence: "readPharnConfig returns null if it throws; DEFAULT_SEAM_CONFIG is asserted valid by an eval (P1)."
```

## Interrogated and found SOUND (recorded so the interrogation is legible, not padding)

- **P7 non-goal accuracy — verified live.** The plan defers `add`/`update` seam handling, claiming it
  "mirrors what those verbs already do for `models`." Grounded, not assumed: `src/commands/add.ts` and
  `update.ts` both write `{ ...config, … }` (spread the existing config read by `readPharnConfig`,
  which carries the whole raw object), so an existing `seam` block is **preserved** on rewrite exactly
  as `models` is. The non-goal is safe — no silent data-loss of the seam block on `add`/`update`.
- **P1 eval shape.** These are `vitest` unit tests over a plain TypeScript validator, not `role:`
  Capability evals, so `eval-format.md`'s `structural[]`/`semantic[]` split does not apply and there is
  **no** judge-laundering risk — every assertion is deterministic (structural by nature). Matches the
  `model-routing.test.ts` precedent. Not a finding.
- **P2.** The plan's trust audit is concrete and correct: untrusted config, verdict over enum-gated
  fields only, extra free-text ignored (the plan even evals the "instruction-looking extra field still
  validates" needle), no value path-joined → no `safeJoin` needed. Conforms to `check-seam-config.mjs`'s
  P2 posture and `finding-shape.md`.
- **P3 / P5.** One axis per file (the new validator is its own file; the two install-step edits are the
  same "write the default" edit each already makes for `models`); imports are lib→lib only (allowed).
  All branches are membership/type tests, fail-closed. No findings.

## Summary

The plan is tight, honest, and conforms to the trusted `pharn-contracts/seam-config.md` after the two
plan-time conflicts were resolved toward the contract. Its guarantee audit is unusually candid — it
does **not** oversell the CLI↔contract consistency, correctly labeling it advisory.

The one concern worth the human's weighing (both findings are the same point at two severities): the
plan treats "the shipped `DEFAULT_SEAM_CONFIG` conforms to the canonical seam contract" as a *manual*
invariant, yet the contract already has a deterministic embodiment — `.dev/floor/check-seam-config.mjs`
— that a single `vitest` test could run against `DEFAULT_SEAM_CONFIG` (write it to a temp file, spawn
the checker, assert exit 0), converting that advisory claim into a **floor cross-check** for at least
the default. That is the P0-spirited move (advisory → floor where cheaply possible). The honest
counter-weight, and why this is advisory not blocking: it couples the CLI's `tests/` to a `.dev/floor/`
dev-loop artifact (a path outside the shipped package), which the human may reasonably decline; the
plan's reject-`"max"` / accept-`"medium"` evals already pin the CLI side to the contract's enum values,
just not to the checker itself. Either choice is defensible — hence surfaced, not gated.

## Verdict

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 1 important, 1 minor — both the same
floor-cross-check point) — for the human to weigh before `/pharn-dev-build`. This is **not** a "grill
passed" and confers no guarantee (P0); the plan may be built as-is or lightly strengthened per the
finding.
