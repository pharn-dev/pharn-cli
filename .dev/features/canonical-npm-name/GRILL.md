# GRILL — canonical-npm-name (advisory)

Plan under interrogation: `.dev/features/canonical-npm-name/PLAN.md`.
Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's `spec_content_hash`. No spec drift (the binding block on drift is `/pharn-dev-build`'s floor-gate; here it only confirms).

> The PLAN is `trust: untrusted` to this griller. `problem`/`evidence` free-text below quotes the plan as DATA; the enum-gated fields (`type`/`rule_id`/`severity`/`file`) are this griller's own membership/path assertions. Grillers gate nothing — this whole log is advisory (fix #3).

## Findings

### Axis: testability (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor # advisory assignment — a griller never gates (fix #3)
  file: ".dev/features/canonical-npm-name/PLAN.md:65"
  problem: "The rename of the user-facing help/error copy in src/index.ts (USAGE) and src/steps/prereqs.ts is not pinned by any test, so a future edit could silently reintroduce the deprecated scoped name without a red gate."
  evidence: "None required... the existing tests/index.test.ts --help assertion checks toContain('Usage:'), not the package-name string, so it stays green whether or not the USAGE string changes."
```

Note: this is a copy-only string change (no control-flow), so the miss is low-risk and P1 is arguably satisfied vacuously — but a one-line assertion (USAGE contains `pharn`, not `@pharn-dev/pharn`) would make the rename a *tested* fact for ~free. Surfaced for the human; not a gate.

### Axis: guarantee-audit / P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor # advisory assignment
  file: ".dev/features/canonical-npm-name/PLAN.md:69"
  problem: "The 'same file list as the scoped publish' guarantee is established by construction plus the local npm pack output, not by an actual list/byte diff against the already-published @pharn-dev/pharn@0.2.0 tarball (which is not fetched this run)."
  evidence: "Published tarball is pharn-0.2.0.tgz, same file list as the scoped publish; content diffs = package.json.name + the bundled help/error strings in dist/index.js ... floor: npm pack --dry-run output."
```

Note: the floor that *does* hold deterministically is `npm pack --dry-run` → tarball name `pharn-0.2.0.tgz` + its file list (`package.json` + `dist/`). "Identical to the *scoped* publish" is a reasoning claim (only the name field + two bundled strings changed), honest to label as such rather than as a verified diff. Low-risk; the file SET is unchanged by construction (`files: ["dist"]`).

### Axis: documentation (P7) — no finding

The documentation griller's own rule: a **mechanical rename** may legitimately need no new docs, and this increment *is* the documentation update — README, SECURITY, `docs/**`, and CHANGELOG all move to the canonical name in-scope. The public surface (package name + install command) is documented, not shipped as self-explanatory. Declaration recognized → **no absence finding**.

### Axes with no findings

- **P2 (trust):** N/A — the increment ingests no untrusted artifact (no manifest/degit content); no taint introduced. Correctly stated in the plan.
- **P3 (one axis / no sibling imports):** every touched file changes for the single axis "canonical package name"; no command→command or step→step import is added.
- **P5 (determinism):** no new branch; the three open questions were resolved by asking the human at GATE 1 (terminal fallback = ask, honored).
- **P7 (scope):** real trigger (publish under the free canonical name); not speculative; one axis, not two bundled.

## Tooling observation (not a plan finding)

`node .dev/floor/count-grillers.mjs .` reported **81** registered grillers — but **all 81 are under `test-*/` install fixtures** (`test-backend/pharn/...`, `test-full/pharn/...`, etc.), i.e. copies PHARN installed into this CLI's own test apps, not this repo's dev-loop grillers. The counter does not exclude the local test-app dirs, so it over-reports. This does not affect this increment (it is a dev-loop tooling quirk, not a defect in the plan), but the same over-count likely appears in `count-verifiers.mjs` at `/pharn-dev-verify` — noted so it is expected there. Recorded as prose (no `PLAN.md:line` to cite → not a finding-shape object).

## Summary

The plan is a tightly-scoped, single-axis mechanical rename that also updates all of its own user-facing documentation. The guarantee audit reduces its real claims to the floor (`npm pack`, `npm run check`) and labels the rest advisory; the trust surface is untouched; the three live-state contradictions (phantom `--wizard`, `provenance` mis-description, CHANGELOG layout) were surfaced and human-resolved before build. The only concerns are two **minor, advisory** ones: (1) the src copy rename is not pinned by a test, and (2) "identical to the scoped publish" is a reasoning claim, not a fetched-tarball diff. Neither blocks build.

## Verdict

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 2 minor/advisory) — for the human to weigh before `/pharn-dev-build`. This grill did NOT "pass" the plan and guarantees nothing; it surfaces the above. The only deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash, unresolved HALT questions) and `.dev/floor/validate.mjs`.
