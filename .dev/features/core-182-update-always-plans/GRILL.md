# GRILL — core-182-update-always-plans

Plan: `.dev/features/core-182-update-always-plans/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` = the plan's `spec_content_hash` (no drift).
Registered grillers (`node .dev/floor/count-grillers.mjs .`): `{"registered":0,"grillers":[]}` — inline axes only.

## Findings (advisory)

### P1 — eval coverage

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/core-182-update-always-plans/PLAN.md:116'
  problem: "The rewritten 'does not re-open' table leaves the expected outcome of four rows (absent, corrupt, torn store; Prettier project without a store) to 'the run', which risks pinning whatever the code does instead of an intended behaviour."
  evidence: 'Final split decided by the run, reported at GATE 2.'
```

State the intended outcome before writing the assertion: with no usable store, a same-version plan behaves as a
version bump does (records note, a store minted/rewritten from what is on disk), and say so in update.md and the PR body.

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: '.dev/features/core-182-update-always-plans/PLAN.md:140'
  problem: 'No eval pins that the header note now prints after the plan and only when it changes something; an up-to-date run printing no header is an observable contract the plan names but does not test.'
  evidence: 'same version, nothing changed: exactly one tarball download, outro `Up to date.`, no confirm'
```

### P4 — docs cite code

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: '.dev/features/core-182-update-always-plans/PLAN.md:57'
  problem: "Text and JSON disagree for a kept-edit-only plan: the text outro says 'Nothing to change.' while --json says status 'up-to-date'; the JSON reference must say up-to-date covers both verdicts."
  evidence: '`changesNothing` ? `unchangedOutcome` (no header, no confirm, no write; outro `Up to date.` or `Nothing to change.`)'
```

### P0 — guarantee audit

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: '.dev/features/core-182-update-always-plans/PLAN.md:44'
  problem: 'The cost of a download on every up-to-date run is stated only in the ticket; the docs should say a plain update always downloads (and that --dry-run does too), so no reader infers the old no-network up-to-date answer.'
  evidence: 'Every run downloads and plans once.'
```

### P7 — scope

No finding: every deletion is triggered by the removed gate; the Concurrency-section doc fix is a P4 repair in a
section the plan already rewrites.

## Summary

The plan is coherent and grounded in a spike. The main concern is honesty about the four store-less/stale-store rows:
their new behaviour (a same-version run rewriting or minting `pharn.records.json`) is a user-visible change that
should be stated, not discovered. Second, the text/JSON verdict split for kept edits needs one sentence in the JSON
reference. Both are cheap to address during build.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor) — for the human to weigh before
/pharn-dev-build. This grill gates nothing.
