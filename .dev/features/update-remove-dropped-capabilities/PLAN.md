# PLAN — update-remove-dropped-capabilities: a capability `update` / a re-run `init` drops from the config is deleted from disk too

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: When `pharn update` (merge rows 5/7/9: `dropped-unselected`, `dropped-gone`) or a re-run `pharn init` drops a capability's entry from `pharn.config.json`, it also deletes that capability's directory in the same run — at the layout the config recorded, through the same strict-child addressing and symlink refusal `pharn remove` uses — after copying every file pharn cannot prove it wrote to `.pharn-backup/<ts>/` (`removalBackupSet` + `createBackup`, PR #274). The deletion is shown before it happens (`update --dry-run` text + `--dry-run --json`, init's overwrite prompt) and named after. Closes finding F-04 (Medium, correctness).
- layer(s): CLI commands (`src/commands/update.ts`, `src/commands/remove.ts`), lib (`src/lib/update-plan.ts`, `src/lib/update-report.ts`, NEW `src/lib/capability-dir.ts`), tests (init: out of scope per GATE 1, see Resolved decisions), user-facing docs, CLAUDE.md, CHANGELOG. No `pharn-contracts` change. No trusted-doc edit by the agent (LIMITS.md — see Open question 6).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (read this run, P6)

- **The defect is real.** `src/lib/merge-capabilities.ts:226-251` — rows 5 (`dropped-unselected`) and 7/9 (`dropped-gone`) drop the CONFIG entry only ("Its FILES are left on disk: `update` never deletes"). `update.ts:1145-1149` prints "REMOVED … files are left on disk". pharn-oss enumerates capabilities FROM DISK: `~/Projects/pharn-oss/pharn/floor/count-lenses.mjs` walks the target dir with `readdirSync` and `pharn-review.md` states "This set is the lenses you run — membership is FLOOR". A grep of pharn-oss's `pharn/floor/*.mjs` + `.claude/commands/pharn-*.md` finds NO runtime read of `capabilities[]` from `pharn.config.json`. So a "REMOVED" capability keeps running, `pharn list` under-reports what runs, and `pharn remove <name>` (addressed from `config.capabilities`, `remove.ts:266-287`) can no longer reach it.
- **Records are already pruned.** `update`: `planUpdate` keys `nextRecords` by the install manifest, which holds only kept capabilities (`update-plan.ts` `manifestCapabilities`), plus `frozenRecords`; a dropped capability's records disappear in the same run. `init`: `writeRecords` = `keptRecords` + manifest + models. So neither path needs `remove`'s `pruneCapabilityRecords`; after this change the records and the disk agree for dropped capabilities (they currently do NOT: files on disk, no records).
- **The planner runs under the lock in the real run.** `update.ts:469-505`: lock → `assertConfigUnchanged` → `fetchRepo` → MIN_CLI → `buildUpdatePlan` → `applyPlannedUpdate`, all inside `withProjectLock`. So a removal set computed IN the planner is authoritative for the real run (no prompt between plan and apply) and is exactly what `--dry-run` previews. **The real run's confirm comes BEFORE the fetch** (`update.ts:400-410`, deliberate: lock after confirm, fetch under lock) — so the confirm cannot list the specific capabilities; see Open question 3.
- **`init`'s drop paths.** `commands/init.ts` `carryOver` (:342-381): manual + not in index → `gone` (named "files stay on disk"); `auto` and source-less (legacy) entries not re-selected → dropped SILENTLY (`if (cap.source !== 'manual') continue;`). init's prompt (`confirmWriteTargets`, `steps/overwrite-check.ts`) runs after the clone, so the drop set IS known at prompt time. `runInstallArchetype` (`steps/install-archetype.ts`): `prepareInstall` → `scanDest` → `createBackup` (overwrites) → `installCapabilities` → records → config, under init's lock.
- **Remove machinery (PR #274).** `src/commands/remove.ts`: `capabilityRelDir` (:202), `capabilityDir` (`safeChildJoin(safeJoin(cwd, subtree), name)`, :121), `deleteCapabilityDir` (`existsSync` + `rmSync({recursive, force})`, :107), `refuseSymlinkedTargets` (`findSymlinkComponent`, exits), `backupBeforeDelete` → `removalBackupSet` (`src/lib/removal-backup.ts`, regular files only, out of the set only when recorded AND hash-equal in a usable store; errors propagate) → `createBackup`. All file-local today except `removalBackupSet`.
- **Layout.** A dropped capability's dir lives at the layout the CONFIG recorded (`configLayout(config)`), which is where `remove` addresses it and how its records are keyed — not necessarily the clone's (`update` records the clone's layout; a flat → pharn/ switch abandons the old tree, `reportLayoutWarnings`).
- **JSON report.** `src/lib/update-report.ts` — explicit projection, `schemaVersion: 1`, additive keys allowed (`compact`/`filesOmitted` precedent).
- **Text that is now false, to be corrected:** `update.ts:1145-1149`; `merge-capabilities.ts:226-227, 247`; `init.ts:184` ("the files stay on disk"); comments `add.ts:592`, `dest-drift.ts:23`, `install-archetype.ts` `reinstallBaseline` ("init never deletes" — still true for layout leftovers, re-worded); docs `docs/commands/update.md:54-56, 266-267`, `docs/commands/init.md:175, 183`, `docs/commands/add.md:168-171`, `docs/commands/list.md:3`, `docs/reference/pharn-config.md:7-8`, `docs/reference/pharn-records.md` (`update`/`init` rows), `README.md` Safety model, `CLAUDE.md` (`pharn update` paragraph "Update **never deletes**", `pharn add` paragraph's drop-then-edit rationale, `init` paragraph), `LIMITS.md:71` (human-only).
- Tests touching this: `tests/merge-capabilities.test.ts` (pure; unchanged outcome), `tests/update.test.ts` (asserts files left on disk for dropped capabilities — those assertions flip), `tests/update-plan.test.ts`, `tests/update-dry-run.test.ts` (whole-tree snapshot), `tests/update-dry-run-json.test.ts`, `tests/update-report.test.ts`, `tests/init-archetype.test.ts`, `tests/init.test.ts`, `tests/add.test.ts:1004` (the drop-then-edit-then-add scenario — the drop now deletes; the test builds its leftover dir by hand, so it keeps passing; its comment is updated), `tests/remove.test.ts` (refactor must stay green).

## Design

1. **NEW `src/lib/capability-dir.ts` — one axis: addressing and deleting ONE capability directory** (moved verbatim from `remove.ts`, so the three commands share one copy):
   - `capabilityRelDir(paths, cap)` → `<subtree>/<name>` (via `capabilitySubtree`).
   - `capabilityDir(cwd, paths, cap)` → `safeChildJoin(safeJoin(cwd, subtree), name)` (strict child, or `Refusing path` throw).
   - `linkedComponent(cwd, paths, cap): string | null` → `findSymlinkComponent` over the rel dir, ENOTDIR/other throw → `null` (remove's existing semantics).
   - `deleteCapabilityDir(cwd, paths, cap): boolean` → existed?
   - `remove.ts` imports them (its `refuseSymlinkedTargets`/`backupBeforeDelete`/`pruneCapabilityRecords` keep their shapes; behaviour byte-identical).
2. **`src/lib/update-plan.ts`** — after the merge, derive `removals` from `merged.changes` with `reason ∈ {dropped-unselected, dropped-gone}` (membership on the reason enum; de-duplicated by `role:name`; never a frozen entry — row 0 keeps those). Each is addressed at `layoutPaths(configLayout(config))`:
   - `linkedComponent` non-null → throw `CapabilityRemovalError` ("Refusing to update: <cap> is no longer installed, but deleting its directory would go through <link>, a symbolic link — files OUTSIDE the project. Nothing was changed. Delete <dir> yourself, then run `pharn update` again.") — the whole run refuses, nothing written (Open question 4).
   - `present` = the address exists; `backups` = `removalBackupSet(cwd, [relDir], records)` (same baseline the plan already read). A scan error → `CapabilityRemovalError` ("Could not check the files in <cap> before removing it: <cause>. Nothing was changed.").
   - `UpdatePlanReport.removals: { cap, reason, dir, present, backups: string[] }[]` (JSON-safe); `UpdateApplyInputs.removalPaths: LayoutPaths` (the config layout's paths).
   - `report.backups` keeps its meaning (the `--force` overwrite set + config); removal backups ride in `removals[].backups`.
3. **`src/commands/update.ts` — `applyPlannedUpdate` order: backup → capability deletes → file writes → records → config.**
   - ONE `createBackup` over `report.backups ∪ removals[].backups` (one directory per run, announced at creation via `onBackup`). `printBackupNotice` wording: "before overwriting." (unchanged when only overwrites), "before removing." (only removals), "before overwriting and removing." (both).
   - Deletes BEFORE writes, deliberately (justifies a different order than the brief's): if a delete fails AFTER the writes, the run has written pharn files whose records are never stored (only `ApplyError` has a records rescue), and the next run reads them as `modified` and skips them forever. A delete failure BEFORE the writes leaves only the backup and some deleted dirs; the config still lists those entries, so the next `update` drops them again (an absent dir is `present: false`, nothing to back up) — benign. A delete failure is reported like any other failure (exit 1, the backup pointer repeated on stderr by the existing abort path).
   - `CapabilityRemovalError` is caught as a POLICY refusal (like `ProjectLockedError`: no PHARN_DEBUG hint) in both the real run and `fetchAndPlan`/`runDryRun` (exit 1; the dry run reports the same refusal the real run would).
   - `reportCapabilityChanges(changes, removals, preview)`: each REMOVED line gains a suffix — `— directory deleted` / `— N file(s) backed up first` / `— already gone` (preview: `would be deleted` …); the footer line "files are left on disk — pharn update never deletes" is REPLACED by: "Their directories are deleted, so PHARN no longer runs them. Files pharn could not prove it wrote were copied to .pharn-backup/<ts>/ first." (preview tense when dry run).
   - Dry-run PLAN note: a `WOULD DELETE — capability directories` section listing each dir (`(already gone)` marked), and the `WOULD BACK UP` section/outro count include the removal backups.
   - Pre-confirm header note: one static dim line (Open question 3).
4. **`src/lib/update-report.ts`** — additive `plan.capabilities.removals: { role, name, reason, dir, present, backups: string[] }[]` (always present in a planned report, `[]` when none); explicit projection; `schemaVersion` stays 1; `plan.backups` unchanged.
5. **`init` (re-run)** — `carryOver` additionally returns `dropped`: every previous entry (first per key) that is neither kept (frozen), nor carried as `extra`/re-selected, i.e. not in the final selection — `auto`, legacy, and `gone` alike (Open question 2). Addressed at `configLayout(previous.config)`.
   - `confirmWriteTargets` gets `context.removals` (`{ key, dir, backups }[]`, computed before the prompt with the same helpers) and lists them in the warning: "No longer selected — these capability directories will be DELETED (N file(s) pharn did not write are backed up first): …". The zero-friction early return only fires when there are no conflicts AND no removals.
   - `runInstallArchetype` gets `carry.dropped` + the previous layout; under the lock, after `prepareInstall`: re-check `linkedComponent` (throw `ManifestValidationError`-style refusal, nothing written), recompute `removalBackupSet` (authoritative, as the overwrite scan is), ONE `createBackup` over overwrite-drift ∪ removal backups (notice "before overwriting and removing"), then the deletes, then the copy. Records/config already omit dropped capabilities.
   - `init.ts:184`'s "files stay on disk" → "its directory is deleted (anything pharn did not write is backed up first)"; an `auto`/legacy drop, silent today, is now NAMED ("No longer selected for your archetypes: …").
6. **Docs/CLAUDE.md/CHANGELOG** — the contract now reads precisely: _`update` deletes ONLY the directories of capabilities it drops from `pharn.config.json`, after backing up every file in them it cannot prove it wrote; it never deletes anything else (a file upstream stops shipping, an abandoned layout tree, `features/README.md`), and never touches `.claude/settings.json`._ Same for a re-run `init`. `pharn-config.md:7-8` corrected (PHARN's commands find capabilities by scanning the directories on disk; `capabilities[]` is the CLI's own record of what it installed; the commands read `models.stages`). `list.md`: lists what `pharn.config.json` records; a capability directory left on disk by pharn < this version (or created by hand) is not listed but still runs — delete it by hand. CHANGELOG `### Fixed` under `[Unreleased]`.

## Files

- `src/lib/capability-dir.ts` — NEW: `capabilityRelDir`, `capabilityDir`, `linkedComponent`, `deleteCapabilityDir` (moved from remove.ts) — layer: lib
- `src/commands/remove.ts` — import the moved helpers; no behaviour change — layer: command
- `src/lib/update-plan.ts` — `removals` in the report, `CapabilityRemovalError`, removal paths in apply inputs — layer: lib
- `src/lib/update-report.ts` — additive `plan.capabilities.removals` — layer: lib
- `src/commands/update.ts` — one backup over overwrites ∪ removals, deletes before writes, refusal handling, CAPABILITIES/PLAN/header/backup-notice wording — layer: command
- `src/lib/merge-capabilities.ts` — comments only (rows 5/7/9 no longer "files left on disk") — layer: lib
- `src/commands/add.ts`, `src/lib/dest-drift.ts` — comments only (the drop-then-edit rationale) — layer: command/lib
- `tests/capability-dir.test.ts` — NEW: unit tests for the moved helpers — layer: tests
- `tests/update-plan.test.ts` — removals derived from rows 5/7/9 only; backups per capability; frozen never removed; symlinked component / scan error → `CapabilityRemovalError` — layer: tests
- `tests/update.test.ts` — dropped dir deleted with backup-first; failure paths; existing "left on disk" assertions flipped; settings.json untouched — layer: tests
- `tests/update-dry-run.test.ts` — WOULD DELETE listed, whole-tree snapshot unchanged — layer: tests
- `tests/update-dry-run-json.test.ts`, `tests/update-report.test.ts` — `plan.capabilities.removals` — layer: tests
- `tests/remove.test.ts` — unchanged; must stay green after the move — layer: tests
- `docs/commands/update.md`, `docs/commands/init.md` (state init's re-run drop path is unchanged for now), `docs/commands/add.md`, `docs/commands/list.md`, `docs/commands/remove.md` (cross-link only, if needed), `docs/reference/pharn-config.md`, `docs/reference/pharn-records.md`, `docs/troubleshooting.md`, `README.md` (Safety model) — layer: docs
- `docs/contributing.md` — test-file table row for `tests/capability-dir.test.ts` — layer: docs
- `CLAUDE.md` — update/add paragraphs — layer: docs
- `CHANGELOG.md` — `### Fixed` under `## [Unreleased]`; no version bump — layer: docs

## Contracts satisfied

- No `pharn-contracts` file governs `update`/`init` membership. Reused, not changed (P4): `lib/backup.ts` (backup dir contract), `lib/removal-backup.ts` (which files a removal would lose), `lib/install-records.ts` `recordsBaseline` (stamp gate), `lib/merge-capabilities.ts` (the 10-row membership table — its outcomes are unchanged; only what DROP means on disk changes).

## Evals to write (P1)

- capability-dir: `..`/nested name → throws; strict child returned; linked `pharn/` → component returned; delete of absent → `false`, of present → `true` and gone.
- update-plan: auto entry no longer resolved → one removal `{reason: dropped-unselected, present: true, backups: [user file]}`; manual gone → `dropped-gone` removal; legacy gone (row 9) → removal; kept-manual / kept-frozen / resolved → none; config layout `flat` + clone `pharn` → dir addressed at flat; absent dir → `present: false, backups: []`; symlinked component → throws `CapabilityRemovalError`, nothing written.
- update (real run, `--yes`): files pharn recorded + unchanged deleted without backup; user-added and edited files in `.pharn-backup/<ts>/<same rel>`, notice "before removing."; with `--force` overwrites too → ONE backup dir, "before overwriting and removing."; records have no key under the dropped dir; config lacks the entry; `.claude/settings.json` untouched; a file upstream stopped shipping inside a KEPT capability is still NOT deleted (the "never deletes anything else" half).
- update failure: `.pharn-backup` is a symlink → exit 1, dropped dir and every file intact, config/records byte-identical.
- update --dry-run: WOULD DELETE section + `whole-tree snapshot` unchanged; `--json`: `plan.capabilities.removals[0]` = `{role, name, reason, dir, present, backups}`.
- init re-run: previous config with an `auto` capability the archetypes no longer select + a user file inside → prompt lists the dir under "will be DELETED"; on proceed → backed up, deleted, config/records lack it; on decline → nothing deleted.
- Full suite (`CI=1 npx vitest run --maxWorkers=2`), `npm run check`, `npm run build`, `npm run test:coverage` thresholds.

## Guarantee audit (P0)

- "A capability `update`/`init` drops from the config no longer has a directory on disk" → control flow (the delete runs in the same locked run), demonstrated by tests; labelled control flow, not floor.
- "Nothing pharn cannot prove it wrote is lost" → classification = membership + sha256 equality against a stamp-checked store (`recordsBaseline`, floor-grade inputs); ORDER (backup completes before the first `rmSync`; any throw aborts before it) = control flow, tested. Same honest label as `remove`.
- "Containment" → floor: `safeChildJoin` strict-child addressing; `findSymlinkComponent` refusal before any delete; `createBackup`'s own symlink refusals.
- "update never deletes anything ELSE and never touches settings.json" → floor by absence: the only new `rmSync` call site is `deleteCapabilityDir`, fed only by `removals` (derived from the merge's two DROP reasons); tested by a byte-identical settings.json and a kept-capability orphan file surviving.
- "`--dry-run` writes nothing" → existing whole-tree snapshot test, extended to a run with a drop.
- "The JSON report is additive" → `schemaVersion` constant unchanged; explicit projection; test.
- NOT claimed: directories left on disk by EARLIER pharn versions (their config entry already gone) are not found or cleaned (no orphan detection — F-12's neighbour); a hand-edited store can opt a file out of the backup (same trust as `remove`/`add`); the local TOCTOU between the under-lock scan and `rmSync` (same named race as `remove`).

## Trust audit (P2)

- The removal set derives from the LOCAL config (names validated at ingest by `CAPABILITY_NAME_RE`) and the merge's reasons — the untrusted clone only decides WHETHER a capability is still selected/shipped (membership), never a path. Every path is the config layout's subtree + validated name through `safeChildJoin`; record keys are compared as strings, never joined. Dir contents are hashed and copied, never parsed or executed. JSON fields are CLI-built enums or validated names/paths; serialized by `serializeJsonReport`.

## Determinism audit (P5)

- Branches: reason ∈ {dropped-unselected, dropped-gone} membership; `linkedComponent === null`; `existsSync`; `removalBackupSet`'s membership + hash equality; `backups.length > 0`. Unknown/failure → named refusal with nothing written (fail closed), never a guessed delete.

## Out of scope (P7)

- Orphaned FILES upstream stops shipping inside a kept capability (F-12); the same-version early return (F-09); cleaning dirs that earlier pharn versions already orphaned; tombstones; changing init's legacy-source carry rule (beyond Open question 2's deletion decision); a version bump; editing LIMITS.md.

## Open questions (HALT)

1. **`dropped-gone` (manual entry upstream no longer ships) — delete too?** Recommended: **yes, same treatment.** The dir otherwise runs forever and is unaddressable; the code gives no reason to treat it differently — `removalBackupSet` already backs up every file pharn cannot prove it wrote, and pharn's own bytes are in pharn-oss's history. Alternative: back up EVERY file for `dropped-gone` (since `pharn add` can no longer reinstall it).
2. **`init` in this increment?** Recommended: **yes** — it has the same drop path (and silently drops `auto`/legacy entries today), its prompt runs after the clone so the deletions can be listed in the existing overwrite confirm, and the shared helpers make it small. init deletes exactly the entries it drops: `auto`, `gone`, AND source-less legacy entries it does not re-select (init does not infer legacy provenance — `carryOver`'s documented rule). Alternative: split init into a follow-up PR, or keep legacy-source dirs (but then they keep running, unaddressable).
3. **The real `update`'s confirm cannot list the specific capabilities** (it precedes the fetch by design; holding the lock across a prompt is forbidden). Recommended: one static dim line in the pre-confirm note — "Capabilities no longer selected are removed — their directories deleted, anything pharn did not write backed up first. `pharn update --dry-run` lists them." — plus the exact list in `--dry-run` (text + JSON) and in the post-run CAPABILITIES note. Alternative: restructure update to plan before the confirm (large; changes the lock/fetch contract).
4. **A dropped capability whose dir path crosses a symlinked component** (e.g. `pharn -> ../shared`). Recommended: **refuse the whole run, nothing written** (exit 1, named link, "delete it yourself"), as `remove` and `add` refuse. Alternative: skip that delete and report it (keeps the defect alive for that dir).
5. **One backup directory per run** for overwrites (`--force`) and removals, notice wording "before overwriting." / "before removing." / "before overwriting and removing.". Recommended: yes. `plan.backups` in JSON keeps its current meaning; removal backups are in `plan.capabilities.removals[].backups`.
6. **`LIMITS.md:71` ("`update` never deletes") is human-only** (CONSTITUTION + `protect-trusted-paths.cjs`). Recommended: not edited by the agent; the exact replacement text is handed over at GATE 2.
7. **Order inside the lock: backup → deletes → writes → records → config** (not the brief's backup → writes → deletes): a delete failing after the writes would strand unrecorded pharn writes that the next run reads as user edits. Recommended: deletes before writes, as justified in Design §3.

## Resolved decisions (GATE 1, 2026-10-13)

GATE 1 passed with one scope change.

1. `dropped-gone` → deleted, same backup-first treatment as `dropped-unselected`.
2. **init is OUT of this increment** (a concurrent refactor moves `carryOver` to `src/lib/init-plan.ts` and overwrite-check labelling to `src/lib/write-targets.ts`). This increment is `update` only + the shared `src/lib/capability-dir.ts` extraction (remove.ts switches to it). Design §5 is NOT built; docs say init's re-run drop path is unchanged for now. The init follow-up is described at GATE 2.
3. One static dim line before the confirm, pointing to `pharn update --dry-run`.
4. A dropped dir crossing a symlinked component → refuse the whole run, nothing written.
5. One backup dir per run; notice "before overwriting." / "before removing." / "before overwriting and removing.".
6. `LIMITS.md` not edited by the agent; replacement text for `:71` handed over at GATE 2.
7. Order inside the lock: backup → capability deletes → file writes → records → config.

## GATE 2 changes (2026-10-13) — the init half joins this PR

Approved at GATE 2 with three changes; the init refactor (#283: `lib/init-plan.ts`, `lib/init-report.ts`, `lib/write-targets.ts`, init `--dry-run`/`--json`/`--yes`) has merged, so the init half is built here.

1. **JSON convention.** `update`'s `plan.capabilities.removals` is ABSENT when empty (as `plan.orphans` / `plan.absentUpstream`); the original 0.10.0 byte-pin test is restored unchanged; docs say "read it as `?? []`". init's new field follows the same rule.
2. **Rebased** onto origin/main (#275–#287). Composition with F-12 orphans (#282): `findOrphans` skips keys under a capability outside the next `capabilities`, which is exactly the set `removals` deletes — disjoint by construction; pinned by a test.
3. **init half (design):**
   - `src/lib/capability-removal.ts` (NEW, one axis: which dropped capability directories a run deletes and what it saves first): `CapabilityRemoval`, `CapabilityRemovalError`, `planCapabilityRemovals(cwd, paths, drops, records)` — moved out of `update-plan.ts` (which re-exports the types) so update and init share one copy.
   - `carryOver` returns `dropped: {cap, reason}[]` — every previous entry (first per key, never frozen) not in the final selection: `auto` not re-selected (`dropped-unselected`), source-less legacy not re-selected (`dropped-unselected` if the index has it, else `dropped-gone`), `gone` manual (`dropped-gone`). `InstallCarry` gains `dropped` and `previousLayout` (`configLayout(previous)`).
   - Before the prompt: `planCapabilityRemovals` at `layoutPaths(previousLayout)` against `reinstallBaseline` — a symlinked component or unreadable file → `CapabilityRemovalError`, a named refusal (exit 1, nothing written).
   - `planWriteTargets` carries the removals; `confirmWriteTargets` lists "will be DELETED (N file(s) … backed up first)" and prompts even with zero conflicts.
   - `init --yes` REFUSES when there are removals (`OverwriteRefusedError`, before the lock and under it): it never deletes without the interactive confirm.
   - `init --dry-run`: PLAN note `WOULD DELETE`, backups/counts include removal backups, `--yes would refuse`; `--dry-run --json` adds `capabilities.removals` (absent when empty).
   - `runInstallArchetype`, under the lock: pre-flight → re-plan removals (authoritative) → ONE `createBackup` over drift ∪ replaced config ∪ removal backups (notice "before overwriting and removing.") → delete → copy → records → config.
   - The silent drops (`auto` / legacy not re-selected) are now named before the summary; "its files stay on disk" / "init still leaves them" text is corrected everywhere.

### Files (init half)

- `src/lib/capability-removal.ts` — NEW: shared removal planning — layer: lib
- `src/lib/update-plan.ts` — use/re-export the shared module — layer: lib
- `src/lib/init-plan.ts` — `carryOver` → `dropped`; `InstallCarry.dropped`/`previousLayout`; `buildInitPlan` → `removals` — layer: lib
- `src/lib/init-report.ts` — additive `capabilities.removals` (absent when empty); backups/counts/yesWouldProceed — layer: lib
- `src/lib/write-targets.ts` — removals in the plan, `removalLines`, `--yes` refusal — layer: lib
- `src/steps/overwrite-check.ts` — list deletions; prompt with zero conflicts — layer: steps
- `src/steps/install-archetype.ts` — under-lock re-plan, one backup, delete before copy — layer: steps
- `src/commands/init.ts` — plan removals before the prompt, refusal handling, naming the drops, dry-run text — layer: command
- `src/lib/orphans.ts` — comment only (disjoint from removals) — layer: lib
- `tests/capability-removal.test.ts` — NEW — layer: tests
- `tests/init-plan.test.ts`, `tests/init-archetype.test.ts`, `tests/init.test.ts`, `tests/init-dry-run.test.ts`, `tests/init-dry-run-json.test.ts`, `tests/init-report.test.ts`, `tests/init-yes.test.ts`, `tests/write-targets.test.ts`, `tests/overwrite-check.test.ts` — layer: tests
- `docs/commands/init.md`, `docs/commands/update.md`, `docs/commands/add.md`, `docs/commands/list.md`, `docs/reference/pharn-records.md`, `docs/troubleshooting.md`, `docs/contributing.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md` — layer: docs

### Evals (init half)

- carryOver: `auto` not re-selected → dropped-unselected; `gone` manual → dropped-gone; legacy not re-selected in/out of index; frozen and re-selected never dropped; duplicates once.
- re-run init: a no-longer-selected `auto` dir and a gone manual dir are deleted, a user file in them backed up (one backup dir, "before overwriting and removing."), records/config lack them; the prompt lists them under "will be DELETED"; declining deletes nothing; a symlinked `pharn/` component refuses with nothing written; the prompt appears with zero conflicts.
- `init --yes` with removals → refusal, nothing written.
- `init --dry-run` lists WOULD DELETE and writes nothing (whole-tree snapshot); `--json` has `capabilities.removals` only when non-empty.
