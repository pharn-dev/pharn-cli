# PLAN — archetype-path-context

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Give `classifyEntry` (detect-archetype.ts) the **path context** its four file-tree rules already assume in their comments — scope `api/`, `route.*`, `.sql`, and `.tsx/.jsx` matches to their documented locations so a file merely _named_ x no longer implies the project _has_ surface x; and (secondary) loosen `parseApplies` (capability-index.ts) to accept unquoted YAML `applies` tokens. No new archetype/enum member; determinism preserved.
- layer(s): pharn `src/lib` — the archetype-detection **I/O boundary** (`detect-archetype.ts`) and the capability **fetch boundary** (`capability-index.ts`), both under ARCHITECTURE.md §5 "Archetype + map-consistency" / "Trust-fence". No `pharn-contracts` / `pharn-core` / `ARCHITECTURE.md` files touched (§5 is hook-protected + human-only).
- constitution_refs: [P5, P2, P6, P7, P1, P3]

## Discovery findings — READ FIRST (grounded in reads this run, not memory — P6)

**The DISCOVERY ask is CONFIRMED: path-context is available at classify time, and is simply not threaded in.**
`classifyEntry(name, isDir)` (detect-archetype.ts:70) receives only the basename + a boolean. Its **sole
caller** is `walk(dir, depth)` inside `scanFileTreeSignals` (detect-archetype.ts:122-140) — and that
closure already holds the full parent path (`dir`), the `depth`, and `root` (in `scanFileTreeSignals`'s
scope). So the ancestor-directory chain is derivable at the call site today; the fix threads it into
`classifyEntry` as an explicit `segments: string[]` (lowercased parent dir names), preserving the sorted
walk + OR-merge (determinism, P5). The finding's premise — "no path context" — is **true against live
state** (detect-archetype.ts:70-95).

**The four rules and their live over-broad match** (detect-archetype.ts):

| # | Rule (line) | Over-broad match today | Genuine false-positive |
| --- | --- | --- | --- |
| 1 | `api` dir → backend (:77) | any depth | `src/api/` (client fetch wrappers) → a SPA wrongly gets ssrf/path-traversal/n+1/migrations. **HIGHEST IMPACT.** The :73 comment already says "top-level `api/` or `pages/api`" — code doesn't honor it. |
| 2 | `.tsx`/`.jsx` → clientUi (:93) | anywhere | react-email templates (`emails/*.tsx`), `*.test.tsx` fixtures in a backend → wrongly gets a11y+i18n. **WEAKEST signal.** |
| 3 | `route.*` → backend (:87) | anywhere | a non-Next client router's `route.ts` (e.g. `src/router/route.ts`) → wrongly backend. |
| 4 | `.sql` file → backend (:91) | anywhere | a frontend's committed `seed.sql` → wrongly backend. |

**Blast-radius sweep (this run):** only `tests/detect-archetype.test.ts` exercises these file-tree
fixtures. `tests/archetype.test.ts` uses the package.json-only `detectArchetypes(pkg)` path (untouched);
`tests/archetype-summary.test.ts` hardcodes `['ssr']`; `tests/init-archetype.test.ts`'s `proj` fixture is
package.json-only (`next` → `ssr`) and its capability fixtures use **quoted** `applies` — all unaffected.

**§5 reconciliation (surfaced per P6, NOT edited — §5 is hook-protected/human-only):** ARCHITECTURE.md
§5 (line 182) phrases detection loosely as "an `api/` dir or a `route.ts` handler → backend". This plan
makes detection *more precise* (still a deterministic membership test; still "an api/ dir → backend", now
scoped to the documented location). This is the same human-owned wording reconciliation already flagged in
`detect-archetype.ts:29-32` and `types.ts:266-269`; no §5 edit is needed or permitted.

## The fix (design — every branch a deterministic membership test, P5)

**A. `src/lib/detect-archetype.ts` — thread `segments`, scope the four rules.** `walk` passes an
accumulated `segments` (lowercased ancestor dir names; `[]` at top level) to `classifyEntry(name, isDir, segments)`:

- **Rule 1 — `api` dir → backend** iff `segments.length === 0` (top-level `api/`) **OR** the immediate
  parent (`segments.at(-1)`) is `pages` or `app` (Next.js `pages/api` / `app/api`). A nested `src/api/` → not backend.
- **Rule 2 — `.tsx`/`.jsx` → clientUi** iff **not** in a non-UI location: no ancestor in
  `NON_UI_DIRS = {test, tests, __tests__, __mocks__, spec, e2e, emails, email}` **and** the basename is not
  a `*.test.tsx|*.spec.tsx|*.test.jsx|*.spec.jsx` fixture. (Exclusion — not a `src/`-only inclusion — so
  existing root-level / `web/` / `Components/` `.tsx` cases stay `spa`; see Open Q re: hono/jsx residual.)
- **Rule 3 — `route.{ts,tsx,js,mjs}` → backend** iff an ancestor is `app` (App-Router; covers `app/**` and
  `src/app/**`). Else skip.
- **Rule 4 — `.sql` file → backend** iff an ancestor dir ∈
  `SQL_HOST_DIRS = {migrations, db, database, prisma, drizzle, sql}` (a DB location). A lone/root `.sql`
  (seed/query file) → not backend. **`migrations/` dir → backend** iff top-level (`segments.length === 0`)
  **OR** an ancestor ∈ `SQL_HOST_DIRS` (GATE-1 Q2: path-scoped too — a deep non-DB `src/state/migrations/`
  no longer fires; a top-level `migrations/` or `prisma/migrations/` still does).

`next.config.*` → ssr and the pure `archetype.ts` signals→archetype rule are **untouched** (correct today).

**B. `src/lib/capability-index.ts` — `parseApplies` accepts unquoted tokens.** Replace the quote-only
extractor `[...raw.matchAll(/["']([a-z0-9]+)["']/g)]` (:163) with **split-on-comma → trim → strip optional
quotes → drop empties**, then validate **each element as a whole** via `assertAppliesToken` (unchanged enum
gate). This accepts `[ssr, backend]` and `["ssr","backend"]` alike, while a dangerous element (e.g.
`[../etc]`) is validated whole and **hard-fails** (split-then-validate never silently skips non-matching
chars the way a loosened `matchAll` would — this is why split is the safer loosening). Empty-array /
unknown-token / `universal`-mixed hard-fails are all preserved.

## Files

- `src/lib/detect-archetype.ts` — thread `segments: string[]` through `walk` → `classifyEntry`; add
  `SQL_HOST_DIRS` + `NON_UI_DIRS` module constants; scope rules 1–4 as above; update the rule comments
  (:60-95) to record the path-context scoping — layer: archetype-detection I/O boundary (§5).
- `src/lib/capability-index.ts` — loosen `parseApplies` token extraction to accept unquoted YAML tokens
  (validate each via `assertAppliesToken`); update its doc-comment (:150-157) — layer: capability fetch
  boundary (§5, Trust-fence).
- `tests/detect-archetype.test.ts` — **update** the two tests that pin the now-corrected behavior (lone
  root `.sql` → was `['backend']`, becomes `['lib']`; root `.sql` + `.tsx` → was `['backend','spa']`,
  becomes `['spa']`), rewriting their comments to cite this scoping; **add** the new cases below — layer:
  test/spec (P1).
- `tests/capability-index.test.ts` — **add** unquoted-`applies` cases — layer: test/spec (P1).

**GATE-2 fix iteration (human-directed; addresses REVIEW.md advisory findings — floor stays GREEN, re-verified):**

- `src/lib/archetype.ts` — **extract** the pure file-entry classifier here (P3 REVIEW finding): move
  `classifyEntry` + `SQL_HOST_DIRS` / `NON_UI_DIRS` / `TEST_FIXTURE_RE` out of the I/O file into the
  pure-rules file (beside `packageSignals`), exported, so all pure classification lives in one file and
  the file header's stated axis holds — layer: pure classification rules (§5).
- `tests/archetype.test.ts` — **add** direct `classifyEntry` unit tests covering every branch incl. the
  cited gaps (P1 REVIEW findings): `app/api` (parent `app`), `route.js` / `route.mjs` under `app`, a deep
  DB location — layer: test/spec (P1).
- (also) `tests/detect-archetype.test.ts` gains one `app/api/` integration case; `src/lib/detect-archetype.ts`
  now imports `classifyEntry` from `archetype.ts` and keeps only the walk + package read (I/O).

**Not touched (correct today):** `src/types.ts` (the `Archetype` enum — no new member), `src/lib/validate.ts`
(`assertAppliesToken` enum gate reused as-is), `src/lib/resolve-capabilities.ts`. `ARCHITECTURE.md §5`
needs no edit (adds no enum member; hook-protected regardless).

## Contracts satisfied

- **ARCHITECTURE.md §5 "Archetype + map-consistency"** — detection stays a **pure, deterministic membership
  test** over merged package.json + file-tree **name** signals; scoping only narrows which name-matches
  fire, introduces no enum member, reads no file body, stays bounded + symlink-safe. Cite, not restate (P4).
- **ARCHITECTURE.md §5 "Trust-fence + taint propagation" / §8 finding-trust split** — both boundaries still
  emit only enum/regex-validated output (the closed `Archetype[]` + boolean; the enum-validated
  `'universal' | Archetype[]`); no untrusted free text crosses. `parseApplies` keeps the hard-fail-naming
  contract (P2/P5). Cite, not restate (P4).

## Evals to write (P1) — vitest cases (one per rule ⇒ both truth values; the six Fable shapes covered)

detect-archetype (`tests/detect-archetype.test.ts`):

- Rule 1 ✗ (scoping isolation): react dep + `src/api/client.ts` → `['spa']` (nested `src/api/` is **not**
  backend — the only case that proves the scoping; kept regardless of Q3).
- Rule 1 ✗ isolation: lone `src/api/users.ts`, no pkg → `['lib']`.
- Rule 1 (Fable #1 literal, GATE-1 Q3): `{express, react}` deps + `src/api/client.ts` → `['backend','spa']`
  (backend from the **real express dep**; `src/api/` correctly adds nothing).
- Rule 1 ✓: `pages/api/users.ts` → `['backend']` (Pages-Router api, parent `pages`).
- Rule 1 ✓ (kept): top-level `api/users.ts` → `['backend']` (existing).
- Rule 2 ✗: express dep + `emails/Welcome.tsx` → `['backend']` (email template, not spa).
- Rule 2 ✗: lone `src/Button.test.tsx`, no pkg → `['lib']` (test fixture, not spa).
- Rule 2 ✓ (kept): `components/Button.tsx` → `['spa']` (real component — Fable #5).
- Rule 3 ✗: vue dep + `src/router/route.ts` → `['spa']` (client router, not backend — Fable #2).
- Rule 3 ✓: `src/app/users/route.ts` → `['backend']` (App-Router under `src/`).
- Rule 3 ✓ (kept): `app/users/route.ts` → `['backend']` (existing).
- Rule 4 ✗: react dep + root `seed.sql` → `['spa']` (committed seed, not backend — Fable #3).
- Rule 4 ✓: `db/seed.sql` → `['backend']` (DB-location-scoped `.sql`).
- Rule 4 ✓ (kept): top-level `migrations/001.sql` and `migrations/001.js` → `['backend']` (existing).
- Rule 4 ✗ (GATE-1 Q2): react dep + `src/state/migrations/v1.ts` → `['spa']` (deep non-DB `migrations/`,
  not top-level / no DB ancestor → not backend).
- Rule 4 ✓ (GATE-1 Q2): `prisma/migrations/001.sql` → `['backend']` (`migrations/` under a DB ancestor).
- **Update** existing: lone root `queries.sql` → `['lib']`; root `schema.sql` + `App.tsx` → `['spa']`.
- Determinism (kept + re-assert on a path-scoped tree): same tree yields identical result twice.

capability-index (`tests/capability-index.test.ts`):

- Unquoted `applies: [ssr, backend]` → `['ssr','backend']`.
- Unquoted `applies: [universal]` → `'universal'` (the resolver-contract string).
- Mixed quoting `applies: [ssr, "backend"]` → `['ssr','backend']`.
- (Kept, must still pass) quoted arrays; `[]` empty hard-fail; unknown-token hard-fail; `universal`-mixed
  hard-fail; non-array hard-fail.

## Guarantee audit (P0)

- "archetype detection is **deterministic**" → **floor: enum/regex** — every scoped branch is a membership
  predicate (`Set.has`, `Array.includes`, `String.endsWith`, `segments.length`, one fixed fixture regex)
  over the deterministically-accumulated `segments`; the sorted walk + boolean OR-merge are unchanged. No
  classification/guess drives a branch (P5).
- "no untrusted free text escapes either boundary" → **floor: enum output** — detection returns the closed
  `Archetype[]` + boolean; `parseApplies` returns enum-validated tokens. `segments` are dir **names** used
  only in predicates — never executed, interpolated, forwarded, logged, or path-joined for new I/O.
- "detection is **more accurate** (fewer false positives)" → **advisory** — which paths count as
  backend-ish/frontend-ish is a heuristic judgment. The *mechanism* is the floor membership test above; the
  *accuracy* is advisory and is **not** sold as a guarantee (P0). No guaranteed decision rests on it.
- "`parseApplies` fails closed on malformed/unknown `applies`" → **floor: enum** — `assertAppliesToken`
  gates every element; the loosening broadens accepted input **shapes**, never the accepted **value set**.
- No `pharn update` / legacy-pin / config-schema surface is touched (P7) — pure CLI-side detection + parse.

## Trust audit (P2)

- **detect-archetype** — inputs: untrusted project file/dir **names**. Added `segments` = lowercased
  ancestor dir names, consumed **only** by membership predicates. No file **body** is read (package.json
  remains the sole file read); output stays the closed `Archetype[]` enum + boolean. Taint posture
  **unchanged** — no new escape path.
- **capability-index** — input: untrusted fetched `applies` frontmatter value. The loosened parse routes
  **every** comma-separated element through `assertAppliesToken` (enum membership); an unknown/dangerous
  element hard-fails **naming the capability** (split-whole-then-validate, so `..`/path junk is rejected,
  not skipped). Output stays `'universal' | Archetype[]`. Taint posture **unchanged/strengthened**.

## Determinism audit (P5)

Every new branch is a membership/predicate test; `segments` is derived deterministically from the existing
sorted, OR-merged, cap-bounded, symlink-safe walk (order-independent). `parseApplies` is deterministic
string processing terminating in a return or a hard-fail — never a guess. Determinism holds.

## Decisions resolved at the GATE-1 halt (this run) — P6

The three open questions were put to the human as an interactive form and resolved; the plan is
**approved**. No open questions remain.

1. **Scope → both together.** Ship the archetype path-scoping fix **and** the `parseApplies` unquoted-YAML
   loosening in this one increment (2 src + 2 test files).
2. **Rule 4 `migrations/` dir → PATH-SCOPED** (non-default choice). `migrations/` → backend iff **top-level
   OR under a DB-location ancestor** (∈ `SQL_HOST_DIRS`); a deep non-DB `src/state/migrations/` no longer
   fires. All existing top-level `migrations/` tests stay `backend`.
3. **Fable #1 → real `express` dep** (non-default choice). The literal shape `{express, react}` + `src/api/`
   → `['backend','spa']` (backend is legitimate from the express dep). The rule-1 **scoping isolation** tests
   (react-only + `src/api/` → `['spa']`, and lone `src/api/` → `['lib']`) are **kept** — they are the only
   cases that prove nested `src/api/` stopped firing backend.

Plan **approved as written** (with Q2/Q3 resolved as above) — **GATE 1 passed.**

**Residual (honest scope, P7 — not blocking):** rule 2's exclusion catches the clear cases (test-fixture
and email-template `.tsx`). A `hono/jsx` template under `src/` (not a test/email dir) still contributes a
`clientUi` signal → such a backend detects as `['backend','spa']`. This is acceptable (it does render UI)
and the named test shapes don't require solving it; a `src/`-only inclusion gate would instead break
existing root-level `.tsx` → `spa` behavior, so it is deliberately not used. Documented, not hidden.
