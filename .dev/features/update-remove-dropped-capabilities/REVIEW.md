# REVIEW — update-remove-dropped-capabilities (iteration 2)

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0, `FLOOR: GREEN — 0 capabilities checked in .` (vacuous for this TypeScript increment). `/pharn-dev-verify` iteration 2: `PASS`; `/pharn-dev-regress`: `no-regressions`. The increment under review is `trust: untrusted`; no instruction-looking content in it changed this review's behaviour.

Reviewed: `git diff ff9312f..HEAD` — `src/lib/capability-dir.ts` (new), `src/commands/remove.ts`, `src/lib/update-plan.ts`, `src/lib/update-report.ts`, `src/commands/update.ts`, comment-only edits in `src/lib/merge-capabilities.ts`, `src/commands/add.ts`, `src/lib/dest-drift.ts`, their tests, and the docs named in the plan.

## Iteration 1 findings — disposition

- Floor-gate (test timeouts outside the increment): **cleared** — the iteration-2 full run is green at lower host load; nothing outside `## Files` was touched.
- Advisory P5 (abort line derived from removal backups, not deletes): **fixed** — `backupAction(report.backups.length > 0, deletes)` with `deletes = report.removals.some((r) => r.present)`; pinned by `names the removal in the backup notice even when the deleted directory needed no copy`.
- Advisory P2 (upstream now drives a deletion): **fixed** — `docs/commands/update.md` "Upstream decides membership" bullet; also carried into the LIMITS.md hand-over text.
- Advisory P5 (type cast on the drop reason): **fixed** — `isDrop` type guard.
- Advisory P4 (LIMITS.md is human-only): **open by design** — replacement text handed over at GATE 2.

## Floor-gate findings (blocking)

None.

- L-floor (P0): containment reduces to `safeChildJoin` (strict child) and `findSymlinkComponent` (refusal from the planner, before any write); classification to membership + sha256 equality against the stamp-checked store; the order backup → delete → write is labelled control flow and tested (`a delete that fails stops the run before any write`, `refuses the whole run when the backup cannot be made`). "Deletes nothing else" is tested by a stray file in a kept capability and a byte-identical `.claude/settings.json`; `--dry-run` writing nothing by the whole-tree snapshot.
- L-eval (P1): 5 unit (`capability-dir`), 11 planner, 12 `update` integration, 2 dry-run text (snapshot + parity), 3 dry-run JSON, and projection/byte-pin tests in `update-report`.
- L-trust (P2): removal paths derive from the local, ingest-validated config names at the config's layout; the clone decides only membership (now documented as such).
- L-axis (P3): `capability-dir.ts` has one axis; consumers reach it through `lib/`; no command→command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'LIMITS.md:71'
  problem: "LIMITS.md still says '`update` never deletes' and cites src/commands/remove.ts / src/commands/update.ts by line numbers this increment shifted; it is human-only, so the replacement text is handed over at GATE 2."
  evidence: 'capability is restored at its new path and the old copy is left on disk — `update` never deletes'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'docs/commands/update.md:274'
  problem: 'Directories an older pharn already orphaned (no config entry) are neither found nor cleaned; documented with the manual fix, and a re-run init still drops without deleting (the agreed follow-up). Recorded so both are weighed at GATE 2.'
  evidence: 'Directories that an older `pharn` left behind when it dropped a capability'
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'src/lib/update-plan.ts:390'
  problem: 'The scan and the delete are a check, not a lock: a local process changing files between the planner and rmSync is not covered (the same unmodelled local race remove and add name). Stated in removal-backup.ts; not repeated in the update docs.'
  evidence: 'In the real run this runs under the project lock immediately before the writes'
```

## Proposed lesson (not written to canon)

None beyond the environmental note: full-suite timeouts under heavy host load are not regressions; re-run at lower load before treating a timeout outside the diff as a finding.

VERDICT: GREEN — 0 floor-gate findings, 3 advisory (minor) findings. This review is advisory; the merge / fix / abandon decision is the human's.
