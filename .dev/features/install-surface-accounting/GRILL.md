# GRILL — install-surface-accounting (ADVISORY)

Plan: `.dev/features/install-surface-accounting/PLAN.md` (with its GATE 1 "Resolved decisions"). Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/install-surface-accounting/PLAN.md:49'
  problem: 'Most init/update tests build MINIMAL fixture clones (no contracts, no floor, no LICENSE, often no hooks). After this change every such run warns / prints NOT SHIPPED; any existing assertion that log.warn or note was not called, or that pins the exact note list, will break. Decide per test whether to complete the fixture or assert the new output — never loosen an assertion to make it pass.'
  evidence: 'any existing fixture now flagged gets the surface or an expectation'
- type: FINDING
  rule_id: P0
  severity: important
  file: '.dev/features/install-surface-accounting/PLAN.md:74'
  problem: 'The accounting is derived from the MANIFEST, while init copies through installCapabilities. "The copy and the accounting agree by construction" holds only through the shared name predicates plus the existing mirror test (manifest == real install). The plan must extend that mirror test with an .mjs hook and say "pinned by test", not "by construction", for the copy side.'
  evidence: "single-sourced so the copy, update's writes and status's diff agree by construction"
- type: FINDING
  rule_id: P5
  severity: minor
  file: '.dev/features/install-surface-accounting/PLAN.md:23'
  problem: "On the pharn layout resolveFeaturesReadme falls back to the ROOT features/README.md when pharn/features/README.md is absent; the reported path for an absent README must be the layout's preferred path, and a clone shipping only the root fallback must count as shipped (not absent). Pin both."
  evidence: "for the features README the layout's preferred path when neither candidate exists"
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/install-surface-accounting/PLAN.md:108'
  problem: 'The layout advisory line is new and explicitly NOT a --strict input. The strict pin must use a case where the diff is otherwise clean (mocked) and the clone layout differs from the recorded one, and assert exit 0 under --strict AND the line printed; plus the --json "layout" pair. Otherwise the "keep today''s strict behaviour" decision is unpinned.'
  evidence: 'It is NOT a `--strict` input; its strict behaviour stays what it is today, pinned by a test.'
- type: FINDING
  rule_id: P7
  severity: minor
  file: '.dev/features/install-surface-accounting/PLAN.md:67'
  problem: "update's same-version early return exits before planning, so an absent surface is reported by update only on a run that plans; on an up-to-date install only status names it. Acceptable (status is the ongoing check) but the update doc must not claim every update run reports it."
  evidence: 'update: plan reports `absentUpstream`; text run + dry-run print `NOT SHIPPED`'
- type: FINDING
  rule_id: P3
  severity: minor
  file: '.dev/features/install-surface-accounting/PLAN.md:26'
  problem: 'absentInstallSurfaces re-walks the fixed surfaces (≈200 files upstream) separately from the manifest the caller already built; cheap, but keep it a single internal enumeration (collectInstallManifest) so the two cannot diverge, rather than a second hand-written list.'
  evidence: 'the rows whose `files === 0` from `collectInstallManifest({ repoDir, capabilities: [], layout })`'
```

## Summary

The plan is grounded in the code and in a live upstream check, and Q2's correction (absent = upstream ships zero files, at the clone's layout; layout mismatch is a separate, non-strict advisory) keeps the label honest. Concerns: fixture churn in init/update tests (complete fixtures or assert the new output, never weaken); state the copy-side agreement as test-pinned (extend the mirror test with `.mjs`); pin the features-README fallback and reported path; pin the layout line's non-strict behaviour with a clean-diff case and the `--json` pair; keep the update doc honest about the early return; derive the accounting from one enumeration.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 6 advisory) — for the human to weigh before /pharn-dev-build. This log gates nothing.
