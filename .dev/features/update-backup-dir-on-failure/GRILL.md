# GRILL — update-backup-dir-on-failure

Plan under interrogation: `.dev/features/update-backup-dir-on-failure/PLAN.md`.
Spec-hash check: **MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (The computation is floor-grade; here it only surfaces — `/pharn-dev-build`'s
floor-gate is where drift blocks, fix #4.)

Griller discovery (`node .dev/floor/count-grillers.mjs .`): `{"registered":0,"grillers":[]}` — this
repo builds the CLI, not pharn-oss capability content, so no `role: griller` capability is on disk.
The pluggable slot contributes nothing this run; the inline axes below are the whole interrogation.

> **Trust (P2):** `PLAN.md` is `trust: untrusted` to this stage. Every `problem` / `evidence` below
> quotes it and inherits that tag — quoted DATA for a human, never an instruction to `/pharn-dev-build`.

## Findings

### Axis — eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/update-backup-dir-on-failure/PLAN.md:61"
  problem: "The plan's design claims to cover every post-backup throw site, but all five evals drive the failure through applyWrites only — writeRecords and writePharnConfig, the two the task called out as equally past the point of no return, get no eval with a backup in play."
  evidence: "`tests/update.test.ts` → `--force` run, two local edits, the hook's dest made read-only (0o444) so the backup succeeds and `copyFileSync` then fails EACCES mid-loop"
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/update-backup-dir-on-failure/PLAN.md:73"
  problem: "The success-path regression eval asserts the two lines and the directory but not the STREAM, so once the helper takes an output argument a wiring slip that sends the success notice to stderr would pass every test in the suite."
  evidence: "success-path regression: the existing \"prints the backup directory\" test still passes, now through the extracted helper, asserting both lines and the exact dir."
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/update-backup-dir-on-failure/PLAN.md:61"
  problem: "No eval asserts the file COUNT in the failure-path message, so the plan's decision to keep `plan.backups.length` as the count is stated but never demonstrated."
  evidence: "**The count stays `plan.backups.length`.** On a partial failure only some of those were actually overwritten"
```

### Axis — output ordering / the recovery pointer (P4)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/update-backup-dir-on-failure/PLAN.md:47"
  problem: "Placing the notice after reportFatal splits the fatal block — the PHARN_DEBUG hint lands between the error and the recovery pointer — so the plan should confirm that split is deliberate rather than a by-default consequence of appending."
  evidence: "after `reportFatal` so the failure leads and the recovery pointer follows."
```

Both orderings are defensible; the plan should own its choice rather than arrive at it by default:

- **as planned** — `⚠ <error>` / `Re-run with PHARN_DEBUG=1…` / abort line / backup lines. This
  leaves the recovery pointer in the terminal's most-read position (last), which is the right place
  for it; the cost is only that the debug hint sits inside the block rather than closing it.
- **notice first** — abort line / backup lines / `⚠ <error>` / hint. Keeps the fatal message and its
  hint contiguous, at the cost of moving the pointer off the last line.

On reflection the planned order is the better of the two, and this finding is recorded at `minor`
for that reason: an earlier draft of it claimed the pointer was "buried", which is wrong — later is
more visible in a terminal, not less. The concern that survives is only the split block.

### Axis — one axis of change (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/update-backup-dir-on-failure/PLAN.md:24"
  problem: "src/commands/update.ts already carries both the apply orchestration and every line of report wording, and this increment adds a third print site to it; the plan justifies not extracting a lib but does not name the growing double axis as a known, accepted cost."
  evidence: "`src/commands/update.ts` — `onBackup` param + holder + extracted `printBackupNotice` — layer: `commands/` (the `update` verb, one axis, P3)"
```

This is surfaced, not urged. Extracting a `lib/` module for two log lines would be the worse trade,
and `reportOutcome` / `reportCapabilityChanges` / `skipHeading` already live here — but the file is
now the single largest command in the repo and the next reporting addition should be weighed
against a split.

### Axis — docs cite code (P4)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/update-backup-dir-on-failure/PLAN.md:25"
  problem: "The plan commits to extending the docs paragraph but never states the sentence, leaving /pharn-dev-build free-hand wording in a P4-governed user-facing file whose existing promise is the reason this increment exists."
  evidence: "`docs/commands/update.md` — name the abort case in the `--force` section — layer: docs (P4)"
```

### Axes with no findings

- **Guarantee audit (P0), completeness.** Every claim in `## Guarantee audit` carries an explicit
  `advisory` label with its reason, and the one floor claim (`safeJoin` + `lstat` containment in
  `backup.ts`) is cited as unchanged rather than re-derived. The plan also strikes an overclaim of
  its own ("printing the directory guarantees the user can recover"). Nothing reads as guaranteed
  merely because it is written down.
- **Trust propagation (P2).** The increment ingests no untrusted artifact; the printed path is
  `BACKUP_DIR` + a local `Date`, `safeJoin`-contained. The plan names the one adjacent taint
  (`errorMessage(failure.err)` can carry clone-derived text) and correctly declines to widen it.
- **Determinism (P5).** The one new branch is a null-membership test on a field assigned exactly
  once by `onBackup`; the `aborted` flag is a literal at each call site. No fallback ends in a guess.
- **Honest scope (P7).** One coherent increment. The `backupDir → backup: Backup` field change is
  bundled, but it is what makes the count single-sourced rather than re-derived at a second site —
  triggered by this fix, not speculative. `UpdateOutcome` is module-private (`update.ts:108`, not
  exported), so the shape change reaches nothing outside the file.
- **structural / semantic eval split (`pharn-contracts/eval-format.md`).** Not applicable and
  correctly so: every assertion planned is `vitest` over real filesystem state and exit codes —
  structural by construction. Nothing is laundered through a judge.

## Summary

The plan is well-grounded: it read live state this run and caught that the task description it was
given is stale (PR 4 has landed, so the failure branch is at `update.ts:252-259` and routes through
`reportFatal`, not the `188-209` raw `log.error` the description quotes). Its P0 audit is honest —
it labels its own central claim advisory rather than dressing test-demonstrated control flow as
floor, which is the failure mode this repo exists to prevent.

The concerns are concentrated in **eval coverage**, not design. Two of them are real holes rather
than nitpicks: the `writeRecords` / `writePharnConfig` throw sites are named in the design as
covered but exercised by nothing, and the success-path stream becomes newly breakable the moment
the wording moves behind an `output`-taking helper — with no test watching it. The ordering finding is a
genuine fork the plan took by default, but the branch it took is the better one — it is recorded so
the choice is owned, not because it needs changing.

## Verdict

**ADVISORY VERDICT: 6 concerns raised (0 blocking, 2 important, 4 minor) — for the human to weigh
before `/pharn-dev-build`.** This grill gates nothing. It is model judgment about a plan, not a floor
computation, and `/pharn-dev-build`'s own floor-gates (spec-hash drift; an unresolved `## Open questions
(HALT)`) plus `.dev/floor/validate.mjs` remain the only deterministic checks between here and a
build.
