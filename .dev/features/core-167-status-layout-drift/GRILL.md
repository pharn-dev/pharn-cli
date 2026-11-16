# GRILL — core-167-status-layout-drift

- plan: `.dev/features/core-167-status-layout-drift/PLAN.md` (approved at gate 1 as written, including the open choice; the orchestrator added: docs must say explicitly that on a mismatch neither the file drift nor NOT SHIPPED UPSTREAM is checked)
- spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5…3c4e` = the plan's `spec_content_hash` → **no drift**.
- registered grillers (`count-grillers.mjs`): `{"registered":0}`, so the inline axes only.
- ADVISORY: this log gates nothing.

## Findings

### Honest scope / docs (P4, P7)

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: ".dev/features/core-167-status-layout-drift/PLAN.md:62"
  problem: "`--no-drift` fetches no clone, so it cannot see a layout mismatch: `status --no-drift --strict` still passes on a mismatched install. The plan does not say the docs will state this."
  evidence: "New exported pure predicate `layoutMismatch(recorded: Layout, upstream: Layout | null)` (`upstream !== null && recorded !== upstream`)"
```

Resolution for build: say it in the Exit code section and the Layout step: the layout check needs the clone, so `--no-drift` neither reports nor fails on it.

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/core-167-status-layout-drift/PLAN.md:42"
  problem: "When the install is ahead of its source, a plain `pharn update` neither moves it nor answers \"Already up to date\": it refuses the downgrade. The LAYOUT note does not cover that case."
  evidence: "If it answers \"Already up to date\", `pharn update --force` moves it, but also overwrites files you edited"
```

Resolution for build: keep the note to the orchestrator's wording. The ahead refusal names `--force` itself, and `status`'s VERSION note already reports "ahead". The docs Layout step can say so in one clause.

### Contract / compatibility (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/core-167-status-layout-drift/PLAN.md:65"
  problem: "A `--json` consumer may have read `drift === null` as meaning `--no-drift` was passed. It now also means a layout mismatch, and `schemaVersion` stays 1. The plan treats this as a documented meaning change, not a shape change, but the compatibility claim is not tested."
  evidence: "no key added or removed; `drift` was already nullable"
```

Resolution for build: acceptable under the ticket, which asks for exactly this, and the type was already `… | null`. Document it in the JSON table and the CHANGELOG. `layout.upstream !== null` together with `drift === null` is how a consumer tells a mismatch apart from `--no-drift`. Say that in the table.

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/core-167-status-layout-drift/PLAN.md:57"
  problem: "No case mocks no `src/` module here: `tests/commands-integration.test.ts` runs status only at matching layouts, so the real `detectLayout` + `configLayout` pair is exercised only through the unit suites' fake clones."
  evidence: "tests/status.test.ts — flat config + pharn clone"
```

Suggestion (not required): the unit suites use the REAL `detectLayout` (layout.js is not mocked) over a real fake-clone dir, so the pair is exercised. An integration case can follow if a regression shows up. Out of the plan's `## Files`.

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/core-167-status-layout-drift/PLAN.md:31"
  problem: "Under a mismatch, HOOKS and the unknown-capabilities warning are kept. The evals only say 'hooks still reported' for JSON; a text case should also pin that HOOKS still prints and still fails --strict on its own."
  evidence: "Hook wiring (`diffHookWiring`) reads `.claude/settings*.json` — layout-independent — so HOOKS stays."
```

Resolution for build: in the text mismatch case, assert that `diffHookWiring` was called. Its strict contribution is already covered by the matching-layout cases.

### Guarantee audit (P0) / Determinism (P5) / Trust (P2) / P3

No findings. The mismatch is a two-member enum equality, applied in both the command (so it skips the diff call) and the report builder (so it nulls `drift`). The plan names both layers, plus the strict predicate. The LAYOUT wording is labelled advisory. There is no new untrusted input, and the two files each still change for one reason (`status-report.ts` is the report/strict predicate; `status.ts` is the command flow).

## Summary

The plan is small and closed. The concerns are about what the user and JSON consumers are told: `--no-drift` cannot see a mismatch, `drift: null` gets a second meaning that must be spelled out with the `layout.upstream` tell, and the ahead-of-source case goes through update's own `--force` refusal. One test gap is minor (HOOKS still runs in the text path on a mismatch).

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor/advisory) — for the human to weigh before /pharn-dev-build.
