# REVIEW — dry-run-json-compact (iteration 1)

Floor first: `node .dev/floor/validate.mjs .` exit 0 (GREEN, 0 capabilities checked); `npm run check` exit 0 (2201 passed, 1 skipped). The lens findings below are ADVISORY (LLM-assigned severity); none is a floor-gate.

## Floor-gate (blocking) findings

None.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "src/lib/update-report.ts:162"
  problem: "filesOmitted.count is derived from the filtered list, while the docs promise it equals counts.ok; that equality is a planner invariant pinned by the integration test, not enforced by the builder."
  evidence: "count: p.files.length - kept.length"
- type: FINDING
  rule_id: P4
  severity: minor
  file: "README.md:262"
  problem: "Prettier re-aligned the whole commands table, so the README diff is 20 lines for a one-clause change."
  evidence: "10 insertions, 10 deletions in README.md"
- type: FINDING
  rule_id: P4
  severity: minor
  file: "docs/troubleshooting.md:22"
  problem: "The exit-code row for `--compact` alone is documented; the two-step refusal of `update --json --compact` (only `--json` is named first) is not, as the grill noted."
  evidence: "| `update --compact` without `--json` | 1 |"
- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/index.ts:341"
  problem: "`--compact=false` passed alone is accepted (Boolean(false) is not a presence), unlike the plan's wording that it is refused; behavior matches the existing `--json=false` handling and no doc claims otherwise."
  evidence: "compact: Boolean(argv.compact)"
```

## Lenses

- L-floor (P0): the default-bytes claim is test-pinned by two sha256 goldens captured from the pre-change builder; the omission claim reduces to an enum membership filter; consumer-reads-the-marker is advisory and documented.
- L-eval (P1): every new branch has a test (unit, integration, dispatch); size pinned on a 504-file fixture (<4096 B and <3 % of full; full >60 KB).
- L-trust (P2): no new untrusted input; kept strings still pass `serializeJsonReport` escaping, tested for a hostile `rel`.
- L-axis (P3): the filter lives in `lib/update-report.ts`, the flag tables in `index.ts`, the guard in `commands/update.ts`; no sibling imports added.

## Proposed lessons

None.

VERDICT: GREEN — 0 blocking floor findings, 4 advisory (minor).
