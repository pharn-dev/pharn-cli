# PLAN — installer layout-aware (mirror pharn/ OR flat), all surfaces

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Make the CLI **mirror whichever layout the fetched pharn-oss clone has** — the new `pharn/` single-install layout (pharn-oss PR #86 / `pharn-runtime-layout`) OR the current flat layout — across ALL archetype surfaces (install, status/drift, remove), via one deterministic layout resolver, recording the installed layout in `pharn.config.json`. Scope: all-at-once (write + read side) per GATE-1 decision; clone ref stays `main`.
- layer(s): pharn product source — `src/lib/` (resolver, constants, types, capability-index, install-capabilities, diff, pharn-config) + `src/steps/` (install-archetype) + `src/commands/` (status, remove). ARCHITECTURE.md §4.
- constitution_refs: [P7, P5, P2, P1, P3]

## Files

- `src/lib/layout.ts` — layer lib. NEW. `detectLayout(rootDir): 'pharn' | 'flat'` = a deterministic membership test (a `pharn/` marker dir exists in `rootDir` → `pharn`; else → `flat`, the safe legacy default). `layoutPaths(layout): LayoutPaths` = the pure path set (`grillers`, `lenses`, `contracts`, `floor`, `docs[]`) used as BOTH source-relative-to-clone and dest-relative-to-project (the mirror). One axis: resolve the install layout.
- `src/lib/constants.ts` — layer lib. Add the `pharn/` path set (`PHARN_GRILLERS_DIR` = `pharn/pharn-pipeline/grillers`, `PHARN_LENSES_DIR` = `pharn/pharn-review`, `PHARN_CONTRACTS_DIR` = `pharn/pharn-contracts`, `PHARN_FLOOR_DIR` = `pharn/floor`, `PHARN_TRUSTED_DOCS` = [`pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`]) beside the existing flat constants (flat values unchanged — the legacy branch). `.claude/*` constants unchanged (identical both layouts).
- `src/lib/capability-index.ts` — layer lib. Build `SUBTREES` from `layoutPaths(detectLayout(repoDir))` so a `pharn/` clone enumerates capabilities. All untrusted-frontmatter validation preserved (P2).
- `src/lib/install-capabilities.ts` — layer lib. Drive every copy from `layoutPaths(detectLayout(repoDir))`: grillers/lenses/contracts/floor/docs mirrored clone→project at identical relative paths; in `pharn` the docs set is `pharn/CONSTITUTION.md` + `pharn/ARCHITECTURE.md` only (THREAT-MODEL/LIMITS are not under `pharn/` → dropped, matching PR #86). Preserve ALL hardening: symlink-reject, `safeJoin`, test-file exclusion, settings-preserve. Return the detected layout to the caller.
- `src/lib/diff.ts` — layer lib. `diffInstalledCapabilities` takes the project's `layout` and derives the expected set via `layoutPaths(layout)` (capability subtree + contracts + floor + docs), for both clone-source and project-dest (same relative path). The module-path `diffInstalled` is untouched (modules install into `.claude/`, layout-invariant). Cross-layout clone (project layout ≠ @main layout) degrades via the existing "source missing at @main → skip" path — a named, pre-existing bound.
- `src/lib/pharn-config.ts` — layer lib. Read/write/validate the additive optional `layout?: 'pharn' | 'flat'` field (schema stays additive — legacy configs omit it and still load; a missing value means `flat`, P7).
- `src/types.ts` — layer lib. Add `layout?: 'pharn' | 'flat'` to the `PharnConfig` interface.
- `src/steps/install-archetype.ts` — layer steps. Record the detected layout (returned by `installCapabilities`) into `pharn.config.json`.
- `src/commands/status.ts` — layer command. Pass `config.layout ?? 'flat'` to `diffInstalledCapabilities`.
- `src/commands/remove.ts` — layer command. `removeCapability` derives the capability subtree from `layoutPaths(config.layout ?? 'flat')` (the only layout-sensitive removal path; `removeModule` is layout-invariant).
- `tests/layout.test.ts` — layer test. NEW. Detection (pharn marker → pharn; none → flat) + `layoutPaths` sets for both.
- `tests/install-capabilities.test.ts` — layer test. Add a `pharn/`-nested fixture: assert mirror under `pharn/…`, THREAT-MODEL/LIMITS dropped, `.claude/` unchanged; the existing flat fixture still installs flat (P7 guard).
- `tests/capability-index.test.ts` — layer test. A `pharn/` fixture enumerates capabilities identically to flat.
- `tests/diff.test.ts` — layer test. `diffInstalledCapabilities` with `layout: 'pharn'` compares the `pharn/` paths.
- `tests/status.test.ts` — layer test. An archetype config with `layout: 'pharn'` drives the pharn-path drift check.
- `tests/remove.test.ts` — layer test. Removing a capability from a `pharn`-layout config deletes the `pharn/…` dir.
- `tests/pharn-config.test.ts` — layer test. `layout` round-trips; a legacy config WITHOUT it still loads (P7).

## Contracts satisfied

- None new — CLI product code, not a `pharn-contracts` schema. It **upholds** the ownership boundary (P3, cited): pharn-oss owns the layout; the CLI mirrors it structurally, never rewriting copied file contents.

## Evals to write (P1)

- Resolver → pharn-marker fixture → pharn set + `isPharn`; no marker → flat set (deterministic else).
- install-capabilities → pharn fixture → mirrored under `pharn/`, THREAT-MODEL/LIMITS absent, `.claude/` intact; flat fixture → unchanged (P7 guard).
- capability-index → pharn fixture → capabilities enumerated identically.
- diff/status → `layout:'pharn'` → expected set on the `pharn/` paths.
- remove → `layout:'pharn'` capability → deletes `pharn/pharn-review|pharn-pipeline/grillers/<name>`.
- pharn-config → `layout` round-trips; legacy config lacking it loads (P7).

## Guarantee audit (P0)

- "installs/status/remove mirror the clone-or-project layout" → **floor**: deterministic detection (membership on a `pharn/` marker) + `layoutPaths` pure map + vitest over both layouts across install/status/remove. Not advisory.
- "old flat pinned SHAs keep working (P7)" → **floor**: the resolver's else-branch IS the current flat behavior; a flat fixture installs/diffs/removes byte-identically (regression tests), and a legacy config (no `layout`) loads and resolves to flat.
- "nothing escapes `safeJoin`; symlinks rejected" → **floor**: existing `safeJoin`/`isSymlink` guards preserved on every copy and delete; re-asserted by the pharn-fixture tests.
- "`layout` config field is additive" → **floor**: a test loads a legacy config without it (P7).
- No new safety/trust guarantee over copied CONTENT is introduced — contents stay mirrored verbatim, never executed.

## Trust audit (P2)

- Input: the fetched pharn-oss clone (untrusted). Layout detection reads only **path existence** (a membership test), never file content — no untrusted bytes drive the branch. Every copy/delete stays `safeJoin`- + symlink-guarded; capability names stay validated against `CAPABILITY_NAME_RE` before any path-join. The project's `layout` field is read from the CLI-owned `pharn.config.json` (validated to the `{pharn,flat}` enum, defaulting flat), not from untrusted remote content. No new taint surface; no guaranteed decision rests on a tainted field.

## Determinism audit (P5)

- Every layout branch is a membership test: a `pharn/` marker exists → `pharn`; else → `flat` (safe legacy default, deterministic else). The config `layout` is enum-validated `{pharn, flat}`, missing → flat. No LLM, no classifier, no guess.

## Open questions (HALT)

- None — resolved at GATE 1: all-at-once (read-side included), clone ref stays `main`, mirror PR #86's current subtree paths (accepted caveat: if #86 renames a subtree before merge, the `pharn/` path set needs a small follow-up; the flat branch is unaffected).
