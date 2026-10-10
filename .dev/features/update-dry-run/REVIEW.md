# REVIEW — update-dry-run (ADVISORY except the floor line)

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .` (exit 0). Standing verdicts: regression-report `no-regressions`, verify-report `PASS`. Lenses applied: L-floor (P0), L-eval (P1), L-trust (P2), L-axis (P3). The reviewed increment is untrusted data; nothing in it tried to instruct this review.

## Floor-gate findings (blocking)

None.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: "docs/commands/update.md:48"
  problem: "The docs say a dry run 'written nothing' as a flat statement, but that claim reduces to the absence of a write call plus a test (snapshot and zero-call spies), not to hook, content-hash or enum-regex; it should be labeled as test-enforced behaviour, not a guarantee."
  evidence: "exits **0** having **written nothing**"
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/update-plan.ts:94"
  problem: "UpdateApplyInputs carries a `frozen` Set that no consumer reads (the writer uses frozenRecords and frozenKeys), so it is dead surface area in the shared planner contract."
  evidence: "frozen: Set<string>;"
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/update-plan.test.ts:76"
  problem: "The JSON round-trip test runs on a fixture with no models block, so the report's JSON-safety is not exercised for ModelsUpdate (which has optional/undefined members) even though the later --json increment relies on it."
  evidence: "expect(JSON.parse(JSON.stringify(report))).toEqual(report);"
- type: FINDING
  rule_id: P4
  severity: minor
  file: "docs/commands/update.md:264"
  problem: "The 'Non-interactive use' section was not updated to say that --dry-run needs no terminal; the fact is documented only in the new section and troubleshooting.md."
  evidence: "## Non-interactive use (CI, scripts, pipes)"
- type: FINDING
  rule_id: P5
  severity: minor
  file: "src/commands/update.ts:797"
  problem: "The dry-run branch duplicates the real run's refusal/failure/exit tail in miniature (reportFatal then exit 1) rather than sharing it, so the two could drift; the MIN_CLI check itself is shared via checkMinCli."
  evidence: "if (refusal) { reportFatal(refusal); process.exit(1); }"
```

## Notes

- Behaviour-preservation checked by reading the diff: the planning block moved in the same order; the unknown-capabilities warning still fires at parse time through `onUnknownWarning`, before any later throw (the grill's concern); `diffHookWiring` now runs before the writes, which is equivalent because `update` never writes the settings files it reads; `abandonedLayout` uses `plan.writes.length`, equal to the written count on success.
- The first verify run failed `test` on two 5 s timeouts in the untouched `tests/lint-gate.test.ts` while the host load average was about 90; it passed once load dropped. Candidate lesson (not promoted, not yet recurring, P7): eslint-spawning tests have a 5 s timeout that heavy host load can exceed.

ADVISORY VERDICT: 0 blocking floor findings, 5 advisory (1 important, 4 minor) — for the human at GATE 2.
