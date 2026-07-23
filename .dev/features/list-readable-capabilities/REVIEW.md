# REVIEW — list-readable-capabilities

Increment under review (`trust: untrusted`): the readable `pharn list` capability layout — new pure renderer `src/lib/capability-groups.ts`, a re-source refactor of `src/lib/capability-picker.ts`, the `src/commands/list.ts` wiring + footer trim, tests, doc sample, CHANGELOG.

## Step 1 — Floor first (P0)

`.dev/floor/validate.mjs` is GREEN for the increment (measured fixture-free = CI condition; the increment adds **zero** markdown capabilities, so it is vacuously green with respect to `validate`). The whole floor (`npm run check` + fixture-free `validate`) is GREEN per `verify-report.json` (verdict PASS). The increment legitimately reached review. Everything below the floor is **advisory**.

## The four lenses

### L-floor → P0

No floor-gate finding. Every guarantee the increment claims reduces or is labeled:

- "capabilities never comma-joined; grouped, counted, dash-bulleted, empty-group-omitted, stored-order" → **floor: test** (`tests/capability-groups.test.ts` asserts each, incl. a demonstrating "no line joins two names" check). Reduced, not asserted.
- "`pharn list --json` byte-identical" → **floor: test** (existing `runList --json` cases kept, still green).
- "narrow-terminal readability / no mid-item wrap" → explicitly **advisory** in the source comment and honestly scoped in `PLAN.md`'s guarantee audit (clack box wrap math is not modeled by the floor). No guarantee is sold over it.

### L-eval → P1

No finding. This is a TypeScript increment, so P1 = `vitest` (not a markdown-capability eval). Every new behavior ships its test in the same increment: the pure renderer has 8 cases covering grouping, per-role counts, one-per-line, em-dash prefix, empty-group omission, stored order, the `(none)` states, and the shared `ROLE_GROUPS` order; `list.ts`'s wiring is locked in `tests/list.test.ts` (grouped/counted/dash lines, no comma-join). No `enforces`/`rule_id` binding applies (no rule added).

### L-trust → P2

No finding. The increment ingests **no** untrusted artifact: `list` reads only `pharn.config.json` (a schema this CLI owns, P3), whose capability `name`/`role` were `CAPABILITY_NAME_RE`/enum-validated at install. The renderer emits those names into terminal text only — never a path, never executed. It produces no finding-shape free-text, so no downstream-instruction surface is created. No instruction-looking content in the reviewed files changed reviewer behavior.

### L-axis → P3

No floor-gate finding. Import graph is clean: `capability-groups.ts` → `format.js` + types (lib←lib); `capability-picker.ts` → `capability-groups.js` (lib←lib); `list.ts` → `capability-groups.js` (command→lib). **No** command→command or step→step sibling import (grep confirms). One **advisory** note carried from `/pharn-dev-grill` (F1): `capability-groups.ts` holds both the shared `ROLE_GROUPS` ordering (consumed by picker + list) and the list-specific `renderCapabilityLines` — arguably two change-reasons in one file. This is a judgment call, not a grep-detectable P3 breach; the file is cohesive under "capability role-group display" and both surfaces now share one order source (the refactor's goal). Recorded as advisory for the human, not blocking.

## Findings — grouped

### Floor-gate (blocking)

- **none.**

### Advisory (informational; never the sole basis to block)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/lib/capability-groups.ts:18"
  problem: "The module co-locates the shared ROLE_GROUPS ordering (used by both the pickers and list) with the list-only renderCapabilityLines, which is a defensible cohesion choice but a possible two-reasons-to-change seam."
  evidence: "export const ROLE_GROUPS ... export function renderCapabilityLines(view: CapabilityListView)"
```

## Verdict

**GREEN** — 0 floor-gate findings, 1 advisory (minor). The increment is buildable/mergeable on the floor; the single advisory is an architecture taste call for the human to weigh, not a blocker.

## Proposed lessons (candidates only — NOT written to canon here)

None. No recurring, real (P7) failure was revealed — the `test-*/` fixture / `validate` whole-repo interaction is already captured in the project's memory (dev-loop floor gotchas) and was handled correctly this run. Any promotion would be a separate human-gated `/pharn-dev-memory-promote`.
