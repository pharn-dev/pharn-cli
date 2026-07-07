# PLAN — archetype I/O boundary (project root → Archetype[])

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — sha256 of ARCHITECTURE.md this run
- increment: Add a thin I/O boundary that reads a project's `package.json` from a root path and returns its `Archetype[]` via the already-built pure `detectArchetypes`.
- layer(s): `src/lib/` (consumer-side infra for the capability resolver — ARCHITECTURE.md §5; the frameworkless `lib` base — §4)
- constitution_refs: [P0, P3, P5, P6, P7]

## Context — why this scope (discovery, P6)

Discovery this run found the described "scan → `Archetype[]`" pure detector **already exists and is
tested**:

- `src/lib/archetype.ts` → `detectArchetypes(pkg: ProjectPackages): Archetype[]` — pure, deterministic,
  package.json-**names-only** (its comment cites ARCHITECTURE.md §5 "membership over package.json").
- Enum is `Archetype = 'ssr' | 'backend' | 'spa' | 'lib'` (`src/types.ts:188`; ARCHITECTURE.md §5:179
  `archetype ∈ {ssr, backend, spa, lib}`) — **not** `frontend`/`db-migrations`/`nextjs`.
- `resolveCapabilities` (the consumer) is also already built + tested.

Two decisions resolved by the human at the discovery halt:

1. **Scope = "Add I/O boundary"** — the one genuine, spec-aligned gap: nothing yet wires a project
   *root path* → `Archetype[]`. `detectArchetypes` takes a parsed `ProjectPackages`; the existing
   `readProjectPackages(cwd)` (steps/prereqs.ts) returns a `Set<string>` (wrong shape) and never calls
   the detector. Neither the detector nor the resolver has a production caller yet (both are #17
   scaffolding — noted honestly under Guarantee audit / P7).
2. **Conflicts = "Drop — stay spec-aligned"** — the description's file-tree signals (`.tsx/.jsx`,
   `.sql`, `migrations/`, `next.config`) and extra enum values are **dropped**. Detection stays
   `package.json`-only, exactly per the pinned spec. (ARCHITECTURE.md is hook-protected / human-only;
   the agent cannot amend it, so a file-tree redefinition was never on the table here.)

## Files

- `src/lib/detect-archetype.ts` — **new.** Exports `detectArchetypesFromProject(cwd: string): Archetype[]`:
  resolve `<cwd>/package.json`; missing file → `detectArchetypes({})` (⇒ `['lib']`); read + `JSON.parse`
  into `ProjectPackages` (`{dependencies?, devDependencies?}`), parse error → `{}` (⇒ `['lib']`); return
  `detectArchetypes(parsed)`. Imports `detectArchetypes` + the `ProjectPackages` type from `./archetype.js`
  only. — layer `src/lib/` (I/O boundary).
- `tests/detect-archetype.test.ts` — **new.** Fixture projects on disk (`useTmpDir` + `writeFileSync` a
  `package.json`), asserting the archetype set for each — the repo's deterministic-suite analog of evals
  (P1). — layer `tests/`.

**P3 note (one axis per file):** the pure membership rules stay in `archetype.ts` (changes only if the
framework allowlists change); the new file holds *only* the disk-read/parse boundary (changes only if the
reading strategy changes). Two change-axes → two files. The new file does **not** import from `steps/`
(layer direction is steps → lib, never lib → steps), so it carries its own minimal package.json read
rather than reusing `readProjectPackages` (different shape + different layer). The ~4 lines of defensive
read/parse mildly duplicate `readProjectPackages`; hoisting a shared lib reader is a separate refactor,
deliberately **out of scope** here (P7 — smallest coherent increment).

## Contracts satisfied

- **N/A — no `pharn-contracts` reference.** `pharn-contracts` is a PHARN-*product* layer (ARCHITECTURE.md
  §4); this increment is a pharn-cli-internal `src/lib/` boundary and satisfies no product contract.
- **Spec cited, not restated (P4):** ARCHITECTURE.md §5 (`archetype ∈ {ssr, backend, spa, lib}`, "detected
  deterministically (membership over `package.json`)") and §4 (the frameworkless `lib` base). The new
  boundary adds the I/O around that rule; it does not re-implement or restate the rule.

## Evals to write (P1)

Each new-function behavior is produced by ≥1 test (evals = the repo's vitest suite for this CLI):

- `next` in dependencies → `['ssr']`.
- `express` + `react` in dependencies → `['backend', 'spa']` (multi-archetype; fixed ARCHETYPE_ORDER).
- `react` only → `['spa']` (**frontend-only ⇒ no `backend`** — the description's required inverse case).
- `express` only → `['backend']`.
- `next` in **devDependencies** → `['ssr']` (reads deps ∪ devDeps).
- **missing** `package.json` → `['lib']` (deterministic default).
- **malformed** `package.json` → `['lib']` (defensive parse).
- determinism: reading the same fixture twice → equal arrays.

## Guarantee audit (P0)

- **"Same project → same `Archetype[]` (deterministic)."** → **FLOOR.** Reduces to the pure
  `detectArchetypes`: membership over a `Set` of names + fixed `ARCHETYPE_ORDER`; the boundary adds only a
  deterministic file read. Backstopped by the determinism test + the fixed-order test already in
  `archetype.test.ts`, and by `npm run check` (typecheck + vitest) — `.dev/floor/validate.mjs` GREEN.
- **"Missing / malformed `package.json` → `['lib']`."** → **FLOOR.** Enum-membership default (no signal ⇒
  frameworkless `lib`, §4), pinned by two dedicated tests.
- **"Reads `package.json` names only — never file bodies, never executes, never sends."** → **ADVISORY.**
  There is no dedicated hook asserting "package.json-only" for this function; the property holds by
  construction (only `existsSync`/`readFileSync` on `<cwd>/package.json` + `JSON.parse`; no
  `child_process`, no `fetch`, no other file reads) and is backstopped by review + the existing
  `.dev/floor/scan-code-*` lenses — but per P0 it is **labeled advisory**, not sold as a floor guarantee.

## Trust audit (P2)

- **Input:** `<cwd>/package.json` — untrusted project bytes.
- **Taint propagation:** contained at the boundary. The function reads only dependency **key names** and
  tests them for membership against fixed in-code allowlists; it never executes, interpolates, forwards,
  or logs the values, and never reads any other file. The output is a **closed enum** `Archetype[]`, not
  free text — so no untrusted free text flows into any downstream instruction or directive. Untrusted
  input → membership test → enum output (P2-clean).

## Determinism audit (P5)

- The only branches are (a) `package.json` name membership (inside `detectArchetypes`) and (b) missing /
  parse-error → the defined default `['lib']`. No LLM classification anywhere. The fallback ends in a
  **deterministic default**, not a guess and not a human question — appropriate because "no framework
  signal ⇒ frameworkless lib" is a defined spec rule (§4), not an irreducible ambiguity.

## Open questions (HALT)

- None. The two scope-level ambiguities (build target; spec-conflicting file-tree ask) were resolved by
  the human at the discovery halt: **Add I/O boundary** + **Drop — stay spec-aligned**.
