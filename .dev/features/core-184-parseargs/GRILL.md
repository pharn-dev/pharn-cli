# GRILL — CORE-184 (argument parsing on `util.parseArgs`; `--json` implies `--dry-run`)

Plan: `.dev/features/core-184-parseargs/PLAN.md` (approved at GATE 1 with answers: parser in
`src/lib/cli-args.ts`; escape the `Unknown command` echo now via `lib/terminal-safe`; labels
`Repeated option` / `Option takes no value`; the proposed help wording; add the dist-smoke case).
Spec-hash check: recomputed `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` = the plan's
`spec_content_hash` (no drift). Registered grillers: 0 (`count-grillers.mjs`), so the inline axes only.

Advisory: these findings inform the build; they gate nothing.

## Findings

### Tests are the spec (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/core-184-parseargs/PLAN.md:95"
  problem: "The orchestrator accepted the TI02 deletions on condition that EVERY behaviour case of the old tests/index.test.ts survives as a row in tests/cli-args.test.ts. The plan states this but names no check; with 116 declarations and ~190 cases it is easy to drop one silently."
  evidence: "every old case that still holds"
```

Suggested reduction: walk the old file declaration by declaration while writing the new one, and record the
old → new mapping (the PR body's "Test-integrity: expected findings" section lists each removed declaration
group with the row(s) that now carry it). Mechanics that no longer exist (minimist's `unknown` callback,
`string: ['_']`) map to the behaviour they protected (numeric positional stays a string, bundle named once).

### Determinism / precedence (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/core-184-parseargs/PLAN.md:58"
  problem: "Under strict:false a string option consumes the NEXT argument even when it starts with '-' (`--ref --yes` → ref = '--yes'; `--archetype --ref main` → archetype = '--ref', `main` a positional). minimist bound '' instead. The outcome must stay a refusal and must not turn into an Unsupported/Unknown error about the swallowed token, nor an arity error."
  evidence: "a bare flag names `\"\"` as today"
```

Suggested reduction: rows for `update --ref --yes` (Invalid value for --ref) and
`init --archetype --ref main` (Invalid value for --archetype, not Unexpected argument) — the value check runs
before the arity check, as today.

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/core-184-parseargs/PLAN.md:52"
  problem: "The plan derives offenders from args[token.index]. For a short bundle that mixes a known and an unknown letter (`-yx`), or an unsupported letter in a bundle, the whole token is named — which is today's behaviour too — but it is not stated or tested."
  evidence: "offenders are `args[token.index]`, de-duplicated"
```

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/core-184-parseargs/PLAN.md:57"
  problem: "Repeating a BOOLEAN (`--yes --yes`, `-y --yes`) stays accepted while a repeated value option is refused. That asymmetry is correct (a repeated boolean cannot disagree with itself) but should be one sentence in the module and one test row, so a later reader does not 'fix' it."
  evidence: "`Repeated option` — `--ref` / `--archetype` given twice"
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/core-184-parseargs/PLAN.md:83"
  problem: "docs/troubleshooting.md says the ``Incomplete option for`` refusal prints 'the usage text'; and the CHANGELOG archive and older CHANGELOG sections describe it. The archive and released sections are history and must not be rewritten; only current docs change."
  evidence: "the \"valid only together\" paragraph → implications"
```

### Trust (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/core-184-parseargs/PLAN.md:113"
  problem: "Use escapeUnsafe (lossless `\\uXXXX`, the same visible form JSON.stringify gives the option offenders) rather than terminalSafe (which strips) for the `Unknown command` echo, so a control character is shown, not silently removed, and printable input prints byte-identically."
  evidence: "The `Unknown command: <cmd>` line still echoes `cmd` raw"
```

### One axis per file (P3)

No finding. `cli-args.ts` changes for one reason (the CLI's argv contract and its help text, which are now
one table); `index.ts` keeps dispatch. Nothing imports command → command.

## Verdict (advisory)

Proceed to build. Two important findings (the TI02 mapping discipline, the swallowed-value precedence rows)
and four minor ones, all addressable inside the planned files.
