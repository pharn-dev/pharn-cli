# PLAN — archetype file-tree scan (package.json ∪ file-tree signals)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — sha256 of ARCHITECTURE.md this run
- increment: Extend archetype detection to also walk the project file tree once (bounded, names-only), collect structural signals, and merge them with the package.json signals — applying the archetype rule once over the union.
- layer(s): `src/lib/` (consumer-side infra for the capability resolver — ARCHITECTURE.md §5; the frameworkless `lib` base — §4)
- constitution_refs: [P0, P2, P3, P5, P6, P7]

## Context — why this scope (discovery, P6)

Discovery this run read the live target and the four trusted docs. Findings that shaped the plan:

- The pure detector `detectArchetypes(pkg)` (`src/lib/archetype.ts`) is **package.json-names-only**; the I/O
  boundary `detectArchetypesFromProject(cwd)` (`src/lib/detect-archetype.ts`) reads only `package.json`.
- The enum is `Archetype = 'ssr' | 'backend' | 'spa' | 'lib'` (`src/types.ts:188`; ARCHITECTURE.md §5:179).
  There is **no** `frontend`/`db`/`nextjs` member. The description's signal NAMES must map onto this enum.
- **Blast radius is small:** `detectArchetypes` / `detectArchetypesFromProject` have **no product caller yet**
  (grep: only their own tests). `resolveCapabilities` consumes an `Archetype[]` but never calls detection.
- **A doc/decision tension (surfaced at the discovery halt).** ARCHITECTURE.md §5 and the `types.ts:184`
  comment both scope detection to "membership over `package.json`," and the **immediately-prior increment
  (#20, `archetype-io-boundary`) deliberately DROPPED file-tree signals** to stay spec-aligned. This
  increment **reverses** that. §5 is trusted + hook-protected (agent cannot edit it).

**Three decisions the human resolved at the discovery halt (this run):**

1. **Proceed — scan the file tree too.** Detection broadens to file-tree NAME signals (still a
   deterministic membership test, P5-clean), merged with package.json. §5's "package.json" wording is a
   **human-owned doc-reconciliation** (see Open questions); this plan records the reversal of #20 explicitly.
2. **Drop `.sql` / `migrations/`** (P7 — smallest coherent increment). That signal maps to no existing
   archetype; adding a `db` archetype is cross-cutting (fix #5: the archetype set drives four maps
   `validate` checks agree). Revisit `db` as its own increment when a real need triggers it.
3. **SSR-gate the `.tsx`/`.jsx` signal.** Merge **signals** (booleans), then apply `spa = clientUI && !ssr`
   **once** over the union — NOT a union of independently-computed archetype sets. So a Next app carrying
   `.tsx` files stays `ssr`, never `ssr`+`spa`. Consistent with today's package.json suppression rule.

## Design — merge SIGNALS, not sets (the correctness pivot)

The three-boolean signal `{ ssr, backend, clientUi }` is the merge pivot. Both sources compute booleans;
they are OR-merged; the archetype rule is applied once. This is what makes decision #3 correct: a naive
`pkgArchetypes ∪ fileArchetypes` could yield `{ssr, spa}` where the merged-signals answer is `{ssr}`.

Signal → archetype mapping (the enum has no `db`/`frontend`, so names map onto members):

- `.tsx` / `.jsx` file anywhere → `clientUi` signal → contributes `spa` **iff no `ssr`** (decision #3).
- `next.config.*` file → `ssr` signal → `ssr`.
- a directory named `api` (covers top-level `api/` and `pages/api`), **or** a `route.{ts,tsx,js,mjs}` file
  (App-Router route handlers, `app/**/route.ts`) → `backend` signal → `backend`.
- `.sql` / `migrations/` → **not scanned** (decision #2).

## Files

- `src/lib/archetype.ts` — **MODIFY (pure).** Add the signal pivot without changing any existing behavior:
  `interface ArchetypeSignals { ssr; backend; clientUi }`; `packageSignals(pkg): ArchetypeSignals` (extract
  today's three membership checks); `archetypesFromSignals(sig): Archetype[]` (extract today's rule —
  `spa = clientUi && !ssr`, `lib` default, `ARCHETYPE_ORDER`); `mergeSignals(a, b)` (field-wise OR).
  `detectArchetypes(pkg)` becomes `archetypesFromSignals(packageSignals(pkg))` — **byte-identical output**
  (existing `archetype.test.ts` stays green). — layer `src/lib/` (pure membership rules).
- `src/lib/detect-archetype.ts` — **MODIFY (I/O boundary).** Add the file-tree reading strategy + merge:
  local pure `classifyEntry(name, isDir): ArchetypeSignals` (the file-name patterns above);
  `scanFileTreeSignals(cwd): ArchetypeSignals` — a **bounded, symlink-safe, deterministic** walk (below);
  `detectArchetypesFromProject(cwd)` merges `packageSignals(pkg)` with `scanFileTreeSignals(cwd)` and
  delegates to `archetypesFromSignals`. `packageJsonFound` keeps its exact current meaning (was a usable
  manifest read) — only `archetypes` becomes the merged set. — layer `src/lib/` (reading strategy).
- `src/types.ts` — **MODIFY (comment only, no type change).** The `Archetype` doc comment (≈184–188) says
  detection is "membership over package.json" — now inaccurate. Correct it to name file-tree signals and
  point at the detection module, with a one-line note that the ARCHITECTURE.md §5 wording reconciliation is
  human-owned. Keeps the code self-honest (P0/P6) without touching the hook-protected doc. — layer `src/`.
- `tests/detect-archetype.test.ts` — **MODIFY.** Add file-tree fixtures (the repo's deterministic-suite
  analog of evals, P1). — layer `tests/`.
- `tests/archetype.test.ts` — **MODIFY.** Add pure unit tests for the new `packageSignals` /
  `archetypesFromSignals` / `mergeSignals` (esp. the spa-gating rule and OR-merge). — layer `tests/`.

**The bounded walk (`scanFileTreeSignals`) — determinism + safety by construction:**

- **Skip** (never recurse / never classify): dir names `node_modules`, `.git`, `dist`, `build`; any name
  starting with `.env` (decision from the description). **Symlink-safe:** `readdirSync(dir,
  {withFileTypes:true})`, recurse only into real `dirent.isDirectory()` (a symlink-to-dir is `false` there)
  — so the walk **cannot escape `cwd` via a symlink** (cf. the repo's `hook-symlink-escape` concern).
- **Deterministic (P5):** signals are booleans → OR-merge is order-independent; per-directory entries are
  **sorted by name** before traversal, so even a cap-truncated walk visits the same set on any filesystem.
  Short-circuit once all three booleans are true. A per-entry `readdir`/`stat` error is narrowly caught and
  that subtree contributes no signal (a deterministic default, mirroring the existing malformed-`package.json`
  → `lib` handling — **not** a blanket swallow).
- **Bounded (advisory defensive caps, P7 — labeled, not sold as a hard guarantee):** a depth cap and a
  total-entry cap bound a pathological tree, in the spirit of the repo's 256KB/8s fetch caps.

## Contracts satisfied

- **N/A — no `pharn-contracts` reference.** `pharn-contracts` is a PHARN-*product* layer (ARCHITECTURE.md
  §4); this is a pharn-cli-internal `src/lib/` boundary and satisfies no product contract (as with #20).
- **Spec cited, not restated (P4):** ARCHITECTURE.md §5 (`archetype ∈ {ssr, backend, spa, lib}`, deterministic
  detection) and §4 (the frameworkless `lib` base). This increment **extends the detection INPUT surface**
  (adds file-tree signals) while preserving the enum and determinism; it does not restate the rule.

## Evals to write (P1)

Every new behavior is produced by ≥1 test (evals = this CLI's vitest suite). New cases:

- **`.tsx` present, NO `react` dep → `spa`** (frontend detected from files, not package.json) — the
  description's headline case.
- **Pure-backend tree** (`api/` dir, no `.tsx`) → `backend`, **never `spa`** — the required inverse.
- **`next.config.js` in tree, no `next` dep → `ssr`.**
- **`route.ts` under `app/` → `backend`; `api/` dir → `backend`.**
- **Merge SSR-gating (the key correctness case):** package.json `react` (→ would be `spa`) + file tree
  `next.config.js` (→ `ssr`) → merged **`['ssr']` only** — proves signals-merge-then-rule (decision #3),
  not union-of-sets.
- **Merge additive:** package.json `express` + file tree `.tsx` → `['backend','spa']`.
- **Bounded walk:** a `.tsx` under `node_modules/` is **skipped** → no `spa` (proves the skip-list).
- **`.sql`/`migrations/` present → contributes nothing** (decision #2, pinned so a future `db` change is a
  deliberate edit).
- **Determinism:** the same tree scanned twice → equal result.
- **Backward-compatible:** every existing `detect-archetype.test.ts` / `archetype.test.ts` case still passes
  (package.json-only fixtures have no file signals → unchanged).
- **Pure units:** `archetypesFromSignals({clientUi:true, ssr:true})` → `['ssr']` (gating);
  `mergeSignals` ORs field-wise.

## Guarantee audit (P0)

- **"Same tree → same `Archetype[]` (deterministic)."** → **FLOOR.** Reduces to: booleans (OR-merge is
  commutative + idempotent) + sorted traversal + fixed caps (deterministic even when truncated) + the pure
  `archetypesFromSignals` (membership + fixed `ARCHETYPE_ORDER`). Backstopped by the determinism tests and
  `npm run check` (typecheck + vitest) → `.dev/floor/validate.mjs` GREEN.
- **"Each specific signal → archetype mapping."** → **FLOOR** per mapping — each is pinned by a dedicated
  test (the enum output is a closed set; the test asserts exact membership).
- **"The mapping SET is the right/complete set of signals."** → **ADVISORY** (a design judgment, not floor-
  reducible) — labeled so; backstopped by review/grill, never sold as guaranteed.
- **"Reads NAMES only — never a discovered file's body, never executes, never sends."** → **ADVISORY.**
  Holds by construction (`readdirSync`/`Dirent` name+type only; the only `readFileSync` is the pre-existing
  `package.json` read; no `child_process`, no `fetch`). No dedicated hook asserts it, so per P0 it is
  **labeled advisory**, backstopped by the `.dev/floor/scan-code-*` lenses + review (as in #20).
- **"Bounded walk (depth/entry caps)."** → **ADVISORY defensive bound**, not a hard guarantee (a large tree
  within caps is still large) — labeled honestly (P7), in the spirit of the repo's fetch caps.

## Trust audit (P2)

- **Inputs:** `<cwd>/package.json` bytes (untrusted, pre-existing) **and** the project's file/dir **NAMES**
  from the walk (untrusted project input).
- **Taint propagation — contained at the boundary.** The walk reads only entry **names + `isDir`**, tests
  them for membership against fixed in-code patterns, and never reads a discovered file's body, executes,
  interpolates, forwards, or logs a name. Output is a closed `ArchetypeSignals` (3 booleans) → closed
  `Archetype[]` enum — **no untrusted free text escapes**. Untrusted names → membership test → enum output
  (P2-clean), the same shape as today's package.json boundary, extended to file names.
- **Worst case of a hostile name** (e.g. a file literally named `route.ts` in a non-backend project, or odd
  unicode): it can only **flip a boolean** → at most a mis-detected archetype (an *advisory* capability-
  selection input downstream), **never** injection, arbitrary read, or path escape. Symlink escape is
  prevented structurally (recurse only into real dirs).

## Determinism audit (P5)

- Every branch is a membership test: file-name/dir patterns, package-name membership, the boolean spa-gating
  rule. No LLM classification. The walk's traversal is sorted + skip-listed + capped → a deterministic
  visited set → deterministic booleans. The terminal fallback is a **deterministic default** ("no signal ⇒
  contributes nothing"; whole-project no-signal ⇒ `lib`, §4), never a guess and never a human question —
  appropriate because "no framework signal ⇒ frameworkless lib" is a defined spec rule, not an irreducible
  ambiguity.

## Open questions (HALT)

- **None blocking.** The three ambiguities were resolved by the human at the discovery halt: **Proceed —
  scan files too** · **Drop `.sql`/`migrations/`** · **SSR-gate the `.tsx` signal**.
- **Human-owned reconciliation (surfaced, NOT agent-edited — reported per P6):** ARCHITECTURE.md §5
  ("detected deterministically (membership over `package.json`)") and the intent recorded in
  `.dev/features/archetype-io-boundary/PLAN.md` ("Drop — stay spec-aligned") both predate this reversal.
  §5 is trusted + hook-protected — the agent cannot amend it; updating §5's wording (and, if desired, the
  #20 record) is the human's call. This plan builds the code + corrects the editable `types.ts` comment; it
  leaves §5 untouched. The build pins §5's current content-hash, so nothing here depends on §5 being edited
  first.
