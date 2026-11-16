# PLAN — core-181-lock-first-plan-once (Linear CORE-181, C5.2, epic CORE-154)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: every writing command (`init`, `add`, `remove`, `update`, `uninstall`) takes `pharn/.lock` before it reads `pharn.config.json` or touches the network and holds it to the end: load config → fetch → plan ONCE → notes → ask → verify-at-write → apply → release. `--dry-run` takes no lock. The re-plans, `assertConfigUnchanged`/`ProjectChangedError`, init's under-lock fingerprint re-check, `membershipKeys`/`membershipDrift`, `preflightInstall`, the `installManifest` wrapper and the duplicate `prepareInstall`/`scanDest`/`planInitRemovals`/`initRootMigration`/`reinstallBaseline` calls go. Edits made while a prompt is open stay protected by write-time checks (per-file hash vs. plan, per-file symlink walk, config fingerprint).
- base: origin/main @ 8e38bf7e (C5.1 + C5.4 + C5.5 + C5.6 merged). Branch `przemek/core-181-c52-lock-first-plan-once-in-every-command`.
- layer(s): pharn-cli `src/` (commands, steps, lib), `tests/`, `docs/`, `CLAUDE.md`, `CHANGELOG.md`; a patch script for `THREAT-MODEL.md` (protected).
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

## Why (discovery, live state this run)

- `withProjectLock` is taken AFTER the prompt in `init` (init.ts:351), `update` (update.ts:585, `applyUnderLock`), the `remove` picker (remove.ts:380) and `uninstall` (uninstall.ts:118); `add` and named `remove` take it before the fetch/delete but load the config BEFORE it (add.ts:60, remove.ts:57). So each re-checks under the lock: `assertConfigUnchanged` (add ×2, remove ×2, update, uninstall), `assertConfigFingerprintUnchanged` (init), and `update` re-plans (`buildUpdatePlan` ×2 per real run) and diffs with `membershipKeys`/`membershipDrift`; `uninstall` re-plans (`planUninstall` ×2).
- `init` real run: `installManifest` + `preflightInstall` (`prepareInstall` #1), `reinstallBaseline` ×3+, `planInitRemovals` ×2, `initRootMigration` ×2, `planWriteTargets` (prompt) + its own `scanDest`, then under the lock `runInstallArchetype` → `prepareInstall` #2, `scanDest` #2, `planInitRemovals` #3, `initRootMigration` #3, then `installCapabilities` → `prepareInstall` #3. `buildInitPlan` (init-plan.ts:551) is used only by `--dry-run`.
- `project-lock.ts` already has C3.3's same-host liveness rule (a live same-host lock is never broken by age), and C5.1 made `finally` run on every path, so `withProjectLock` removes an empty `pharn/` it created on a cancel. `applyWrites(…, seen)` (C5.4) re-reads each planned file before its write and returns `changed`.
- `vi.spyOn(moduleNamespace, 'buildUpdatePlan')` works under this vitest (5.1.0, SSR-transformed ESM): probed this run, the namespace export is configurable. So the planner spy needs no `vi.mock` of a src module (CLAUDE.md rule kept).
- `THREAT-MODEL.md §4d` names `assertConfigUnchanged` as the partial backstop against an older (pre-0.14.0) CLI interleaving — protected file, needs a patch script.

## Design

**Order (real runs).** `init`: node floor → git prereq → TTY gate → `--yes` existing-config refusal (an existence test, no read) → banner → **lock** → detection → fetch → MIN_CLI → index → selection/carry → `buildInitPlan` (once) → summary prompt → overwrite prompt → verify → apply → release. `update`: node floor → **lock** → load config → TTY gate → channel notice → version fetch → ahead/same-version early returns (unchanged; C5.3 owns them) → header note → tarball → MIN_CLI → `buildUpdatePlan` (once) → `changesNothing` (writes nothing) / notes → confirm → verify → apply → release. `add`: **lock** → load config → (picker: TTY gate) → fetch → gates → plan/pick → verify → write. `remove`: **lock** → load config → resolve → (picker: TTY gate, multi-select, walk, confirm) → verify → backup → delete. `uninstall`: **lock** → not-installed check → load config → records → `planUninstall` (once) → note → TTY gate → confirm → verify → delete. Dry runs (`init --dry-run`, `update --dry-run`/`--json`) branch BEFORE the lock and take none.

- **TTY gate position (open question 1).** `update`, `uninstall` and the `add`/`remove` pickers keep their current precedence — a config error wins over the TTY gate — which tests pin (`update.test.ts` "that error wins over the TTY gate and the proxy note", `dist-smoke` `pharn update` → "No pharn.config.json found", remove "reports nothing installed without prompting, even off a TTY"). So for them the lock is taken right after the node floor and the gate stays after the config load, inside the lock (an off-TTY refusal takes and releases the lock; a `pharn/` it created is removed when empty). `init`'s gate already precedes its config read and stays before the lock.
- **The refusal while another run waits** (`project-lock.ts` `refusal()`): `Another pharn process is writing to this project: pharn update (pid 4821 on host, since …). It may be waiting for input in another terminal.` + the existing "Wait for it to finish, or delete pharn/.lock…" line. Static wording; the payload gains nothing. The header's "a prompt may not be held" rule becomes "a prompt may be held (as git does): the same-host liveness rule never breaks a live holder by age". `ProjectChangedError` deleted.
- **Verify at write time** (the protection for edits made while a prompt is open), run after the last prompt and before the first write:
  - **config:** `assertConfigFingerprintUnchanged(cwd, fingerprint, command)` (kept in `pharn-config.ts`, now throws `CliError.refusal`): `configFingerprint` is taken right before the config is loaded under the lock. Wording: `pharn.config.json changed while \`pharn <cmd>\` was waiting for your answer — it was edited by hand or by another program. Nothing was written. Re-run \`pharn <cmd>\`.`(existing tests match "changed while`pharn <cmd>`"). Runs in every command that writes the config, after its prompts (named `add`/`remove`and`--yes`runs have no prompt; it still runs, cheaply, so one rule covers all).`assertConfigUnchanged`+`configChangedError` deleted.
  - **files `init` overwrites:** `applyWrites` with the plan's `seen` (unchanged mechanism): a file edited during a prompt is backed up, then written.
  - **files `update` writes (open question 2):** before the backup, `changedSince(cwd, apply.seen, plan.writes)` (new, `apply-update.ts`, the same comparison `applyWrites` uses, now its one definition). Non-empty → refuse, nothing written: `<rel> changed while \`pharn update\` was waiting for your answer. Nothing was written. Run \`pharn update\` again — your edit is kept.`(the re-run plans it`modified`and skips it).`applyWrites`still gets`seen` as the backstop for the instant between the check and the write; a file caught there is left unwritten and its record is not refreshed (`nextRecordStore` gets it as kept).
  - **directories deleted (update/init drops):** the backup set is recomputed at delete time over the present removal dirs (`removalBackupSet`, the same rule) and unioned with the plan's, so a file edited inside a dropped dir during the prompt is backed up before the delete. `deleteCapabilityDir` walks for a symlinked component itself and refuses (the write-time walk for every recursive delete).
  - **files `uninstall` unlinks:** before the config backup, the plan's `delete` bucket is re-classified (`planUninstall` over just those keys, `uninstall-plan.ts`): a file now edited/unverifiable is kept and listed; a symlinked parent refuses the run with nothing removed (as today).
  - **remove:** the walk runs once on the named path (under the lock, before the backup); the picker keeps its early walk before the confirm (so a refused pick is never asked about) plus the same walk before the backup — the tests "a parent swapped to a symlink while the confirm is open" must still pass.
- **update** (`update.ts`): `runUpdate` → `dryRun ? runArchetypeUpdate(...) : withProjectLock(cwd, 'update', …)`; a `ProjectLockedError` maps to `CliError.refusal` as today. `applyUnderLock`'s re-plan, `membershipKeys`, `membershipDrift` deleted; the confirm's plan is applied. `buildUpdatePlan` exposes `apply.seen` (rel → plan-time hash or null, from `diskStates`). The real run still downloads once and plans once; the "THE PLAN SNAPSHOT" comment and "a cancelled confirm has already downloaded" cost stay true.
- **init** (`init.ts`, `init-plan.ts`, `install-archetype.ts`): `buildInitPlan` returns `{ report, apply }` (report = today's JSON-safe `InitPlanReport`, so `init-report.ts` and the dry run are unchanged; apply = manifest, `PreparedInstall`, the full-manifest `scanDest` result (`seen`, `drifted`), baseline records, removals, root migration, previous fingerprint). Inside it: ONE `prepareInstall`, ONE `scanDest` over the whole manifest (its labels feed `planWriteTargets` via a new optional `labels` input, so no second scan), ONE `planInitRemovals`, ONE `initRootMigration`, ONE `reinstallBaseline` read. The real run calls it once after the summary is answered "install" (a cancelled summary still builds no manifest — today's property). `confirmWriteTargets(cwd, targets)` takes the plan's `WriteTargetsPlan`; `assertNoExistingTargets(targets)` takes it too (one check: `--yes` has no prompt, so the old under-lock repeat goes). `runInstallArchetype(repoDir, cwd, run, planned)` consumes the plan: backup (`drifted` + replaced config + removal backups recomputed at delete time) → deletes → `installPrepared(…, planned.apply.prepared, seen)` → root docs → records → config (after `assertConfigFingerprintUnchanged` before the backup). `installManifest`, `preflightInstall` and the `reinstallBaseline` re-export deleted.
- **install-capabilities.ts:** `installCapabilities(repo, root, selection, manifest?, seen?)` keeps its contract (pre-flight, then copy) for its direct callers and tests; its body becomes `installPrepared(repo, root, selection, prepareInstall(...), seen)`, and `installPrepared` is exported for init, which already ran the pre-flight in its plan. Residual (named in the module): a type collision that appears during the prompt fails the write part-way (ApplyError names the files that landed), as a link created after the walk always did.
- **add** (`add.ts`, `add-picker.ts`): config loaded inside the lock (both paths), `assertConfigUnchanged` deleted; fingerprint check before the first write (named: before `resolveArchetypeAdd`'s backup; picker: after `groupMultiselect`, before the first pick). The picker cleanup C5.1 left: drop `cause?: FatalCause` from `AddResult`/`PickerAddOutcome` and the never-produced `PickerAddOutcome` `error` kind with add.ts's branch for it.
- **Loader rename (open question 3):** `loadConfigOrExit` → `loadConfig`, `loadArchetypeConfigOrExit` → `loadArchetypeConfig` (they throw `CliError`); callers in add, remove, update, uninstall, list, status.
- Records: a hand-edit of `pharn.records.json` during a prompt is overwritten by the run's next store (it was re-read by the old re-plan). Named residual in docs (pharn's own file; the lock keeps every pharn writer out).

## Files

- `src/lib/project-lock.ts` — refusal names "may be waiting for input in another terminal"; `ProjectChangedError` deleted; header + `withProjectLock` rule: a prompt may be held — layer lib
- `src/lib/pharn-config.ts` — delete `assertConfigUnchanged`/`configChangedError`; `assertConfigFingerprintUnchanged` throws `CliError.refusal` with the waiting wording; rename the two loaders — layer lib
- `src/lib/apply-update.ts` — `changedSince()` (one definition of "edited since the plan"), used by `applyWrites` — layer lib
- `src/lib/update-plan.ts` — `apply.seen` (plan-time destination hashes) — layer lib
- `src/lib/update-next.ts` — `nextRecordStore` keeps the previous record for a file the writer left unwritten — layer lib
- `src/commands/update.ts` — lock first; plan once; write-time verify (fingerprint, `changedSince`); removal backups recomputed at delete; `membershipKeys`/`membershipDrift`/re-plan deleted — layer command
- `src/lib/capability-removal.ts` — `removalBackupsNow()` (the backup set re-read at delete time) — layer lib
- `src/lib/capability-dir.ts` — `deleteCapabilityDir` refuses a symlinked component itself — layer lib
- `src/lib/init-plan.ts` — `buildInitPlan` → `{ report, apply }`, one prepare/scan/removals/migration/baseline — layer lib
- `src/lib/write-targets.ts` — `planWriteTargets` takes optional precomputed `labels`; `assertNoExistingTargets(plan)` — layer lib
- `src/steps/overwrite-check.ts` — `confirmWriteTargets(cwd, targets)` renders the plan's targets, no recompute — layer step
- `src/steps/install-archetype.ts` — `runInstallArchetype` consumes the plan; wrappers `installManifest`/`preflightInstall`/re-export deleted — layer step
- `src/lib/install-capabilities.ts` — export `installPrepared`; `installCapabilities` = pre-flight + it — layer lib
- `src/commands/init.ts` — lock first; consumes `buildInitPlan`; duplicate calls and the fingerprint re-check call deleted — layer command
- `src/commands/add.ts` — config inside the lock; fingerprint before first write; picker error-kind branch dropped — layer command
- `src/steps/add-picker.ts` — the type cleanup (no `cause`, no `error` kind) — layer step
- `src/commands/remove.ts` — lock first; one walk on the named path; fingerprint after the picker's confirm — layer command
- `src/lib/uninstall-plan.ts` — header: re-classification at delete time replaces the under-lock re-plan (comment) — layer lib
- `src/commands/uninstall.ts` — lock first; plan once; delete bucket re-classified before the first delete; fingerprint check — layer command
- `src/commands/list.ts` — loader rename only — layer command
- `src/commands/status.ts` — loader rename only — layer command
- `tests/commands/lock.test.ts` — NEW describe "a second pharn command while another waits for input is refused" (update confirm, init summary, remove picker confirm, uninstall confirm, add picker multi-select each run a second writer → exit 1, message names `pharn <cmd> (pid <process.pid>` and "may be waiting for input in another terminal", the first run then completes); the held-lock table: update/init now `downloads: false`; the "config rewritten between the read and the lock" describe rewritten in place (see Test changes) — layer test
- `tests/commands/update.test.ts` — planner spy (`vi.spyOn(updatePlanModule, 'buildUpdatePlan')`: one call per real run, incl. `--yes` and a confirm-answered run); a file edited during the confirm → refused, nothing written, edit kept; a file added to a dropped dir during the confirm → backed up before the delete; the two membership-guard tests rewritten/removed (see Test changes) — layer test
- `tests/commands/init.test.ts` — planner spy (`buildInitPlan` once per real run); a file edited during the overwrite confirm → backed up then written; the fingerprint test kept (wording); the `runInstallArchetype` "changed since its scan" test rewritten to the plan signature — layer test
- `tests/commands/update-dry-run.test.ts` — a dry run under a held lock still runs and leaves the lock untouched (no lock taken) — layer test
- `tests/commands/init-dry-run.test.ts` — a dry run under a held lock still runs and leaves the lock untouched (no lock taken) — layer test
- `tests/commands/uninstall.test.ts` — lock-held refusal now before the plan note; the "edited while the prompt was open is kept" and "config changed" tests kept; a parent swapped to a symlink during the confirm refuses with nothing removed — layer test
- `tests/commands/remove.test.ts` — config read under the lock; existing symlink tests unchanged — layer test
- `tests/commands/add.test.ts` — config read under the lock; existing symlink tests unchanged — layer test
- `tests/project-lock.test.ts` — refusal wording asserts the waiting sentence; no `ProjectChangedError` — layer test
- `tests/pharn-config.test.ts` — `assertConfigUnchanged` describe removed (function deleted); fingerprint describe asserts the `CliError` refusal + wording; loader rename (describe titles kept) — layer test
- `tests/write-targets.test.ts` — rewritten in place to the plan-taking signatures — layer test
- `tests/overwrite-check.test.ts` — rewritten in place to the plan-taking signatures — layer test
- `tests/install-capabilities.test.ts` — `installPrepared` writes without re-running the pre-flight; existing refusal tests unchanged — layer test
- `tests/capability-dir.test.ts` — unit cases for the new helpers (statically import each changed src file, real assertions) — layer test
- `tests/capability-removal.test.ts` — unit cases for the new helpers (statically import each changed src file, real assertions) — layer test
- `tests/apply-update.test.ts` — unit cases for the new helpers (statically import each changed src file, real assertions) — layer test
- `tests/update-plan.test.ts` — unit cases for the new helpers (statically import each changed src file, real assertions) — layer test
- `tests/update-next.test.ts` — unit cases for the new helpers (statically import each changed src file, real assertions) — layer test
- `tests/uninstall-plan.test.ts` — unit cases for the new helpers (statically import each changed src file, real assertions) — layer test
- `docs/commands/update.md` — the new order; what happens to an edit made while the prompt is open — layer docs
- `docs/commands/init.md` — the new order; what happens to an edit made while the prompt is open — layer docs
- `docs/commands/add.md` — the new order; what happens to an edit made while the prompt is open — layer docs
- `docs/commands/remove.md` — the new order; what happens to an edit made while the prompt is open — layer docs
- `docs/commands/uninstall.md` — the new order; what happens to an edit made while the prompt is open — layer docs
- `docs/troubleshooting.md` — lock section: the waiting wording; every writer holds the lock across its prompts; the "If the lock outlives its owner" paragraph — layer docs
- `docs/architecture.md` — TTY gate, init steps 6–7, the copy (prepareInstall once), remove, uninstall, update "plans before it asks" — layer docs
- `CLAUDE.md` — "The project lock" invariant: lock first, prompts held, write-time checks (no line growth) — layer docs
- `CHANGELOG.md` — **Changed** under `[Unreleased]`: "a second pharn command is refused while another waits for input" (+ the order change, the update-edit refusal) — layer docs
- `/private/tmp/…/scratchpad/patch-CORE-181.py` — NOT run: THREAT-MODEL.md §4d backstop sentence → the fingerprint check before the first write — protected file
- `tests/commands/list.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/commands/status.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/add-picker.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/archetype-summary.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/init-report.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/commands/clone-cleanup.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/dist-smoke.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/index.test.ts` — touched only where needed (static import, real assertions) — layer test
- `tests/overwrite-check.test.ts` — touched only where needed (static import, real assertions) — layer test
- `docs/contributing.md` — only where the old flow is described — layer docs
- `docs/reference/pharn-records.md` — only where the old flow is described — layer docs

## Test changes needing a decision (pharn-ci TI01/TI02)

- **Deleted** — `tests/pharn-config.test.ts` describe `assertConfigUnchanged` (its 3 `it`s: passes on an unchanged config; "refuses with ProjectChangedError when another run rewrote it"; absent/invalid counts as changed): the function is deleted.
- **Deleted** — `tests/commands/update.test.ts` "refuses when the membership itself differs under the lock, naming both sides": it edits the private clone during the confirm to change membership; with one plan there is no second membership to compare.
- **Rewritten, title changed** — `update.test.ts` "refuses when the locked re-plan would delete a directory the confirm did not show" → "a directory that comes back while the confirm is open is not deleted (the plan did not name it)", same arrange, now exit 0 with the notes intact.
- **Rewritten, title changed** — `lock.test.ts` describe "a config rewritten between the read and the lock refuses the writer": the remove-picker and update cases keep refusing (now the fingerprint check after the prompt); the named `remove`/`add` `it.each` (write right after the lock is created) now READ that config and keep its entry, and the control case stays. Describe → "a config edited while a writer waits for input refuses it".
- **Title changes from data** — `lock.test.ts` held-lock table `'$label (downloads first: $downloads)'`: `update --yes` and `init --yes` rows become `false`, so two full names change.
- Everything else is rewritten in place under its existing name.

## Contracts satisfied

- CLAUDE.md "The project lock" — rewritten: writers take the lock first and hold it across prompts; readers never take it.
- CLAUDE.md "Records are the proof" / "Back up before overwrite or delete" — unchanged rules, now enforced at write time against the one plan.
- CLAUDE.md "Destination symlink walks" / "Hard-link-safe writes" — the per-file walk in `applyWrites` and the new walk in `deleteCapabilityDir`; every existing symlink and hard-link test unchanged.
- CLAUDE.md "`--json` reports keep their `schemaVersion: 1` bytes" — dry runs and their JSON untouched.

## Evals to write (P1)

- second writer during update's confirm / init's summary / remove picker confirm / uninstall confirm / add picker → exit 1, names holder command + pid + "may be waiting for input in another terminal"; the first run completes
- each writing command with a held lock → refused before reading the config or fetching (`downloaded() === false`, incl. update and init)
- `buildUpdatePlan` called once per real update run; `buildInitPlan` once per real init run
- update: file edited during the confirm → exit 1, nothing written, edit intact; a file added in a dropped dir during the confirm → in the backup before the delete
- init: file edited during the overwrite confirm → backed up byte-identical, then written
- config hand-edited during a prompt (init, update, uninstall, remove picker, add picker) → refused, nothing written
- uninstall: a parent swapped to a symlink during the confirm → refused, nothing removed
- `deleteCapabilityDir` refuses a symlinked component; `changedSince` reports edited/appeared, ignores vanished/unchanged; `installPrepared` writes without a pre-flight; `nextRecordStore` keeps a left-unwritten file's old record
- dry runs under a held lock still run and take no lock
- every existing symlink-refusal and hard-link test passes unchanged

## Guarantee audit (P0)

- "a writer takes the lock before reading the config and holds it to the end" → floor: `withProjectLock` (O_EXCL create) + the command suites (held-lock table: no fetch, no write, config never read past the refusal).
- "a second command during a prompt is refused" → floor: O_EXCL + same-host liveness (`isDead`); test runs the second command inside the stubbed prompt.
- "planned once" → floor (test): the planner spies; advisory beyond the tested paths.
- "an edit made while a prompt is open is not overwritten" → floor: content-hash comparison at write time (`changedSince`/`applyWrites` `seen`, `planUninstall` re-classification, `removalBackupSet`) + tests. Residual (named): an edit landing between the last check and the write itself (milliseconds), and a hand-edit of `pharn.records.json` during a prompt.
- "no write through a link swapped in during a prompt" → floor: `findSymlinkComponent` at write time (`applyWrites`, `deleteCapabilityDir`, `planUninstall` parent walk). Not atomic with the syscall (unchanged residual).
- "pharn.config.json edited during a prompt is not overwritten" → floor: raw-bytes sha256 fingerprint compare before the first write.

## Trust audit (P2)

- No new untrusted input. The lock payload's `command`/`pid`/`host`/`startedAt` were already printed in the refusal (parsed and shape-checked by `parsePayload`); the added sentence is static.

## Determinism audit (P5)

- Every new branch is an equality/membership test (hash !== seen, fingerprint !==, `instanceof ProjectLockedError`, bucket membership). No new fallback guesses.

## Open questions (HALT) — recommended answers

1. **TTY gate vs. lock order.** Ticket: lock after the TTY gate, before the config. Recommended: lock right after the node floor/git prereq; keep each command's tested precedence (config error wins over the TTY gate in update/uninstall/the pickers), so the gate stays after the config read, inside the lock; init's gate stays before the lock. Alternative: literal ticket order — rewrites "that error wins over the TTY gate…" tests (renames) and the dist-smoke `update` row.
2. **update: a file edited while the confirm is open.** Recommended: refuse before any write, naming the file(s), nothing written; the re-run plans it `modified` and skips it (the edit is never overwritten). Literal "skip and continue" needs the planner's derived state re-derived (version withhold, `pendingSkillsVersion`, executable-unit hold, root-migration hold, frozen keys) — a second partial planner, which is what this ticket deletes. Same refusal under `--force` (the confirm named the forced files; an extra one is not what was confirmed).
3. **Loader rename.** Recommended: `loadConfig` / `loadArchetypeConfig`; keep the `describe('loadConfigOrExit')` titles in pharn-config.test.ts so no test name changes (TI02).
4. **Config check.** Recommended: keep `configFingerprint` + `assertConfigFingerprintUnchanged` as the one check, after the last prompt and before the first write, in all five writers; delete `assertConfigUnchanged`, `ProjectChangedError` and init's at-lock call.
5. **Test deletions/renames** listed above — OK to proceed (pharn-ci will flag TI01/TI02 on them)?

## GATE 1 — RESOLVED (2026-11-16, orchestrator for the user)

Approved. (1) Lock right after the node/git prereqs → config → TTY gate (tested precedence kept). (2) update refuses before any write naming the edited file, same under `--force`; the deviation from the AC wording goes in the PR body, the CHANGELOG line and docs/commands/update.md. (3) Rename to `loadConfig`/`loadArchetypeConfig` AND rename the `describe` titles. (4) One fingerprint check after the last prompt in all five writers. (5) The delete/rename list is accepted; listed in the PR body under "Test-integrity: expected findings". THREAT-MODEL.md: `patch-CORE-181.py` in the scratchpad, not run.
