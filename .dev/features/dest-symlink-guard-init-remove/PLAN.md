# PLAN — dest-symlink-guard-init-remove (PHARN-02: `init` / `remove` must not write or delete through a symlinked project directory)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: before any write, `init` walks every destination path it will write (the install manifest +
  `.claude/settings.json`) with `findSymlinkComponent` and refuses the whole install, naming the
  symlinked component; `remove` refuses (before any delete, for the whole selection) when a
  capability dir's path crosses a symlinked component — the same posture `update` and `add` already take.
- layer(s): the CLI itself (`src/lib/install-capabilities.ts`, `src/commands/remove.ts`)
- constitution_refs: [P0, P1, P2, P3, P5, P7]

## Discovery — verified this run (P6)

Base = `main` @ `2b74a74` (PHARN-01 merged, #195). Reproduced in the review (`repro/init-symlink`,
`repro/init-symlink2`, `repro/remove-symlink`):

- `.claude/commands -> ../../dotfiles/…` → `init` wrote 11 `pharn-*.md` outside the project, no prompt.
- `pharn -> ../team-shared/pharn` → `init` overwrote an external file and created 421 files outside.
- `pharn -> ../shared` → `pharn remove a11y` deleted `../shared/pharn-review/a11y` incl. a user file.

Live code: `installCapabilityDirs` (`cpSync` at `safeJoin(projectRoot, …)`), `copyFilteredDir`, the
docs/license/contracts/core/floor copies and `settings.json` all check only the SOURCE; only
`features/README.md` walks the destination (`destAcceptsWrite`). `deleteCapabilityDir` walks nothing.
`findSymlinkComponent` (`lib/symlink-guard.ts`) is the shared physical walk; `collectExpectedInstallPaths`
(`lib/install-manifest.ts`) enumerates every file `installCapabilities` writes except the user-owned
`.claude/settings.json`.

## Files

- `src/lib/install-capabilities.ts` — `installCapabilities` pre-flight: for every rel in
  `collectExpectedInstallPaths(...)` ∪ `{.claude/settings.json}`, `findSymlinkComponent(projectRoot, rel)`;
  any hit → throw `ManifestValidationError` naming the component(s) (sorted, capped) before the first
  write. ENOTDIR from the walk is not a symlink hit (left to the existing copy behaviour) — layer CLI/lib
- `src/commands/remove.ts` — before deleting (named path, and the picker for the WHOLE selection
  before the first delete), `findSymlinkComponent(cwd, capabilityRelDir(...))`; a hit → `logError`
  naming the component + exit 1, nothing deleted, config/records untouched — layer CLI/command
- `tests/install-capabilities.test.ts` — symlinked `.claude`, `.claude/commands`, `.claude/hooks`,
  `pharn`, `pharn/pharn-review`, capability leaf dir, `.claude/settings.json` → throw, external dir
  snapshot unchanged, project unchanged (no partial write)
- `tests/remove.test.ts` — symlinked `pharn` / `pharn/pharn-review` / capability dir → exit 1, external
  dir unchanged, config write skipped; picker with one unsafe pick → nothing deleted
- `README.md` — "Safety model": `init` and `remove` also refuse symlinked destination paths (P4)
- `CLAUDE.md` — `install-capabilities` / `remove` paragraphs: destination walk (P4)

## Contracts satisfied

- README "Safety model" / `SECURITY.md` path-traversal scope / `LIMITS.md` containment — now true for
  `init` and `remove`, not only `update`/`add`.
- CLAUDE.md "lexical/physical split": `safeJoin` contains the string, `findSymlinkComponent` refuses the
  path on disk — applied at the two remaining write/delete sites.

## Evals to write (P1)

- init pre-flight: each symlinked root above → `ManifestValidationError` naming that component; the
  link target dir byte-identical; nothing written under the project
- init with a regular (non-symlink) existing tree → unchanged behaviour (existing tests stay green)
- remove named: `pharn` symlink → exit 1, `../shared/pharn-review/a11y/NOTES.md` still present,
  `writePharnConfig` not called, records untouched
- remove picker: two picks, one crossing a symlink → exit 1 before ANY delete (the safe one survives too)
- remove of a normal capability → unchanged

## Guarantee audit (P0)

- "`init` writes nothing through a symlinked destination component" → floor: `findSymlinkComponent`
  over every manifest rel before the first write (lstat walk). Residual (advisory, named): a symlink
  created concurrently between pre-flight and copy (TOCTOU) is not covered — same residual as `update`.
- "`remove` deletes nothing through a symlinked component" → floor: same walk before `rmSync`.

## Trust audit (P2)

- The project tree is local, user-controlled state; the walk reads only `lstat` metadata and emits a path
  string (DATA) into the error message. No untrusted remote content drives a new branch.

## Determinism audit (P5)

- Branch = `findSymlinkComponent(...) !== null` (membership over lstat results); the terminal is a named
  hard-fail, never a silent skip.

## Open questions (HALT)

- none
