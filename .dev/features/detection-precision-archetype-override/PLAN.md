# PLAN — detection-precision-archetype-override: scope the Next/DB tree signals, and make `--archetype` a real override with evidence in the summary

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: Narrow the file-tree archetype signals so Next-specific rules fire only where Next lives (router roots under a base that has Next evidence; `next.config.*` only at a base), and gate the language-agnostic structural backend signals (`api/` at the root, `migrations/`, DB-located `.sql`) on a usable root `package.json`; make detection return one piece of triggering evidence per archetype and print it in the install summary; turn `--archetype` from a parsed no-op into a strictly validated, value-taking `init` override that replaces detection. Closes F-06 and F-17 (both Medium).
- layer(s): CLI (`src/index.ts` dispatch, `src/commands/init.ts`, `src/steps/archetype-summary.ts`) + pure lib (`src/lib/archetype.ts`) + I/O lib (`src/lib/detect-archetype.ts`) + tests + user-facing docs + CLAUDE.md. No `pharn-contracts` change. No trusted-doc edit.
- constitution_refs: [P0, P2, P3, P5, P6, P7]

## Discovery (read this run, P6)

- `src/lib/archetype.ts:181-223` `classifyEntry(name, isDir, segments)` — pure per-entry rule. Today: dir `api` → backend at top level OR whenever the immediate parent is `app`/`pages` (any depth); dir `migrations` → backend at top level or under a `SQL_HOST_DIRS` ancestor; file `next.config.*` → ssr at ANY depth; `route.{ts,tsx,js,mjs}` → backend under ANY `app` ancestor; `.sql` → backend under a `SQL_HOST_DIRS` ancestor; `.tsx`/`.jsx` → clientUi except tests/emails. None of the structural backend rules consult the language or the framework.
- `src/lib/detect-archetype.ts:178-227` `scanFileTreeSignals(root)` — sorted, bounded (MAX_DEPTH 24, MAX_ENTRIES 50k), symlink-never-followed walk; SKIP_DIRS at zero budget; ECOSYSTEM_DIRS via the parent's `siblingFiles` set (already computed per directory BEFORE its entries are classified); `.env*` files skipped; short-circuit when all three signals are true. `detectArchetypesFromProject` reads `package.json` first (`readPackageSignals`, bounded `O_NONBLOCK` read), then walks, then merges. `packageJsonFound` is returned but has no consumer today.
- Baseline measured this run with the reviewer's 39 fixtures (`scratchpad/detect/fx`, current HEAD ff9312f): `07-python-flask` `09-go-sqlx-migrations` `10-rust-sqlx` `11-rails-grape` → `[backend]`; `12-laravel` → `[backend, spa]`; `21-angular-src-app-api` `22-vite-react-rtk` `39-vue-src-app-route` → `[backend, spa]`; `23-lib-with-next-docs` → `[ssr]`; `30-lib-docs-pages-api` → `[backend]`; `02-next-app` `20-case-upper` → `[ssr, backend]`; `04-monorepo` `15-split-next` (`packages/web/next.config.js`, `apps/web/next.config.js`) → `[ssr]`. NOTE: the finding says Angular/RTK/Vue `src/app/` → `ssr`; measured, they gain **`backend`** (the `api`-under-`app` and `route.*`-under-`app` rules), not `ssr`. The "+5 personas" are the five capabilities gated on `backend` (see next bullet).
- Live pharn-oss (`/Users/pgalarowicz/Projects/pharn-oss` @ 791d205): the archetype-gated capabilities are `grillers/migrations` (`[backend, ssr]`), `a11y`/`i18n` (`[ssr, spa]`), and the lenses `ssrf`, `unsafe-deserialization`, `path-traversal`, `n-plus-one` (`[backend, ssr]`). `ssrf.md:117` and `path-traversal.md:82,110` state their sink matching is JS/TS-only ("other-runtime sinks (Python `requests.get`) … missed"); upstream's README says detection "is JS/TS-shaped today".
- `src/index.ts`: `ALLOWED_FLAGS` row `['init', ['archetype', 'ref']]` (:85); `STRING_FLAGS = new Set(['ref'])` (:136); declared booleans/strings derived from the table (:145-146, :189-190); `refOption` (:370) maps minimist's `''` (bare), `false` (`--no-ref`), array (repeated) and any non-member to `null` → `refuse('Invalid value for --ref …')` before `--version`/`--help` (:295-300). `runInit({ ref })` (:322). USAGE line `--archetype    init: deprecated no-op …` (:28). Comment block at :244-245.
- `src/commands/init.ts:103-106` `runInitArchetype(channel)` → `detectArchetypesFromProject(cwd)` → `note(archetypes.join(', '), 'Detected archetypes')` BEFORE the fetch; `:205` `runArchetypeSummary(archetypes, selection)`; the archetypes flow on to `runInstallArchetype` which records them in `pharn.config.json`.
- `src/steps/archetype-summary.ts:33` — `row('Detected archetypes', archetypes.join(', '))`, no evidence.
- `src/lib/terminal-safe.ts` `terminalSafe(value, { max })` — THE display sanitizer (C0/C1/DEL/Cf stripped, optional cap).
- `update` re-resolves `config.archetypes` and never re-detects (`lib/update-plan.ts` → `mergeCapabilities`), so an override recorded at `init` sticks across `update` with no change there.
- Parallel work: branch `fix/validate-archetypes` (F-05, wt-f05, not merged) introduces `ARCHETYPE_VALUES` in `src/lib/validate.ts` and derives `Archetype` and `ARCHETYPE_ORDER` from it. This plan needs the same canonical list — see Open question 1.
- Tests touched: `tests/detect-archetype.test.ts` (803 lines; ~12 manifest-less cases assert the signals this plan gates — `api/` dir, `app/**/route.ts`, `db/*.sql`, `migrations/`), `tests/archetype.test.ts` (`classifyEntry` direct calls), `tests/index.test.ts` (`init --archetype` no-op test :60, `status --archetype` :574, flag-threading keys :755, USAGE text :864, the `--ref` block :781-850 to mirror), `tests/archetype-summary.test.ts`, `tests/init.test.ts` (mocks `detectArchetypesFromProject` → must gain `evidence`), `tests/init-archetype.test.ts` (Next fixture; unaffected).
- Docs that state the detection rules or the no-op: `README.md:276-277` (no-op), `:340-344` (JS/TS-shaped claim); `docs/getting-started.md:55-58`; `docs/troubleshooting.md` "My Python / Go / Rust project detected as `lib`" + "Monorepos / workspaces"; `docs/commands/init.md` (no-op blockquote, "`init`'s options are …", §3 Detect, §6 Summary); `CLAUDE.md` (dispatch paragraph "`init: archetype, ref` (archetype is its retained no-op)", "`--ref` is the CLI's one VALUE-taking flag", init step 2, the "retained no-op alias" sentence); `ARCHITECTURE.md` §5 lists the signals descriptively (trusted, human-owned; still true as a description after narrowing — no edit proposed). `LIMITS.md` does not mention detection.

## Design

### A. Signal precision (F-06) — `src/lib/archetype.ts` (pure rules)

`classifyEntry(name, isDir, segments, ctx)` gains a fourth, required argument — a pure description of the entry's surroundings computed by the walk:

```ts
interface ClassifyContext {
  jsProject: boolean; // a usable package.json at the scan root (packageJsonFound)
  baseDepth: number; // how many leading `segments` are the entry's BASE (0 = root, 2 = apps/<x> | packages/<x>)
  nextBase: boolean; // the base has Next evidence
}
```

- **Base** = the scan root, or a workspace package dir `apps/<x>` / `packages/<x>` (exactly depth 2, membership `WORKSPACE_DIRS = {apps, packages}`). This keeps today's monorepo behaviour (`04-monorepo`, `15-split-next` stay `ssr`) while dropping arbitrary-depth `next.config.*`.
- **Next evidence of a base**: a regular file named `next.config.*` (case-insensitive) directly in it; for the root base also the `next` dependency in the root `package.json`. (`next.config.*` is optional in Next, so the dependency is the root's primary evidence; workspace packages' own `package.json` files are not read — unchanged.)
- **Router root** (relative to the base, `rel = segments.slice(baseDepth)`): `app` | `pages` | `src/app` | `src/pages` — the four locations Next reads. Not `website/pages`, `docs/pages`, `src/features/app`, …

| Signal                            | Fires only when                                                                       | Gate                            |
| --------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| `next.config.*` → ssr             | the file sits directly in a base (root, `apps/<x>`, `packages/<x>`)                   | none (the file IS the evidence) |
| `route.{ts,tsx,js,mjs}` → backend | under an `app` router root (`app/**`, `src/app/**`) of its base                       | `nextBase`                      |
| `api/` dir → backend              | directly under a router root (`app/api`, `pages/api`, `src/app/api`, `src/pages/api`) | `nextBase`                      |
| `api/` dir → backend              | at the scan root                                                                      | `jsProject`                     |
| `migrations/` dir → backend       | at the scan root, or under a `SQL_HOST_DIRS` ancestor (unchanged placement)           | `jsProject`                     |
| `.sql` → backend                  | under a `SQL_HOST_DIRS` ancestor (unchanged placement)                                | `jsProject`                     |
| `.tsx`/`.jsx` → clientUi          | anywhere but tests/emails (unchanged)                                                 | none                            |

**Why gate the DB/`api/` signals on JS evidence rather than change the docs to say non-JS backends resolve `backend`** (the finding's either/or): the five `backend`-gated capabilities are JS/TS-shaped in their own matching (upstream `ssrf.md`/`path-traversal.md` say non-JS sinks are missed), and the floor/commands PHARN installs assume a Node toolchain. Resolving a Rails/Flask/Go service as `backend` would install lenses that structurally cannot see its code — a false sense of coverage. Gating keeps the documented, honest outcome (`lib` + universal capabilities, `pharn add` for anything else, or now `--archetype backend`) true. Residual, documented: a non-JS backend that ALSO has a root `package.json` (Laravel/Rails with a Vite frontend) still resolves `backend` from its `migrations/`/`db/*.sql`.

### B. Walk + evidence (F-06/F-17) — `src/lib/detect-archetype.ts` (reading strategy)

- `detectArchetypesFromProject` already reads `package.json` before walking; it now passes `{ jsProject: packageJsonFound, nextDependency }` into the walk. `scanFileTreeSignals(root, pkgFacts?)` — `pkgFacts` defaults to "no package.json" (`{ jsProject: false, nextDependency: false }`).
- When the walk lists a directory that is a base, it computes that base's `nextBase` from the `siblingFiles` set it already builds (no extra I/O), and threads `{ baseDepth, nextBase }` down to the subtree. Every safety property is untouched: same sort, same SKIP_DIRS / ECOSYSTEM_DIRS / symlink / `.env*` / non-regular-file handling, same budget accounting and caps, same short-circuit (now on the GATED signals, so it stays correct).
- Evidence: the first trigger of each signal kind, in the deterministic walk order, is kept as a project-relative POSIX path (dirs with a trailing `/`), e.g. `src/app/api/hello/route.ts`, `migrations/`. Dependency evidence comes from the allowlist member that matched, in allowlist order (e.g. `next`, `express`) — dependency evidence wins over path evidence for the same kind (package.json is read first). `packageSignals` gets an evidence-returning sibling (`packageEvidence`) so its existing output is unchanged.
- Result type: `ArchetypeDetection { archetypes, packageJsonFound, evidence: ArchetypeEvidence[] }` with exactly one entry per returned archetype, in archetype order: `{ archetype, source: 'dependency', name }` | `{ archetype, source: 'path', path }` | `{ archetype: 'lib', source: 'none' }`. `spa`'s evidence is the clientUi trigger; it is absent whenever `spa` is suppressed.
- The file-header comment "no untrusted free text escapes this boundary" is corrected: evidence paths are names from the user's OWN local tree (not fetched content), used only for display, through `terminalSafe`, capped — never written to config, joined into a path, or compared.

### C. `--archetype` override (F-17) — `src/index.ts`, `src/commands/init.ts`

- `STRING_FLAGS = new Set(['ref', 'archetype'])`; `ALLOWED_FLAGS` init row unchanged (`['archetype', 'ref']`) but no longer a no-op. USAGE: `--archetype <list>  init: use these archetypes instead of detecting them (comma-separated: ssr,backend,spa,lib)`.
- `archetypeOption(value): Archetype[] | undefined | null`, mirroring `refOption` exactly: `undefined` → `undefined`; a string split on `,` where EVERY segment is an exact member of the canonical list, no segment repeats, no empty segment, no whitespace, no case folding → the members in canonical order; everything else (`''` bare, `false` `--no-archetype`, an array from a repeated flag, an unknown/upper-case/space-padded/duplicate/empty segment) → `null` → `refuse('Invalid value for --archetype (expected a comma-separated list of "ssr", "backend", "spa", "lib", each at most once)', [offender])`, placed beside the `--ref` value check, i.e. BEFORE `--version`/`--help`. `lib` combined with another archetype → see Open question 3 (recommended: refused).
- `runInit({ ref, archetypes })` — `archetypes` threaded only when given (the "threads exactly the flags each row grants" test becomes `['archetypes', 'ref']` with `archetypes: undefined` when absent, matching how `ref` is threaded).
- `runInitArchetype(channel, override)`: detection still runs (local, cheap; see Open question 2) so the summary can show what it found; when `override` is given the installed/recorded set IS the override. The pre-fetch note becomes `Archetypes (from --archetype)` vs `Detected archetypes`. Nothing else in init changes: the override flows through `resolveCapabilities` → summary → `runInstallArchetype` → `config.archetypes`, and `update`/`add`/`status` keep reading the recorded set (so the correction sticks). No new config key.

### D. Summary (F-17) — `src/steps/archetype-summary.ts`

`runArchetypeSummary(archetypes, selection, origin)` where `origin` is `{ kind: 'detected', evidence }` | `{ kind: 'flag', detected: ArchetypeDetection }`. Rendering:

```text
  Detected archetypes        ssr, backend
    ssr      ← next (package.json)
    backend  ← src/app/api/hello/route.ts
```

```text
  Archetypes (--archetype)   backend
    detection found          ssr, backend   (not used)
```

`lib` with no signal renders `lib ← no framework signal found`. Every path goes through `terminalSafe(…, { max: 120 })`; dependency names are allowlist literals.

## Files

- `src/lib/archetype.ts` — `ClassifyContext`, base/router-root/Next-evidence membership sets, gated `classifyEntry`, `packageEvidence`; comments updated — layer: lib (pure rules)
- `src/lib/detect-archetype.ts` — walk threads base context + package facts, records first-trigger evidence, `ArchetypeDetection.evidence`; header comment corrected — layer: lib (I/O)
- `src/index.ts` — `archetype` into `STRING_FLAGS`, `archetypeOption` + refusal before the short-circuits, `runInit({ ref, archetypes })`, USAGE text, stale no-op comment removed — layer: CLI dispatch
- `src/commands/init.ts` — `InitOptions.archetypes`, override replaces detection, pre-fetch note label, origin passed to the summary — layer: command
- `src/steps/archetype-summary.ts` — evidence lines / override rendering, terminal-safe; stale "pharn init --archetype" header comment fixed — layer: step
- `src/lib/validate.ts` — `ARCHETYPE_VALUES` (byte-identical to the F-05 branch, GATE 1 decision 1), `APPLIES_TOKEN_VALUES` derived from it — layer: lib
- `src/types.ts` — only the two stale "(pharn init --archetype)" comments (if F-05 has not landed first; see OQ1) — layer: types
- `tests/archetype.test.ts` — `classifyEntry` table for every gate (with/without `jsProject`, `nextBase`, base depth, router roots) — layer: tests
- `tests/detect-archetype.test.ts` — the reviewer fixtures (below), evidence assertions, existing manifest-less cases given the evidence they now need (each keeps its original intent) plus their negative twins; walk-safety suites unchanged and still green — layer: tests
- `tests/index.test.ts` — `--archetype` block mirroring `--ref` (accepts, normalises order, `--archetype=…` form, refusals incl. beside `--help`, `status --archetype x` still Unsupported, USAGE text); the old no-op test replaced — layer: tests
- `tests/init.test.ts` — override replaces detection (detected set not recorded/resolved), label, evidence passed to summary; mock gains `evidence` — layer: tests
- `tests/archetype-summary.test.ts` — evidence lines, override rendering, `lib` line, an ESC/RLO in a path is stripped and a long path capped — layer: tests
- `README.md` — CLI table/`init` options (drop the no-op sentence, document `--archetype`), JS/TS-shaped bullet made precise — layer: docs
- `docs/commands/init.md` — options, an `--archetype` section, §3 Detect (the gated rules table in prose), §6 Summary evidence — layer: docs
- `docs/getting-started.md` — the JS/TS-shaped sentence made precise — layer: docs
- `docs/troubleshooting.md` — "Python/Go/Rust → lib" kept and made precise (+ the Laravel/Rails-with-package.json residual), new "Detection picked the wrong archetype" section (`pharn init --archetype …`; `update` keeps it; a re-run `init` re-detects unless passed again), monorepo section notes `apps/*`/`packages/*` bases — layer: docs
- `docs/reference/pharn-config.md` — `archetypes` row: "detected, or given with `init --archetype`" — layer: docs
- `CLAUDE.md` — dispatch paragraph (`--ref` no longer the one value-taking flag; init row), init step 2 (gates + evidence), the retained-no-op sentence — layer: docs
- `CHANGELOG.md` — `[Unreleased]`: `### Changed` (detection precision) + `### Added` (`--archetype` override, evidence in the summary). No version bump — layer: docs

## Contracts satisfied

- No `pharn-contracts` file governs detection. The archetype enum is the existing `Archetype` type (ARCHITECTURE.md §5 "archetype ∈ {ssr, backend, spa, lib}"); detection stays "a pure, deterministic membership test … names only … bounded + symlink-safe" (§5), cited, not restated.

## Evals to write (P1)

Detection (`tests/detect-archetype.test.ts`, each built with `touch`/`writePkg` in a tmp dir; expected = archetypes, plus evidence where noted):

- Angular: `@angular/core` + `src/app/app.component.ts` + `src/app/api/users.service.ts` → `[spa]`
- Vite + React + RTK Query: `src/App.tsx` + `src/app/store.ts` + `src/app/api/apiSlice.ts` → `[spa]`
- Vue: `vue` + `src/App.vue` + `src/app/router/route.ts` → `[spa]`
- docs site inside a lib: devDeps only + `website/next.config.js` + `website/pages/index.tsx` + `src/index.ts` → `[spa]` (not `ssr`)
- lib with `docs/pages/api/search.ts`, no manifest → `[lib]`
- Flask-Migrate: `pyproject.toml` + `migrations/env.py` + `migrations/versions/0001_init.py` → `[lib]`
- golang-migrate: `go.mod` + `migrations/001_init.up.sql` → `[lib]`
- sqlx (Rust): `Cargo.toml` + `migrations/20240101_init.sql` → `[lib]`
- Rails: `Gemfile` + `db/structure.sql` + `app/api/v1/users.rb` → `[lib]`
- Laravel: `composer.json` + `database/migrations/x.php` → `[lib]`; with `resources/js/app.jsx` → `[spa]`
- residual pinned: the same Laravel tree + a root `package.json` → `[backend]` (documented)
- genuine Next App Router: `next` dep + `app/api/users/route.ts` → `[ssr, backend]`, evidence `ssr ← next`, `backend ← app/api/users/route.ts`
- genuine Next under `src/app`: `next` dep, no config, `src/app/api/hello/route.ts` → `[ssr, backend]`
- genuine Pages Router: `next.config.js` (no dep, no manifest) + `pages/api/users.ts` → `[ssr, backend]`; `src/pages/api/` likewise
- upper-case `Next.Config.JS` + `App/API/ROUTE.TS`, no manifest → `[ssr, backend]` (unchanged)
- monorepo: `apps/web/next.config.js` + `apps/web/app/api/x/route.ts` → `[ssr, backend]`; `packages/web/next.config.js` → `ssr`; `apps/admin/src/app/api/` beside a Next `apps/web` (admin has no next.config) → no backend from admin
- `next.config.js` at `website/`, `src/`, `apps/web/nested/` → no ssr
- JS backends keep their signals: `package.json` (no framework dep) + `migrations/001.sql` → `[backend]`; + `db/schema.sql` → `[backend]`; + root `api/` → `[backend]`; `prisma/migrations/` → `[backend]`
- evidence: dependency beats path for the same kind; first path in sorted walk order is chosen; `lib` → `source: 'none'`; suppressed `spa` has no evidence; evidence is deterministic across runs
- walk safety unchanged: the existing SKIP_DIRS / ECOSYSTEM_DIRS / symlink / depth / budget suites stay green (the `app/<target|vendor>/route.ts` cases gain a `next` dep so they still test the skip, not the gate)

Dispatch (`tests/index.test.ts`), mirroring `--ref`:

- `init --archetype backend` → `runInit({ ref: undefined, archetypes: ['backend'] })`; `--archetype=spa,backend` → `['backend', 'spa']` (canonical order); all four singletons accepted
- refused (exit 1, stderr names the value, usage printed, `runInit` not called): bare `--archetype`, `--no-archetype`, repeated flag, `Backend`, `bogus`, `backend,backend`, `backend,`, `,backend`, `backend, spa`, `lib,backend` (per OQ3), and `init --help --archetype bogus` (before the short-circuit)
- `status --archetype ssr` / `update --archetype ssr` → Unsupported option (row unchanged)
- `init --archetype backend extra` → still `Unexpected argument extra` (the value binds; arity gate unchanged)

Init + summary (`tests/init.test.ts`, `tests/archetype-summary.test.ts`):

- override given → `resolveCapabilities` and `runInstallArchetype` receive the override, not the detected set; the note says `Archetypes (from --archetype)`
- no override → detected set + evidence reach the summary; summary shows one `←` line per archetype
- override rendering shows the unused detection result; an ESC / U+202E in an evidence path is stripped; a 300-char path is capped with `…`

Repo gates: `npm run check`, `npm run build`, `npm run test:coverage` thresholds hold; `node .dev/floor/validate.mjs .` GREEN.

## Guarantee audit (P0)

- "Detection is deterministic" → floor: membership tests over names (`Set.has`, fixed `startsWith`/`endsWith`), sorted bounded walk, OR-merge; evidence = first trigger in the same sorted order. Tested by repeat-run equality.
- "Detection is correct for a given project" → **advisory**, as today. The new gates trade false positives for documented false negatives (a Next app in an unusual base; a JS backend with no `package.json`); `--archetype` is the in-product correction.
- "`--archetype` accepts exactly the canonical archetypes" → floor: enum membership per comma segment, exact string equality, duplicate check, before any dispatch (same reduction as `--ref`).
- "An override sticks across `update`" → floor by construction: the override is what `runInstallArchetype` records, and `update` resolves the recorded set (existing code, unchanged).
- "Evidence is terminal-safe" → floor: `terminalSafe` (fixed regex) + cap at the one render site.
- "Walk safety (bounded, symlink-safe, skips)" → floor: unchanged code paths; existing suites re-run.

## Trust audit (P2)

- No new untrusted input. `package.json` dependency NAMES and local tree NAMES were already read; nothing fetched is involved. New: tree names now LEAVE the detection boundary as display-only evidence strings — they are the user's own project paths, rendered only through `terminalSafe` with a cap, never written to `pharn.config.json`, never joined into a path, executed, or compared. Dependency evidence is an allowlist literal, never the manifest's key bytes. The `--archetype` value is user argv, reduced to the closed enum before use (anything else refused).

## Determinism audit (P5)

- Every branch is membership (`WORKSPACE_DIRS`, router-root pairs, `SQL_HOST_DIRS`, the enum), a boolean gate, or exact string equality. `--archetype` parsing is exact-membership-or-refuse; no fuzzy matching, no case folding, no guessing which of two repeated values was meant.

## Out of scope (P7)

- F-27 (allowlist breadth: React Router v7 / TanStack Start SSR, dev-only `express`), F-25 (silent 50k cap), F-05 (config-side `archetypes` validation — separate branch), the "detected [...]" wording in `resolveCapabilities`' skip reason, re-reading workspace packages' `package.json`, any `update`/`add`/`status` change, a version bump, any trusted-doc edit.

## Open questions (HALT)

1. **Canonical archetype list vs the parallel F-05 branch.** F-05 (`fix/validate-archetypes`, unmerged) adds `ARCHETYPE_VALUES` to `src/lib/validate.ts` and derives `Archetype`/`ARCHETYPE_ORDER` from it. Recommended: build against a byte-identical `ARCHETYPE_VALUES` declaration (same file, same comment, same position) so whichever lands second rebases trivially; if F-05 merges first, rebase onto it and drop the duplicate. Alternative: wait for F-05 to merge before building.
2. **With `--archetype`, does detection still run, and is its result recorded?** Recommended: run it (local, bounded, no network) and SHOW it in the summary as "detection found … (not used)", but record nothing new — the override is what `config.archetypes` holds, and no consumer exists for a recorded detection (P7). Alternatives: (b) skip detection entirely; (c) also record `detectedArchetypes` in the config.
3. **`lib` combined with another archetype** (`--archetype lib,backend`). Detection never produces it (`lib` means "no signal"). Recommended: refuse it in the same `Invalid value for --archetype` error, so the override cannot create a config state detection never does. Alternative: accept any non-empty distinct set.
4. **Monorepo bases.** Recommended: `next.config.*` counts at the root and at exactly `apps/<x>/` and `packages/<x>/` (today's `04-monorepo`/`15-split-next` stay `ssr`), with Next route/api signals in such a package gated on that package's own `next.config.*`. `src/next.config.*` does NOT count (Next never reads it there). Alternatives: (b) strictly root-only — monorepo Next apps would then detect `spa` (or `lib`) and need `--archetype`; (c) any depth (today, rejected by F-06).
5. **Language-agnostic signals: gate or re-document?** Recommended: gate `api/` (root), `migrations/` and DB-located `.sql` on a usable root `package.json` (justified above: the backend capabilities are JS/TS-shaped upstream), keep the docs' "Python/Go/Rust → `lib`" claim and make it precise, and document the Laravel/Rails-with-`package.json` residual. Alternative: leave the signals language-agnostic and change the three docs to say non-JS backends DO resolve `backend`.
6. **Re-run `init` after an override.** A re-run `init` (the documented recovery command) re-detects; it does not remember a previous `--archetype`. Recommended: keep it that way, say so in `docs/commands/init.md` and the troubleshooting entry, and show the source in the summary so it is visible. Alternative: carry the previous config's `archetypes` when it differed from detection (needs a new marker key).
7. **`LIMITS.md`** does not mention detection; no proposal expected. `ARCHITECTURE.md` §5's signal list stays a true description after narrowing; no edit proposed (human may refine it).

## Resolved decisions (GATE 1, 2026-10-13)

GATE 1 passed: approved, with the answers below.

1. `ARCHETYPE_VALUES` → declared in `src/lib/validate.ts` byte-identical to the F-05 branch (same comment, same position, `APPLIES_TOKEN_VALUES` derived from it). F-05 is expected to merge first; this branch then rebases and drops the duplicate.
2. Bases → the root plus exactly `apps/<x>/` and `packages/<x>/`; `src/next.config.*` does not count.
3. With `--archetype`, detection still runs and is SHOWN ("detection found … (not used)"); no new config key is recorded.
4. `lib` combined with any other archetype → refused (`Invalid value for --archetype`).
5. Gate `api/` (root), `migrations/` and DB-located `.sql` on a usable root `package.json`; document the Laravel/Rails-with-`package.json` residual.
6. A re-run `init` re-detects. ADDITION: when the resulting archetypes differ from the replaced config's `archetypes` (read tolerantly — init already does), the summary prints `previously recorded: <list> — pass --archetype to keep them`, so an earlier override never disappears silently. The previous list is shown only when it is an array of canonical archetype members (anything else → no line); it is display-only, through `terminalSafe`.
7. No `LIMITS.md` / `ARCHITECTURE.md` proposal.

Coordination constraint (F-07 reworks init in parallel: init `--dry-run/--json/--yes`, `archetypeSummaryLines` extraction, `lib/init-plan.ts`): keep `init.ts` / `archetype-summary.ts` edits small and localized; the evidence / origin rendering lives in ONE pure function taking plain data (`archetypeOriginLines`), so it can slot into `archetypeSummaryLines` later.

Rebase note (2026-10-13): F-05 merged first (`3fedcb8`, #277). The branch was rebased onto `origin/main` `6dae4fe`; the `ARCHETYPE_VALUES` declaration merged identically, so `src/lib/validate.ts` no longer differs from main and this branch now uses the merged declaration. A config with invalid `archetypes` is now refused by `readPharnConfig` (F-05), so init's tolerant `readPreviousConfig` yields no previous config there — the "previously recorded" line is then simply absent, as designed.
