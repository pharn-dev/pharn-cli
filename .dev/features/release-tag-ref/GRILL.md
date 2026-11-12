# GRILL — release-tag-ref

Plan: `.dev/features/release-tag-ref/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` = the plan's `spec_content_hash` → **no drift**. Registered grillers (`count-grillers.mjs .`): `{"registered":0,"grillers":[]}`, so only the inline axes ran.

## Findings

### Guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/release-tag-ref/PLAN.md:69'
  problem: "The audit calls refs/tags resolution 'GitHub's documented full-ref semantics', but the endpoint's docs name `tags/TAG` (which answers 422), not `refs/tags/TAG`. The tag-only resolve is measured behaviour of an external service, so it should be labelled advisory and not called documented."
  evidence: "That GitHub's `commits/refs/tags/<name>` resolves only `refs/tags/<name>` is GitHub's documented full-ref semantics, MEASURED this run for an annotated tag"
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/release-tag-ref/PLAN.md:67'
  problem: 'The guarantee audit covers only the release channel. The `main`-channel change (commits/refs/heads/main) has no entry: its claim (a tag named `main` cannot answer) and its unchanged failure mode (null → the LIMITS §3b float, which already downloads `refs/heads/main`) are not stated.'
  evidence: '## Guarantee audit (P0)'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/release-tag-ref/PLAN.md:59'
  problem: 'The annotated- and lightweight-tag evals cannot differ. With `application/vnd.github.sha` both stubs answer a bare commit id, and the dereference happens inside GitHub. Two cases would show the same thing twice and read as if the CLI handles tag types. Keep ONE case asserting there is no second (dereference) request, and leave the annotated-tag evidence to the live measurement.'
  evidence: "annotated tag (stub answers the dereferenced commit) → `{kind:'release', sha: <commit>}`, two requests"
```

### Docs in sync (P4)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: '.dev/features/release-tag-ref/PLAN.md:41'
  problem: "Two acceptance criteria of CORE-169 (LIMITS.md and THREAT-MODEL.md describe the tag-only resolve) can't be met by the build, because both files are hook-protected. Merging publishes 0.18.5, so unless the human applies the proposed text before merge, the release ships with LIMITS §3e and THREAT-MODEL describing the old resolve."
  evidence: '### Proposed for the human (hook-protected — the agent cannot write them)'
```

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/release-tag-ref/PLAN.md:5'
  problem: 'The increment bundles two resolves (release tag and main branch). The human chose this at GATE 1, and both are one-line URL changes of the same class, so this is noted rather than objected to. The main-channel risk is lower (the main channel is unverified content anyway).'
  evidence: "and the `main` channel's SHA resolve asks for `commits/refs/heads/main`"
```

### Trust propagation (P2), one axis (P3), determinism (P5)

No findings. No new untrusted input is ingested, `tag_name` still passes `RELEASE_TAG_RE` before becoming a URL segment, each file keeps its one reason to change, and no new branch is added.

## Summary

The plan is small and grounded in live measurements. The concerns are about labelling, not mechanics:

- The tag-only resolve depends on GitHub behaviour that was measured but isn't documented, so it should be stated as advisory.
- The annotated-vs-lightweight pair of tests would be theatre.
- The main-channel half is missing from the guarantee audit.
- The two protected docs need the human's edit before a merge that publishes.

(Out of scope, seen in passing: THREAT-MODEL.md l.146 still says the commit-SHA resolve has "no separate cap", which has been stale since F-21 added `MAX_SHA_BYTES`. It is hook-protected, so it is for the human.)

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 3 important, 2 minor), for the human to weigh. This verdict gates nothing.
