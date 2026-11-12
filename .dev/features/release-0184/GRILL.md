# GRILL — release-0184

Plan: `.dev/features/release-0184/PLAN.md`. Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5…3c4e`, equal to the plan's `spec_content_hash` (no drift). Registered grillers:
`{"registered":0,"grillers":[]}` (`.dev/floor/count-grillers.mjs .`), so only the inline axes ran.

## Findings

### P6 — discovery completeness

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/release-0184/PLAN.md:25"
  problem: "The 'published CLI is unchanged' claim rests on a diff of src, README, LICENSE, package.json and scripts, but the bundle also depends on package-lock.json (esbuild bundles dependencies into dist/index.js) and tsconfig.json; checked during grill, `git diff --stat v0.18.3 origin/main` over those is empty too, so the claim holds — the plan should name them."
  evidence: "`git diff --stat v0.18.3 origin/main -- src README.md LICENSE package.json scripts` is empty"
```

### P4 — docs cite code

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/release-0184/PLAN.md:44"
  problem: "The new #358 entry describes a dev-loop change no user of the CLI sees; it should say so plainly (as #357's entry does with 'No change to the published CLI') and cite the test that pins it, so the release notes do not read as a user-facing change."
  evidence: "add a `### Changed` entry for #358, state that the published CLI's behavior is unchanged"
```

## Summary

A metadata-only release: no code path changes, so the guarantee audit is a factual check of the
published inputs, which the grill extended to the lockfile and tsconfig (both unchanged). The two
concerns are about naming that check fully and keeping the #358 entry clearly contributor-facing.
No trust, determinism or scope concerns.

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 0 important, 2 minor) — for the human to
weigh before /pharn-dev-build. This is not a judgment that the plan is sound.
