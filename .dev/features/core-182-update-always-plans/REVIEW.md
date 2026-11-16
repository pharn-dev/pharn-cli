# REVIEW — core-182-update-always-plans

Reviewed: build commit `27d96ef0` against base `0f90e6fd` (34 paths). Floor first: `node .dev/floor/validate.mjs .` →
`FLOOR: GREEN — 0 capabilities checked` (exit 0); `/pharn-dev-verify` PASS on all six gates; `/pharn-dev-regress`
`no-regressions`. Everything below is advisory.

## Floor-gate findings (blocking)

None.

- L-floor (P0): the increment's claims reduce to tested behaviour — "an empty plan asks nothing and writes nothing"
  (C1.5's `changesNothing`, exact comparisons; `update.test.ts` snapshot + confirm-spy cases), "a downgrade is never
  planned" (the unchanged ahead-of guard before the download; its table still asserts no download), "`up-to-date`
  keeps its schemaVersion-1 bytes" (`update-report.test.ts` exact-bytes pin, unchanged). No new guarantee, and the
  eight deleted "bounded re-open" arguments leave no claim behind them.
- L-eval (P1): no Capability or `rule_id` is added; every changed `src/` file is statically imported by a test file
  this PR modifies with real assertions (update.ts/add.ts/remove.ts/status.ts/update-plan.ts by `update.test.ts`;
  update-report.ts, models-update.ts, root-migration.ts, update-decision.ts, constants.ts by their own suites;
  types.ts and pharn-config.ts by `remove.test.ts`).
- L-trust (P2): no new untrusted input. The header note keeps `terminalSafe` on the config's version strings; nothing
  in the reviewed files read as an instruction.
- L-axis (P3): no command→command or step→step import; deleted helpers leave no dangling importer (tsc + eslint
  clean).

## Advisory findings

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: 'docs/commands/add.md:154'
  problem: 'The docs now say a plain update moves a layout at a matching skills version (add.md, status.md, status.ts LAYOUT note, CHANGELOG), but no test runs a same-version layout move; the only layout-move tests bump the version.'
  evidence: "A plain `pharn update` plans at the clone's layout on every run, so it moves the install there"
```

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: 'src/commands/update.ts:390'
  problem: 'printHeader is a renderer living in the command, while lib/update-render.ts holds every other update note; it was inline in the command before this change too, so moving it is optional.'
  evidence: 'function printHeader('
```

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'docs/commands/update.md:855'
  problem: 'The download size is quoted as about 2.5 MB while THREAT-MODEL.md says ~2.4 MB; both are approximations of the same tarball.'
  evidence: 'downloads pharn-oss (about 2.5 MB)'
```

## Resolution of the advisory findings

- P4 same-version layout move: addressed before GATE 2 by a new test in `tests/commands/update.test.ts`
  (`describe('a layout move')`: "flat → pharn/ at the same skills version: one plain update moves it, and the next run
  is up to date").
- P3 `printHeader` placement and the P4 size wording: left as they are (pre-existing placement; an approximation).

## Verdict

GREEN — 0 floor findings; 3 advisory findings (1 addressed, 2 left by choice).

No lesson proposed for canon: nothing here shows a recurring failure.
