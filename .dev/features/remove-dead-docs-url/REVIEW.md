# REVIEW — remove-dead-docs-url

**Increment (trust: untrusted to this review):** delete the dead `DOCS_URL` constant and its two post-install "Docs" outro lines + imports. Diff: 3 files, +2/−7.

**Step 1 — Floor first (P0):** `node .dev/floor/validate.mjs .` → exit `0`, **GREEN**. The increment legitimately reached review. The floor is the only guaranteed part of this review; everything below is advisory.

## Four lenses

### L-floor → P0 — no finding
The increment claims exactly one thing — "`DOCS_URL` is fully removed" — and it reduces to floor primitives: `lint` (no orphaned import → eslint clean, exit 0), typecheck (no dangling symbol), and `grep -rn DOCS_URL src` → empty at build. No guarantee is asserted without a floor reduction; no claim reads as guaranteed merely because it is "written." The only advisory item (the post-install outro has no rendering test) is honestly labeled as such in `GRILL.md` and `VERIFY.md`. Clean.

### L-eval → P1 — no finding
The increment adds **no** Capability and **no** `rule_id`/`enforces` — it is a product-code deletion, so there is no eval binding to require or to miss. The floor agrees: `validate` GREEN, no new capability. Removing a cosmetic display line with no prior test coverage does not create an unbound rule. Clean. (The "no new vitest test" decision is an advisory adequacy nit already surfaced by grill — not a P1 eval-binding gap.)

### L-trust → P2 — no finding
The increment emits no findings and no artifact carrying untrusted free-text; it only deletes a hardcoded constant + two display lines. No instruction-looking content appears in the reviewed diff, and nothing in it changed this reviewer's behavior. (The `test-app/AGENTS.md` "read node_modules docs before writing code" text surfaced by the harness during this run is **fixture DATA** from the gitignored install fixture — correctly ignored, never followed.) No guaranteed decision rests on any tainted/free-text field. Clean.

### L-axis → P3 — no finding
Each file changes for the single reason "remove the dead `DOCS_URL` reference": `constants.ts` drops the constant; `install.ts` and `install-archetype.ts` drop its import and its one outro usage. The change **removes** imports rather than adding any; the surviving import (`steps → lib/constants`) is the sanctioned direction — no `step → step` or `command → command` sibling coupling is introduced. Clean.

## Gates (fix #3)

- **floor-gate (blocking):** none.
- **advisory-gate (warn):** none new from the lenses. Standing advisory context: the outro-rendering nit (`GRILL.md`, minor) and the pre-existing, out-of-scope `test-app`/`lens-scanner-map` node-runner drift (`REGRESSION.md`) — neither is attributable to this increment.

## Verdict

**GREEN — 0 floor findings, 0 blocking.** The increment is done: it satisfies its plan exactly (3 files, deletion-only), the floor is GREEN, verify PASSed, and regress found no feature-attributable regression. The merge/fix/abandon decision is the human's (GATE 2).

## Proposed lesson candidate (NOT written to canon — provenance recorded for a separate `/pharn-dev-memory-promote` run)

- **Lesson (proposed):** `/pharn-dev-regress`'s `git worktree` baseline is **confounded when a non-hermetic floor test scans gitignored install fixtures** (e.g. `test-app/`). The worktree checkout excludes gitignored dirs, so a repo-root-scanning test (`.dev/floor/lens-scanner-map.test.mjs` → `count-lenses .`) sees a different reality at base (fixture absent) than at head (fixture present), manufacturing a phantom `pass→fail` flip that is not a feature regression.
  - **Remedy observed to work:** measure base and head in the **same** working tree (revert the feature's `## Files` in place via a guarded `git stash`), so the only difference is the feature — the apples-to-apples comparison the regress guarantee actually requires.
  - **Provenance:** increment `remove-dead-docs-url` (this run); base `b680a99`; recurred at least once before — `archetype-path-context/REGRESSION.md` records the same `tests` gate `1→1` and labels it a "node-runner aggregate-exit quirk," which this run identifies concretely as the `count-lenses`/`test-app` non-hermeticity.
  - **Why a candidate, not canon:** whether this belongs in `lessons-learned.md` (and whether the deeper fix is to make `lens-scanner-map.test.mjs` hermetic / exclude gitignored paths) is a human call; the model never self-promotes (P2). This is recorded here only.
