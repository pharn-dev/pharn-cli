# PLAN — init-dest-type-preflight (PHARN-16: init refuses a file/dir collision BEFORE its first write)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `installCapabilities`' destination pre-flight also checks TYPES: for every path the install
  manifest says `init` writes, an existing intermediate component that is not a directory, or an
  existing leaf that is not a regular file, is a collision. Any collision refuses the whole install with
  one `ManifestValidationError` naming the colliding paths (capped) — "Nothing was written" — instead of
  `cpSync` failing part-way and leaving ~300 files with no `pharn.config.json` and no records. The
  optional `features/README.md` keeps its documented skip-on-collision (a leaf that is not a regular file
  now skips too, instead of throwing).
- layer(s): the CLI itself (`src/lib/install-capabilities.ts`)
- constitution_refs: [P1, P2, P4, P5]

## Discovery — verified this run (P6)

Review repro (`repro/init-dir-collision`): a directory at `.claude/commands/pharn-spec.md/` makes
`init` abort mid-copy; the project keeps 296 new files, no config, no records. The pre-flight
(`assertDestinationsInProject`, `install-capabilities.ts`) walks the same manifest set with
`findSymlinkComponent` only and deliberately leaves ENOTDIR "to the copy". `features/README.md` is
already skip-on-collision via `destAcceptsWrite` (tests at `install-capabilities.test.ts:396-427`).

## Files

- `src/lib/install-capabilities.ts` — type walk in the destination pre-flight (after the symlink check,
  so a symlink is still reported as a symlink); features rel excluded; `destAcceptsWrite` also refuses a
  non-regular-file leaf — layer CLI/lib
- `src/lib/symlink-guard.ts` — `findTypeCollision` lives beside `findSymlinkComponent` (the repo pins every
  path-component walk to this one module — `tests/symlink-guard.test.ts`; amendment approved) — layer CLI/lib
- `tests/install-capabilities.test.ts` — directory at a file target → throws naming it, ZERO files
  written; regular file at a directory component → same; a re-install over existing regular files still
  succeeds; directory at `features/README.md` → skipped, install completes
- `docs/troubleshooting.md` — the new refusal and how to fix it (P4)

## Contracts satisfied

- "no partial installs" (CLAUDE.md, `installCapabilityDirs` pre-flight) — now also for destination types.

## Evals to write (P1)

- listed above; the collision cases leave files behind on the base source.

## Guarantee audit (P0)

- "init never starts writing into a tree whose types it cannot write" → floor: `lstat` of every
  manifest path component before the first write.

## Trust audit (P2)

- Only `lstat` on project paths already `safeJoin`-contained; nothing read or executed.

## Determinism audit (P5)

- Sorted, capped list of colliding paths.

## Open questions (HALT)

- none
