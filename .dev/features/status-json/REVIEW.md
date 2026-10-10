# REVIEW — status-json

Floor first: `node .dev/floor/validate.mjs .` exits 0 (GREEN). Regress verdict is `no-regressions` and verify verdict is `PASS`; both are in their own reports. Real-process spot check, run from a temp project against the built source:
- No config: stdout is 0 bytes, stderr carries the message, exit 1.
- `status --json --no-drift` with an archetype config: stdout is one 511-byte object that parses, exit 0.

VERDICT: GREEN — 0 floor-gate findings; 4 advisory findings.

## Floor-gate findings (blocking)

None. The four lenses found no P0 guarantee without a floor reduction or `advisory` label, no missing eval binding, no tainted field behind a guaranteed decision, and no sibling import.
- **L-floor / P0:** the docs state the stdout contract as behaviour and call the `schemaVersion` stability a documented contract, which `pharn` does not enforce.
- **L-trust / P2:** every upstream-derived string leaves stdout escaped. `serializeStatusReport` is covered by a round-trip test over C0, C1, Cf, U+2028/2029 and an astral tag character.
- **L-eval / P1:** every new branch has a test.
- **L-axis / P3:** `lib/status-report.ts` and `lib/version-status.ts` are pure, there is no command→command import, and `log.error(` stays only in `report-error.ts`.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: "src/lib/status-report.ts:166"
  problem: "Hook `missing[]`/`localOnly[]` entries are emitted uncapped, unlike text mode's 300-character line cap. The settings read is capped at 256KB, so it is bounded, but it is not the same cap the other free-text fields get (grill finding, left as is)."
  evidence: "missing: drift.hooks.missing,"
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/commands/status.ts:104"
  problem: "The proxy notice is a warning but goes through `logErrorPlain`, whose name says error. Behaviour is right (plain stderr, sanitized); only the name is misleading."
  evidence: "if (proxyNotice) logErrorPlain(proxyNoticeMessage(proxyNotice));"
- type: FINDING
  rule_id: P4
  severity: minor
  file: "docs/commands/status.md:121"
  problem: "The status.md Behavior/Exit-code prose describes only the text flow. The new JSON section covers the differences, but the numbered Behavior list does not mention `--json` skipping the notes and spinner."
  evidence: "## JSON output"
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/status-json/PLAN.md:105"
  problem: "The plan labels the stdout-contract and exit-parity claims 'floor: structural' and 'floor: shared predicate'. Both are enforced by tests and code shape, not by hook/content-hash/enum-regex (grill finding). Nothing shipped repeats that label; the docs say 'documented contract'."
  evidence: "→ floor: structural (single `console.log`/`write` after the report is fully built"
```

## Notes for the human

- `.pharn/writes-scope.json` (and the other tracked `.pharn/**` scratch) show as modified in the working tree. They are tracked scratch that the hooks rewrite; consider leaving them out of the commit.
- The build wrote `tests/status-json.test.ts` through Bash without it being in the plan's `## Files`. The regress scope check caught it, and the plan now declares it.
- `tests/lint-gate.test.ts` cases spawn eslint under a 5 s timeout, and they flake on a loaded machine. One verify run failed this way at load ~37 and passed on re-run.

## Proposed lessons (candidates only; nothing written to canon)

1. `prettier --write tests` rewrites `'‮'`-style escapes in string literals into the raw characters, which trips `tests/source-hygiene.test.ts`. Build invisible characters in tests with `String.fromCodePoint(...)`. Provenance: status-json build, 2026-10-10.
2. Never run `prettier --write` over a whole directory. It reformatted the byte-pinned vendored `tests/fixtures/pharn-oss/check-model-config.mjs`. Run it on the files you changed. Provenance: status-json build, 2026-10-10.
