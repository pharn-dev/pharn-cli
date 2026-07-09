# GRILL — archetype-path-context (ADVISORY)

Interrogates `.dev/features/archetype-path-context/PLAN.md`.
**Spec-hash check:** `sha256(ARCHITECTURE.md)` = `bca940a5…d3c4e` **matches** the plan's
`spec_content_hash` → no drift (P6). **Registered grillers:** `count-grillers.mjs .` → `0` (the griller
capabilities live in pharn-oss, not in this installer repo — the pluggable slot is empty here; the inline
axes below are the whole grill). **This whole log is ADVISORY — it gates nothing. `/pharn-dev-build`'s floor is
unchanged.**

The `PLAN.md` is `trust: untrusted` to the griller; `problem`/`evidence` below quote it as DATA.

## Findings (grouped by axis; enum-gated / free-text split per `pharn-contracts/finding-shape.md`)

### Honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/archetype-path-context/PLAN.md:44"
  problem: "The plan discloses rule 2's false-positive residual (hono/jsx) but NOT the symmetric false-NEGATIVE the scoping introduces on legitimate nonconventional layouts; the accuracy trade is one-directional in the write-up."
  evidence: "'Rule 1 — api dir → backend iff segments.length === 0 … OR the immediate parent is pages or app.' A frameworkless backend serving from src/api/ with no server-framework dep (no express/fastify/hono/etc.) now detects as lib/spa, not backend — it loses path-traversal/ssrf/n+1 lenses. Same class: an App-Router handler under a non-`app`-named root (rule 3), and a backend `.sql` outside {migrations,db,database,prisma,drizzle,sql} (rule 4)."
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/archetype-path-context/PLAN.md:109"
  problem: "NON_UI_DIRS and the *.{test,spec}.{tsx,jsx} fixture regex each have several members, but the eval plan exercises only one representative of each (emails/ and .test.tsx); the other members are asserted by construction, not by a test."
  evidence: "Planned rule-2 evals name only 'emails/Welcome.tsx' and 'lone src/Button.test.tsx'. Untested: the spec arm of the regex (.spec.tsx) and the dir members tests/ __tests__/ __mocks__/ e2e/ spec/. Add ≥1 case for the .spec arm and a tests/-style dir, or state representative-coverage as the deliberate intent."
```

### Determinism / rule shape (P5)

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/archetype-path-context/PLAN.md:50"
  problem: "route.tsx matches BOTH the scoped route-handler rule (backend) and the .tsx clientUi rule — a preserved pre-existing double-classification worth an explicit call."
  evidence: "'Rule 3 — route.{ts,tsx,js,mjs} → backend iff an ancestor is app' plus 'Rule 2 — .tsx/.jsx → clientUi'. So app/route.tsx → backend AND clientUi → ['backend','spa']. Route handlers are .ts in practice; confirm this is intended, or drop route.tsx from the route set to remove the overlap."
```

### Churn / reversal history (P7, P6)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/archetype-path-context/PLAN.md:52"
  problem: "This scopes the lone-.sql-file behavior that archetype-enum-align SHIPPED ~2 days ago (2026-07-07), which itself reversed archetype-file-tree-scan's decision #2 — the third flip of the .sql/migrations signal on a tested surface."
  evidence: "'Rule 4 — .sql file → backend iff an ancestor dir ∈ SQL_HOST_DIRS … A lone/root .sql (seed/query file) → not backend.' Human-approved at GATE-1 Q2 (path-scope migrations too), so this is a resolved decision — surfaced only so the churn on a twice-flipped pinned test is explicit before another flip lands."
```

### Docs / user-observable surface (P4)

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/archetype-path-context/PLAN.md:4"
  problem: "Detection RESULTS shift observably (a react + src/api/ project stops receiving backend/ssrf capabilities under `pharn init --archetype`), yet ## Files plans no CHANGELOG entry — noted for a confirm, not asserted as a defect."
  evidence: "Verified this run: the sibling archetype-enum-align (same change class — detection results shifted) added NO CHANGELOG entry, and no sibling PLAN listed CHANGELOG in ## Files. So omission is CONSISTENT WITH PRECEDENT (CHANGELOG logs user-facing commands/flags/docs, not internal detection tuning). Surfaced only to confirm that precedent still holds now that --archetype install consumes detection."
```

## Prose summary

The plan is well-grounded: the spec-hash matches, the DISCOVERY ask (path-context available at classify
time) is verified in-tree, and the guarantee/trust/determinism audits reduce correctly — determinism stays
FLOOR (membership predicates over a deterministically-accumulated `segments`), while *accuracy* is honestly
labeled **advisory** (P0). The `parseApplies` loosening is the **safer** of the two options the request
offered: split-comma-then-validate-each rejects a dangerous element whole (e.g. `[../etc]` hard-fails)
rather than silently skipping non-matching chars as a loosened `matchAll` would, and every element still
passes the unchanged `assertAppliesToken` enum gate (P2/P5 preserved, fail-closed intact). The rule-2
hono/jsx residual is disclosed, not hidden. The two-subsystem bundling (detect-archetype + capability-index)
was a deliberate GATE-1 Q1 decision, and P3 (one axis per file) is not violated — each file changes for one
reason.

The concerns worth the human's eye before/at build: **(1, important)** the write-up states the
false-positive residual but not the symmetric **false-negatives** the scoping accepts (a frameworkless
backend on `src/api/`; an App-Router handler in a non-`app` root; a backend `.sql` outside DB dirs) — the
trade is defensible (these layouts are rarer than the frontend `src/api/` case being fixed) but should be
explicit; **(2, minor)** representative-only eval coverage of the NON_UI_DIRS / fixture-regex members;
**(3, minor)** the `route.tsx` backend∧clientUi overlap; **(4, minor)** this is the third flip of the
`.sql`/migrations signal; **(5, minor)** a confirm that a detection-result shift needs no CHANGELOG entry
(precedent says no). None of these block — they are inputs for the human, and several are addressable
cheaply inside the already-approved `## Files` during `/pharn-dev-build` (e.g. a sentence in the rule comments
stating the false-negative trade; one extra `.spec.tsx` / `tests/` eval).

## Verdict

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 1 important, 4 minor) — for the human to weigh
before `/pharn-dev-build`. The plan is sound and buildable; no concern is a floor-gate, and none requires a
re-plan. This is NOT "grill passed" and NOT a guarantee the increment is good — that judgment is the
human's.
