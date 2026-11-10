# REVIEW — update-executable-unit

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `npm run check` is green (3485 passed). Everything below is **advisory** unless it says floor-gate.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** "without `--force` no unit file is written partially" reduces to label membership (`action === 'skip'`) plus a path predicate over the planner's own content-hash decisions. Pinned by `tests/update-decision.test.ts` (hold cases), `tests/update-plan.test.ts` and the real-tarball case in `tests/commands-integration.test.ts`. "Membership is by path only" is pinned by a static test (`executable-unit.ts` imports no `node:fs`). "Coherent at the old version" is labelled advisory in the code comment, docs and CLAUDE.md.
- **L-eval (P1):** no markdown capability was added (validate checks 0). Every new behavior has a vitest test: membership table, hold, no-hold under `--force`, no hold at the same version, unreadable/unverifiable/unrecorded blockers, records carried, `pendingSkillsVersion` null, root migration held, JSON key present only on a hold, default bytes unchanged (the existing byte-pin test still passes), the text dry run, the real run, the exit code (0).
- **L-trust (P2):** blocking rels are printed through `terminalSafe` (capped at 300) and serialized through `serializeJsonReport` in `--json`. No decision rests on free text. Nothing in the reviewed files read as an instruction.
- **L-axis (P3):** membership lives in its own lib module. The hold pass sits in the planner (same axis: the update decision). The command only calls a renderer. No command→command or step→step import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "src/lib/model-config-format.ts:1"
  problem: "The models label (modelsLabelLines) still says that editing a /pharn-* command's frontmatter makes update SKIP it and withhold the bump. It does not say that this edit now also HOLDS the floor and hooks. docs/commands/update.md and the troubleshooting entry do say it. The label is incomplete, not contradictory, and the file was outside this plan's Files (grill finding, carried)."
  evidence: "Editing a /pharn-* command's frontmatter makes that file `modified`, so `update` SKIPS it and withholds the `skillsVersion` bump"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/update-plan.ts:265"
  problem: "The hold keys on SKILLS_VERSION. On the main channel, a new commit at the SAME version can change floor bytes, and that run still decides each file on its own (the old behavior), so a mix stays possible there. This is the price of keeping same-version re-opens bounded. It is not stated as a residual in docs."
  evidence: "holdUnit: installedVersion !== config.skillsVersion,"
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "src/lib/update-plan.ts:351"
  problem: "The comment says pendingRootMigration re-opens the held migration later. That re-open only applies to a same-version early return. After a hold the version is withheld, so the next run plans the migration normally, and the comment's mechanism is wrong (the behavior is fine)."
  evidence: "unit (pendingRootMigration re-opens it then)."
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/update-decision.ts:295"
  problem: "Under --force an `unreadable` unit path is still skipped (by design) while the rest of the unit is written, so --force can produce the mix this feature prevents. docs/commands/update.md mentions that the unreadable path is still skipped, but does not name the mix."
  evidence: "Never under --force: there every skip became a backed-up write, so the unit is written whole."
```

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: "src/commands/update.ts:600"
  problem: "The pre-confirm EXECUTABLE UNIT note comes from the snapshot plan. If the locked re-plan holds differently, nothing re-confirms. Only the post-apply note shows the change. Root-migration differences are caught by membershipDrift; a hold difference alone is not. This is the same snapshot contract the skip lists already have."
  evidence: "reportExecutableUnit(confirmed.executableUnit, true);"
```

## Proposed lesson (candidate — NOT written to canon; needs `/pharn-dev-memory-promote` + human accept)

- **Candidate:** in zsh, `$VAR` holding a space-joined path list is passed to a command as ONE argument. The `/pharn-dev-regress` baseline/head runs must use `${=VAR}` (or an array). Otherwise `node --test` fails the same way on both sides, and the `tests` gate reads as `pre_existing` instead of being measured.
- **Provenance:** this increment (`update-executable-unit`), `REGRESSION.md` run note. The first capture recorded `tests: 1/1`; the re-capture with `${=TESTS}` recorded `0/0`. This may already be covered by the user memory note "zsh `${=VAR}` in regress". If so, the canon entry would only restate it, so promote it only if canon lacks it.

## Verdict

GREEN — 0 floor-gate findings. 5 advisory findings (1 important, 4 minor) for the human.
