# REVIEW — remove-preserve-user-files

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0, `FLOOR: GREEN — 0 capabilities checked in .` (vacuous for this TypeScript increment; the deterministic gates that matter are `/pharn-dev-verify`'s, all exit 0). The increment under review is `trust: untrusted`; no instruction-looking content in it changed this review's behaviour.

Reviewed: `git diff 1e59c51..HEAD` — `src/lib/removal-backup.ts` (new), `src/commands/remove.ts`, `tests/removal-backup.test.ts` (new), `tests/remove.test.ts`, and the docs named in the plan. Dist smoke run by hand: a user file was backed up and the directory deleted; with `.pharn-backup` a symlink the run exited 1 and deleted nothing.

## Floor-gate findings (blocking)

None.

- L-floor (P0): the order "backup completes before the first delete" is labelled in code comments and docs as deterministic control flow demonstrated by tests, not a floor primitive (`src/commands/remove.ts`, `backupBeforeDelete` header). The classification reduces to `Object.hasOwn` membership + sha256 equality against a stamp-checked store; containment is `safeJoin`/`safeChildJoin`. No unlabelled guarantee found.
- L-eval (P1): every new behaviour has a vitest test: 13 unit tests (`tests/removal-backup.test.ts`) and 13 integration tests (`tests/remove.test.ts`, `backup before delete`), including the failure path on both the named and picker paths and the lock release.
- L-trust (P2): no fetched input; record keys are compared, never joined (pinned by a unit test with a `../../etc/passwd` key). The scan addresses directories through the same `safeChildJoin` as the delete, so a hand-edited `..` name is refused before any read — the existing `the delete itself refuses name …` tests (whole-tree snapshot unchanged) still pass, which they would not if the scan had walked `pharn/` and written a backup.
- L-axis (P3): `removal-backup.ts` has one axis (which files a removal would lose); `remove.ts` reaches `backup.ts`, `removal-backup.ts`, `install-records.ts` through `lib/`; no command→command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'src/commands/remove.ts:184'
  problem: 'The refusal message double-punctuates when the underlying error already ends in a period (observed on a dist run with a symlinked .pharn-backup).'
  evidence: 'Could not back up the files in a11y (lens) before removing: .pharn-backup is a symlink; refusing to write backups through it.. Nothing was removed.'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'LIMITS.md:82'
  problem: 'LIMITS.md still names the whole-directory delete as an unmitigated residual and cites src/commands/remove.ts by line numbers this increment shifted; it is a human-only trusted doc, so the agent did not edit it (replacement text handed over at GATE 2).'
  evidence: "`remove`'s delete takes the **whole directory** at that address, including files you added inside it."
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'src/lib/removal-backup.ts:45'
  problem: 'Walk-then-delete is a check, not a lock: a local process changing files between the scan and rmSync is not covered. Stated in the code; the docs do not mention it (consistent with how add/dest-drift present the same unmodelled local race).'
  evidence: 'NOT a lock (stated, P0): the walk reads the tree at time T and the delete runs at T+1.'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'docs/commands/remove.md:79'
  problem: "Behaviour change worth the human's attention: on projects without a usable pharn.records.json every remove now writes a backup of the whole capability directory. Approved at GATE 1 (decision 3) and stated in CHANGELOG; recorded here so it is weighed at GATE 2."
  evidence: 'The backup copies everything that qualifies, however large'
```

## Proposed lesson (not written to canon)

None — no recurring failure pattern beyond this one finding.

VERDICT: GREEN — 0 floor-gate findings, 4 advisory (minor) findings. This review is advisory; the merge / fix / abandon decision is the human's.
