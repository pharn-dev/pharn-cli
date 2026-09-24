# GRILL — init-manual-carry

Plan: `.dev/features/init-manual-carry/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/init-manual-carry/PLAN.md:52'
  problem: 'The fingerprint and the parse are two separate reads. If the parse runs first and the file changes before the fingerprint is taken, the carry set comes from the OLD bytes while the fingerprint (and so the under-lock check) blesses the NEW ones — the concurrent write is lost with no refusal. Take the fingerprint BEFORE the parse, or derive both from one read, so any change in between fails closed.'
  evidence: 'the previous `(skillsVersion, commit)` stamp, and a config fingerprint'
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/init-manual-carry/PLAN.md:6'
  problem: 'update''s row 0 keeps ANY frozen entry (`frozen | any source → KEEP VERBATIM`), but the plan keeps only `source: manual` ones; a frozen AUTO entry (update kept it earlier) is still dropped by a re-run init and its files orphaned. Either extend the kept set to any source or name the gap — this is a question for the human, since GATE 1 approved the manual-only wording.'
  evidence: 'A manual entry whose capability upstream ships but this CLI cannot parse is KEPT as-is'
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/init-manual-carry/PLAN.md:48'
  problem: 'The carry computation (manualKeys / extra / kept / gone) is pure set logic over the previous config and the index; kept inside the command it is testable only through the fully mocked runInit. Acceptable, but keep it a pure function with no I/O besides the one tolerant read so the tests can pin every bucket.'
  evidence: 'replace `carriedManualCapabilities` with one tolerant read of the previous config returning'
- type: FINDING
  rule_id: 'P6'
  severity: minor
  file: '.dev/features/init-manual-carry/PLAN.md:59'
  problem: 'Records for a kept entry are selected by prefix at the NEW clone layout; if the re-run init also moves the install from flat to `pharn/`, the kept capability''s files and records sit at the old paths and nothing is carried. update behaves the same, so this is parity, but it should be named rather than implied away.'
  evidence: 'merge their records from the previous store (`recordsBaseline` + `recordsUnderCapabilities`, the pair `update` uses)'
```

## Summary

The plan closes a reproduced provenance bug (manual → auto) and a reproduced lost-write race, and brings
init into line with update's merge table for hand-added capabilities. The one soundness concern is the
order of the fingerprint and the parse: only fingerprint-first (or a single read) makes the new lock
check fail closed. The open design question is whether frozen AUTO entries get the same treatment as
frozen manual ones — update keeps both; the approved plan covers manual only. The other two are scope
notes.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 advisory — 2 important) — for the human to
weigh before /pharn-dev-build.
