# GRILL — publish-pack-destination

Plan: `.dev/features/publish-pack-destination/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/publish-pack-destination/PLAN.md:34'
  problem: 'A `mkdir -p` anywhere earlier in the FILE does not create the directory for the pack: each job runs on its own runner, so a mkdir in another job (or in a later-defined job that YAML order puts first) would satisfy the scan while the Pack step still hits ENOENT. The scan must look only inside the same job, before the pack line.'
  evidence: 'or a `mkdir -p <dir>` precedes it in the same file'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/publish-pack-destination/PLAN.md:33'
  problem: 'The same directory can be spelled `$RUNNER_TEMP/pkg`, `"$RUNNER_TEMP/pkg"`, `${{ runner.temp }}/pkg` or `${RUNNER_TEMP}/pkg`; matching the mkdir to the pack destination by raw text would call a correct workflow broken (or miss a broken one). Normalize quotes and the runner-temp spellings to one form before comparing.'
  evidence: '`<dir>` is either exactly `$RUNNER_TEMP` / `${{ runner.temp }}`'
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/publish-pack-destination/PLAN.md:32'
  problem: 'check-run-pins.test.mjs is the test of the run-line PIN checker; a pack-destination pin is a different reason to change. PHARN-07 already hosts publish.yml job-structure pins there (id-token, npm floor), so this follows precedent — say so in the test comment rather than leave the axis blur implicit.'
  evidence: '`.dev/floor/check-run-pins.test.mjs` — ★ live test: for every `npm pack --pack-destination <dir>`'
```

## Summary

The plan fixes a real, reproduced release blocker with a one-line workflow change and pins it with a
live-text test plus a positive control. The main concern is the scan's scope: "same file" is weaker
than "same job, earlier in it", and only the latter is what makes the directory exist on the runner
that packs. Normalizing the runner-temp spellings keeps the check from false alarms. The test's home
is a minor axis question with precedent on the plan's side.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before
/pharn-dev-build; all three are foldable into the build without changing the plan's Files.
