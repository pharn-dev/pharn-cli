# GRILL — init-archetype-default (interrogation of PLAN.md)

**Plan:** `.dev/features/init-archetype-default/PLAN.md` · **Spec-hash check:** MATCH (`sha256(ARCHITECTURE.md)` == plan's `spec_content_hash` `bca940a5…`) — no drift. · **Griller membership (floor):** 13 registered (`count-grillers.mjs`, vendored in `test-app/`); isolated runner deferred (P7) — relevant lenses applied inline; a11y/i18n/migrations/privacy/observability/performance are N/A for an internal CLI refactor (no UI/data/PII/telemetry surface). · **Status: ADVISORY — gates nothing.**

## Findings (finding-shape; free-text = quoted DATA from the untrusted plan)

### axis: documentation

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/init-archetype-default/PLAN.md:27"
  problem: "The Files list plans no CLAUDE.md or docs/ update, yet CLAUDE.md documents the init step-pipeline as the v1/v2 wizard flow (runInitLegacy/runInitV2) and its Documentation discipline says docs/ is user-facing and kept in sync with code; deleting those flows makes that prose stale."
  evidence: "## Files (Scope A-clean) ... Explicitly NOT touched (live back-compat — must stay): src/lib/manifest.ts, install-modules.ts, installer.ts, wizard.ts"
```

### axis: testability

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/init-archetype-default/PLAN.md:53"
  problem: "The no-404 regression guard is specified as 'mock-not-called' on fetchRemoteManifest/loadManifest, but once init.ts stops importing manifest.js there is nothing in init's module graph to spy on; a positive assertion (archetype path invoked: detect+resolve+installCapabilities) or a static 'init.ts has no manifest.js import' assertion is the more robust deterministic guard."
  evidence: "no-404 regression guard: the default init path makes **no** call to `fetchRemoteManifest`/`loadManifest` (asserted via mock-not-called)."
```

### axis: guarantee-audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/init-archetype-default/PLAN.md:59"
  problem: "The label 'floor-adjacent' is non-canonical: the guarantee taxonomy is floor-reducible (hook / content-hash / enum-regex) OR advisory. A vitest behavioral assertion is advisory-with-CI-enforcement, not a floor primitive — the plan is otherwise honest (it explicitly says 'Not a new hook/content-hash primitive'), so this is a labeling nit, not the disease."
  evidence: "→ **floor-adjacent**: enforced by the rewritten `tests/init.test.ts` mock-not-called assertion + `typecheck` ... Not a new hook/content-hash primitive."
```

### axis: scope / one-axis-of-change (P3 / P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/init-archetype-default/PLAN.md:24"
  problem: "Scope A-clean bundles a behavior change (init default -> archetype + delete legacy symbols) with a dead-code sweep (9 orphaned step files + tests) — two reasons to change. This is ACKNOWLEDGED: the plan surfaced A-minimal as the smaller alternative and the human explicitly chose A-clean at GATE 1, so the bundle is a weighed decision, not a hidden one."
  evidence: "Scope A-clean (this plan's recommendation): rewire init default → archetype; delete the init-level legacy symbols **and** the 9 now-orphaned step files + their tests."
```

### axis: eval-coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/init-archetype-default/PLAN.md:50"
  problem: "The '## Evals to write (P1)' items are vitest unit tests, not eval-format.md capability evals with structural[]/semantic[] arrays; since the increment adds no Capability/rule_id, P1's ≥1-eval-per-Capability rule does not bind here — the plan should state P1 N/A explicitly to avoid conflating unit tests with capability evals."
  evidence: "## Evals to write (P1)"
```

## Prose summary

The plan is grounded, honest, and unusually careful about the one thing that most often goes wrong here: it does **not** overclaim. It correctly rejects the request's literal ask (delete `manifest.ts`/`install-modules.ts`) as infeasible-in-one-increment with a concrete back-compat proof, and its security audit explicitly refuses to claim it closes the Fable symlink finding (installModule survives via add/update). No blocking concern was found; the spec-hash matches.

Two concerns are worth the human's attention before build:

1. **Doc sync (important).** CLAUDE.md's "`commands/init.ts` is a step pipeline" narrative and its v1/v2 descriptions go stale the moment `runInitLegacy`/`runInitV2` are deleted, and CLAUDE.md's own Documentation-discipline note says docs/ tracks code. The Files list plans no such update. Either add CLAUDE.md/docs to the increment or record an explicit follow-up.
2. **No-404 guard shape (important).** "mock-not-called" is a fragile way to prove a negative once the symbol is no longer imported; a positive "archetype path invoked" assertion (or a static no-import check) is the deterministic guard that actually survives the refactor.

Three minor items are labeling/hygiene: the "floor-adjacent" wording (P0 taxonomy), the acknowledged A-clean bundle (already chosen at GATE 1), and stating P1 N/A explicitly. None changes the build.

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to weigh before /pharn-dev-build. This grill-log gates nothing; the floor backstops (spec-hash drift, unresolved HALT questions, validate.mjs) remain /pharn-dev-build's.**
