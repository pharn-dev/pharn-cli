# PLAN — install pharn/pharn-core as a fixed product surface

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Make `pharn init` / `pharn update` copy the clone's `pharn/pharn-core/` directory
  into the user's project as a fixed product surface, exactly the way `pharn-contracts/` is
  copied — one layout path, one copy block, one manifest mirror entry, and the pin tests that
  keep writer and mirror in lockstep.
- layer(s): the CLI's install path — `lib/constants.ts` (source paths), `lib/layout.ts` (layout
  resolver), `lib/install-capabilities.ts` (the writer), `lib/install-manifest.ts` (the read-only
  mirror). The surface being installed is `pharn-core` (L0–L2, ARCHITECTURE.md §4 — "seam-resolver
  (the MECHANISM, agnostic)").
- constitution_refs: [P1, P2, P3, P4, P5, P7]

## Discovery (live state, read this run — P6)

Verified in `/Users/pgalarowicz/Projects/pharn-cli` (clean tree, HEAD `56fec66`) and the local
upstream checkout `/Users/pgalarowicz/Projects/pharn-oss`:

- Upstream ships `pharn/pharn-core/seam-resolver/seam-resolver.md` + `evals/{cases,expected}/`
  with **6 case/expected pairs** (13 files total). Frontmatter declares `role: skill`,
  `applies: ["universal"]`. Upstream `SKILLS_VERSION` is **2.8.0** (the finding said 2.7.0 — stale
  by one minor; immaterial to this increment).
- Upstream has **no** flat-layout root `pharn-core/` (confirmed: `ls -d pharn-core` → absent).
- The installed product command `/pharn-build` cites the resolver at
  `pharn-oss/.claude/commands/pharn-build.md:174`, `:212`, `:297` — a live dangling reference in
  every install.
- `src/lib/constants.ts:52-59` has no core constant; `installCapabilities`
  (`src/lib/install-capabilities.ts:113-187`) copies capabilities, commands, hooks, settings, docs,
  contracts, floor — and nothing else; `collectExpectedInstallPaths`
  (`src/lib/install-manifest.ts:122-124`) mirrors exactly that set.
- `PHARN_FLOOR_DIR` is `'pharn/floor'` (the finding's quoted `'pha/floor'` was a transcription
  truncation, not the code).
- `src/types.ts:91` reads "the runtime resolver that walks it is a later increment (a pharn-core
  capability)" — stale; upstream shipped it.

## Files

- `src/lib/constants.ts` — add `CORE_DIR = 'pharn-core'` + `PHARN_CORE_DIR = 'pharn/pharn-core'`
  with a comment naming the flat one as a today-no-op kept for `LayoutPaths` uniformity — layer:
  CLI source-path constants
- `src/lib/layout.ts` — add `core: string` to `LayoutPaths` and to both `layoutPaths` branches,
  doc comment matching the neighbours — layer: layout resolver
- `src/lib/install-capabilities.ts` — one whole-dir copy block for `paths.core`, mirroring the
  contracts block verbatim (`safeJoin` both ends, `existsSync` + `!isSymlink` root guard,
  `cpSync` recursive/force with the `noSymlinks` filter) — layer: the writer
- `src/lib/install-manifest.ts` — `addDir(paths.core);` beside the contracts/floor entries; extend
  the block comment's surface list — layer: the read-only mirror
- `src/types.ts` — reword the stale line 91 comment (the resolver ships and is installed) — layer:
  CLI types
- `tests/install-capabilities.test.ts` — extend `scaffoldRepoPharn` with the core dir; assert it
  lands; add a symlinked-`pharn-core`-root case and a flat-repo no-op case — layer: tests
- `tests/install-manifest.test.ts` — extend `scaffoldRepoPharn`; assert the key set; add a pharn
  variant of the update-writer mirror; add a symlinked-core-root manifest case — layer: tests
- `tests/layout.test.ts` — pin `core` in both `layoutPaths` branches — layer: tests
- `tests/update.test.ts` — a pharn-layout clone shipping `pharn/pharn-core/...` restores it into a
  project that lacks it (`missing → restore`, exit 0) — layer: tests
- `tests/diff.test.ts` — a deleted `pharn/pharn-core/**` file reports as `missing` (pins the status
  drift claim; added post-grill, GRILL.md P1) — layer: tests
- `tests/overwrite-check.test.ts` — extend its `scaffoldRepoPharn` only if the added surface
  changes an asserted conflict list — layer: tests
- `docs/getting-started.md` — add the `pharn/pharn-core/` row to the "What you get" table — layer:
  docs
- `docs/commands/init.md` — name the surface in the intro (`:11`), the write-target list (`:105`),
  and the copy-surfaces table row (`:112`) — layer: docs
- `docs/commands/update.md` — sweep its installed-surface prose (`:203`) — layer: docs
- `docs/commands/status.md` — name the surface in the compared-set list (`:64`) — layer: docs
- `README.md` — add the row to the mirror of the "What you get" table (`:72`) — layer: docs
- `CHANGELOG.md` — an `[Unreleased] / ### Added` entry for the new installed surface (added
  post-review, for the PR) — layer: docs

## Contracts satisfied

- `pharn-contracts/seam-config.md` — the `seam` block init already writes
  (`src/steps/install-archetype.ts:73`) is the **policy**; this increment installs the
  **mechanism** that policy points at, so the config, the floor validator
  (`check-seam-config.mjs`), and the resolver are all present in one install. Cited, not restated
  (P4).
- `ARCHITECTURE.md §4` — `pharn-core (req)` is a required layer holding "seam-resolver (the
  MECHANISM, agnostic)". This makes the CLI's install set match the declared layer tree.

## Evals to write (P1)

No new PHARN capability is authored here (this is CLI code), so the P1 obligation is discharged by
`vitest` tests, one per behaviour:

- pharn-layout install → `pharn/pharn-core/seam-resolver/seam-resolver.md` **and** a nested
  `evals/cases/*.md` land in the project
- flat-layout install with no root `pharn-core/` in the clone → nothing written, no throw (tolerant
  no-op)
- clone whose `pharn/pharn-core` root is a **symlink** → nothing materialized (writer), and the
  manifest enumerates no key under it (mirror)
- `layoutPaths('pharn').core === 'pharn/pharn-core'`; `layoutPaths('flat').core === 'pharn-core'`
- manifest ⟷ writer mirror (pharn layout) stays exactly equal with the new surface present
- manifest ⟷ update-writer mirror (pharn layout) writes exactly the manifest keys
- `update` against a pharn clone: project missing `pharn/pharn-core/**` → files classify
  `missing → restore`, written, exit 0

## Guarantee audit (P0)

- "the copied core dir cannot escape the project root" → **floor**: `safeJoin` on both the source
  and destination joins (`lib/validate.ts`), identical to contracts/floor.
- "a symlinked core root is never materialized" → **floor**: `existsSync(from) && !isSymlink(from)`
  guard at the copy root + the `noSymlinks` `cpSync` filter for nested entries (writer);
  `findSymlinkComponent` + `lstatSync(...).isDirectory()` in `addDir` (mirror).
- "the writer and the manifest mirror cannot silently drift" → **floor-adjacent, test-pinned**: the
  two mirror `describe`s in `tests/install-manifest.test.ts` compare the manifest key set against a
  **real** `installCapabilities` run and a real `applyWrites` run. This is a *test* guarantee (P1),
  not a runtime floor operation — labelled as such, not sold as a runtime invariant.
- "the resolver the installed `/pharn-build` cites now exists in the install" → **advisory** for
  any given clone: the CLI copies whatever `pharn/pharn-core` the clone ships and does not verify
  the referenced *file* exists (it never parses the copied commands). The floor part is only
  "whatever is at that path in the clone is mirrored to that path in the project". A clone that
  ships no core dir still installs cleanly — stated, not hidden.
- "file contents are copied verbatim, never executed or parsed" → **floor**: no reader touches the
  bytes; `role: skill` is deliberately never fed to `ROLE_VALUES` (`lib/validate.ts:26`), because
  `parseCapabilityIndex` is not extended (out of scope).
- "flat installs are unaffected" → **split** (relabelled post-grill, GRILL.md P0): the *branch* is
  **floor** — `existsSync` on `paths.core` decides it, else a no-op. The *outcome* "flat is
  unaffected" is **advisory, contingent on upstream** — it holds because no flat clone ships a root
  `pharn-core/` (verified this run), not because the CLI enforces it. If upstream ever adds one,
  flat installs copy it, which is the correct behaviour but not what "unaffected" promises. P7: old
  pinned flat SHAs keep mirroring exactly what they mirrored before.
- "a symlinked core root is never materialized" → **floor, at leaf depth only** (relabelled
  post-grill, GRILL.md P2). The writer's `isSymlink` lstats the FINAL component; the manifest's
  `findSymlinkComponent` walks every component. So a clone whose `pharn/` **ancestor** is a symlink
  is copied by the writer but skipped by the mirror. This asymmetry is **pre-existing** and affects
  `contracts`/`floor`/`docs` identically; this increment adds a fourth directory to it and does
  **not** fix it (that is a different axis of change, P3 — filed as a follow-up increment).

## Trust audit (P2)

- **Input:** `pharn/pharn-core/**` in the degit-cloned, **untrusted** pharn-oss tree.
- **Taint propagation:** the bytes are copied verbatim into the user's project and are read later
  by the user's Claude Code — the same posture as every other copied surface (capability dirs,
  contracts, commands). The CLI never parses, executes, or branches on them; nothing in this
  increment reads frontmatter. Containment is structural: `safeJoin` on both joins, the
  `isSymlink` root reject, and the `noSymlinks` nested filter — so a hostile clone can neither
  escape the destination root nor plant a symlink that a later tool follows.
- **Not widened:** dev-only exclusion stays STRUCTURAL. `pharn/pharn-core` is one *named* subtree
  added to a closed list; no generic `.dev/` scan and no repo-wide walk is introduced.

## Determinism audit (P5)

- The only new branch is `existsSync(coreFrom) && !isSymlink(coreFrom)` — a filesystem membership
  test, no classification, no LLM. Its else branch is a **no-op**, which is the correct and safe
  outcome for a clone that legitimately has no core dir (every flat clone). It cannot end in a
  guess.
- `layoutPaths` stays a pure enum switch; the new `core` field is resolved by the same
  `layout === 'pharn'` membership test as its neighbours.

## Consequences worth naming (not open questions)

- **Existing pharn-layout installs will start reporting drift.** Once `addDir(paths.core)` lands,
  `pharn status` lists `pharn/pharn-core/**` as **missing** for every already-installed pharn-layout
  project, and `pharn status --strict` exits **1** for them until they run `pharn update`. That is
  the intended effect of the finding (the gap becomes visible instead of silent). `update`
  classifies those files `missing → restore` and fixes it at exit 0 — **but only when the skills
  version actually differs.** Flat installs see no change.
- **`update` cannot repair this for a same-version install** (GRILL.md P1, blocking; verified at
  `src/commands/update.ts:134-138`). `update` early-returns `Already up to date` whenever
  `config.skillsVersion === latest && !force`, so a user who installed at upstream's current
  `SKILLS_VERSION` with the pre-fix CLI sees `status --strict` exit 1 while `update` writes nothing.
  Their route is `pharn update --force` (which backs up, then overwrites local edits) or a re-init.
  **Decision at GATE 1 follow-up: document the caveat, do not restructure `update`.** Making
  `update` skip its early-return when the manifest reports missing files is a change to `update`'s
  control flow that this plan promised not to make — filed as its own increment.

## Out of scope (explicitly not in this increment)

- Extending `ROLE_VALUES` / `parseCapabilityIndex` to a third subtree or `role: skill`, and any
  `pharn add` / `pharn remove` addressing of pharn-core (finding 3.2).
- The THREAT-MODEL/LIMITS installed-surface story (4.8) and `models`-block honesty (4.9).
- `add`'s dest-overwrite drift check (4.2) — `installCapabilityDirs` semantics are untouched.
- Any pharn-oss edit. Upstream coordination (pharn-core is now a CLI-installed surface, so
  relocating it is a breaking layout change on par with PR #86) is **reported here for a human**,
  not performed.

## Open questions (RESOLVED at GATE 1)

1. **Flat counterpart constant.** → **RESOLVED: uniform.** Add `CORE_DIR = 'pharn-core'` so
   `LayoutPaths.core` is a plain `string` in both branches, documented in `constants.ts` as a
   today-no-op kept for interface uniformity (no flat clone ships one). This avoids
   `string | undefined` narrowing at both consumer sites under `strict` +
   `noUncheckedIndexedAccess`, and the copy site is already tolerant of a missing source. P7 is
   satisfied by *labelling* the flat constant as a no-op rather than selling it as support for a
   layout upstream does not ship.
2. **Docs sweep width.** → **RESOLVED: full sweep.** Every doc that today enumerates the installed
   surfaces names the new one — `docs/getting-started.md`, `docs/commands/init.md` (`:11`, `:105`,
   `:112`), `docs/commands/status.md` (`:64`), `docs/commands/update.md` (`:203`), and `README.md`
   (`:72`) — so no user-facing list is left contradicting the code (P4).

**Plan approved by the human at GATE 1: "Approve as written".**
