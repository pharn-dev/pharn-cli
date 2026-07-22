# REVIEW — npm-publish-metadata

PHARN reviewing PHARN. Increment: rename the package to `pharn` + npm publish metadata (4 files, no `src/`). Under review as `trust: untrusted`.

- **Floor (Step 1):** `node .dev/floor/validate.mjs .dev/features/npm-publish-metadata` → `FLOOR: GREEN — 0 capabilities checked` (exit 0). The increment adds no markdown capability, so the structural floor is vacuously GREEN — it did not reach review with a RED floor.
- **Standing verdicts:** build floor `npm run check` GREEN (378/378) · regress `no-regressions` · verify `PASS`. Everything below the floor line is **advisory**.

## Floor-gate findings (blocking) — NONE

No blocking floor-finding. No unbacked guarantee (L-floor/P0), no missing eval binding (L-eval/P1 — vacuous, and the floor agrees: 0 capabilities), no tainted-field-driven decision (L-trust/P2), no sibling reference (L-axis/P3 — the increment is config + docs, no code imports).

## Advisory findings

### L-axis → P3 / P7

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: "package.json:37"
  problem: "The `build` script was changed to clean-then-compile — a change beyond the plan's listed package.json values (the approved concrete-values block named prepack/prepublishOnly but not `build`). It must be ratified by the human at GATE 2, not absorbed silently."
  evidence: "\"build\": \"node -e \\\"require('fs').rmSync('dist',{recursive:true,force:true})\\\" && tsc\""
```

Rationale (advisory): the change is **sound and needed** — `npm pack --dry-run` showed the tarball shipping ~11 orphaned `dist/` modules (`manifest.js`, `install-modules.js`, `wizard.js`, the old wizard steps) compiled from **deleted** sources, because `tsc` never prunes and `dist/` is gitignored. A clean build makes the plan's own "fresh dist, zero junk" acceptance deterministically true and protects the **manual-local first publish** (the task's documented first-publish path). It shares `package.json`'s single "correct publishability" axis rather than opening a new one — but it is a deviation, so it is surfaced for explicit ratification, not hidden.

### L-floor → P4 (documentation truth)

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: "README.md:60"
  problem: "The README still describes the REMOVED module/manifest model (module table, 'pick which PHARN modules and stack pack', privacy-posture wizard, `orm:prisma`), which contradicts the archetype-only code — a pre-existing P4 doc-vs-code drift in a file this increment edits."
  evidence: "PHARN ships as **modules** (subfolders of the pharn-oss repo). `pharn-core` is required; everything else is optional and depends on it."
```

Rationale (advisory): **pre-existing**, not introduced here; per GATE-1 (Q4) it was deliberately deferred to a **fast-follow** to keep PR1 tight, and this increment's edits (Install section, badge, single-bin note) introduce **no new** P4 violation. Flagged because the file I touched still carries the drift — the fast-follow increment should de-stale the module prose to archetype language.

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: "README.md:41"
  problem: "The Install section documents `npx pharn@latest init`, which resolves only AFTER the package's first publish (the package is E404 on npm today)."
  evidence: "npx pharn@latest init"
```

Rationale (advisory): standard pre-publish hygiene — a package's README documents its own install command, and the first publish is the immediate next step (PR2 + manual first publish). Noted for completeness; no change recommended.

## Lens summary

- **L-floor (P0):** clean — every guarantee reduces to floor (`files`/`prepack`/clean-build verified by `npm pack --dry-run`; repository URL verified against `git remote`) or is correctly labeled advisory (provenance is delivered by npm/Sigstore at publish, not by setting a JSON field — the plan says so).
- **L-eval (P1):** vacuous — no Capability, no `rule_id`; the floor agrees (0 capabilities). No binding to miss.
- **L-trust (P2):** clean — the reviewed files are author-written config/docs; the increment ingests no untrusted remote artifact; no instruction-looking content influenced this review; findings' free-text is quoted as DATA.
- **L-axis (P3):** clean — the 4 files change for one coherent axis (publish-readiness/rename); the doc edits are P4-mandated by the rename (leaving them false would itself violate P4); no code, so no sibling imports.

## Verdict

**GREEN — no blocking floor-findings.** 3 advisory findings (2 important, 1 minor) for the human to weigh at GATE 2. This is not a merge decision and not a `PHARN ✓ reviewed` seal — the standing floor verdicts (build GREEN / regress clean / verify PASS) are as shown; the merge/fix/abandon call is the human's.

## Proposed lessons (candidates only — NOT written to canon; `/pharn-dev-memory-promote` + human gate required, P2)

```yaml
- candidate: lessons-learned
  provenance: { feature: npm-publish-metadata, diff: "package.json build script; npm pack --dry-run" }
  lesson: "A gitignored build-output dir published via `files:` (here `dist/`) must be CLEANED before pack/publish (prepack = clean-then-build), because `tsc` never prunes orphaned output — otherwise `npm publish` ships `.js` compiled from since-deleted sources. `npm pack --dry-run` is the deterministic detector; run it before the first manual publish."
- candidate: lessons-learned
  provenance: { feature: npm-publish-metadata, diff: "grill/regress/verify runs" }
  lesson: "In this repo the dev-loop floor scans that walk the whole tree (`validate.mjs .`, `count-grillers .`, `lens-scanner-map.test.mjs`) are polluted by gitignored `test-*/` scratch installs — false-RED at the repo root, absent from a fresh checkout/CI. Measure them over tracked content (clean worktree) for an honest signal; a lasting fix is to have the scans exclude gitignored/scratch trees."
```
