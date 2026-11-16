# GRILL — CORE-192 (CLAUDE.md ≤ 150 lines; incident history out of src comments)

Plan: `.dev/features/core-192-claude-md-trim/PLAN.md`. Spec-hash check: recomputed
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` = the plan's `spec_content_hash` (no drift).
Registered grillers: 0 (`count-grillers.mjs`), so the inline axes only.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/core-192-claude-md-trim/PLAN.md:120"
  problem: "transpileModule(removeComments) erases TYPES, so an accidental edit to a type annotation, an interface or a type-only import passes the 'no behaviour change' floor; typecheck only catches it when it stops compiling."
  evidence: "`ts.transpileModule(…, {removeComments: true})` output at the base commit equals the output at HEAD"
```

Suggested reduction: compare the TypeScript SCANNER's token stream (`ts.createScanner` with
`skipTrivia: true`, kind + text per token) instead of the emit. It skips only comments and
whitespace, so types and every other token are compared too. That is strictly stronger and still an
exact string comparison.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/core-192-claude-md-trim/PLAN.md:98"
  problem: "Some comments are DIRECTIVES, not prose (eslint-disable*, @ts-expect-error / @ts-ignore, prettier-ignore, /* @__PURE__ */, c8/istanbul ignore). A token comparison cannot see them; deleting one changes lint, typecheck, format or coverage behaviour."
  evidence: "REMOVE: \"used to…\" / \"before this…\" stories; F-xx ids; CORE-nnn ids used as provenance"
```

Suggested reduction: a grep floor. The number of directive comments at base equals the number at HEAD,
for each pattern. Workers are told never to touch them.

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/core-192-claude-md-trim/PLAN.md:20"
  problem: "cloc counts a line holding code and a trailing comment as CODE, so trimming trailing comments does not move the ratio. Effort should go to full-line comment blocks."
  evidence: "remove **≥ ~1,800 comment lines**"
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/core-192-claude-md-trim/PLAN.md:31"
  problem: "docs/contributing.md's 'Project layout' tree is already stale (it omits several lib modules). Pointing it at docs/architecture.md is in scope; rewriting the tree is not. Say so, so the PR does not grow a second axis."
  evidence: "`docs/contributing.md` — its \"see CLAUDE.md for the architecture in depth\" pointer → docs/architecture.md"
```

### Determinism (P5)

No branch is added. The ratio target is an integer comparison; the equivalence check is exact equality.

### Trust (P2)

No untrusted input is ingested.

## Summary

The plan is a docs-and-comments change, and its main risk is a silent non-comment edit hidden inside
a large comment diff. Two concerns tighten the floor behind "no behaviour change": the emit
comparison misses type edits, and directive comments are invisible to any token comparison. Two minor
scope notes follow.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor), for the human to weigh
before /pharn-dev-build. Under /pharn-dev-ship I adopt the two important reductions in the build (the scanner
token comparison and the directive-count floor). This grill-log gates nothing.
