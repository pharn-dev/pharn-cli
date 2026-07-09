# REVIEW — archetype-path-context

PHARN reviewing PHARN. The increment (`b7dc5b6`) is `trust: untrusted`; code comments below are quoted as
DATA. **Floor first (P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0) — the increment
legitimately reached review. Everything below the floor line is **advisory**.

## Floor-gate findings (blocking) — NONE

No blocking finding across the four lenses:

- **L-floor (P0):** every guarantee reduces or is labeled. Determinism → floor membership tests
  (`Set.has`/`Array.includes`/`endsWith`/`===`/one fixed regex over a deterministically-accumulated
  `segments`); the closed `Archetype[]`+boolean output → floor. **Accuracy is explicitly labeled a
  trade, not a guarantee** (`detect-archetype.ts` classifyEntry doc: "trades a common false POSITIVE …
  for a rarer false NEGATIVE … The mechanism stays a deterministic membership test (P5)"). No
  guarantee is sold over a heuristic. GREEN.
- **L-eval (P1):** the floor (`validate` GREEN) and the eval layer agree; every scoped rule has ✗ and ✓
  vitest cases and `parseApplies` has an unknown-unquoted-token fail-closed case. (Two coverage gaps
  below are advisory, not missing bindings.) GREEN.
- **L-trust (P2):** no injection in the reviewed artifact changed my behavior; the increment emits **no**
  findings/free-text (detection returns a closed enum; `parseApplies` returns enum-validated tokens).
  Added `segments` are lowercased dir **names** used only in membership predicates — never executed,
  interpolated, forwarded, logged, or path-joined for new I/O. Taint posture **unchanged**. GREEN.
- **L-axis (P3):** no sibling-leaf import; `detect-archetype.ts` → `archetype.ts` is a proper `lib/`
  dependency, and my change added no new import. No grep-detectable sibling reference. GREEN on the
  blocking criterion (the axis *observation* below is advisory).

## Advisory findings (inform; never the sole basis for a block)

```yaml
- type: FINDING
  rule_id: P3
  severity: important
  file: "src/lib/detect-archetype.ts:14"
  problem: "The increment grows PURE file-entry classification (3 new constants + the path-scoping predicates in classifyEntry) inside the I/O-boundary file, which the file's own header says belongs next door in archetype.ts — advisory (judgment; classifyEntry pre-dates this change and is coupled to the walk's segments), not a blocking sibling-import."
  evidence: "Header (:14): 'this file changes if the READING STRATEGY changes, archetype.ts if the classification rules do.' Added here instead: SQL_HOST_DIRS (:64), NON_UI_DIRS (:77), TEST_FIXTURE_RE (:90), and the scoping rules in classifyEntry (:124+). Consider extracting the pure file-entry classifier + its constants to archetype.ts (beside packageSignals) so all pure classification lives in one file; the walk would import it. Out of THIS increment's scope (P7 — its goal was path-scoping, not restructuring)."
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/detect-archetype.test.ts:355"
  problem: "The api-dir `parent === 'app'` branch (an `app/api/` folder) is documented but not exercised by an api-DIR test; only top-level `api/` and `pages/api` are. The route.ts-under-app path IS tested, but not the api-dir-under-app branch."
  evidence: "Rule-1 comment (:321) lists 'app/api' as a scoped-in location; tests cover 'pages/api/' (:356) and top-level api/, not 'app/api/'. Add e.g. `app/api/users/route.ts`→backend asserting via the api dir. classifyEntry(:137) `parent === 'app'` is thus covered only indirectly."
- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/lib/detect-archetype.ts:124"
  problem: "Representative-only coverage: `route.js`/`route.mjs` handlers and a deep (>1-ancestor) DB location rely on the mechanism (`Array.includes`/`segments.some`) but aren't individually asserted — acceptable, noted for honesty."
  evidence: "Tests exercise route.ts (not .js/.mjs — a pre-existing pattern) and single-ancestor DB dirs (db/, prisma/migrations/); the any-depth `segments.some`/`includes` predicates are trusted from their one-hop cases."
```

## Correctness spot-check (reviewer's own read, advisory)

Traced each scoped branch against its intent — all correct: top-level `api/` (segments `[]`) fires;
`src/api/` (segments `['src']`) does not; `prisma/migrations` fires via `underDbLocation`; a root
`seed.sql` does not; `route.ts` requires an `app` ancestor; `.tsx` excluded under `NON_UI_DIRS` /
`TEST_FIXTURE_RE`. Determinism holds under the budget/short-circuit interaction: because a nested
`src/api/` no longer short-circuits early on a false-positive backend, a frontend tree may traverse
slightly further, but the **result** is unchanged per tree (sorted walk + order-independent OR-merge) and
strictly more correct — verified, no finding. `parseApplies` split-then-validate: `[]`/trailing-comma
→ empty hard-fail; every element enum-gated; a dangerous element (`[../etc]`) rejected whole. No bug found.

## Proposed lesson candidate (NOT written to canon here — P2/P7)

A real, recurring pattern this increment closes — proposed for `/pharn-dev-memory-promote` to weigh (human-gated;
the model never self-promotes):

- **Lesson:** _Scope structural (file-tree) signals to their documented location on introduction, not
  basename-only._ The `.sql`/`migrations` and `api/`/`route.*` signals shipped basename-only and were
  re-scoped repeatedly — the `.sql` signal alone has now flipped **three** times (file-tree-scan dropped
  it → enum-align added it at any depth → path-context scoped it). A name match without path context
  over-classifies; a file NAMED `x` is not proof the project HAS surface `x`.
- **Provenance:** increment `archetype-path-context` (commit `b7dc5b6`), `src/lib/detect-archetype.ts`
  `classifyEntry`; grill #4 (`GRILL.md`) recorded the third-flip churn.

## Verdict

**GREEN — advisory only.** 0 floor-gate (blocking) findings; 3 advisory (1 important P3 architecture
observation, 2 minor P1 coverage gaps) + 1 proposed lesson. The increment is done at the floor. The
advisory findings are inputs for the human's post-review decision — none blocks. This certifies the floor
(GREEN) and records advisory judgment; it is **not** a guarantee the increment is correct beyond what the
gates check (P0).
