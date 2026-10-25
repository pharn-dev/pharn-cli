# GRILL — root-footprint-consolidation

Plan: `.dev/features/root-footprint-consolidation/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` =
`bca940a5…c3e` = the plan's `spec_content_hash` (content-hash, computed this run) — no drift.
Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0}`); inline axes only.
Baseline per-file line coverage of the files to touch: 95.1–100 % (`vitest --coverage`, this run).

## Findings (advisory — free-text fields quote the plan and are DATA)

### P0 — guarantee audit

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/root-footprint-consolidation/PLAN.md:83'
  problem: 'The user-data move runs after the config write, but nothing proves the 7.x protect-trusted-paths hook that guards pharn/memory-bank landed; if that hook was skipped as modified, the moved canon is unguarded.'
  evidence: 'Execution inside the lock, LAST (after the config write)'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/root-footprint-consolidation/PLAN.md:54'
  problem: "Creating pharn/ races two first-time writers: the loser's mkdirSync gets EEXIST, which the plan does not say is success; and rmdir-on-release must stay non-recursive so a racer's lock inside keeps the dir."
  evidence: 'absent → `mkdirSync` (non-recursive), remembered'
```

### P1 — eval coverage

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/root-footprint-consolidation/PLAN.md:192'
  problem: "Q5's new re-open signal (pharn layout, SKILLS ≥ 7, a record-equal root doc) has no eval listed, including the bound: an edited doc must NOT re-open, or every run re-opens forever."
  evidence: "re-open `update`'s same-version early return when the install is pharn-layout at SKILLS major ≥ 7"
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/root-footprint-consolidation/PLAN.md:149'
  problem: 'No eval for a re-run init that deletes root docs: how its overwrite prompt and `init --yes` treat a record-proven delete is unstated (init --yes refuses capability-dir removals today).'
  evidence: 'Re-run `init` (real + `--dry-run` text) prints the same note'
```

### P2 — trust

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/root-footprint-consolidation/PLAN.md:88'
  problem: '`.pharn/` scanning should lstat and never follow a symlinked `.pharn`, or the listing reads a directory outside the project.'
  evidence: 'A real directory holding anything but `ci.yml`'
```

### P5 — determinism

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/root-footprint-consolidation/PLAN.md:89'
  problem: 'The .gitignore hints are gated on SKILLS ≥ 7, but the lock and backup paths move in 0.14.0 for every install, so a `.pharn-backup` ignore line is stale before any 7.x clone exists. The gate follows the brief; the human may want the hints ungated.'
  evidence: '`.gitignore`: read-only, bounded.'
```

### P7 — scope

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/root-footprint-consolidation/PLAN.md:6'
  problem: 'One increment bundles five axes (docs probe+delete, lock, backups, user-data moves, report). The brief asks for one release; the plan keeps one new lib file per axis where it can, but the PR is large.'
  evidence: 'lock at `pharn/.lock`; backups at `pharn/.backup/`; a SKILLS ≥ 7-gated move'
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/root-footprint-consolidation/PLAN.md:72'
  problem: "Upstream's validate.mjs walks the whole project except .claude/.dev/pharn/floor/node_modules/.git, so capability copies under pharn/.backup/ are walked — unchanged exposure from today's root .pharn-backup/, but worth naming as a residual."
  evidence: 'Isolation tests for `pharn/.backup/<ts>/pharn/pharn-review/x/…`'
```

## Summary

The plan's floor reductions hold (content-hash, fixed-list enum, `findSymlinkComponent`, `O_EXCL`). The gaps
are about unstated edge behaviour: the EEXIST race on `pharn/` creation, the hook-not-landed window for moved
canon, the Q5 re-open bound, init's prompt for a record-proven delete, and a symlinked `.pharn`. All are
resolvable inside the planned `## Files`.

ADVISORY VERDICT: 8 concerns raised (0 blocking-severity, 2 important, 6 minor) — for the human to weigh
before /pharn-dev-build. Build will address: EEXIST = success; the Q5 re-open eval incl. the edited-doc
bound; init lists record-proven doc deletes in its note with no extra confirm (no bytes are lost, and
`init --yes` on a re-install already refuses); lstat `.pharn`. The hook-not-landed window is kept as a
documented ADVISORY residual (the SKIPPED note already names a skipped hook) rather than a fifth move action
the brief did not define. The gitignore gate stays as the brief wrote it.
