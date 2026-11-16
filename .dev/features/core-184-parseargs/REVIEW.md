# REVIEW — core-184-parseargs

Floor first: `node .dev/floor/validate.mjs .` GREEN (0 capabilities). `/pharn-dev-regress` `no-regressions`,
`/pharn-dev-verify` `PASS` (see `regression-report.json`, `verify-report.json`). Everything below is **advisory**
unless marked floor-gate.

Reviewed: `src/lib/cli-args.ts` (new), `src/index.ts`, `tests/cli-args.test.ts` (new), `tests/index.test.ts`,
`tests/dist-smoke.test.ts`, `package.json`, `package-lock.json`, `scripts/build.mjs`, and the doc changes
(`CLAUDE.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/architecture.md`, `docs/commands/{init,list,status,update}.md`,
`docs/troubleshooting.md`). No instruction-looking content in the increment changed this review.

## Floor-gate findings (blocking)

None.

- L-floor (P0): each claim reduces to a membership test or an exact allowlist: option name ∈ `OPTION_BY_KEY`
  (a `Map`), option ∈ the command's `OPTIONS[].uses` set, `REF_CHOICES` / `parseArchetypeList` for values,
  `JSON.stringify` / `escapeUnsafe` for echoed argv. Each has a test row (`tests/cli-args.test.ts`).
- L-eval (P1): no capability or `rule_id` is added; every behaviour is a vitest row. Coverage of `cli-args.ts`:
  100% statements/lines/functions; the one remaining uncovered branch is the pre-existing `first ?? ''` in
  `optionLines` (an option with no help text cannot exist in the table).
- L-trust (P2): argv is untrusted; it is never used as an object key (Maps only), never interpolated unescaped
  (the `Unknown command` echo now goes through `escapeUnsafe`, tested with BEL), and the unsupported-option label
  interpolates the table's literal, not argv.
- L-axis (P3): `cli-args.ts` changes for one reason (the argv contract, whose help text and parser are now one
  table); `index.ts` only dispatches. lib → lib imports only; no command → command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: "src/lib/cli-args.ts:495"
  problem: "The unknown-command branch had an unreachable `word ?? ''` fallback (no word resolves to `init`, which always exists), leaving an uncovered branch."
  evidence: "message: `Unknown command: ${escapeUnsafe(word ?? '')}`"
```

Fixed in this stage's follow-up: `word!` with a one-line reason, the repo's convention for validated values.

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "docs/commands/list.md:21"
  problem: "list.md still said only the option name is checked and `pharn list --json=false` is accepted; status.md described the drift check as 'with and without `--drift`', a flag that is now an unknown option."
  evidence: "Only the option **name** is checked, so `pharn list --json=false` is still accepted"
```

Fixed before verify iteration 2 (both files added to the plan's `## Files`).

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "src/commands/update.ts:124"
  problem: "`runUpdate` / `runInit` keep their direct-caller guards ('--json is only available with --dry-run.', '--compact is only available with --json.'). The CLI can no longer reach them, since the parser always passes a consistent triple, and their wording reads as the old pairing rule."
  evidence: "reportFatalPlain('--json is only available with --dry-run.');"
```

Left as is: they are the backstop for a direct caller (the commands are out of this plan's files), and no CLI path
prints them. A later cleanup can drop or reword them.

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".agents/skills/pharn-cli/references/json.md:55"
  problem: "The vendored copy of the published pharn-cli skill says `update --json` alone is refused with `Incomplete option for`. After this change that is no longer true, though the skill's own invocation (`--dry-run --json --compact`) keeps working."
  evidence: "`Incomplete option for`). The plan is a snapshot"
```

Out of scope here (the skill lives in pharn-dev/skills; this repo carries an installed copy). Follow-up for the skills
repo when 0.20.0 ships.

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "src/lib/cli-args.ts:392"
  problem: "Under `strict: false`, a value option swallows the next argument (`update --ref --yes` → value `--yes`). It still refuses with `Invalid value for --ref`, but the offender is now `\"--yes\"` where minimist named `\"\"`. Pinned by a test row; not called out in the CHANGELOG (same label, exit 1)."
  evidence: "[['update', '--ref', '--yes'], '\"--yes\"']"
```

Accepted: the refusal and its label are unchanged; only the quoted offender differs.

## Test-integrity note

`tests/index.test.ts` drops from 116 declarations (1,399 lines) to 5 (`main()` behaviour). Every behaviour case of
the old file is a row in `tests/cli-args.test.ts` (205 cases across both files) or a `main()` row; the
intentionally reversed cases (`Incomplete option for` → implied dry run; `--dry-run=false` / `--no-dry-run` /
`--json=false` accepted → refused; `--no-ref` / repeated value → new labels) are rewritten to the new behaviour.
pharn-ci TI02 is expected to flag the removed declarations.

Verdict (advisory): no blocking finding; the cheap advisory findings are fixed, the rest are noted for follow-up.
The decision is the human's.
