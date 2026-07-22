# PLAN — archetype missing-signal (distinguish a missing package.json)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — sha256 of ARCHITECTURE.md this run
- increment: Change `detectArchetypesFromProject(cwd)` to return `{ archetypes, packageJsonFound }` so a MISSING/malformed package.json is distinguishable from a genuinely frameworkless project (resolves the `archetype-io-boundary` REVIEW.md P5 finding).
- layer(s): `src/lib/` (the archetype I/O boundary — ARCHITECTURE.md §5)
- constitution_refs: [P0, P3, P5, P6, P7]

## Context — why this scope (discovery, P6)

`archetype-io-boundary`'s review surfaced an advisory **P5** finding: `detectArchetypesFromProject`
returned `['lib']` for a **missing** package.json, a **malformed** one, AND a genuinely **frameworkless**
project alike — a silent collapse that loses the "is this even a project?" distinction. At GATE 2 the
human chose to **fix** it, and (at the plan halt) chose the **result-object** contract shape.

Discovery this run:

- `src/lib/detect-archetype.ts:37` currently returns `Archetype[]`; missing/malformed/non-object all →
  `detectArchetypes({})` ⇒ `['lib']`.
- `detectArchetypesFromProject` has **no production caller** — only `tests/detect-archetype.test.ts`
  references it (`grep` this run) — so changing its return type is safe; only the test updates.
- Consumer `resolveCapabilities(archetypes: Archetype[], …)` is unaffected (it is not wired to this
  boundary yet; the wiring is a later increment).

## Files

- `src/lib/detect-archetype.ts` — **modify.** Export `interface ArchetypeDetection { archetypes: Archetype[]; packageJsonFound: boolean }` (co-located with the function, like `ProjectPackages` in `archetype.ts`) and change `detectArchetypesFromProject(cwd): ArchetypeDetection`. Semantics: `packageJsonFound` is `true` **iff** a package.json exists and parses to a non-null, non-array object; missing / parse-error / non-object ⇒ `false`. `archetypes` is `detectArchetypes(pkg)` for a found object, else `detectArchetypes({})` ⇒ `['lib']`. — layer `src/lib/`.
- `tests/detect-archetype.test.ts` — **modify.** Update every assertion to the new object shape and add the finding-resolving cases (frameworkless-valid ⇒ `packageJsonFound: true` vs missing ⇒ `packageJsonFound: false`). — layer `tests/`.

**P3 note:** still one axis of change — the disk-read/parse boundary. The new return type is the
boundary's own output shape (co-located, mirroring `ProjectPackages`); no new import, no `steps → lib`
inversion. If a future consumer needs `ArchetypeDetection`, hoisting it to `types.ts` is a separate
refactor, out of scope now (P7).

## Contracts satisfied

- **N/A — no `pharn-contracts` reference** (a pharn-internal `src/lib/` boundary, as in the prior
  increment).
- **Spec cited, not restated (P4):** ARCHITECTURE.md §5 (`archetype ∈ {ssr, backend, spa, lib}`,
  "membership over `package.json`") and §4 (frameworkless `lib` base). The change only enriches the
  boundary's return; detection stays package.json-only.

## Evals to write (P1)

Rewrite the suite to the object shape; every behavior produced by ≥1 test:

- `next` ⇒ `{ archetypes: ['ssr'], packageJsonFound: true }`.
- `express` ⇒ `{ ['backend'], true }`; `react` ⇒ `{ ['spa'], true }`; `express`+`react` ⇒ `{ ['backend','spa'], true }`.
- **frameworkless-valid** (`lodash`, and a no-deps `{name}`) ⇒ `{ ['lib'], packageJsonFound: true }` — the key "present but frameworkless" case.
- `next` in **devDependencies** ⇒ `{ ['ssr'], true }`.
- **missing** package.json ⇒ `{ ['lib'], packageJsonFound: false }` — the key finding-resolving case (missing ≠ frameworkless).
- **malformed** package.json ⇒ `{ ['lib'], false }`.
- **mis-shaped** `dependencies` (a string) ⇒ `{ ['lib'], true }` (a valid object was found; benign no-match).
- **non-object** top-level (e.g. a JSON array) ⇒ `{ ['lib'], false }` (no usable package.json object).
- determinism: same project ⇒ deep-equal result twice.

## Guarantee audit (P0)

- **"Deterministic (same project ⇒ same result)."** → **FLOOR.** `archetypes` via the pure
  `detectArchetypes` (membership + fixed `ARCHETYPE_ORDER`); `packageJsonFound` is a deterministic
  function of file existence + parse success. Pinned by the determinism test + the per-case tests.
- **"`packageJsonFound` distinguishes missing/malformed from a found package.json."** → **FLOOR.**
  Deterministic boolean (existsSync ∧ parses-to-object), pinned by the missing/malformed/frameworkless
  cases (found:false vs found:true).
- **"Reads package.json only — never file bodies, never executes, never sends."** → **ADVISORY** (as in
  the prior increment: holds by construction — only `existsSync`/`readFileSync` on `<cwd>/package.json` +
  `JSON.parse`; no exec/network — but no dedicated hook asserts it, so labeled advisory, not floor).

## Trust audit (P2)

- **Input:** `<cwd>/package.json` — untrusted project bytes.
- **Taint propagation:** unchanged and contained. Dependency **key names** are tested for membership;
  `packageJsonFound` is a boolean derived from file-existence + parse-success — **not** free text and not
  derived from any dependency value. The output is `{ Archetype[], boolean }` (closed enum + boolean); no
  untrusted free text escapes the boundary or reaches any downstream instruction.

## Determinism audit (P5)

- Branches: package.json existence, parse success, top-level object-ness, and `detectArchetypes` name
  membership — all deterministic membership/predicate tests. No LLM classification. The missing/malformed
  cases now return an **explicit** `packageJsonFound: false` (a defined signal, not a guess and not a
  silent default) — which is exactly the improvement the P5 finding asked for.

## Open questions (HALT)

- None. The contract shape (result object `{ archetypes, packageJsonFound }`) was chosen by the human at
  the plan halt; `packageJsonFound = false` for missing/malformed/non-object, `true` for a found object.
