# GRILL — ci-matrix-os-node (M7) — **ADVISORY, gates nothing**

Plan under interrogation: `.dev/features/ci-matrix-os-node/PLAN.md`.
**Spec-hash check:** recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's pin. No drift. (The computation is content-hash floor-grade; the *block* on drift is `/pharn-dev-build`'s gate, not this one.)
**Griller discovery (FLOOR — enum membership):** `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`. **No griller capabilities exist in this repo**, so Step 2b contributed nothing and the inline axes carry this entire grill. Stated so the coverage is not overread: the `testability` griller the stage doc names lives in pharn-oss, not here.

The plan is treated as `trust: untrusted`. Its self-claims are tested, not believed.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/ci-matrix-os-node/PLAN.md:106"
  problem: "The plan fuses two DIFFERENT claims about `.gitattributes` into one row, and the only proof it schedules (Phase C's renormalize check) verifies the weaker one; the claim that actually matters is verified nowhere but the probe's Windows cell."
  evidence: "\"Source bytes are LF on every OS at checkout\" → FLOOR — git's, declared … | \"The renormalization is a no-op today\" → git add --renormalize . && git diff --cached --stat must be empty"
```

Sharpened: `git add --renormalize .` run on **this macOS working tree** proves the *index does not change* — a statement about the repo's current bytes. It says nothing whatsoever about **what a Windows runner checks out under `core.autocrlf=true`**, which is the entire red-class `.gitattributes` is being shipped to kill. The two are separate claims with separate evidence, and only the second one matters. Recommendation: keep both proofs but stop presenting the renormalize output as evidence for the checkout claim — the Windows cell going green **is** that evidence, which is precisely the probe's job.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/ci-matrix-os-node/PLAN.md:103"
  problem: "The plan labels the soft-tier gate FLOOR without naming HOW it executes in CI — no workflow step runs it, and floor.yml is a declared non-goal, so its CI enforcement rides entirely on its own test's live-repo block."
  evidence: "\"No workflow in this repo declares a soft tier\" | FLOOR — primitive #3 (enum/regex), NEW in this increment."
```

Not a defect — it is the exact mechanism `check-action-pins` and `check-run-pins` already rely on, and the plan read that precedent correctly. But the reduction is only honest when stated end-to-end: **the gate runs in CI because `floor.yml`'s `node --test "**/*.test.mjs"` collects `check-soft-tier.test.mjs`, whose `★ LIVE REPO-CONSISTENCY` block invokes the checker against the real tree.** Delete that `★` block and the gate becomes decorative while still looking like floor. Recommendation: say so in the script header, and treat the `★` block as load-bearing rather than as a nicety.

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/ci-matrix-os-node/PLAN.md:41"
  problem: "The new floor gate is NOT exercised by /pharn-dev-build's own floor — validate.mjs does not call check-soft-tier.mjs and npm run check does not collect .mjs tests — so a build that goes GREEN proves nothing about the gate this increment adds."
  evidence: "`.dev/floor/check-soft-tier.mjs` — new, deterministic scanner … layer: floor (primitive #3)"
```

Concrete and checkable: `/pharn-dev-build`'s verdict is `node .dev/floor/validate.mjs .`, and `validate.mjs` walks markdown frontmatter — it never invokes the `check-*` scanners. `npm run check` = `format:check + lint + typecheck + vitest`, and vitest globs `tests/*.test.ts`, not `.dev/**/*.test.mjs`. So **both** of this stage's automatic verdicts are blind to the new gate. Recommendation (process, not plan-shape): run `node --test ".dev/**/*.test.mjs"` explicitly during build and paste the result — otherwise the increment's only genuinely new floor primitive ships unexecuted locally, and its first real execution is on a runner.

### Axis: determinism / honest scope (P5, P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: important
  file: ".dev/features/ci-matrix-os-node/PLAN.md:34"
  problem: "Coverage-on-every-cell interacts with a fact the plan never records: vitest.config.ts enforces four coverage thresholds, so all five cells now gate on them — converting any platform-specific test skip into a red cell that reports a coverage table instead of a test name."
  evidence: "3. **Coverage runs on EVERY cell** (draft proposed canonical-cell-only; overruled). Consequences, all simplifications:"
```

**This is the finding I would most want a human to see before the probe runs.** Measured this run: `vitest.config.ts:13-18` sets `thresholds: { statements: 90, branches: 82, functions: 95, lines: 92 }`, described in its own comment as *"Conservative floors set just below current measured coverage so CI stays green."* Those floors were calibrated against **exactly one platform**. Two consequences the plan calls "all simplifications" but are not:

1. If any test skips or short-circuits on Windows/macOS — a `symlinkSync` fixture hitting `EPERM`, a platform-gated branch — coverage **drops below a floor tuned to have no headroom**, and the cell goes red on a *coverage table*, not a test name. That is a materially harder triage than a failing assertion, and it is a **new** red-class not in the brief's §3 taxonomy.
2. `coverage.include: ['src/**/*.ts']` is a glob evaluated against paths on the runner. A glob/separator mismatch on Windows would not fail loudly — it would yield an **empty include set**, and empty-set threshold behavior is a silent-catastrophe shape rather than a clean red.

I am **not** recommending reversing the human's decision — coverage everywhere has real value, and this is advisory. I am recommending that HALT 1's triage treat *"red on coverage threshold"* as its own named class, per §3's `Unclassified` rule, rather than filing it under a test failure it is not.

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/ci-matrix-os-node/PLAN.md:33"
  problem: "The increment now bundles two independent concerns — a measurement (the matrix) and an enforcement (the soft-tier gate) — after the plan's own draft argued they should be separate tickets."
  evidence: "2. **The soft-tier fence IS built in this increment** (draft recommended deferring; overruled)."
```

Raised for the record, not to relitigate: the human weighed this and chose to bundle, which is legitimate. The residual cost is concrete — a red probe cell and a soft-tier-gate bug are now independent failure modes landing in one PR, so a revert of one is a revert of both. Worth one sentence in the PR description so the coupling is visible to a future bisect.

### Axis: trust propagation (P2)

No finding. The increment ingests no untrusted artifact, and the plan's fix-#1 discipline for the new scanner (verdict = integer count; offending line copied to output as data only) matches `check-action-pins.mjs`'s stated contract. Recorded as checked, not skipped.

### Axis: one axis of change / no sibling imports (P3)

No finding. Each planned file has one reason to change, and the plan's R3 explicitly **refuses** to share an enumerator module between floor scripts — preserving the no-floor-script-imports-another isolation rather than "DRY-ing" it into a shared dependency. That is the right call and the plan already gives the reason.

---

## Axis checked and DE-RISKED (reported so the absence of a finding is evidence, not silence)

I suspected the single most common first-red cause for this exact change — **platform-specific optional deps missing from `package-lock.json`**, the `@esbuild/*` / `@rollup/*` class that makes `npm ci` fail on a platform the lock was not generated on. Measured rather than assumed:

- `@esbuild/*` — **26** platform variants present, including `darwin-arm64`, `linux-x64`, `win32-x64`
- `@rolldown/binding-*` — **11** variants, including `win32-x64-msvc` and `darwin-arm64`
- `lightningcss-*` — all platforms including `win32-x64-msvc`

The lockfile is fully populated across the matrix's three platforms. Residual, stated: *the lock containing a variant is not proof `npm ci` selects and links it correctly* — only the probe proves that. But this axis is healthier than expected and should **not** be the first place to look at HALT 1.

---

## Summary

The plan is unusually explicit about what it does **not** guarantee, and its two strongest moves are both defensible under interrogation: refusing to write a tautology-test over `ci.yml`, and refusing to share an enumerator between floor scripts. Its guarantee audit is genuinely complete in structure — every row carries a reduction or an `advisory` label.

The concerns are concentrated in one place: **things the GATE-1 amendments changed that the plan then re-described as simplifications without re-checking their consequences.** Coverage-on-every-cell is the sharp one — it silently recruits four calibrated-with-no-headroom thresholds into the gating set of four never-before-exercised platforms, and produces a red shape the brief's taxonomy does not have a row for. The other cluster is verification blindness: the increment's one genuinely new floor primitive is invisible to both `/pharn-dev-build`'s floor and `npm run check`, so nothing automatic in this pipeline will execute it before it reaches a runner.

Nothing here argues against building. Two items (the coverage-threshold class, the explicit `node --test` run) are cheap enough to absorb during the build without a plan change.

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 3 important, 2 minor), plus 1 axis checked and de-risked — for the human to weigh before `/pharn-dev-build`. This is not a pass, not a gate, and not a judgment that the plan is sound; `/pharn-dev-grill` gates nothing.**
