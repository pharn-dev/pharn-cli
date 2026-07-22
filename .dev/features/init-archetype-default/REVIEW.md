# REVIEW — init-archetype-default

**Increment:** make the archetype flow the default (and only) `pharn init`; delete the legacy module/wizard init path (`runInitLegacy`/`runInitV2`/`loadManifest` + 19 orphaned files); keep `--archetype` as a no-op alias; retain `manifest.ts`/`install-modules.ts`/`installer.ts`/`wizard.ts` for `add`/`update` legacy-config back-compat.

**Step 1 floor:** `validate.mjs .` GREEN (exit 0) over the tracked scope. The review below is advisory.

## The four lenses

### L-floor → P0 — GREEN

Every guarantee the increment makes reduces to the floor or is honestly labeled. The one security claim is stated with rare discipline — it explicitly **refuses to overclaim**:

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/init-archetype-default/PLAN.md:59"
  problem: "The guarantee audit labels the behavioral no-404 claim 'floor-adjacent'; canonically a claim is floor-reducible (hook/content-hash/enum-regex) OR advisory, and a vitest+CI assertion is advisory-with-CI — a labeling nit, ADVISORY, already flagged at grill. The built code itself makes no unlabeled guarantee."
  evidence: "→ **floor-adjacent**: ... Not a new hook/content-hash primitive."
```

No blocking P0 finding. The security posture actually **improves**: the default install no longer routes through the symlink-vulnerable `install-modules.ts` `installModule` (the archetype path's `install-capabilities.ts` rejects symlinks); the plan correctly notes this does NOT fully close the finding (`installModule` survives via `add`/`update`).

### L-eval → P1 — GREEN

The increment adds no Capability and no `enforces` `rule_id`, so P1's ≥1-eval binding does not bind. Every new behavior nonetheless ships a test in-increment: archetype-default + no-manifest-import guard (`tests/init.test.ts`), no-op flag alias (`tests/index.test.ts`), and the deletions are covered by typecheck (no dangling refs) + a green suite. `tests/init-archetype.test.ts` (engine e2e) is unchanged and still covers the install machinery. No missing binding.

### L-trust → P2 — GREEN

The increment emits no findings/free-text and ingests no new untrusted input — it removes a code path. Nothing in the reviewed artifact was instruction-looking or altered reviewer behavior. The retained archetype path already validates the untrusted fetched repo (validate.ts allowlists + `safeJoin` + symlink rejection); this increment does not weaken it. No guaranteed decision rests on a tainted field.

### L-axis → P3 — GREEN

Each changed file carries one coherent axis: `init.ts` (make archetype the default + delete legacy), `index.ts` (flag no-op + honest help + call change). No cross-sibling-module reference (pharn is a single package; no `pharn-contracts` routing applies). The A-clean bundle (behavior change + dead-code sweep) is a P7-scope choice, human-accepted at GATE 1 — not a P3 file-axis violation.

## Advisory findings (inform the GATE-2 decision; block nothing)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "CLAUDE.md:42"
  problem: "Deferred doc-sync (grill #1): CLAUDE.md's 'commands/init.ts is a step pipeline' / v1-v2 narrative and docs/commands/init.md still describe the now-deleted legacy init flow. The scope decision deferred this (CLAUDE.md's init prose is entangled with the module model that SURVIVES for add/update legacy configs — a careful reconciliation, not a mechanical sync). ADVISORY: real accuracy gap; recommend a follow-up increment."
  evidence: "**v1 (`runInitLegacy`):** a loop of `module-select` ... **v2 (`runInitV2`):** `mode-select` (Default / Custom) ..."
```

## Verdict

**GREEN — 0 blocking floor-findings.** Four lenses pass on the built code; the standing floor verdicts are BUILD `npm run check` = 0, REGRESS = `no-regressions`, VERIFY = `PASS`. The remaining items are advisory: one **important** deferred doc-sync (CLAUDE.md/docs), and minor labeling/scope nits already weighed at grill/GATE-1. None blocks; all are the human's to weigh at the post-review gate.

## Proposed lessons (candidates only — NOT promoted; a gated `/pharn-dev-memory-promote` run decides)

Two **real** recurring gotchas surfaced during this build (P7 — real, not hypothetical; provenance: this increment):

1. **`PLAN.md` `## Files` format for deletion/glob increments.** The writes-scope setter + `check-build-complete.mjs` scan back-tick paths under `## Files` and require each **concrete** one to EXIST after build; `isConcrete` treats `{a,b,c}` brace-globs as a single literal path. **Lesson candidate:** list only created/modified (must-exist) paths as concrete back-tick items in the scanned region; put deletions under a `### Deleted` heading (removed via `git rm`, which the enforce hook does not gate); never use brace-glob shorthand.
2. **`validate.mjs .` is whole-repo and scans untracked `test-app/`.** A gitignored local `build:install-local` artifact (with deliberately-red `test-fixtures/`) flips `validate` red in the working tree but not on a clean checkout/CI. **Lesson candidate:** at `/pharn-dev-regress` / `/pharn-dev-verify`, measure the whole-repo `validate` gate over the tracked/CI scope (untracked `test-app/` set aside) so base/head and working-tree/CI compare like-for-like.
