# REVIEW — core-155-v0-22-0-removals

Four advisory lenses (correctness, contracts/invariants, test integrity, docs/P4). Severities are
advisory; none is a floor gate.

## Correctness

- **[advisory] `detectLayout`'s refusal is defensive.** After the rebase onto #404 a flat tree ships no
  `pharn-install.json` and is refused by the fetch first (an `UpstreamManifestError`, shown with the
  `PHARN_DEBUG` hint like every fetch-boundary refusal); `detectLayout`'s own message is reached only by
  a tree that has a manifest but no marker, which `checkLayout` already refuses. Kept as the one
  layout probe; covered by `tests/layout.test.ts`.
- **[advisory] A dropped capability's old flat directory is left untracked after a re-run init.**
  `init` plans removals at `pharn/` paths only, and `findOrphans` prunes a dropped capability's
  records. Never a lost file; the refusal message tells the user to delete the old top-level copies.

## Contracts and invariants

- Records are the proof: the change only removes delete paths (the root-doc unlink, the flat-path
  removals). No new write or delete path.
- `--json` `schemaVersion` 1: `plan.abandonedLayout` and `plan.rootMigration` are constant `null`,
  `status.layout` constant `pharn`; the 0.10.0 byte-pin test now restores `"abandonedLayout": "flat"`
  before hashing, like the CORE-188 `conversion` constant.
- **[advisory] Legacy root paths stay in the install-root bound** (`LEGACY_ROOT` in
  `install-surfaces.ts`, the flat constants in `constants.ts`) so old records surface as orphans. It
  classifies records only; whether it is a shim that needs a removal version is a maintainer call.
- **[advisory] Dead lint rule.** `rootMigrationRename` in `eslint.config.mjs` targets the deleted
  `src/lib/root-migration.ts`; it is kept because removing it would drop a `tests/lint-rules.test.ts`
  table row. Follow-up with a reviewer sign-off.
- **[advisory] `layoutPaths(layout)` keeps a single-value parameter** (`Layout` is `'pharn'` only);
  dropping it touches every caller, so it is left for a follow-up.

## Test integrity

- No test file or title removed; titles that now describe v0.20.0 behaviour are kept, each body
  opening with a `// v0.21.0:` comment saying what it asserts. Three `it.each` tables dropped their
  flat rows (templates unchanged).

## Docs (P4)

- User docs, the support policy, the shim table, CHANGELOG `[Unreleased]` (### Removed, 0.20.x named)
  and CLAUDE.md's module map follow the code. Of the protected docs, only LIMITS.md §1d names removed
  code (`configLayout`); it is human-owned and hook-protected, so a patch script for the maintainer to
  run is handed over instead of an edit.
- Rebased onto #404 (merged mid-run): its removals of `resolveTrustedDocs`/`PHARN_ROOT_FALLBACK_DOCS`
  stand; this change only adds the flat layout and the root-footprint migration on top.
