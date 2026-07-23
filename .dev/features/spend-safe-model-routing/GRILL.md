# GRILL — spend-safe model-routing defaults + post-install visibility

- Plan under interrogation: `.dev/features/spend-safe-model-routing/PLAN.md` (approved as written; doc-link resolved URL-free).
- Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's `spec_content_hash`. No drift (the actual block remains `/pharn-dev-build`'s floor-gate, fix #4).
- Griller discovery (`count-grillers.mjs`): reports `registered: 81`, but **every path is inside a `test-*/` fixture install** (`test-backend/pharn/…`, `test-next/pharn/…`, …) — pharn-cli ships **no root griller set** (`pharn-pipeline/grillers/` does not exist at the repo root). Those are duplicated test fixtures of pharn-oss, not grillers of this CLI's plan, so none is run over this plan. Interrogation below is the inline Step 2 set. _(Advisory note for humans: the scanner walking into `test-*/` installs is a tooling observation, not a finding against this plan.)_

This grill-log is **ADVISORY end-to-end** — it gates nothing. Every finding below rests on model judgment; the `severity` values are advisory assignments (fix #3). The floor backstops are unchanged: `/pharn-dev-build`'s spec-hash + open-questions gates and `.dev/floor/validate.mjs`.

## Findings (finding-shape; enum-gated fields trusted, free-text inherits the plan's untrusted tag)

### Axis: deterministic gate completeness (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/spend-safe-model-routing/PLAN.md:22"
  problem: "The plan's completeness gate is 'npm run check green', but `check` = format:check && lint && typecheck && test and EXCLUDES `lint:md` — yet this increment edits two markdown artifacts (docs/reference/pharn-config.md and CHANGELOG.md) that `lint:md` (markdownlint-cli2 'docs/**/*.md' '*.md') is the CI gate for. The doc/CHANGELOG could pass `check` locally and fail CI's separate lint:md gate."
  evidence: "PLAN.md checklist inherits '## Checklist ... npm run check green'; package.json check omits lint:md; docs line 22 + CHANGELOG line 26 add markdown."
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/spend-safe-model-routing/PLAN.md:20"
  problem: "The 'rendered from the actual written config, not re-hardcoded' guarantee is discharged ONLY by the formatModelRoutingLines unit test (which feeds a non-default routing). No init/status integration test feeds a NON-default config through the outro/note, and the init outro string itself is deliberately untested (consistent with the remove-dead-docs-url precedent). The claim holds, but its proof is indirect — worth stating so review does not expect an init-level 'not hardcoded' assertion."
  evidence: "PLAN.md:20 'built from formatModelRoutingLines(config.models) (the just-written config — not re-hardcoded)'; Evals section tests the formatter directly."
```

### Axis: one axis of change per file (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: important
  file: ".dev/features/spend-safe-model-routing/PLAN.md:19"
  problem: "Placing the presentation renderer formatModelRoutingLines in model-routing.ts co-locates a display concern with schema/validation/resolution. The plan asserts 'the models block is one axis' but does not flag the tension: a future change to the display format (e.g. ' · ' → ' / ') would then touch the same file as the validator — arguably a second reason-to-change. Defensible either way; a dedicated src/lib/model-routing-format.ts (importing ModelRouting + PIPELINE_STAGES, lib→lib is allowed) sidesteps the debate. Surface for /pharn-dev-review to confirm the home."
  evidence: "PLAN.md:19 '(c) add a pure renderer formatModelRoutingLines(routing: ModelRouting): string[]' in src/lib/model-routing.ts, which today holds only allowlists + DEFAULT + validate + resolve."
```

### Axis: determinism / strict-null narrowing (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/spend-safe-model-routing/PLAN.md:20"
  problem: "config.models is OPTIONAL in PharnConfig (models?: ModelRouting), so under strict/noUncheckedIndexedAccess `formatModelRoutingLines(config.models)` in the init outro is a type error (ModelRouting | undefined → ModelRouting). The plan names the guard for status (line 21) but NOT for the init path (line 20). Build must narrow it (if (config.models)) or render the in-scope DEFAULT_MODEL_ROUTING — else typecheck (a floor gate) fails."
  evidence: "PLAN.md:20 passes config.models unguarded; types.ts:116 declares `models?: ModelRouting`; status line 21 correctly guards with `config.models !== undefined`."
```

### Axis: docs cite code accurately / user-facing precision (P4)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/spend-safe-model-routing/PLAN.md:26"
  problem: "CHANGELOG.md already has a `### Changed` (line 10) and `### Added` (line 18) under `## [Unreleased]`. The plan says to add `### Changed` + `### Added` — build must MERGE into the existing subsections, not create duplicates, or markdownlint MD024 (no-duplicate-heading) fires under lint:md (ties to the P1 gate finding)."
  evidence: "CHANGELOG.md:8 '## [Unreleased]', :10 '### Changed', :18 '### Added'; PLAN.md:26 'under ## [Unreleased]: ### Changed (...) + ### Added (...)'."
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/spend-safe-model-routing/PLAN.md:20"
  problem: "The rendered block shows a `default` row, but `default` lives at config.models.default — NOT under config.models.stages. The pointer line names only 'models.stages', so a user wanting to change the shown `default` (which governs build/grill/regress/verify/ship) would look under .stages and not find it. Consider 'the models block' or 'models.stages / models.default' for precision (init pointer + the doc's edit instruction at line 22)."
  evidence: "PLAN.md:20 pointer 'change routing anytime in pharn.config.json → models.stages'; the block's first line renders `default` from models.default."
```

## Summary

The plan is well-grounded (discovery is live, the SoT is correctly located in-repo, the default-flip is covered end-to-end by an existing assertion, and the trust/determinism audits are honest). No blocking-severity concern and no constitution-violation signal. Six concerns, all actionable at build time:

- **Two important, mechanical (P1, P5):** the completeness gate `npm run check` does **not** run `lint:md`, so the markdown edits need `npm run lint:md` explicitly (else CI fails); and the init outro must **narrow** the optional `config.models` (or render `DEFAULT_MODEL_ROUTING`) to typecheck.
- **One important, judgment (P3):** the renderer's home (`model-routing.ts` vs a dedicated format module) is a real "one axis" tension the plan asserts away — flagged for `/pharn-dev-review` to confirm.
- **Three minor (P1, P4×2):** the "not hardcoded" proof is indirect (formatter test only); the CHANGELOG edits must merge into the existing `### Changed`/`### Added` (MD024); and the pointer line's `models.stages` is imprecise for the shown `default` row.

None of these changes the plan's shape; they are refinements the build/verify stages should absorb (add `lint:md` to the gates run; narrow `config.models`; merge CHANGELOG headings; and let review adjudicate the renderer's home).

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 3 important, 3 minor) — for the human to weigh before /pharn-dev-build. This is NOT a pass/fail gate; /pharn-dev-grill guarantees nothing.
