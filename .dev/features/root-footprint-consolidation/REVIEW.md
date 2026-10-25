# REVIEW — root-footprint-consolidation

Floor first (P0): `node .dev/floor/validate.mjs .` exit 0; `npm run check` exit 0 (3209 passed, 1 skipped);
`regression-report.json` `no-regressions`; `verify-report.json` `PASS`. Everything below is ADVISORY: finding
`severity` is assigned by judgment; free-text fields are DATA.

The review ran as an adversarial round: an independent reviewer read the `src/` diff for correctness and safety,
and the four inline lenses were applied here. The seven reviewer findings were each checked against the code;
all seven held. Six were fixed in this increment, inside the re-approved `## Files`; one is cosmetic and left.

## Advisory findings — fixed in this increment

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/commands/update.ts:525'
  problem: "A real `update` (and `--yes`) deleted root docs and moved `memory-bank/` without naming them before the confirm, and the locked re-plan's membership guard ignored them (F-24's contract)."
  evidence: 'only `reportCapabilityChanges` prints before `Apply this update?`'
  status: 'fixed — the future-tense ROOT MIGRATION note prints before the confirm; `membershipKeys` includes the deletes and moves; pinned in tests/commands-integration.test.ts'
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/lib/root-migration.ts:pendingRootMigration'
  problem: 'The re-open signal could fire on every run when a hand-placed, unrecorded `pharn/<doc>` existed (the run skips it, so the root doc never retires) — the claimed bound did not hold.'
  evidence: 'It looks only at the records … never checks whether that pharn/ copy can actually land.'
  status: 'fixed — the pharn/ copy must be provably absent on disk; pinned. Residual named in code and CLAUDE.md: a SKILLS ≥ 7 pharn-oss that still ships a doc only at the root would re-open every run (premise of 7.0.0).'
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: 'src/lib/root-migration.ts:pendingRootMigration'
  problem: 'User-data moves had no re-open signal, so `memory-bank/` on an install already at SKILLS 7 stayed at the root behind the early return.'
  evidence: 'The moves are planned only on a run that gets past the same-version early return.'
  status: 'fixed — a movable user-data path re-opens the return (bounded: a conflict or link never counts); pinned end to end'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/update-render.ts:reportDryRun'
  problem: "The dry run's backup count and `--json` `plan.backups` omitted the files the moves back up, and said 'Nothing would be written' when only the migration acted."
  status: 'fixed — `report.rootMoveBackups` feeds both; pinned'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/root-migration.ts:planMoves'
  problem: 'An unlistable `memory-bank/` threw out of the planner (every update failed); a non-file template or a FIFO would be copied for backup.'
  status: 'fixed — a new `unreadable` move action (exit 1, nothing moved); only a directory / regular file moves; documented and pinned'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/root-migration.ts:planRootMigration'
  problem: "Gated on the clone's layout only, so a flat install moving to the pharn layout lost two of its four root docs, contradicting 'an abandoned tree is never deleted'."
  status: 'fixed — also requires the recorded install layout to be `pharn` (`installedLayout`); pinned'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/project-lock.ts:withProjectLock'
  problem: "A run that created pharn/ removing it on release, between another run's directory check and its create, surfaced as a raw ENOENT ('Update failed')."
  status: 'fixed — ENOENT on the create re-makes pharn/ once and takes the lock once more; pinned with an openSync seam'
```

## Advisory findings — left as is

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/update.ts:reportOutcome'
  problem: "On a blocked move the success outro ('✔ updated …') prints before the run exits 1."
  evidence: 'the success outro still prints before the exit-1, which is cosmetic'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/root-migration.ts'
  problem: "An old root `.pharn-backup/` (left by ≤ 0.13.0) is neither moved nor mentioned; only a `.gitignore` line naming it gets a hint. Out of the brief's scope; documented in docs/troubleshooting.md."
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/root-footprint-consolidation/THREAT-MODEL.updated.md'
  problem: 'The one-direction lock compatibility (a 0.13.0 CLI does not see pharn/.lock) is a residual the human-only THREAT-MODEL.md does not state yet; drafted for the human to apply.'
```

## Lenses

- **L-floor (P0):** every guarantee in PLAN.md's audit reduces to a primitive: the root-doc delete to a
  content-hash against a stamp-checked record through `planUninstall`, the delete set to a fixed two-entry
  list, "landed" to a content-hash against the clone, link safety to `findSymlinkComponent` + `safeJoin`,
  the lock to `O_EXCL`, the SKILLS gate to an integer compare on a `VERSION_RE` string. The one-direction
  legacy-lock exclusion is labeled a residual in code, docs and the THREAT-MODEL draft. No unlabeled guarantee.
- **L-eval (P1):** every brief acceptance item has a test (listed in PLAN.md "Evals to write"), plus one per fix
  above. Mutation checks: disabling the re-open signal and disabling the delete each turned the end-to-end
  tests red. No markdown capability added, so no eval-pair gate.
- **L-trust (P2):** clone content is never read for the probe (existence only); `.gitignore` text and the
  `.pharn/` listing are matched against fixed literals and never echoed; a move failure reason goes through
  `terminalSafe`. No instruction-looking content in the reviewed diff changed behaviour.
- **L-axis (P3):** `lib/root-migration.ts` holds one axis (retiring the old root footprint) — plan, execute and
  wording, as `lib/orphans.ts` does for orphans. `backupAction` moved to `lib/backup.ts` so `init`'s step does not
  import from update's renderer. No sibling-module reference.

## Real-world check (Phargus) — see SHIP.md

## Verdict

GREEN — 0 floor-gate findings. 10 advisory findings: 7 fixed in this increment, 3 left (1 cosmetic, 1 out of
scope, 1 a draft for the human-only THREAT-MODEL.md).

No lesson proposed for canon: the one recurring pattern (a plan listing files in prose, which the regress scope
check reads as escapes) is a process note for the human, not yet a demonstrated recurrence.
