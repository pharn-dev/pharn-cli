# PLAN — remove-preserve-user-files: `pharn remove` backs up what it cannot prove is pharn's before deleting

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: Before `pharn remove` recursively deletes a capability directory, copy every regular file in it that is not provably pharn-written-and-unchanged (per a usable `pharn.records.json`) into `.pharn-backup/<ts>/` with the existing `createBackup`, announce the backup at creation, and refuse the removal (exit 1, nothing deleted) if the scan or the backup fails. Closes finding F-01 (High): user-authored or edited files inside a capability dir were deleted unrecoverably.
- layer(s): CLI command (`src/commands/remove.ts`) + one new shared lib leaf (`src/lib/removal-backup.ts`) + tests + user-facing docs. No `pharn-contracts` change. No trusted-doc edit by the agent (see Open question 1).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (read this run, P6)

- `src/commands/remove.ts:96-108` `deleteCapabilityDir` → `rmSync(dir, {recursive:true, force:true})`, no prompt, no backup. Called from `removeNamed` (:277, inside `withProjectLock` after `assertConfigUnchanged`) and the picker loop (:383, inside the lock, after the one confirm). `refuseSymlinkedTargets` (:119) already refuses, before the lock (and before the picker's confirm), any target whose dir path crosses a symlinked component — so the dir root itself is never a link when the delete runs (modulo the named race below).
- `pruneCapabilityRecords` (:174) reaches the store via `recordsBaseline(readRecords(cwd), {skillsVersion, commit})` → `records: FileRecords | null` (null = absent / invalid / stamped-for-another-state). Record keys are project-relative posix paths `${capabilityRelDir}/<rel>` — the same prefix the prune filters on.
- `src/lib/backup.ts` `createBackup(projectRoot, rels)`: refuses a symlinked `.pharn-backup`, per-component symlink check on each rel, throws on a vanished source, uniquifies the timestamp dir, returns `.pharn-backup/<ts>`. Throws rather than returning partial work; it may leave a partially-filled backup dir behind, never touches an original.
- `src/commands/add.ts:632-641` is the precedent: `createBackup(cwd, scan.drifted)` then `log.info(\`Backed up ${n} file(s) to ${backupDir} before overwriting.\`)` — announced AT CREATION. No shared notice helper exists; `add` inlines it.
- `src/lib/install-manifest.ts` `walkFiles` is private, skips symlinks, and yields any non-directory (a FIFO included) as a file — so it is not reusable for the DEST side (a FIFO handed to `copyFileSync`/`sha256File` blocks on open). A dest walk must keep only `isFile()` entries.
- `src/lib/hash.ts` `sha256File` — the hash the records were taken with (`buildRecords`).
- `runRemove` (:52) catches only `ProjectLockedError`; any other throw from inside the lock reaches `main().catch` → raw `console.error(err)` + exit 1. `withProjectLock` releases on throw.
- Docs that describe remove / backups (grep `pharn-backup`, `remove`): `docs/commands/remove.md` (Behavior steps 1-4, Concurrency "delete → prune → config"), `docs/commands/add.md:161-164` ("Files that are in the directory but not part of the capability upstream are never touched at all" — true for `add`, contradicted by `remove`), `docs/troubleshooting.md:106-113` ("`add` writes backups too"), `docs/roadmap.md:19` ("also written by `add`"), `docs/reference/pharn-records.md:50` (remove row), `README.md:~308` (Safety model: "`remove` deletes only the selected capability directory and prunes its records"), `CLAUDE.md` (`pharn remove` addressing paragraph), `CHANGELOG.md` `[Unreleased]` (empty).
- `LIMITS.md:82-83` names the residual ("`remove`'s delete takes the **whole directory** at that address, including files you added inside it"). `LIMITS.md` is a trusted doc: `CONSTITUTION.md` (editable_by human only; P2 "write-protected at the floor") + `.claude/hooks/protect-trusted-paths.cjs`. See Open question 1.
- Tests: `tests/remove.test.ts` (875 lines; clack mocked incl. `log.info`; pharn-config mocked; records run for real; existing tests write capability files WITHOUT a store → after this change they will produce a backup — assertions there are about deletion/config/records, so they should keep passing; re-checked at build). `tests/project-lock-commands.test.ts` and `tests/index.test.ts` import `runRemove`; checked at build for any whole-tree assertion a new `.pharn-backup/` would break.

## Design

1. **`src/lib/removal-backup.ts` (NEW, one axis: which files a capability removal would lose).** Export `removalBackupSet(projectRoot: string, relDirs: readonly string[], records: FileRecords | null): string[]` (sorted, deduped):
   - For each `relDir`: `safeJoin(projectRoot, relDir)`; `lstat` (no follow). Absent → nothing. Regular file (the address is a file, which `rmSync` would delete) → candidate `relDir`. Directory → recursive walk with `readdirSync(withFileTypes)`: `isDirectory()` → recurse; `isFile()` → candidate; anything else (symlink, FIFO, socket, device) → NOT a candidate (see Open question 2). Symlinked directories are never descended (Dirent of a link is not `isDirectory()`).
   - Candidate kept OUT of the set only when `records !== null && Object.hasOwn(records, rel) && sha256File(abs) === records[rel]` — pharn-written and unchanged. Everything else (not recorded, edited, or no usable store) is IN the set. A pure membership + byte-equality test (P5); no guess.
   - Errors (EACCES on `readdirSync`/`sha256File`, ENOTDIR) PROPAGATE: the caller turns them into a refusal with nothing deleted (fail closed — an unreadable file must never be treated as "safe to delete").
   - Keys are compared as strings; the walk joins only names read from the local dest dir under a `safeJoin`-contained root.
2. **`src/commands/remove.ts`**:
   - Read the records baseline ONCE inside the lock (after `assertConfigUnchanged`), pass it to both the backup step and `pruneCapabilityRecords` (signature takes the baseline instead of re-reading; behaviour of the prune unchanged).
   - New `backupBeforeDelete(cwd, paths, targets, records)`: computes `removalBackupSet` over `targets.map(capabilityRelDir)`; empty → nothing (no `.pharn-backup/` created); else `createBackup(cwd, set)` and immediately `log.info(\`Backed up ${n} file(s) to ${dir} before removing.\`)` (same shape as `add`, announced at creation). Any throw from scan or backup is wrapped in a local `RemoveBackupError` ("Could not back up … before removing: <cause>. Nothing was removed.").
   - Order inside the lock becomes: `assertConfigUnchanged` → records baseline → **backup** → delete → prune → config. Named path: for `[target]`. Picker: ONE backup for the whole selection, after the confirm, inside the one lock, before the first delete.
   - `runRemove`'s catch: `RemoveBackupError` → `logError(message)` + `process.exit(1)` (same treatment as `ProjectLockedError`; the lock is already released by unwinding).
   - Contract otherwise unchanged: named path still never prompts, no `--yes`, picker keeps its single confirm, `refuseSymlinkedTargets` unchanged and still first.
   - Update the header/inline comments that say "delete → prune → config".

## Files

- `src/lib/removal-backup.ts` — NEW: `removalBackupSet` (dest walk, regular files only, records-hash classification) — layer: lib
- `src/commands/remove.ts` — backup step before the delete on both paths, records read once, `RemoveBackupError` + catch in `runRemove`, comment updates — layer: command
- `tests/removal-backup.test.ts` — NEW: unit tests for `removalBackupSet` — layer: tests
- `tests/remove.test.ts` — integration tests (see Evals); adjust any existing assertion a new backup dir legitimately changes — layer: tests
- `tests/project-lock-commands.test.ts` — only if an existing assertion breaks because a backup is now written (expected: none) — layer: tests
- `docs/commands/remove.md` — Behavior steps + a "What is backed up" section (which files, where, the notice line, failure → nothing removed, what is NOT backed up), Concurrency order — layer: docs
- `docs/commands/add.md` — lines 161-164: keep the `add` statement and add that `pharn remove` backs such files up before deleting the directory (link) — layer: docs
- `docs/troubleshooting.md` — the "`add` writes backups too" subsection → covers `remove` too (heading + one paragraph) — layer: docs
- `docs/reference/pharn-records.md` — `remove` row / prose: it also READS the store to decide which files need a backup (absent/unusable store → every file is backed up) — layer: docs
- `docs/roadmap.md` — line 19 "(also written by `add`)" → "(also written by `add` and `remove`)" — layer: docs
- `README.md` — Safety model bullet for `remove`: mention the backup — layer: docs
- `docs/contributing.md` — add a row for `tests/removal-backup.test.ts` in the test-file table if that table is meant to list it (check at build) — layer: docs
- `CLAUDE.md` — the `pharn remove` addressing paragraph: describe the backup step and the new order (backup → delete → prune → config) — layer: docs
- `CHANGELOG.md` — a `### Fixed` entry under `## [Unreleased]`. No version bump — layer: docs

## Contracts satisfied

- No `pharn-contracts` file governs `remove`. The backup directory contract is `lib/backup.ts`'s own (reused, not changed). The records stamp contract is `lib/install-records.ts` `recordsBaseline` (reused verbatim, P4).

## Evals to write (P1)

Unit (`tests/removal-backup.test.ts`):
- user file not in records → in the set
- recorded file, bytes unchanged → NOT in the set
- recorded file, edited → in the set
- `records === null` → every regular file in the set
- nested subdirectories walked; result sorted
- symlink inside the dir (to a file and to a dir) → not in the set, not descended
- address absent → `[]`; address is a regular file → `[relDir]` (when not provably recorded)
- unreadable file (chmod 000, skipped when running as root) → throws

Integration (`tests/remove.test.ts`, named path unless stated):
- user file `…/a11y/notes/USER.md` inside the dir → backed up at `.pharn-backup/<ts>/<same rel>`, bytes identical, dir deleted, `log.info` called with the "Backed up 1 file(s) to .pharn-backup/… before removing." line
- edited recorded file → backed up; unchanged recorded file in the same dir → NOT in the backup
- all files recorded and unchanged → no `.pharn-backup` directory created, `log.info` not called with the notice
- no usable records (absent store; and stale-stamped store) → every file backed up
- backup failure (`.pharn-backup` is a symlink) → exit 1, capability dir and every file still present, config not written, records untouched
- picker path: two capabilities selected → ONE backup dir holding files from both, created after the confirm; declining the confirm → no backup dir
- already-gone dir → no backup, unchanged behaviour
- existing suite stays green (`CI=1 npx vitest run --maxWorkers=2`), `npm run check`, `npm run build`, `npm run test:coverage` thresholds hold

## Guarantee audit (P0)

- "Files `remove` cannot prove are pharn's are backed up before the directory is deleted" → the ORDER (backup completes before the first `rmSync`; a throw aborts before it) is deterministic control flow demonstrated by tests, not a floor primitive — labelled as such in comments/docs, the same honest label `lib/backup.ts` uses. The CLASSIFICATION is a membership test + sha256 equality against a stamp-checked store (floor-grade inputs: `recordsBaseline` exact-match stamp).
- "A file still at its recorded hash is pharn's own bytes" → reduces to sha256 equality against `pharn.records.json`; the store is local and hand-editable, so a user who rewrites a record to match an edit can opt a file out of the backup — stated as such (advisory w.r.t. intent, floor w.r.t. bytes). Same trust level `update`/`add` already give the store.
- "Containment" → floor: every path is `safeJoin`-contained; `createBackup` keeps its per-component symlink refusal and its `.pharn-backup` symlink refusal.
- "Backup failure → nothing deleted, exit 1" → control flow, tested.
- NOT claimed: symlinks / FIFOs / sockets inside the dir are not backed up (a link is deleted as a link, its target is never touched by `rmSync`); a component turned into a symlink between the pre-lock symlink check and the delete is the existing named race (local attacker, not modelled — THREAT-MODEL Surface B is remote content). Both stated in docs.

## Trust audit (P2)

- No untrusted (fetched) input: `remove` stays zero-network and imports no repo module. Inputs are the local dest tree, the validated config (`capabilities[]` names already `CAPABILITY_NAME_RE`-checked at ingest), and the stamp-checked local records store. Record keys are compared as strings, never joined into a path. File contents are hashed and copied, never parsed or executed.

## Determinism audit (P5)

- Branches: `lstat` type checks, `Object.hasOwn` membership, sha256 string equality, `set.length === 0`. Errors fail closed into a named refusal. No classification by guess.

## Out of scope (P7)

- The false "next update will reinstall" warning; orphan detection; any change to `add`/`update`/`init`; a version bump; any edit to a trusted doc by the agent.

## Open questions (HALT)

1. **`LIMITS.md` is human-only.** `CONSTITUTION.md` ("agents … MUST NOT modify") and `.claude/hooks/protect-trusted-paths.cjs` protect it; writing it through Bash would bypass the floor. Recommended: I do NOT edit it; at GATE 2 I hand over the proposed replacement text for `LIMITS.md:82-83` (narrowing the residual to: symlinks/special files inside the dir are removed as links/not backed up, and a store a user hand-edits can opt a file out) for a human to apply. Alternative: the human edits it before merge from a diff I provide.
2. **Non-regular entries inside the capability dir** (symlinks, FIFOs, sockets). Recommended: not backed up and not followed; `rmSync` deletes a link as a link (its target is untouched); documented in `remove.md`. Alternative: refuse the whole removal when any such entry is present (new refusal path, stricter).
3. **No usable records → every regular file is backed up** (pre-records installs, a hand-edited/stale store). This means most removals on such projects will now produce a `.pharn-backup/`. Recommended: yes (conservative; matches `add`'s `unverifiable` stance).
4. **Notice wording**: `Backed up N file(s) to .pharn-backup/<ts> before removing.` via `log.info`, mirroring `add`. Recommended: yes.

## Resolved decisions (GATE 1, 2026-10-13)

GATE 1 passed: "Approve as written".

1. `LIMITS.md` → not edited by the agent, by any route; the replacement residual text is handed over at GATE 2 for a human to apply.
2. Non-regular entries (symlinks, FIFOs, sockets) → not backed up, not followed; documented in `docs/commands/remove.md`.
3. No usable records → every regular file is backed up.
4. Notice wording → `Backed up N file(s) to .pharn-backup/<ts> before removing.`
