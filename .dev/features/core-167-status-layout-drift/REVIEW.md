# REVIEW — core-167-status-layout-drift

- Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN`. `npm run check` is GREEN (see VERIFY.md: PASS on 8 gates). Everything below is advisory unless marked floor-gate.
- Reviewed: the working-tree diff on `688a838` covering `src/commands/status.ts`, `src/lib/status-report.ts`, the three status test suites, `docs/commands/status.md`, `CLAUDE.md` and `CHANGELOG.md`.

## Floor-gate (blocking) findings

None.

- L-floor (P0): the one new guarantee is "no file diff is reported across layouts, and the mismatch fails `--strict`". It reduces to a two-member enum equality (`layoutMismatch`), applied in two places: the command uses it to skip `diffInstalledCapabilities`/`absentInstallSurfaces`, and `buildStatusReport` uses it to null `drift` whatever a caller passes and to feed `strictFails`. Tests pin each layer: the `status-report` truth table and nulling, the text suite (spies not called, no DRIFT note, `ProcessExit(1)`) and the JSON suite (`drift: null`, `exitCode` 1). The LAYOUT note's advice is prose, and the code comment and docs carry it as advice, not as a guarantee.
- L-eval (P1): every new branch has a test written first. All 10 new or inverted cases failed before the build (recorded in the build run) and pass now. The matching-layout guards (text: no LAYOUT note, DRIFT present, diff at `flat`; JSON: drift object, code 0) pin "output unchanged".
- L-trust (P2): no new input. The values printed are the closed `Layout` enum; no clone text reaches the new note.
- L-axis (P3): `status-report.ts` still owns the report and the strict predicate (the comparison was added there because both modes share it); `status.ts` owns the command flow. No command→command or step→step import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: ".claude/skills/pharn-cli/references/json.md:37"
  problem: "The vendored pharn-cli operating skill still says a layout difference is not a --strict input, and that `drift` is null only under --no-drift (line 28). This is outside docs/ and outside this plan's ## Files, but an agent following it would misread a CLI with this change."
  evidence: "A difference is not a `--strict` input."
```

Suggested follow-up: update the skill at its home (pharn-dev/skills), with a version gate ("from the release that ships CORE-167"), and re-vendor. It was not edited here because the PLAN's `## Files` does not cover it.

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: "src/commands/status.ts:560"
  problem: "The LAYOUT note's 'If it answers \"Already up to date\"' covers the same-version case only. An install ahead of its source gets update's own downgrade refusal instead, which names --force itself. The note leaves that case to update's message; the docs say it in one clause."
  evidence: "If it answers \"Already up to date\", `pharn update --force` moves it,"
```

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: "src/lib/status-report.ts:73"
  problem: "`drift: null` gains a second meaning inside schemaVersion 1. The shape is unchanged (the type was already nullable), and the docs give consumers the tell (`layout.upstream` set and different). A consumer that treated null as '--no-drift was passed' will now misreport a mismatched install as 'drift not requested'."
  evidence: "null when not computed: the drift check was skipped (`--no-drift`, then"
```

This is accepted by the ticket and recorded in the CHANGELOG under Changed.

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/commands-integration.test.ts:916"
  problem: "The no-mock integration suite runs status only at matching layouts. The mismatch is exercised through the real detectLayout over fake clone dirs in the unit suites, not end to end through a codeload tarball."
  evidence: "layout: { recorded: 'pharn', upstream: 'pharn' },"
```

## Lesson candidate (proposed, not written)

None: no recurring failure surfaced. (The case where a report should be suppressed rather than computed wrong already has a precedent in `statusOrphans`' identical `null`.)

## Verdict

GREEN — 0 floor-gate findings, 4 advisory (1 important, 3 minor). For the human at GATE 2.
