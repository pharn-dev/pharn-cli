# PLAN — core-158-root-migration-hint (Linear CORE-158, C1.1)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the root migration stops moving the user's data. A root `memory-bank/` or `pharn.spec-template.md` is never renamed by `update` (any flags) or a re-run `init`; the `ROOT MIGRATION` note prints a hint instead (`git mv …`, or "merge by hand" when the `pharn/` copy exists). The move machinery, the move-backup plumbing, the exit-1 conflict path and the user-data half of `pendingRootMigration` are removed. The root-doc deletions (record-proved) are unchanged.
- base: origin/main @ 991b229 (0.19.0 released + CodeRabbit chore). Worktree branch; delivery branch `przemek/core-158-c11-root-migration-leaves-an-unproven`. Ticket line numbers were at b14cf22; re-located below.
- layer(s): CLI source (`src/lib/*`, `src/commands/update.ts`, `src/steps/install-archetype.ts`), tests, docs (`docs/commands/update.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`).
- constitution_refs: [P0, P1, P4, P5, P6, P7]

## Why (discovery)

- `src/lib/root-migration.ts` `USER_DATA_MOVES` + `planMoves`: the only proof a path is PHARN's is its type. `memory-bank/` is also Cline's Memory Bank directory. A first `init` leaves it (`initRootMigration` → null), the next same-version `update` re-opens just to move it (`pendingRootMigration` user-data loop; `update.ts:381-389`), `--yes` moves it unasked, and a `pharn/memory-bank/` that already exists (`/pharn-memory-promote` writes there) is a `conflict` → every planned run exits 1 (`rootMigrationFailed`).
- `THREAT-MODEL.md` / `LIMITS.md` do not mention the moves (grep): no protected-file patch needed.
- `.agents/skills/pharn-cli/` describes the moves too (SKILL.md "Root layout migration", references/json.md `moves[]`, references/commands.md). It is vendored from pharn-dev/skills ("updated pharn-dev/skills", #336/#337), so it is NOT edited here (it would diverge from its source). → named as a follow-up at GATE 2.

## Files

- `src/lib/root-migration.ts` — layer CLI lib:
  - DELETE `RootMoveAction`, `RootMove`, `RootMigrationPlan`, `USER_DATA_MOVES`'s move semantics, `planMoves`, `regularFilesUnder`, `RootMoveFailure`, `applyRootMoves`, `moveBlocks`, `rootMigrationFailed`; drop `renameSync` from imports.
  - `RootMigration` = `{ docs, userData: RootUserDataHint[], scratchNotice, gitignoreHints }` where `RootUserDataHint = { from, to, destination: 'free' | 'exists' }` (dir paths end in `/`), listing ONLY sources that exist at the root (`lstat`, any type; a throwing lstat → not listed). `destination` = `lstat(pharn/<to>)` finds an entry → `exists`; a throwing lstat (e.g. ENOTDIR) → `exists` too (the conservative answer: never print a command that nests or fails).
  - `planRootMigration` returns `RootMigration | null` (no `.backups`); same null rule as today (`hintsApply` = clone SKILLS major ≥ 7; `!hintsApply && docs.length === 0` → null).
  - Rename `ROOT_MOVES_FROM_MAJOR` → `ROOT_MIGRATION_FROM_MAJOR` (it gates the hints, both notices and the re-open's doc half; nothing imports it outside this file).
  - `pendingRootMigration`: delete the user-data loop (fact 2) and its doc-comment half; the root-doc half stays byte-identical.
  - `RootMigrationResult` = `{ deleted, kept }`.
  - `rootMigrationNoteLines`: the docs lines unchanged; the moves block replaced by the hint lines (same text in preview and result):
    - free: `memory-bank/ is at the project root; PHARN 7 reads pharn/memory-bank/. pharn does not move it. If it is PHARN's, move it: git mv memory-bank pharn/memory-bank (or mv, if git does not track it).`
    - exists: `memory-bank/ is at the project root, and pharn/memory-bank/ already exists; PHARN 7 reads pharn/memory-bank/. pharn does not move or merge them. If the root copy is PHARN's, merge it into pharn/memory-bank/ by hand, then delete memory-bank/.`
    - the template the same with `pharn.spec-template.md` / `pharn/spec-template.md` (no trailing `/`).
  - Module header: the `moves` bucket becomes `hints` (user data is never moved; why: type is no proof of ownership).
- `src/lib/update-plan.ts` — drop `rootMoveBackups` from `UpdatePlanReport` and `UpdateApplyInputs` (+ the two assignments); `planRootMigration(...)` now returns the report directly (`rootMigration` instead of `rootMigration?.report`). The held-unit comment says it deletes paths the old floor reads (no "moves").
- `src/lib/init-plan.ts` — `initRootMigration` returns `RootMigration | null`; the dry run's `backups` drops `rootMigration?.backups`; doc comments updated (first install: "never hints at the user's data").
- `src/lib/update-render.ts` — `PLAN` backup union drops `r.rootMoveBackups`; `migrates` counts only doc deletes; `RootMigrationResult` type follows.
- `src/lib/update-report.ts` — the JSON type's `moves` becomes the literal empty-tuple type `[]` with a comment (kept for `schemaVersion` 1, always empty since CORE-158); the projection emits `moves: []`; `backups` = `[...new Set(p.backups)]` → `[...p.backups]` (the union with move backups goes; keep de-dup semantics identical: `p.backups` is already unique — verify at build, else keep `new Set`).
- `src/lib/backup.ts` — `backupAction(overwrites, removals)`; `BackupAction` back to `'overwriting' | 'removing' | 'overwriting and removing'`; comment updated.
- `src/commands/update.ts` — drop imports `applyRootMoves`, `rootMigrationFailed`; the re-open comment (`:380-385`) names the doc half only; delete the exit-1 block after `reportOutcome`; `membershipKeys` drops the `move …` keys; `applyPlannedUpdate` drops `apply.rootMoveBackups` from the backup union and `backupAction`'s third argument, drops the `applyRootMoves` call; `rootMigrationResult` = `docResult`.
- `src/commands/init.ts` — (found at build) the interactive re-run prints the preview note from `initRootMigration(...)`, which now returns the report itself: `migration.report` → `migration`.
- `src/steps/install-archetype.ts` — drop `applyRootMoves`, `rootMigrationFailed`, `moveBackups`; `backupAction` two args; the final note uses `docResult`; comment updated (no exit 1).
- `tests/root-migration.test.ts` — DELETE the "user-data moves" describe (moves, conflict, symlink, unreadable, re-check-under-lock cases), the `moveBlocks` case and the user-data `pendingRootMigration` case; KEEP every docs, `deleteRootDocs`, scratch/gitignore and doc-half `pendingRootMigration` case. ADD: hint planning (absent → none; present + destination free → `free`; destination exists → `exists`; a symlinked/file-typed source still listed; below 7 → no hints); note wording (git mv line present for `free`, "merge … by hand" and NO `git mv` for `exists`; identical in preview and result); `pendingRootMigration` → null for a root `memory-bank/` alone.
- `tests/commands-integration.test.ts` — rewrite "previews, then retires…" (`:803`): JSON `moves: []`, `plan.backups` has no user-data files, notes contain the `git mv memory-bank pharn/memory-bank` hint and no `WOULD MOVE`; after `update --yes`, `memory-bank/` and `pharn.spec-template.md` are still at the root, unchanged, no `pharn/memory-bank`, no backup dir holding them; `rootEntries()` includes them; `status --strict` still clean; next update still the same-version return (no codeload fetch). Rewrite "keeps an edited root doc… exits 1" (`:942`): both copies present → exit code undefined (0), nothing moved or merged, template NOT moved either, the hint says merge by hand and prints no `git mv memory-bank`. Rewrite "re-opens … for user data" (`:1018`): a root `memory-bank/` on a 7.x install does NOT re-open (no codeload fetch, records byte-identical, folder untouched). ADD: `update --force` → not moved; a re-run `init` over a 7.x pharn install with root `memory-bank/` (`init --yes` always refuses a re-install, so: the text `init --dry-run` prints the hint, and a real re-run with the TTY stubbed and the two prompts answered by the mock for that one case) → not moved, hint printed; a first `init` with root `memory-bank/` → no ROOT MIGRATION note.
- `tests/update-plan.test.ts` — 'holds the root migration with the unit': drop the `rootMoveBackups` assertions; the unheld half asserts `rootMigration?.userData` contains `{from:'memory-bank/', …, destination:'free'}` (the null-while-held assertion stays).
- `tests/update-render.test.ts` — drop `rootMoveBackups` from the fixture.
- `tests/update-report.test.ts` — drop `rootMoveBackups` from the fixture; add one case: a non-null `rootMigration` projects `moves: []` and no hint key.
- `tests/backup.test.ts` — `backupAction` table drops the four `moving` rows (2-arg signature).
- `docs/commands/update.md` — "The root-footprint migration": the user-data bullet becomes the hint (never moved; `git mv` / `mv` / merge by hand); the "refuses with exit 1 if what it would delete or move" sentence → "delete"; the re-open paragraph drops the user-data trigger; the `plan.rootMigration` row (`:228`) says `moves` is always `[]` since this release (kept for `schemaVersion` 1; the hint is text-only) and drops the backups sentence; `:485` (held unit) "moves and deletes" → "deletes".
- `README.md` — `:183-189`: the docs are deleted; `memory-bank/` and the template are left where they are with a hint.
- `CLAUDE.md` — the `lib/root-migration.ts` paragraph (and the `backupAction`-free mentions if any): hints instead of moves, no `rootMoveBackups`, no exit 1, `membershipKeys` deletes only, `pendingRootMigration` doc half only, `plan.rootMigration.moves` always `[]`.
- `CHANGELOG.md` — `## [Unreleased]` → `### Changed`: bold claim + behaviour + JSON note. No version bump.

## Contracts satisfied

- CLAUDE.md "`update --dry-run --json`" additive rule: `plan.rootMigration` stays present with the same four keys; `moves` stays an array (always empty). No key removed or renamed; `schemaVersion` stays 1.
- CLAUDE.md held-unit contract: `rootMigration: null` while held — unchanged.
- CLAUDE.md "Update deletes exactly one thing…" + root-doc deletions: unchanged (deleteRootDocs untouched).
- `.dev/memory-bank` lessons: tests first (P1).

## Evals to write (P1) — the NEW/rewritten ones fail before the code change

- integration: after `update --yes` against 7.0.0, `memory-bank/lessons-learned.md` and `pharn.spec-template.md` still at the root (FAILS today: moved).
- integration: both `memory-bank/` and `pharn/memory-bank/` → `process.exitCode` undefined (FAILS today: 1); note contains "merge" + "by hand", not `git mv memory-bank`.
- integration: `update --force` → not moved (FAILS today).
- integration: re-run `init --yes` on a 7.x pharn install → not moved, hint printed (FAILS today: moved).
- integration: a root `memory-bank/` alone on a 7.x install → no re-open, no fetch (FAILS today: re-opens and moves).
- integration: first `init` with a root `memory-bank/` → no ROOT MIGRATION note (passes today; pins AC).
- integration: JSON `plan.rootMigration.moves` === `[]` and `plan.backups` has no user-data files (FAILS today).
- unit (root-migration): hint planning + wording cases above (FAIL today: no `userData` field / no hint text).
- unit: root docs still deleted / kept exactly as today (unchanged, green).

## Guarantee audit (P0)

- "A root `memory-bank/` / `pharn.spec-template.md` is never renamed by pharn" → floor: no code path calls `renameSync` on them after the change (the only `renameSync` in root-migration.ts is deleted; grep at build: `git grep renameSync src/lib/root-migration.ts` empty) + integration tests for `update`, `--yes`, `--force`, re-run `init`.
- "The hint never prints a nesting `git mv`" → floor: membership branch on `destination` (`free` → `git mv`; `exists` → merge text), lstat-derived; pinned by unit + integration tests. Throw → `exists` (fail toward no command).
- "Whether the root copy is PHARN's" → advisory: the hint says "If it is PHARN's"; pharn makes no claim.
- "`moves` is always `[]`" → floor: literal in the projection, typed `[]`.
- "Root docs deleted exactly as before" → floor: unchanged code + unchanged tests.

## Trust audit (P2)

- No new untrusted input. The hint prints fixed literals only (paths are constants, never read from disk text).

## Determinism audit (P5)

- `lstat` presence → hint or not; `lstat(dest)` presence/throw → `free`/`exists`. Membership tests, no guess.

## Open questions (HALT)

- none. GATE 1: approved (2026-11-16).

## Resolved questions

1. Tracked vs untracked → one hint line naming both commands (`git mv … (or mv, if git does not track it)`), no git read (pharn never runs git).
2. `.agents/skills/pharn-cli/*` → left untouched (pinned by skills-lock.json, owned by pharn-dev/skills); the stale lines are listed in the final report for a follow-up.
3. Also accepted: the hint in both the pre-confirm and the post-run note; the `isTTY` + prompt-mock stub for the one real re-run `init` case; `new Set` de-dup kept unless proven redundant.
