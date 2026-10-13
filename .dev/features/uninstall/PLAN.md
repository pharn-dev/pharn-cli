# PLAN — uninstall: `pharn uninstall` removes what pharn provably wrote, and nothing else

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: Add an offline `pharn uninstall` command that deletes every file a USABLE `pharn.records.json` proves pharn wrote and nobody changed (sha256 equal to its record, path inside pharn's install surfaces), leaves edited/unrecorded files in place and lists them, removes directories left empty (rmdir only, bottom-up, stopping at the project root), backs up then deletes `pharn.config.json` and deletes `pharn.records.json`, never edits `.claude/settings.json` but prints the hook entries that still reference a hook script it removed. Closes finding F-13 (Medium, ux/docs): no uninstall command and no documented removal procedure.
- layer(s): CLI command (`src/commands/uninstall.ts`, new verb) + one new lib leaf (`src/lib/uninstall-plan.ts`) + additive exports in `src/lib/install-manifest.ts` and `src/lib/hook-wiring.ts` + dispatch (`src/index.ts`) + tests + user-facing docs. No `pharn-contracts` change. No trusted-doc edit by the agent.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (read this run, P6)

- `src/index.ts`: `USAGE` (commands + per-command options), `MAX_POSITIONALS` (Map, incl. command word), `ALLOWED_FLAGS` (Map; `DECLARED_FLAGS` derived from it), `REQUIRED_WITH` (update only), `ALIASES` (`y`→`yes`, granted per command by the row), dispatch `switch`. No uninstall anywhere. `-y, --yes` USAGE line says "update: …".
- `src/commands/remove.ts`: the offline precedent — `loadArchetypeConfigOrExit` before the lock, `refuseSymlinkedTargets` (`findSymlinkComponent`, exit 1, nothing written) before the lock, confirm BEFORE the lock (`interactiveAllowed` gate off a TTY), then `withProjectLock(cwd,'remove', …)` → `assertConfigUnchanged` → records baseline read once (`recordsBaseline(readRecords(cwd), {skillsVersion, commit}).records`) → backup (`createBackup`, announced at creation via `log.info`) → delete → prune → config. `ProjectLockedError` (incl. `ProjectChangedError`) and its own `RemoveBackupError` → `logError` + exit 1.
- `src/lib/install-records.ts`: store `{schemaVersion:1, skillsVersion, commit, files}`; `readRecords` never throws (`ok`/`absent`/`invalid` with message); `recordsBaseline` → `records | null` + `note` (stamp mismatch named). Keys are validated (no `..`/`.` segment, not absolute, not drive-absolute) and "never path-joined" by existing consumers (they iterate the manifest). `MODELS_RECORD_KEY` = `pharn.config.json#/models` is a non-file key.
- `src/lib/install-manifest.ts` `collectExpectedInstallPaths` is the ONE definition of what an install writes: capability dirs at `capabilitySubtree`, top-level `.claude/commands/pharn-*.md` minus `pharn-dev-*`, top-level `.claude/hooks/*.cjs` minus `*.test.cjs`, `paths.docs`, `paths.license.to`, the features README (`resolveFeaturesReadme` — either `pharn/features/README.md` or root `features/README.md` on the pharn layout), `paths.contracts/`, `paths.core/`, `paths.floor/` minus tests and `test-fixtures/`. It needs the CLONE; uninstall has none.
- `src/lib/hook-wiring.ts`: private `readSettings` (bounded, `O_NONBLOCK`, symlinked-`.claude/` refusal, follows a symlinked leaf on the project side), exported `hookEntries`, `displayHook` (escaped via `escapeUnsafe`, capped 300 chars). Header: "Project content is never printed".
- Hook commands upstream: `node .claude/hooks/x.cjs`, `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/x.cjs`, and exec form `command: 'node', args: [...]` (tests/hook-wiring.test.ts).
- `src/lib/backup.ts` `createBackup(projectRoot, rels)` → `.pharn-backup/<ts>`; refuses a symlinked `.pharn-backup` / symlinked components.
- `src/lib/project-lock.ts` `withProjectLock(cwd, command, fn)`; `command` is a free string; release removes `.pharn.lock` on success, throw, exit and fatal signal — independent of the config, so deleting the config inside the lock is fine.
- `src/lib/pharn-config.ts` `loadConfigOrExit`: absent config → "No pharn.config.json found. Run `pharn init` first." exit 1; legacy module config → `LEGACY_CONFIG_MESSAGE` exit 1.
- `src/lib/capability-picker.ts` `interactiveAllowed({stdinIsTTY, stdoutIsTTY})`; `tests/source-hygiene.test.ts` pins that no other `isTTY` read exists.
- `src/commands/update.ts`: the same-version early return does NOT rebuild an absent store, so "run `pharn update` first" is not a reliable remedy for missing records — the refusal must point to the manual procedure instead.
- `src/steps/overwrite-check.ts` `MAX_LISTED = 10` — the existing cap for listing paths in a prompt.
- Docs: `docs/commands/{init,add,remove,update,list,status}.md`, `docs/README.md` (index), `docs/troubleshooting.md`, `docs/reference/pharn-records.md`, `README.md` (command list; line ~169 names `.pharn/` runtime scratch and `.pharn-backup/`), `CLAUDE.md`, `CHANGELOG.md` `[Unreleased]`. No doc mentions uninstalling.
- Trusted docs that enumerate the verbs: `CONSTITUTION.md` P3 parenthetical "(`init`/`add`/`remove`/`update`/`list`/`status`)"; `LIMITS.md` §1d covers `remove` offline. Both human-only (see Open question 7).

## Design

### What uninstall deletes (the rule — membership + byte equality, P5)

For every key `rel` in a USABLE record store (excluding `MODELS_RECORD_KEY`):

| condition (evaluated in order)                                    | bucket      | action        |
| ----------------------------------------------------------------- | ----------- | ------------- |
| `rel` is not an install-surface path (`isInstallSurfacePath`)     | `outside`   | left, counted |
| a component of `rel` below the root is a symlink                  | `unsafe`    | REFUSE whole run |
| absent on disk                                                    | `absent`    | nothing       |
| present but not a regular file (dir, FIFO, symlinked leaf, …)     | `notFile`   | left, listed  |
| regular file, `sha256File` ≠ record                               | `edited`    | left, listed  |
| regular file, `sha256File` = record                               | `delete`    | unlinked      |

- Files pharn has NO record of are never candidates — the store is the only proof (unrecorded files in pharn's dirs survive, and keep their directory alive).
- `isInstallSurfacePath(rel, layout)` (NEW, in `install-manifest.ts`, next to the manifest it mirrors): a pure string-membership predicate describing the SHAPE of every path `collectExpectedInstallPaths` can produce at that layout (capability subtree `/<name>/…`, top-level `.claude/commands/pharn-*.md` not `pharn-dev-*`, top-level `.claude/hooks/*.cjs` not `*.test.cjs`, exact docs, license dest, both features-README spellings, `contracts/`, `core/`, `floor/` prefixes). Defense in depth: the store is local and committed, so a hand-edited (or malicious-PR) key like `src/app.ts` with its current hash must not be enough to delete a user file. A key outside the surfaces is left alone and counted. A mirror test pins that every path a real `installCapabilities` run records satisfies the predicate.
- Keys are joined into paths ONLY after passing that predicate, through `safeJoin`, and after a `findSymlinkComponent` walk — the first consumer that joins a record key, stated in the store's header comment.

### Directories

After the unlinks, for each deleted file walk its parent chain upward and `rmdirSync` each directory (non-recursive — the kernel refuses a non-empty directory, ENOTEMPTY/EEXIST, which ends that climb); never the project root, never above it. A directory that still holds anything (a user's feature folder under `pharn/features/`, an unrecorded file, an edited file, `.claude/settings.json`) is left by construction. Directories left non-empty are listed (deduped, capped at `MAX_LISTED`).

### Config, records, lock, backups

- Order inside the lock: `assertConfigUnchanged` → re-read the records baseline and RE-PLAN (the pre-prompt plan is advisory, as `init`'s; the in-lock plan is authoritative) → refuse on `unsafe` → `createBackup(cwd, ['pharn.config.json'])`, announced at creation → unlink the `delete` bucket → rmdir empties → unlink `pharn.records.json` → unlink `pharn.config.json` (LAST: it is the "installed" marker, so any earlier failure leaves a state a re-run of `pharn uninstall` finishes — deleted files are then simply `absent`).
- A failed unlink/rmdir (other than ENOENT / not-empty) stops the run: exit 1, names the file, says how many were already deleted, config + records untouched so a re-run continues. A failed config backup → exit 1, nothing deleted.
- `.pharn.lock` is released by `withProjectLock` as usual. `.pharn-backup/` (earlier backups + the config backup) is left in place and named in the outro.

### Hooks (`.claude/settings.json` is never written)

- NEW export in `hook-wiring.ts`: `hooksReferencing(projectRoot, scriptRels)` → per project settings file (`settings.json`, `settings.local.json`) the hook entries whose `command` or any `args` element CONTAINS one of `scriptRels` as a substring (deterministic string membership), or an `unreadable` note. Reuses `readSettings`/`hookEntries`; lines rendered with `displayHook` (escaped + capped). Header updated: project entries are now printed too, but only through `displayHook`.
- `scriptRels` = recorded `.claude/hooks/*` paths that are absent after the run (deleted now or already gone). Printed as a `HOOKS` note: "still wired in <file> — remove these by hand", or nothing when none.

### Command flow (`src/commands/uninstall.ts`)

1. `intro('pharn uninstall')`; absent `pharn.config.json` → benign "PHARN is not installed here" (see OQ 3); else `loadArchetypeConfigOrExit`.
2. Records baseline; `null` → refuse exit 1 naming the reason (`note` or "no pharn.records.json") and pointing at the manual procedure in `docs/troubleshooting.md`. Nothing written.
3. Plan (`planUninstall`, read-only); `unsafe` → refuse exit 1, nothing written.
4. Print a `PLAN` note: N files to delete, edited files kept (listed, capped), not-a-file kept, recorded-but-gone count, outside-surface count.
5. `--yes` → no prompt; else `interactiveAllowed` false → refuse exit 1 ("run in a terminal or pass --yes"); else `confirm` default No (cancel → `cancelAndExit`).
6. `withProjectLock(cwd, 'uninstall', …)` as above.
7. Outro: deleted N files / M dirs; kept files listed; dirs left non-empty listed; HOOKS note; config backup path; `.pharn-backup/` left.

Imports no repo/fetch module (zero network). No `--dry-run`, no `--force`, no `--json` (P7 — no triggering need; the confirm's plan note is the preview).

### Dispatch (`src/index.ts`, localized edits)

USAGE line `uninstall   Remove PHARN files pharn wrote and you did not change`; `-y, --yes` → "update, uninstall: skip the confirmation prompt"; `MAX_POSITIONALS` `['uninstall', 1]`; `ALLOWED_FLAGS` `['uninstall', ['yes']]`; `case 'uninstall': await runUninstall({ yes: Boolean(argv.yes) })`.

## Files

- `src/commands/uninstall.ts` — NEW: the command (gates, plan note, confirm, lock, deletes, rmdir climb, config backup + deletes, outro, HOOKS note) — layer: command
- `src/lib/uninstall-plan.ts` — NEW: `planUninstall(projectRoot, layout, records)` → buckets (read-only, never writes) — layer: lib
- `src/lib/install-manifest.ts` — add `isInstallSurfacePath(rel, layout)` beside the manifest it mirrors — layer: lib
- `src/lib/hook-wiring.ts` — add `hooksReferencing(projectRoot, scriptRels)` + header note — layer: lib
- `src/lib/install-records.ts` — header comment only: `uninstall` joins keys after the surface predicate + `safeJoin` + symlink walk — layer: lib
- `src/index.ts` — USAGE, `MAX_POSITIONALS`, `ALLOWED_FLAGS`, import, dispatch case — layer: dispatch
- `tests/uninstall-plan.test.ts` — NEW: bucket unit tests — layer: tests
- `tests/uninstall.test.ts` — NEW: command integration (clack mocked, real fs) — layer: tests
- `tests/install-manifest.test.ts` — `isInstallSurfacePath` cases + mirror pin against a real install (both layouts) — layer: tests
- `tests/hook-wiring.test.ts` — `hooksReferencing` cases — layer: tests
- `tests/index.test.ts` — dispatch, `--yes`/`-y` accepted, `--force` refused, extra positional refused — layer: tests
- `tests/project-lock-commands.test.ts` — uninstall refuses under a held lock / changed config (if the file's pattern fits) — layer: tests
- `docs/commands/uninstall.md` — NEW: usage, what is/is not deleted, hooks, refusals, exit codes — layer: docs
- `docs/troubleshooting.md` — "Removing PHARN by hand" procedure (when records are unusable) — layer: docs
- `docs/README.md` — index entry — layer: docs
- `docs/reference/pharn-records.md` — uninstall reads the store (and is the one consumer that deletes by it) — layer: docs
- `docs/contributing.md` — test-file table rows if that table lists test files (check at build) — layer: docs
- `README.md` — command list + safety-model bullet — layer: docs
- `CLAUDE.md` — dispatch tables (`ALLOWED_FLAGS`/`MAX_POSITIONALS` prose) + a `pharn uninstall` architecture paragraph — layer: docs
- `CHANGELOG.md` — `### Added` under `## [Unreleased]`; no version bump — layer: docs

## Contracts satisfied

- No `pharn-contracts` file governs the CLI's own commands. Reused unchanged (P4): `recordsBaseline` stamp contract, `createBackup`, `withProjectLock`/`assertConfigUnchanged`, `interactiveAllowed`, `displayHook`/`escapeUnsafe`.

## Evals to write (P1)

Unit — `planUninstall`:
- recorded + unchanged → `delete`; recorded + edited → `edited`; recorded + absent → `absent`
- recorded path that is a directory / FIFO / symlinked leaf → `notFile` (never hashed, never followed)
- symlinked intermediate component → `unsafe`
- key outside surfaces with matching hash (`src/app.ts`) → `outside`, never deleted
- `MODELS_RECORD_KEY` ignored; unrecorded file in a capability dir → in no bucket
- both layouts (flat and `pharn/`)

Unit — `isInstallSurfacePath`: accepts each surface shape; rejects `pharn-dev-*` commands, nested hook files, `*.test.cjs`, floor tests/fixtures, `src/…`, `pharn/features/<feature>/…`, the config/records files; mirror: every key of a real `installCapabilities` + `buildRecords` run satisfies it.

Unit — `hooksReferencing`: string-form, `$CLAUDE_PROJECT_DIR` form, exec-form args match; unrelated hook not listed; both files read; unreadable file reported; symlinked `.claude/` refused; escaping of control chars.

Integration — `runUninstall` (`--yes` unless stated):
- full install fixture → every recorded unchanged file deleted, empty dirs removed, config + records gone, config backup at `.pharn-backup/<ts>/pharn.config.json` byte-identical, `.pharn.lock` gone, exit normal
- an edited CONSTITUTION.md and a user file in `pharn/features/my-feature/` → both survive with bytes intact; their dirs survive; listed
- unrecorded file inside a capability dir → survives, dir survives
- `.claude/settings.json` byte-identical after; HOOKS note lists the entry referencing a deleted hook script, not unrelated ones
- no records / stale-stamped records → exit 1, tree byte-identical (whole-tree snapshot)
- symlinked `pharn/` → exit 1, nothing deleted, outside target untouched
- off a TTY without `--yes` → exit 1, nothing written; TTY confirm declined → nothing written; TTY confirm accepted → runs
- config changed while the prompt was open → exit 1, nothing deleted
- unlink failure part-way (read-only dir) → exit 1, config + records intact, re-run finishes the job
- absent config → behaviour per OQ 3
Dispatch: `pharn uninstall --force` → "Unsupported option"; `pharn uninstall x` → "Unexpected argument"; `pharn uninstall -y` dispatches with `yes: true`.

## Guarantee audit (P0)

- "uninstall deletes only files pharn wrote and nobody changed" → floor: record-key membership + sha256 equality against a stamp-checked store (`recordsBaseline` exact match) + `isInstallSurfacePath` membership + `safeJoin` + `findSymlinkComponent`. Stated limit: the store is local and hand-editable; someone who rewrites a record AND it matches a file inside pharn's surfaces can opt that file in — the surfaces bound the damage to paths pharn installs.
- "never deletes a non-empty directory" → floor: `rmdirSync` (non-recursive) — the kernel refuses ENOTEMPTY; no recursive delete anywhere in the command.
- "never writes `.claude/settings.json`" → by construction (no write call reaches it); pinned by a byte-identity test. The hook listing is advisory: textual substring matching, an equivalent hook spelled differently (or through a wrapper script) is not found — stated in the note and the docs.
- "nothing deleted on a refusal" → control flow (refusals precede the first unlink), tested with whole-tree snapshots — not a floor primitive, labelled as such.
- "a partial failure is resumable" → ordering argument (config deleted last), advisory, tested once.
- NOT claimed: atomicity of the whole uninstall; removal of `.pharn/` runtime scratch or `.pharn-backup/` (left, named); removal of files pharn has no record of.

## Trust audit (P2)

- No fetched input: zero network, no repo module imported. Inputs: the validated config (layout via `configLayout`), the local record store (untrusted, user-editable: keys validated by `readRecords`, then surface-membership + `safeJoin` + symlink walk before any join; values compared, never executed), project settings files (read bounded/non-blocking, printed only through `displayHook` escaping). File contents are hashed, never parsed or executed.

## Determinism audit (P5)

- Branches: key membership, surface-predicate string membership, `lstat` type, sha256 string equality, `rmdir` errno. Unknown terminals: no usable store → refuse (never guess); symlinked component → refuse; non-TTY without `--yes` → refuse.

## Out of scope (P7)

- `--dry-run` / `--json` / `--force` for uninstall; editing settings files; deleting `.pharn/` or `.pharn-backup/`; uninstalling a legacy (module) install; any change to other commands; version bump; trusted-doc edits by the agent.

## Open questions (HALT)

1. **Edited/unrecorded files: leave-and-list vs back-up-and-delete.** Recommended: LEAVE in place and list (your lean). Uninstall never destroys or relocates user work; the project afterwards holds only files the user owns. Alternative: back up to `.pharn-backup/<ts>/` then delete (mirrors `remove`, cleaner tree, but the user hunts for their edits).
2. **`pharn.config.json`: back up before deleting?** Recommended: YES, always — one file, announced, it may hold user-owned keys (`testResults`/`ship`/`gates`/`budget`), `seam`, an edited `models` block that `init` would otherwise not recover. Alternatives: delete without backup; or back up only when it holds something beyond what pharn wrote (more logic, less predictable).
3. **No `pharn.config.json` at all.** Recommended: benign "PHARN is not installed here (no pharn.config.json). Nothing was removed." exit 0 — makes a re-run after success idempotent and avoids `loadConfigOrExit`'s "Run `pharn init` first" wording. Existing config that is unreadable/legacy → `loadArchetypeConfigOrExit`'s exit 1 unchanged. Alternative: plain `loadArchetypeConfigOrExit` (exit 1 with "Run pharn init first").
4. **Surface allowlist (`isInstallSurfacePath`).** Recommended: YES — record keys outside pharn's install surfaces are never deleted even when the hash matches (a committed store can be edited in a PR). Alternative: trust every valid key (simpler; relies on the hash alone).
5. **Order of the final two unlinks.** Recommended: records → config (config last = "installed" marker; a crash between leaves a config with no records, which the refusal message explains — the manual procedure is then one `rm`). Alternative: config → records (leaves an orphan records file the CLI never looks at).
6. **HOOKS note scope.** Recommended: entries in `settings.json` / `settings.local.json` whose command/args contain a recorded `.claude/hooks/*` path that is absent after the run. Alternative: any deleted path (wider, false positives on e.g. doc names).
7. **Trusted docs (human-only).** `CONSTITUTION.md` P3's verb list and `LIMITS.md` (an uninstall residual: settings wiring is reported not removed; unrecorded files survive; a hand-edited store inside the surfaces) would go stale/incomplete. Recommended: I do NOT edit them; I hand over exact replacement text at GATE 2.

## Resolved decisions (GATE 1, 2026-10-13)

GATE 1 passed: "approved as written".

1. Edited/unrecorded files → left in place and listed.
2. `pharn.config.json` → always backed up to `.pharn-backup/<ts>/` before it is deleted.
3. Missing config → "PHARN is not installed here (no pharn.config.json). Nothing was removed." exit 0; unreadable/legacy config → exit 1 unchanged.
4. Only keys passing `isInstallSurfacePath` are ever deleted, even when the hash matches; the `outside` keys are counted AND named in the PLAN note.
5. Records deleted first, config last.
6. HOOKS note limited to recorded `.claude/hooks/*` scripts that are absent after the run.
7. `CONSTITUTION.md` / `LIMITS.md` not edited by the agent; exact replacement text handed over at GATE 2.
8. (Added at GATE 1) The PLAN note AND the final summary state plainly that `.pharn-backup/` directories and `.claude/settings.json` are left untouched.
