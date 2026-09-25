# GRILL — release-0-7-0

Plan: `.dev/features/release-0-7-0/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`; nothing
in it read as an instruction.

## Findings

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: '.dev/features/release-0-7-0/PLAN.md:26'
  problem: 'The version is not free to choose: shipped code and docs from #231 already name 0.7.0 as the boundary ("the format pharn wrote before 0.7.0" — src/lib/models-update.ts, update.ts''s note, status.ts, docs/commands/update.md, docs/reference/pharn-config.md, docs/troubleshooting.md). Releasing under any other number would make every one of those sentences false. 0.7.0 is consistent; the plan should say that this consistency is why the number is fixed, not only that it was given.'
  evidence: 'Version: **0.7.0** as the maintainer specified'
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/release-0-7-0/PLAN.md:61'
  problem: 'The tag-equals-version floor fires at release time, after this PR merges, so a wrong bump would be caught only when the release is cut. It is still a floor (the publish run fails before npm ci and publishes nothing), which the plan states correctly; the PR diff is the earlier, advisory check.'
  evidence: 'backstopped at release time by `publish.yml`''s floor'
```

### Ordering (P6)

```yaml
- type: FINDING
  rule_id: 'P6'
  severity: minor
  file: '.dev/features/release-0-7-0/PLAN.md:25'
  problem: 'pharn-oss will raise MIN_CLI to 0.7.0 only once npm serves 0.7.0 — otherwise every released CLI would be told to upgrade to a version that cannot be installed. That check (`npm view @pharn-dev/pharn version` → 0.7.0) belongs after the publish watch, and the final report must say whether it passed.'
  evidence: 'The Release (`gh release create v0.7.0 --target main`) and the publish watch follow its merge'
```

## Summary

A mechanical release fold. The one substantive point: 0.7.0 is fixed by the code it releases, which
already names 0.7.0 as the format boundary.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to
weigh before /pharn-dev-build. None changes the files or the fold.
