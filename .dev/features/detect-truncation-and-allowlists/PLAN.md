# PLAN — detect-truncation-and-allowlists (F-25 + F-27)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 — sha256 of ARCHITECTURE.md, read this run
- increment: Make archetype detection say when its bounded walk stopped early (F-25: `truncated`, an init warning, an additive `--dry-run --json` key, and a short-circuit once nothing can change the result) and widen its package allowlists while no longer letting a devDependency-only server/DB package make a project `backend` (F-27).
- layer(s): product (`pharn` CLI, `src/`) + its tests + user docs.
- constitution_refs: [P1, P2, P4, P5, P6, P7]

## Context (live reads, this run)

- `src/lib/detect-archetype.ts:177-178` — `MAX_DEPTH = 24`, `MAX_ENTRIES = 50_000`. When either cap
  bites, the walk just returns (`:252`, `:269`); nothing records it. The comment at `:171-176` already
  admits "a signal that lies past a cap is silently UNDETECTED". Sorted order makes it deterministic
  but name-dependent: 50,000 files in `public/` (sorts before `src/`) + `src/App.tsx` → `lib`.
- `:235` `allFound = acc.ssr && acc.backend && acc.clientUi` — over the TREE signals only; the
  package.json signals are never consulted, so a Next + Express project still walks until the tree
  itself yields all three.
- `src/lib/archetype.ts:346-354` — the rule: `spa = clientUi && !ssr`. So once `ssr ∧ backend` hold
  (merged over package.json ∪ tree) the archetype set is `[ssr, backend]` whatever else the walk
  finds, and `evidenceFor` cites a dependency before a path and the FIRST path per signal — the
  evidence is fixed too. That is the exact "nothing more can change the result" condition.
- `src/lib/archetype.ts:22-58` — `SSR_FRAMEWORKS` (7), `BACKEND_FRAMEWORKS` (9), `CLIENT_UI` (6).
  `:117-124` — `packageFacts` reads `dependencies ∪ devDependencies` names with equal weight;
  `peerDependencies` / `optionalDependencies` are not read.
- `tests/archetype.test.ts:67-79` pins today's F-27 behavior verbatim: `react` (dep) + `express`
  (devDep) → `['backend', 'spa']`.
- Every candidate package name below was checked to exist on the npm registry this run
  (`npm view <name> version`).
- Evidence flows `detectArchetypesFromProject` → `ArchetypeOrigin` (`init.ts:183-191`) →
  `archetypeOriginLines` (real run, `--yes`, text dry run — one composition) and
  `buildInitReport` (`archetypeEvidence`, `schemaVersion: 1`).

## Design decisions

1. **`truncated` means "the walk stopped while the result could still change".** `scanFileTree`
   returns `truncated: true` iff it skipped an entry it would have classified because the entry
   budget was spent, OR because the entry sits below `MAX_DEPTH` (the same silent-cap defect; the
   depth check moves from "do not read the dir" to "read it, and the first countable entry trips
   `truncated`", so an EMPTY dir past the cap is not a false alarm). Because the settled check runs
   before the cap checks, a walk that short-circuits is never `truncated`.
   `ArchetypeDetection.truncated` carries it out.
2. **Short-circuit on "settled" = merged `ssr ∧ backend`**, replacing the tree-only `allFound`
   (which it strictly subsumes). The package.json signals are passed into the walk through
   `RootFacts.packageSignals` (default: none — so `scanFileTree(root)` callers keep a tree-only
   walk). Consequence, stated in the `TreeScan` contract: once settled, the tree's `clientUi` may be
   left unset — it cannot change the result (spa is suppressed). A Next + Express project now does
   zero tree reads past the root listing.
3. **The cap becomes injectable for tests only**: exported read-only `WALK_LIMITS = {maxDepth: 24,
maxEntries: 50_000}` and an optional third `limits` parameter on `scanFileTree`.
   `detectArchetypesFromProject` always uses `WALK_LIMITS`. A test pins the two values, so the real
   bound cannot drift; the truncation behavior is proven with a small limit rather than a 50k-file
   fixture (the existing suite's stated rule: "would be measuring the machine, not the rule").
4. **Where the warning shows.** It is part of the archetype block `archetypeOriginLines` renders, so
   the real run's summary, `--yes`'s printed summary and the text dry run show the identical line
   (one composition, as for `previously recorded:`), at the point the user decides:
   `    detection stopped early (it examines at most 50,000 entries, 24 directories deep) — the result may be incomplete; pass --archetype <list> if it is wrong`.
   Under `--archetype` (detection not used) the line is NOT printed — the user already chose.
   `ArchetypeOrigin` gains a required `truncated: boolean` on both variants (each constructor must
   decide; P5). `init --dry-run --json` gains the additive top-level `detectionTruncated: true`,
   ABSENT when false (the `absentUpstream` convention — default bytes unchanged), present under
   `archetypeSource: "flag"` too because it describes detection, like `archetypeEvidence`.
   `schemaVersion` stays 1.
5. **devDependencies no longer raise `backend`; ssr and client-UI still read them.** Decision on the
   F-27 fork: "require tree corroboration for a dev-only backend dependency" COLLAPSES to "drop
   devDependencies for backend" — any tree backend signal already makes the project `backend` on its
   own, so the corroborated case never needs the devDependency. Dropping is the simpler, equivalent
   rule. ssr / client UI keep reading devDependencies because the official templates put the
   framework there (`npm create svelte` lists `@sveltejs/kit` + `svelte` as devDependencies, React
   Router framework mode lists `@react-router/dev`; Vite apps often list `react`); a dev-only
   _server_ is the mock/test-server case the finding names. **Trade-off (documented):** a backend
   bundled so that its server framework is only a devDependency (some Workers/serverless setups)
   loses `backend` unless the tree signals it — `--archetype backend` corrects. `nextDependency`
   (the gate for Next's structural rules) keeps reading both, unchanged.
6. **peerDependencies and optionalDependencies stay unread, deliberately.** A peer dependency names
   the host a _plug-in library_ runs inside (a Next plugin, a React component library) — reading it
   would make every such library `ssr`/`spa`. An optional dependency is by definition one the project
   runs without. Documented as intended, not a gap.
7. **Evidence says devDependency.** `ArchetypeEvidence.source` gains `'devDependency'` (precedence:
   dependency > devDependency > path). Text: `ssr ← @sveltejs/kit (package.json devDependencies)`;
   `dependency` stays `… (package.json)`. JSON `archetypeEvidence[].source` may now be
   `"devDependency"` — an additive enum member, as `update`'s `ahead-of-main` was within
   `schemaVersion: 1`. `PackageFacts` gains `devEvidence` beside `evidence` (runtime deps).
8. **Allowlist additions** (each a name the registry has; all match a framework whose app always
   lists that package):
   - SSR: `@react-router/dev`, `@react-router/node`, `@react-router/serve` (React Router v7
     framework mode — library mode lists only `react-router`, which stays `spa`),
     `@tanstack/react-start`, `@tanstack/solid-start`, `@tanstack/start`, `@solidjs/start`,
     `@builder.io/qwik-city`, `@analogjs/platform`, `vike`, `vite-plugin-ssr`,
     `@nguniversal/express-engine` (Angular Universal, pre-`@angular/ssr`).
   - Backend (request frameworks): `elysia`, `@adonisjs/core`, `h3`, `@trpc/server`,
     `@apollo/server`, `graphql-yoga`.
   - Backend (DB/ORM clients, the list's own "DB folds onto backend" rule): `typeorm`, `sequelize`,
     `mongoose`, `knex`, `kysely`, `@mikro-orm/core`, `pg`, `mysql2`, `mongodb`, `better-sqlite3`.
   - Not added (named so they are not rediscovered): release candidates (`@qwik.dev/router`,
     `waku`), build-time-only generators (`gatsby`), adapters that always ride with a listed package
     (`@react-router/express`, `@remix-run/dev`), and `@supabase/supabase-js` (a browser client too).
   - Known accepted ambiguity: React Router framework mode with `ssr: false` (SPA mode) detects as
     `ssr`, exactly like a `next` static export today — `--archetype spa` corrects.
     `CLIENT_UI` unchanged.

## Files

- `src/lib/archetype.ts` — allowlist additions; `packageFacts` splits runtime vs dev names
  (backend from runtime only; `devEvidence`); `ArchetypeEvidence` `'devDependency'` member;
  `evidenceFor` takes the dev evidence (dependency > devDependency > path); `ArchetypeOrigin`
  `truncated`. — product
- `src/lib/detect-archetype.ts` — `WALK_LIMITS`, `limits` param, `RootFacts.packageSignals`,
  settled short-circuit, `truncated` on `TreeScan` / `ArchetypeDetection`; comments at `:171-176`
  and the interface updated. — product
- `src/steps/archetype-summary.ts` — `describeEvidence` devDependency case; the truncation line in
  `archetypeOriginLines` (detected origin only). — product
- `src/lib/init-report.ts` — additive `detectionTruncated?: true`. — product
- `src/commands/init.ts` — thread `detection.truncated` into both origins. — product
- `src/lib/init-plan.ts` — default origin gets `truncated: false`. — product
- `tests/archetype.test.ts` — new allowlist rows (each SSR/backend addition), dev-only backend → no
  backend (flips `:67-79`), dev-only ssr / clientUi still count, peer/optional ignored, evidence
  precedence dependency > devDependency > path, `packageFacts.devEvidence`. — tests
- `tests/detect-archetype.test.ts` — truncation by entry budget (small limit; the F-25 shape:
  many files sorting before `src/App.tsx` → `lib` + `truncated: true`), by depth (the existing
  depth-25 fixture), empty dir past MAX_DEPTH → not truncated, settled short-circuit (pkg `next` +
  `express` → zero-cost, not truncated even with limit 0; tree ssr + pkg backend), a complete walk →
  `truncated: false`, `WALK_LIMITS` pinned, dev-only express + `src/server.ts` → not backend,
  dev-only express + root `api/` → backend citing the PATH, SvelteKit devDeps evidence. — tests
- `tests/archetype-summary.test.ts` — truncation line printed for a detected origin, not for a flag
  origin, absent when false; devDependency evidence rendering. — tests
- `tests/init-report.test.ts` — `detectionTruncated` absent when false, `true` when set (both
  origin kinds), `devDependency` source projected with its value. — tests
- `tests/init.test.ts` — the detection mock gains `truncated`; origin literals. — tests
- `tests/init-dry-run-json.test.ts` — end-to-end: `detectionTruncated` absent on a normal project
  (GRILL P1). — tests
- `tests/init-dry-run.test.ts` — only if the origin type change forces it. — tests
- `README.md` — limitations bullet (dev-only backend, runtime DB driver ⇒ backend, truncation). — docs
- `docs/getting-started.md` — step 1 (detection). — docs
- `docs/troubleshooting.md` — "Detection picked the wrong archetype" (+ `--archetype backend` for a
  dev-only bundled backend) and "detection stopped early". — docs
- `docs/commands/init.md` — JSON output: `detectionTruncated`, `devDependency` source. — docs
- `CLAUDE.md` — the detection step-2 paragraph (surgical) and the `--dry-run --json` key list. — docs
- `CHANGELOG.md` — `[Unreleased]`: Fixed (F-25 truncation surfaced; F-27 dev-only backend),
  Changed (allowlist widening; `devDependency` evidence; new JSON key). No version bump. — docs
- `.dev/features/detect-truncation-and-allowlists/*` — stage artifacts (GRILL/regress/verify/
  REVIEW/SHIP).

## Contracts satisfied

- `ARCHITECTURE.md §5` "Archetype + map-consistency" — detection stays a deterministic membership
  test over two merged sources, names only, bounded + symlink-safe (cited, unchanged in kind).
- `init --dry-run --json` contract (`src/lib/init-report.ts` header): additive keys within
  `schemaVersion: 1`; explicit projection, never a spread.

## Evals to write (P1 — vitest is the spec)

- dev-only `express` + dep `react` → `['spa']` (was `['backend','spa']`).
- dev-only `@sveltejs/kit` → `['ssr']`, evidence `{source:'devDependency', name:'@sveltejs/kit'}`.
- each new SSR name alone (+ `react`) → `['ssr']`; each new backend name (dependency) → `['backend']`.
- `react-router` alone + `react` → `['spa']` (library mode stays spa).
- `peerDependencies: {next}` / `optionalDependencies: {express}` → `['lib']`.
- walk with `maxEntries: N` and N+ files sorting before `src/App.tsx` → archetypes `['lib']`,
  `truncated: true`; same tree with a big limit → `['spa']`, `truncated: false`.
- `a/…(25)…/Page.tsx` → `truncated: true`; `a/…(25)…/` empty → `truncated: false`.
- pkg `next`+`express`, limit `maxEntries: 0` → `['ssr','backend']`, `truncated: false`.
- `archetypeOriginLines` with `truncated: true` (detected) contains the line; (flag) does not.
- `buildInitReport`: `detectionTruncated` absent / `true`; key order of the rest unchanged.

## Guarantee audit (P0)

- "`truncated` is reported whenever the cap stopped the walk before the result was settled" →
  floor: deterministic integer compare + boolean membership in the walk, pinned by tests (the walk
  is sorted, so the same tree always yields the same flag).
- "a settled result is final" → floor: follows from the pure rule `archetypesFromSignals`
  (`spa = clientUi ∧ ¬ssr`) and `evidenceFor`'s precedence; pinned by tests that compare a settled
  short-circuited walk to a full walk's archetypes + evidence.
- "detection is correct for a framework" → **advisory**, as before: allowlists are a heuristic
  about what a project is; `--archetype` remains the correction. Docs keep saying so.
- "a dev-only server dependency no longer adds backend capabilities" → floor: name-set membership
  over `dependencies` only for the backend allowlist; pinned.

## Trust audit (P2)

- package.json names / tree entry names are local project input (unchanged class). New: none. The
  `detectionTruncated` key is a CLI-computed boolean. Evidence values stay allowlist LITERALS for
  dependency/devDependency (never the manifest's key bytes) and `terminalSafe`/`cap`-ed paths.

## Determinism audit (P5)

- Every new branch is a set-membership test (allowlists, `dependencies` vs `devDependencies` key
  sets) or an integer compare (budget, depth). The settled test is a boolean AND. No fallback guesses:
  a truncated walk still returns its deterministic partial result, and the terminal fallback is
  "tell the user, point at `--archetype`" (ask), never a guess.

## Risks

- Changing the `clientUi` tree signal after settlement could break a test that asserts the tree's
  clientUi on an ssr+backend tree via `scanFileTreeSignals` — mitigated: `scanFileTree(root)`
  without `packageSignals` still settles only on tree ssr ∧ backend, and the full suite runs.
- The JSON `source: "devDependency"` member is new; a consumer switching exhaustively on `source`
  sees an unknown member. Precedent: `ahead-of-main` was added the same way; CHANGELOG names it.
- Over-selection from the DB driver additions (`pg`, `mongodb`) in a tooling repo that uses them at
  runtime is the intended reading (it IS a backend surface); dev-only uses are now excluded.

## Open questions (HALT)

None open. Resolved at GATE 1 (human, via the coordinator, 2026-10-18 — APPROVED as written):

- Decision 1: YES — the depth cap counts toward `truncated`.
- Decision 5: YES — devDependencies dropped for `backend` only, kept for ssr / client UI; the docs
  say `--archetype backend` is the fix for a dev-only bundled backend.
- Decision 8: keep the full allowlist additions, DB clients included; the docs add ONE sentence that
  a runtime DB driver dependency means `backend`.
- Risk 1 directive: no evidence or JSON field may change for an archetype the result already rules
  out (evidence is emitted only for archetypes IN the result, and `detectionTruncated` is false for a
  settled walk); adjust a test asserting on an internal tree `clientUi` only if that value is truly
  unobservable through `detectArchetypesFromProject`.
