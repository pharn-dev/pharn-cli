# PLAN — archetype-enum-align

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Map DB signals (`.sql` files, `migrations/` dirs, and `prisma` / `@prisma/client` / `drizzle-orm` deps) to the existing `backend` archetype — the one residual after discovery found the enum alignment already complete. **Approved by the human at the halt (this run); knowingly reverses the tested decision #2 of increment #21.** (The enum↔pharn-oss alignment itself was already implemented across #17/#20/#21 — confirmed, no change needed.)
- layer(s): pharn `src/lib` capability-resolver (ARCHITECTURE.md §5, "Archetype + map-consistency") — no `pharn-contracts` / `pharn-core` module files touched
- constitution_refs: [P6, P7, P5, P2, P3]

## Discovery finding — READ FIRST (the increment's premise is stale)

Everything the request describes as a *change* is **already in the tree** (verified by reads this run, not memory — P6). The task's premise — _"pharn's archetype.ts currently uses {frontend, db, …} — mismatched"_ — is **false against live state**:

| Requested change | Live state | Evidence |
| --- | --- | --- |
| enum → `{ssr, backend, spa, lib}` | **already so** — no `frontend`/`db` member exists | `src/types.ts:195` (`Archetype`), `src/lib/archetype.ts:54` (`ARCHETYPE_ORDER`) |
| `universal` handled by resolver as wildcard | **already so** — always selected, `continue`s | `src/lib/resolve-capabilities.ts:46-52` |
| `applies` matches iff `intersect(applies, detected)` non-empty | **already so** | `src/lib/resolve-capabilities.ts:54-63` |
| `.tsx`/`.jsx`, react/vue → spa | **already so** (`spa = clientUi ∧ ¬ssr`) | `detect-archetype.ts:84`, `archetype.ts:42-49,122-130` |
| next.config / next-in-deps → ssr | **already so** | `detect-archetype.ts:76`, `archetype.ts:21-29` |
| api routes/handlers / express / fastify → backend | **already so** | `detect-archetype.ts:68-82`, `archetype.ts:32-39` |
| library (no app entry) → lib | **already so** (no signal → `lib`) | `archetype.ts:128` |
| `.sql` / migrations / drizzle / prisma → **backend** | **NOT done** — deliberately maps to **nothing** | `detect-archetype.ts:67-68`, pinned test `tests/detect-archetype.test.ts:209-216` |

The grep for `frontend` / `db` as enum values across `src` + `tests` returns **only comments and a test label** — zero live enum occurrences. `ARCHITECTURE.md §5` (line 179) already reads `archetype ∈ {ssr, backend, spa, lib}`. **The DISCOVERY ask — "confirm the 5 enum values match pharn-oss exactly" — is CONFIRMED: `{universal (wildcard sentinel), ssr, backend, spa, lib}` already match.** The alignment landed across increments #17 (resolver scaffolding), #20 (I/O boundary), #21 (file-tree scan).

**So the only buildable residual is the DB→backend signal — and it is not a "fix a mismatch", it is a _reversal_.** Increment #21 (`archetype-file-tree-scan`) recorded, at its own discovery halt, **decision #2**: _"Drop `.sql` / `migrations/` (P7 — smallest coherent increment). That signal maps to no existing archetype; … Revisit `db` as its own increment when a real need triggers it."_ A pinning test enforces it (`tests/detect-archetype.test.ts:209-216`, "pinned so a future `db` archetype is a deliberate edit"). Reversing it is a real design decision, and per **P6/P7** the human — not the agent — must trigger it. Hence the HALT below.

## Files

> Contingent on Open-question Q1 = "implement the DB→backend residual". If Q1 resolves to "no / already aligned", this increment is a **no-op** (P7 — no speculative addition) and **no file changes**.

- `src/lib/detect-archetype.ts` — in `classifyEntry`, add: a file whose name ends `.sql` → `backend` signal; a dir named `migrations` → `backend` signal; update the "contribute NOTHING" comment (lines 66-68) to record the reversal — layer: I/O boundary
- `src/lib/archetype.ts` — add ORM package names (`prisma`, `@prisma/client`, `drizzle-orm`) to `BACKEND_FRAMEWORKS`; update the set's comment — layer: pure classification rules
- `tests/detect-archetype.test.ts` — **flip** the pinned decision-#2 test (209-216): `.sql` + `migrations/` now → `['backend']`, not `['lib']`; rewrite its comment to cite this plan's reversal — layer: test/spec (P1)
- `tests/archetype.test.ts` — add package-name cases: `drizzle-orm` dep → `backend`; `prisma` / `@prisma/client` dep → `backend`; a DB-only project → `['backend']` — layer: test/spec (P1)

**Not touched (already correct):** `src/lib/resolve-capabilities.ts`, `src/types.ts` (enum + `universal` wildcard), `tests/resolve-capabilities.test.ts`. `ARCHITECTURE.md §5` needs **no** edit — DB→backend adds no enum member, so it stays `{ssr, backend, spa, lib}` (and §5 is hook-protected / human-only regardless).

## Contracts satisfied

- ARCHITECTURE.md §5 "Archetype + map-consistency" — detection stays a **deterministic membership test** over merged package.json + file-tree **name** signals; the residual only adds two names/patterns to the existing `backend` signal, mapping DB onto an existing enum member (no `db` member introduced, so the four `validate` maps are unaffected). Cite, not restate (P4).
- ARCHITECTURE.md §8 finding/trust split — unchanged: detection emits the closed `Archetype[]` enum + a boolean; no untrusted free text crosses the boundary.

## Evals to write (P1)

- `.sql` file present (e.g. `db/schema.sql`) → detection includes `backend`
- `migrations/` dir present → detection includes `backend`
- `drizzle-orm` in deps → `backend`
- `prisma` (or `@prisma/client`) in deps → `backend`
- DB signal **+** a `.tsx` file → `['backend', 'spa']` (merge-then-rule, order preserved)
- DB signal **+** `next` → `['ssr', 'backend']` (SSR not suppressed by DB)
- DB-only project (no UI/SSR/API) → `['backend']`, not `['lib']` (the reversal, replacing the old `→ lib` pin)

## Guarantee audit (P0)

- "archetype detection is deterministic" → **floor: enum/regex** — every added branch is a name-membership test (`lower.endsWith('.sql')`, `lower === 'migrations'`, `names.has('prisma')`); no classification/guess (P5).
- "DB concern belongs to the `backend` archetype" → **advisory design choice** (a mapping decision, not a guarantee). It introduces no new guaranteed invariant; the *mechanism* underneath it is the floor membership test above.
- No `pharn update` / legacy-pin surface is touched (P7) — this is pure CLI-side detection with no config-schema or manifest impact.

## Trust audit (P2)

- Inputs: file/dir **names** in the project tree and dependency **key names** in `package.json` — both untrusted project input. The residual adds only `.sql` / `migrations` / `prisma` / `drizzle-orm` to the existing name-membership checks. Names are tested for membership **only** — never executed, interpolated, forwarded, or logged; no file **body** is read (package.json remains the sole file read). Output stays the closed `Archetype[]` enum + boolean, so **no untrusted free text escapes** the boundary. Taint posture is unchanged.

## Decisions resolved at the approval halt (this run) — P6

Both open questions were put to the human as an interactive form and resolved; no open questions remain.

1. **Scope → "Map DB → backend."** Build the residual as specced. This knowingly **reverses decision #2** of increment #21 and flips its pinned test (`tests/detect-archetype.test.ts:209-216`, currently `→ lib`, becomes `→ backend`).
2. **DB home → `backend`, no new archetype.** DB folds onto the existing enum member per the brief's "DB concern lives in backend archetype"; a dedicated `db` archetype was explicitly declined as out-of-scope / cross-cutting (would touch §5 + the four `validate` maps + `pharn-contracts`).

Plan **approved as written** — GATE 1 passed.
