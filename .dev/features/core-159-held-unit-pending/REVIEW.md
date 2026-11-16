# REVIEW — core-159-held-unit-pending

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0 at `79abf0d`. `npm run check`, `test:coverage` and `build` → exit 0 (`verify-report.json`: PASS). Everything below is advisory.

Reviewed: `git diff 991b229..HEAD` (src, tests, docs, CHANGELOG, CLAUDE.md).

## Floor-gate findings (blocking)

None.

- **L-floor (P0).** The one logic change is label membership over `SkipLabel` (`update-plan.ts`: `USER_EDIT_SKIPS.has(g.label) || g.label === 'held'`), with both sides tested: a hold with `modified` / `unrecorded` blockers records the pending version, and a hold with an `unreadable` or `unverifiable` blocker records `null`. The claim "a blocker's own label is always a `plan.skipped` group" is structural: `holdUnitWrites` builds `blocking` only from files already pushed to `groups`, and only appends `held` to them. The claim "`add` at a pending version never writes inside the unit" rests on `add` calling only `installCapabilityDirs`, and the integration case asserts the edited command, the deleted hook and the v1 floor are unchanged after `add`. `missing` is label membership plus a records-key test, unit-tested in both the store and no-store cases.
- **L-eval (P1).** Every acceptance criterion has a test: planner (pending recorded / not recorded), decision (`missing` rule), render (both tenses, cap, escaping), report (projected only when non-empty), `add` (both refusal wordings), integration (edit + delete → update → `add` exit 0 with the stamp kept → revert → update completes, pending cleared, hook restored). No markdown capability is added, so no eval pair.
- **L-trust (P2).** `missing` holds manifest keys from the clone, already path-validated. They are printed through `terminalSafe(…, {max: 300})` like the blockers, and escaped once by `serializeJsonReport` in JSON. The render test covers ESC stripping. No new input.
- **L-axis (P3).** Each file keeps its axis: the decision table owns `missing`, the planner owns the pending rule, render owns wording, and report owns projection.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: 'tests/commands-integration.test.ts:566'
  problem: "Three existing assertions are inverted, not one: the ticket named only update-plan.test.ts. The other two (commands-integration :562-566, update-dry-run-json :550) pinned the same 0.18.0 'nothing pending' decision. Approved at GATE 1, and they must be listed in the PR body so pharn-ci's test-integrity reviewer sees the reason."
  evidence: "expect(cfg.pendingSkillsVersion).toBe('2.0.0');"
- type: FINDING
  rule_id: P5
  severity: minor
  file: 'src/lib/update-render.ts:167'
  problem: "The note's last line changed from 'revert the files above' to 'revert the skipped files' for every hold, not only one with missing files. It is needed because the missing list now can sit between the blockers and that line. A user-visible wording change, named in the CHANGELOG; no test pinned the old text."
  evidence: "'  To upgrade the unit: revert the skipped files, or run',"
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'docs/commands/update.md:489'
  problem: "'A hook you deleted stays off' describes the effect, but pharn does not touch settings.json: the hook stays wired, and Claude Code calls a file that is not there. Fixed after GATE 2: the paragraph now says the entry stays wired to a script that is not on disk, that the guard does not run until the hold ends, and that `pharn status` reports the file as missing."
  evidence: 'A hook you deleted stays off until you revert your edit or use `--force`.'
- type: FINDING
  rule_id: P1
  severity: minor
  file: 'docs/commands/add.md:96'
  problem: "Fixed during review: the 'Kept local edits' paragraph said every other file is at the new version (files the user edited outside the unit are not) and placed 'The refusal then reads' right after 'add accepts a clone at that version', which read as if the accepted case refused. Reworded; prettier and markdownlint clean."
  evidence: 'every other file you did not edit is at the new one … If upstream has moved on again, the refusal reads'
```

## Lesson candidate

None. This is a policy reversal the ticket asked for, not a recurring failure. One note for whoever next reverses a pinned behaviour: grep the test suite for every assertion of the old value (here `pendingSkillsVersion` undefined/null near a hold) before you count how many inversions the ticket allows.

**Verdict: GREEN** (0 floor-gate findings; 4 advisory, 1 already fixed in review). Advisory only: this is not a judgment that the increment is good. That decision is the human's at GATE 2.
