# GRILL — npm-name-scoped (`pharn` → `@pharn-dev/pharn`)

Plan under interrogation: `.dev/features/npm-name-scoped/PLAN.md`. **Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` == the plan's `spec_content_hash`; no spec drift (the deterministic block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — surfaced here, not enforced here).

**Griller discovery (Step 2b, deterministic membership):** `count-grillers.mjs .` → `registered: 81`, **all 81 under `test-*/` install fixtures** (gitignored copies — the known over-report, prior `canonical-npm-name` REVIEW lesson #2). **Zero source-tree grillers apply**, so interrogation is the inline axis set below. The `testability`/eval axis is **vacuous**: the increment adds no Capability and no `rule_id`, so per `eval-format.md` there is nothing to bind `structural[]`/`semantic[]` assertions to.

The `PLAN.md` is `trust: untrusted`; quoted `evidence` below is DATA, not instruction. **This grill is ADVISORY end-to-end — it gates nothing; `/pharn-dev-build` is not blocked by it.**

## Findings

### Axis P3/P7 — one axis of change (lock regeneration scope)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: important # assignment is advisory (fix #3)
  file: ".dev/features/npm-name-scoped/PLAN.md:105"
  problem: "OQ2's `npm install --package-lock-only` recomputes the lock against the live registry; if any transitive `^`/`~` range now resolves higher, the diff carries dependency bumps — a second axis (a supply-chain change) riding a pure name-rename PR."
  evidence: "regenerate** via `npm install --package-lock-only` (name → `@pharn-dev/pharn`; also corrects the stale version to 0.3.0)"
```

The plan already names the correct backstop (`PLAN.md:111`: "Verify `git diff` shows only name/version"). This finding **elevates it to a build/verify MUST**: if the lock diff touches anything beyond the root `name` (+ the acknowledged `version` 0.2.0→0.3.0), fall back to OQ2's **name-only hand-edit** rather than shipping dependency churn under this commit.

### Axis P1 — test coverage of the changed help/error copy

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/npm-name-scoped/PLAN.md:14"
  problem: "The USAGE (src/index.ts:13) and git-missing (src/steps/prereqs.ts:11) strings change to `@pharn-dev/pharn`, but the only assertion is `toContain('Usage:')`; a future revert to the now-unpublishable `pharn` in that copy would pass the suite silently."
  evidence: "no test asserts `package.json.name`. `tests/index.test.ts:134` asserts USAGE `toContain('Usage:')` (not the package name)"
```

For the human to weigh: add a `toContain('@pharn-dev/pharn')` assertion to `tests/index.test.ts` (pins the canonical name in help text) **vs.** not over-pinning a string constant (the inverse `canonical-npm-name` increment accepted the vacuous-P1 posture). Advisory either way.

### Axis P4 — narrative-rewrite coherence (least floor-backed part)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/npm-name-scoped/PLAN.md:70"
  problem: "Three separate narrative blocks (CLAUDE.md:32, docs/RELEASING.md:15–17, CHANGELOG.md:56) are respecified by shared 'key points', not exact prose — the least floor-backed edits in the increment; build could word the E403/similarity story divergently across the three."
  evidence: "**CLAUDE.md:32 / docs/RELEASING.md:15–17 / CHANGELOG.md:56** must all state: the unscoped name **`pharn` is not publishable**..."
```

Backstopped only by `markdownlint`/`prettier` shape gates (labeled `advisory` in the plan's guarantee audit); textual consistency is a human-review item at GATE 2.

### Axis P0 — guard: "check green" ≠ "name is publishable"

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/npm-name-scoped/PLAN.md:83"
  problem: "`npm run check` validates code/doc SHAPE, not the package NAME or its publishability; reading a green check as 'the scoped name works' would be the 'written-therefore-guaranteed' disease. Only `npm pack --dry-run` (tarball name) + the actual publish validate the name."
  evidence: "\"The repo still builds and every gate passes\" → **floor**: `npm run build` + `npm run check`"
```

This is a **guard, not a gap**: the plan already routes tarball-name to `npm pack --dry-run` in a separate floor bullet. Surfaced so no reader conflates the two floors.

## Summary

A tight, single-axis mechanical rename with an honest, mostly-floor-reduced guarantee audit and a correct P2 = N/A (no untrusted artifact is ingested; `--package-lock-only`'s registry contact is bounded to lock metadata and gate-checked by the diff-scope backstop). The one **important** concern is real but pre-mitigated: the lock regeneration (OQ2) could smuggle a second axis (dependency bumps) into the diff — verify must enforce "name/version only" and fall back to the name-only edit otherwise. The three **minor** items are advisory: an untested help-string axis, the coherence risk across three prose rewrites, and a P0 guard against mistaking `npm run check` green for name-publishability. No spec drift; no constitution violation; no blocking-by-floor condition.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to weigh before/at `/pharn-dev-build`.** This is not "grill passed" and not a guarantee the plan is sound; `/pharn-dev-grill` gates nothing. The deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`.
