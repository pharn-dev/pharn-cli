# GRILL — first-feature-spec-entry

Plan under interrogation: `.dev/features/first-feature-spec-entry/PLAN.md`.
Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's `spec_content_hash` (no drift).
Griller discovery (`node .dev/floor/count-grillers.mjs .`): 81 registered — but **all 81 are inside `test-*/` fixture installs** (the local sample apps), i.e. installed *products*, not first-party interrogators of this CLI dev-loop plan. This CLI repo vendors **no** repo-root griller (it clones pharn-oss's grillers at runtime), so none applies. The testability axis is handled inline (Step 2) below.

## Findings (advisory — grill gates nothing, fix #3)

### Correctness / build-safety

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/first-feature-spec-entry/PLAN.md:11"
  problem: "The proposed label 'capture your first feature's intent' contains an apostrophe; the current consumer wraps the label in a SINGLE-quoted string — pc.dim('plan your first feature') at install-archetype.ts:92 — so a naive swap closes the string early and breaks the build. The builder must escape it (\\') or use double-quotes/backticks."
  evidence: "retarget the step-2 dim label `plan your first feature` → `capture your first feature's intent`"
```

_(The deterministic floor — typecheck/build in `npm run check` — WOULD catch this as a RED, so it cannot ship broken; surfaced here so the builder picks a safe quote up front and avoids a red floor round-trip.)_

### Eval coverage (testability axis, inline)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/first-feature-spec-entry/PLAN.md:43"
  problem: "The new test pins the CONSTANT value but nothing asserts the printed next-steps output actually references FIRST_FEATURE_COMMAND. The label edit at install-archetype.ts:92 is thus untested end-to-end; a test that the rendered 'Next steps' contains the constant would couple hint↔constant (more meaningful than exact-prose assertion)."
  evidence: "assert `FIRST_FEATURE_COMMAND` starts with `PRODUCT_COMMAND_PREFIX` … and equals `/pharn-spec`"
```

### Honest scope (P7) — guard against overstating

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/first-feature-spec-entry/PLAN.md:13"
  problem: "Doc rewording must say 'recommended first', NOT 'required'. Nothing in the tooling enforces running /pharn-spec — the command is copied unconditionally, but whether the user runs it is their choice. The plan already says 'recommended first' (correct); this is a guard so the builder does not drift to 'required'/'must' wording (P7/P4)."
  evidence: "reword the \"it's optional\" clause to \"recommended first\""
```

### One axis of change (P3) — recorded, not re-litigated

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/first-feature-spec-entry/PLAN.md:62"
  problem: "Option A couples a code-hint change (the constant + its label) with a docs methodology-stance reframe (optional → spec-first) — arguably two axes: the CLI's printed hint vs the product's optional/mandatory stance. This was THE open question and the human explicitly chose Option A at GATE 1, so it is a recorded, accepted trade-off — flagged only for continued visibility, not as a new objection."
  evidence: "Q1 → Option A (spec-first is the new norm). Approved by the human at GATE 1"
```

## Prose summary

The plan is small, well-audited, and honest: its guarantee audit reduces the one real guarantee ("`/pharn-spec` is installed") to the prefix-copy floor with an explicitly-labeled advisory residual (pharn-oss actually shipping the file), its trust audit is correctly N/A (no untrusted ingestion), and its determinism audit is clean (no new branch). The spec-hash matches, so the plan is built against the current `ARCHITECTURE.md`.

The one concern worth acting on before build is **mechanical, not conceptual**: the approved label text contains an apostrophe that will collide with the existing single-quoted string literal — the floor would catch it, but the builder should choose a safe quote deliberately. The remaining notes are minor: the label edit lacks a direct test (the constant is covered), the doc wording must stay "recommended" (honest scope, since nothing enforces spec), and Option A's coupling of hint + stance is a two-axis trade-off the human already accepted at GATE 1.

## Verdict

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to weigh before `/pharn-dev-build`. Grill gates nothing; the deterministic backstops (spec-hash drift and an unresolved `## Open questions (HALT)` at `/pharn-dev-build`; `.dev/floor/validate.mjs`) remain where they always were.
