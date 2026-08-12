# PLAN — the detection walk stops paying for framework build/deploy caches

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: add eleven framework build/deploy cache directories to `SKIP_DIRS` in the archetype
  file-tree walk, export the constant read-only, and pin skip semantics + classification neutrality
  for every member (old and new) with tests.

> **Gate decision (recorded, human, this run):** the wider cache zoo is **IN** — "Add all six" was
> chosen over the plan's own recommendation to decline. `SKIP_DIRS` therefore ships **15** members:
> the original 4, the 5 measured-or-canonical, and the 6 zoo names. Every claim below that counted
> "five" / "nine" is restated at the real counts. Base drift resolved: **proceed on live `main`**.
- layer(s): the installer's own `src/lib` — the archetype detection I/O boundary (`ARCHITECTURE.md §5`,
  "detected deterministically … bounded + symlink-safe"). No PHARN layer (`§4`) changes.
- constitution_refs: [P1, P3, P4, P5, P6, P7]

## Live state verified this run (P6)

- Base: `main` at `4d24ad4`, working tree clean, `0 0` divergence from `origin/main`.
  **The brief's stated base `21db522` is two commits stale** — `#92` (`fix: prune removed capability
  entries from pharn.records.json`) and `#93` (`docs: align trust map with the records era`) landed
  since. Neither touches `src/lib/detect-archetype.ts`, `src/lib/archetype.ts`,
  `tests/detect-archetype.test.ts`, or `docs/commands/init.md`, so no §0 claim is invalidated.
- `npm run check` GREEN on the untouched base (41 files, 658 tests).
- `SKIP_DIRS` — `src/lib/detect-archetype.ts:51`, module-private `const`, `new Set(['node_modules',
  '.git', 'dist', 'build'])`, compared as `SKIP_DIRS.has(name.toLowerCase())` at `:105`. Confirmed
  **not exported**.
- Order confirmed at `:96–:115`: per-directory `.sort()` → symlink `continue` (`:103`) → **skip
  `continue` (`:105`, before `budget -= 1` at `:108`)** → classify (`:109`) → recurse. A skip-listed
  subtree therefore costs **zero** budget and is never classified.
- The cap comment (`:53–:58`) reads verbatim as quoted in the brief, including "a signal that lies
  past a cap is silently UNDETECTED" and "chosen GENEROUSLY, far beyond any realistic project".
- `classifyEntry` (`src/lib/archetype.ts:189–:202`) has exactly two directory-name rules — `api`
  (top level, or parent `pages`/`app`) and `migrations` (top level, or under a SQL-host ancestor).
  **No proposed member collides.**
- Doc anchor confirmed: `docs/commands/init.md:86` carries the verbatim enumeration
  "`node_modules`/`.git`/`dist`/`build` skipped". An untruncated sweep of `docs/` + root `*.md`
  found **no second enumeration** (`ARCHITECTURE.md §5` says only "bounded + symlink-safe", and it
  is hook-protected — no change needed or permitted).

### Measurement re-run (this run, file-based `probe.mts` — `tsx -e` will not resolve `.js`→`.ts`)

```text
FAT:     {"archetypes":["lib"],"packageJsonFound":false}  188ms
CONTROL: {"archetypes":["spa"],"packageJsonFound":false}    1ms
```

`/tmp/l3fix` = `.next/` with 55 000 empty files + `src/App.tsx`, no `package.json`; `/tmp/l3ctl` =
the same tree minus `.next`. The misclassification reproduces exactly as §0 states.

### Two corrections to the brief's own claims (P6 — reported, not silently absorbed)

1. **"the original four skip dirs have zero test pins" is FALSE.** `tests/detect-archetype.test.ts`
   already pins two of the four under the comment "Bounded walk — skip-list": `:191`
   (`node_modules/react-dom/index.tsx` → `lib`) and `:199` (`dist/bundle.jsx` → `lib`). Unpinned
   today: `.git` and `build`. The uniform table below still subsumes all fifteen; the two existing
   anecdotes are **kept**, not replaced — they are the only `.jsx` skip fixtures and are existing
   regression pins.
2. **`SQL_HOST_DIRS` is larger than the brief states.** Actual (`src/lib/archetype.ts:121`):
   `{migrations, db, database, prisma, drizzle, sql}` — the brief omits `drizzle` and `sql`. The
   neutrality test's comment will mirror the **real** set; `['db']` remains a valid SQL-host
   ancestor context, so the chosen literal is unaffected.

## Files

- `src/lib/detect-archetype.ts` — eleven members added to `SKIP_DIRS`; comment extended to name the
  new class and record the `out` failure direction; the constant exported as `ReadonlySet<string>` —
  layer: installer `lib/` (I/O boundary; reading strategy only, P3)
- `tests/detect-archetype.test.ts` — the generic classification-neutrality pin + the fifteen
  per-member paired skip pins — layer: tests (P1)
- `docs/commands/init.md` — line 86's four-dir enumeration refreshed to name the class **and** list
  all fifteen members (per `GRILL.md` finding P4/minor: dropping the list would remove the user's
  only way to learn what is skipped without reading source) — layer: user-facing docs (P4)
- `CHANGELOG.md` — one user-facing bullet under `## [Unreleased] → ### Fixed` — layer: release notes

### The literal diff (dictated)

```diff
-// Directories never recursed into and never classified — heavy or irrelevant
-// trees (build output, VCS, deps). Compared case-insensitively (below).
-const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
+// Directories never recursed into and never classified — heavy or irrelevant
+// trees (build output, VCS, deps, framework build/deploy caches). Compared
+// case-insensitively (below). A skipped dir `continue`s BEFORE the budget
+// decrement, so a skip-listed subtree costs zero entries — which is what keeps a
+// fat framework cache from consuming MAX_ENTRIES and silently truncating the walk.
+// The failure DIRECTION of this list is a LOST signal, never a false one: a
+// hand-authored `out/` holding real signal files goes dark (package.json deps
+// normally backstop it). Exported read-only so tests can pin every member's skip
+// behavior and its classification neutrality without mutating it.
+export const SKIP_DIRS: ReadonlySet<string> = new Set([
+  'node_modules',
+  '.git',
+  'dist',
+  'build',
+  '.next', // Next.js build cache (the measured offender)
+  'out', // Next.js static-export default output
+  'coverage', // test-coverage output
+  '.turbo', // Turborepo cache
+  '.vercel', // deploy artifacts
+  '.nuxt', // Nuxt build cache
+  '.svelte-kit', // SvelteKit build cache
+  '.astro', // Astro build cache
+  '.cache', // generic tool cache
+  '.parcel-cache', // Parcel cache
+  'storybook-static', // Storybook static build
+]);
```

No other production line changes. `MAX_ENTRIES` / `MAX_DEPTH` are **not** touched, exported, or
parameterized (see the declined alternative below).

## Contracts satisfied

- `ARCHITECTURE.md §5` (archetype + map-consistency, fix #5) — detection stays a pure deterministic
  membership test over names; this increment only widens the membership set the walk refuses to
  descend into. Cited, not restated (P4).
- No `pharn-contracts/` schema is touched: the output type `ArchetypeDetection` is byte-identical.

## Evals to write (P1)

- `SKIP_DIRS` classification neutrality → `describe.each` over the **entire live set** ×4 ancestor
  contexts (`[]`; `['app']` and `['pages']` — **both** `api` parent triggers, per `GRILL.md` finding
  P1/minor; `['db']` — a `SQL_HOST_DIRS` ancestor, the `migrations` trigger) →
  `classifyEntry(member, true, segments)` equals `{ssr: false, backend: false, clientUi: false}` for
  every member. Generic, so it fails the day anyone adds `api` or `migrations` to the skip list.
- Case-folding of the skip membership test (added per `GRILL.md` finding P1/important — the walk
  compares `name.toLowerCase()`, and no fixture exercised a non-lowercase name) → an uppercased
  fixture directory (`.NEXT/Widget.tsx`, `Coverage/Widget.tsx`) still yields `lib`, while the same
  file at `src/` yields `spa`.
- Per-member skip semantics, all fifteen uniformly → `it.each` over the live set: `<member>/Widget.tsx`
  → `{archetypes: ['lib'], packageJsonFound: false}`, then the paired positive control in the same
  test — `src/Widget.tsx` added → `{archetypes: ['spa'], packageJsonFound: false}` — proving the
  null result is the skip and not an inert fixture.
- Existing pins retained unchanged: `:191` `node_modules/**/*.tsx` → lib, `:199` `dist/*.jsx` → lib.
- **Not a CI test, by design:** the 55 000-file budget-exhaustion fixture. It is the manual e2e
  verification of record (recorded above and re-run inverted in the proof phase). CI pins the
  *mechanism* — skip-before-classify per member — which composes with the verified source fact that
  the skip `continue` precedes `budget -= 1`.

## Guarantee audit (P0)

- "a `SKIP_DIRS` member is never classified, so it can never contribute a signal" → **floor:
  enum-regex** (set membership at `detect-archetype.ts:105`), pinned by the neutrality + per-member
  tests (P1).
- "a `SKIP_DIRS` subtree consumes zero walk budget" → **advisory** (relabeled after `GRILL.md`
  finding P0/important; it read `floor: enum-regex` and that was wrong). The membership test IS
  floor, but the zero-COST half rests on the order of two adjacent statements — the skip `continue`
  at `:105` preceding `budget -= 1` at `:108` — and nothing in CI observes that ordering. Every test
  in this increment uses a handful of fixture files, so the budget never nears `MAX_ENTRIES` and all
  of them would still pass if the decrement moved above the skip. The floor-grade claim is the one
  above it (never classified → never a signal); the zero-cost consequence is asserted, held by code
  review and the manual e2e measurement, and labeled accordingly.
- "a project with a fat framework cache is now detected correctly" → **advisory.** It holds for the
  fifteen listed names only; any unlisted cache still exhausts the budget. The residual is stated,
  not hidden: the caps remain a labeled completeness tradeoff
  (`detect-archetype.ts:53–58`), and this increment narrows the window without closing it.
- "detection is deterministic" → **floor: enum-regex** — unchanged; sorted DFS + boolean OR-merge
  over a closed `Archetype[]` enum.
- "an `out/` directory holding real signal files is still detected" → **NOT guaranteed — struck.**
  Named as an accepted lost-signal tradeoff in the constant's comment and in the PR description.

## Trust audit (P2)

- **Input:** the user's project tree — untrusted (`detect-archetype.ts:24–29`). Unchanged by this
  increment: only entry/dependency **names** are membership-tested; no discovered file body is read,
  and no value is executed, interpolated, forwarded, or logged.
- **Taint propagation:** none added. The boundary's output stays a closed `Archetype[]` enum plus a
  boolean, so no untrusted free text escapes. Widening `SKIP_DIRS` strictly *reduces* the set of
  untrusted names that reach the classifier.
- Symlink safety is untouched — `entry.isSymbolicLink()` still `continue`s before the skip check, so
  a symlink named `.next` is refused as a symlink, not merely skipped.

## Determinism audit (P5)

- The added branch is `SKIP_DIRS.has(name.toLowerCase())` — a set-membership test over lowercase
  literals, identical on every filesystem. All eleven new members are lowercase, as the
  `.toLowerCase()` comparison requires.
- No new fallback is introduced; the walk's existing terminal fallbacks (unreadable subtree → no
  signal; no signal anywhere → `lib`) are defined outcomes, unchanged.
- Exporting the constant as `ReadonlySet<string>` means the test iterates the *production* set: the
  pins cannot drift from the shipped list, and a test cannot mutate it.

## Declined alternatives (recorded)

- **Exporting/parameterizing `MAX_ENTRIES` to make budget exhaustion CI-testable** — declined, on a
  **corrected** rationale (`GRILL.md` finding P0/minor caught the original one conflating two
  claims). The mechanism pins prove skip-before-**classify** (no signal), NOT skip-before-**decrement**
  (no budget cost) — those are statements about different lines. So this alternative is declined not
  because it is redundant but because it widens the module's API purely for a test; the cost it would
  have covered is now honestly labeled **advisory** in the guarantee audit above rather than sold as
  floor. Argue it at the gate if you disagree.
- **Removing the two existing skip pins as now-redundant** — declined; they are the only `.jsx` skip
  fixtures and pin realistic paths.

## Open questions (HALT) — RESOLVED at the gate

1. **The wider cache zoo** — `.nuxt`, `.svelte-kit`, `.astro`, `.cache`, `.parcel-cache`,
   `storybook-static`. The plan recommended declining under P7 (no triggering need). **The human
   chose "Add all six"**, overriding that recommendation — the triggering need is accepted as the
   same one the measurement proved, generalized: `.nuxt`/`.svelte-kit`/`.astro` are the caches of
   SSR frameworks pharn *already* recognizes in `SSR_FRAMEWORKS`, and the remaining three are
   generic build/tool output. Recorded per name: `.nuxt` YES, `.svelte-kit` YES, `.astro` YES,
   `.cache` YES, `.parcel-cache` YES, `storybook-static` YES. Honest scope (P7): the six are
   **canonical, not measured** — only `.next` carries a live measurement. They inherit the same
   accepted failure direction as `out` (a lost signal, never a false one), and the neutrality +
   per-member pins cover them identically to every other member.
2. **Base drift** — the brief pins base `21db522`; live `main` is `4d24ad4`. **Resolved: proceed on
   live `main`** — no §0 claim is invalidated (verified above).
3. **Plan acceptance** — **approved as written** (with the zoo amendment recorded above).
