# PLAN — retire the legacy root lock and backup notice (CORE-187, C6.2)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Rewrite `src/lib/project-lock.ts` to its essentials (≤ 250 lines of code, comments excluded)
  by removing the one-release compatibility with the root `.pharn.lock` (0.13.0 and older) and the corpse
  sweep, and remove `legacyBackupNotice` for the root `.pharn-backup/`; every other lock rule stays.
- layer(s): pharn-core (`src/lib`), commands/steps call sites, tests, user docs # ARCHITECTURE.md §4
- constitution_refs: [P0, P1, P3, P4, P6, P7]

## Files

- `src/lib/project-lock.ts` — rewrite: one lock site (`pharn/.lock`), no `LockSite`, no
  `LEGACY_LOCK_FILE`/`checkLegacyLock`/`legacySite`/`LEGACY_CORPSE_RE`/`CORPSE_RE`, no `sweepCorpses`;
  keeps O_EXCL create, payload `{pid, host, command, startedAt}`, refusal wording, C3.3 staleness
  (same-host kill(pid,0) + boot check; other host STALE_MS; malformed/future past MALFORMED_GRACE_MS),
  rename → re-verify → O_EXCL break with link(2) restore, own-payload-only release, exit listener
  (0 → 130), fatal-signal hook, directory refusal, `pharn/` create/remove-if-empty, ENOENT retry — layer core
- `src/lib/backup.ts` — drop `LEGACY_BACKUP_DIR` and `legacyBackupNotice` — layer core
- `src/commands/init.ts` — drop the dry-run notice call + import (CORE-189's lane; required by the removal) — commands
- `src/commands/update.ts` — drop the two notice calls + import (CORE-188's lane; required by the removal) — commands
- `src/steps/install-archetype.ts` — drop the notice call + import — steps
- `tests/project-lock.test.ts` — rewrite the legacy describe to assert a root `.pharn.lock` is ignored
  (live, stale, 7 h old, directory); rewrite the sweep test to assert corpse-named files are left alone;
  drop the `LEGACY_LOCK_FILE` import — tests
- `tests/backup.test.ts` — rewrite the `legacyBackupNotice` describe: the module no longer exports it,
  and `createBackup` writes under `pharn/.backup/` leaving a root `.pharn-backup/` untouched — tests
- `tests/commands/update.test.ts` — rewrite "points at an old root .pharn-backup/" to assert no notice
  is printed and the directory is left alone — tests
- `src/lib/root-migration.ts` — drop the `.pharn-backup` / `.pharn.lock` entries from the `.gitignore`
  hint table (the `.pharn` → `pharn/.run/` hint stays until root-migration retires in v0.22.0) — layer core
- `tests/root-migration.test.ts` — the hint test asserts the two old names are no longer hinted — tests
- `README.md` — the `.gitignore` sentence names only `.pharn/` (CORE-186's lane; required for P4) — docs
- `tests/commands/init-dry-run.test.ts` — `init --dry-run` prints no `.pharn-backup/` notice (exercises `src/commands/init.ts`; added after pharn-ci warned TESTS_NOT_EXERCISING_CHANGES) — tests
- `docs/troubleshooting.md` — drop the `.pharn-backup/` reminder paragraph, the "lock moved in 0.14.0"
  one-release paragraph and the root corpse-directory sentence; say leftovers are no longer read and
  may be deleted; fix the manual-uninstall step — docs
- `docs/commands/update.md` — note in the `.gitignore` bullet that pharn no longer reads the old root
  lock/backup paths themselves — docs
- `CHANGELOG.md` — `[Unreleased]` `### Removed` line naming 0.19.x as the last CLI that honoured them — docs
- `.dev/features/retire-legacy-lock/BUILD.md` — the build note

## Contracts satisfied

- CLAUDE.md "Invariants": project lock (taken before reading config, held across prompts), containment
  (`safeJoin`), destination symlink walk (`findSymlinkComponent` on `pharn`), bounded local reads
  (`readBoundedFile` for the lock) — all preserved, cited not restated (P4).
- Support policy (CORE-186): retire C6.2 in v0.20.0; CHANGELOG Removed names the last CLI (0.19.x).

## Evals to write (P1)

- live same-host lock → refused naming `pharn <command>` + pid + "may be waiting for input" (existing)
- dead same-host lock → broken and taken (existing)
- directory at `pharn/.lock` → refused, left in place (existing)
- `pharn/` created and removed when empty; refused when symlink/file (existing)
- fatal signal / exit(0) → released (existing)
- race: rename → re-verify → restore (existing tests/project-lock-break.test.ts, unchanged)
- NEW (rewritten): live / stale / old root `.pharn.lock` → ignored, run proceeds, file untouched
- NEW (rewritten): corpse-named neighbours of the lock → never deleted (no sweep)
- NEW (rewritten): `legacyBackupNotice` no longer exported; `update` prints no `.pharn-backup/` notice

## Guarantee audit (P0)

- "a live lock is never broken" → floor: O_EXCL create + rename-and-re-verify bytes (deterministic fs
  ops) + liveness by `kill(pid,0)`; PID recycling residual named (advisory side errs to refusing)
- "release never deletes another run's lock" → floor: payload pid+host equality before unlink;
  read-then-unlink race named as residual
- "pharn never deletes a file it did not create next to the lock" → floor: only `corpse` (our own
  random name from this call) is ever removed; the sweep's regex allowlist goes away with the sweep
- ".pharn.lock / .pharn-backup/ no longer read" → floor: no code path references them (grep + tests)

## Trust audit (P2)

- The lock file is user-editable local input: parsed with shape checks before `process.kill`, read via
  `readBoundedFile` (FIFO/huge file safe). Unchanged by this increment.

## Determinism audit (P5)

- Staleness is a fixed decision table over (parse ok, future-dated, host equality, boot time, kill
  result, age) — membership/compare tests only. Unchanged.

## Decisions (resolved, no open questions)

- Revised at build (human gate, recorded): the acceptance says `.pharn.lock` / `.pharn-backup/` are no
  longer read or mentioned in src or user docs, so root-migration's `.gitignore` hints for those two
  names go too; its `.pharn/` hint stays until `lib/root-migration.ts` retires in v0.22.0.
- THREAT-MODEL.md §4d names `checkLegacyLock` (human-owned): a python patch script goes to the
  scratchpad, not run.

## Open questions (HALT)

- none
