# GRILL — core-170-one-sanitizer

Plan: `.dev/features/core-170-one-sanitizer/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`count-grillers.mjs` → `{"registered":0}`); inline axes only.

## Findings

### Determinism / gate hygiene (P6)

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/core-170-one-sanitizer/PLAN.md:72"
  problem: "The `## Open questions (HALT)` heading still carries bullets, although both are resolved; /pharn-dev-build halts on unresolved open questions and could read them as open."
  evidence: "- None blocking: the ticket's \"escape where it is built (or terminalSafe at its two print sites)\" is resolved by your decision 1"
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/core-170-one-sanitizer/PLAN.md:49"
  problem: "The plan accepts that tar-extract now refuses entry names holding U+2028/2029 but writes no tar-extract test for it; the side effect is asserted only through hasUnsafeChars."
  evidence: "tar-extract refuses names holding them"
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/core-170-one-sanitizer/PLAN.md:22"
  problem: "Integration case (b): `update --yes` rewrites pharn.records.json, so the hostile store must be planted again before `uninstall --yes`, or uninstall will not see an invalid store."
  evidence: "`uninstall --yes` refuses with it escaped"
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/core-170-one-sanitizer/PLAN.md:51"
  problem: "The static 'one definition' test matches spellings (\\xNN-\\xNN, \\u00NN-\\u00NN, \\p{Cf}/\\p{Cc} in a class); a future definition spelled otherwise (e.g. `\\0-\\x1f`, `\\u{0}-\\u{1f}`, a code-point array) passes it. It reduces to a regex over source text, so the claim is 'no recognised spelling', not 'no definition'."
  evidence: "no `src/**/*.ts` except terminal-safe.ts holds a control-range class (`\\xNN-\\xNN` / `\\u00NN-\\u00NN` spellings)"
```

## Summary

The plan follows the human's decisions and its trust audit names all three sinks of the records note (terminal, JSON, uninstall). Concerns: the HALT section's wording can trip the build gate (rename it to resolved notes); two small test gaps (tar-extract U+2028 refusal, re-planting the store before uninstall); and the static test's guarantee should be worded as spelling-based. Suggested build adjustments: rename the section to `## Resolved questions`, add one tar-extract case, widen the detector to also catch `\u{…}`-range spellings.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to weigh before /pharn-dev-build.
