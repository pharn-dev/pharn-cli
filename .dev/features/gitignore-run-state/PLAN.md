# PLAN — `init` / `update` keep `pharn/.run/` and `pharn/.backup/` out of git

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn init` and `pharn update` make sure the project's root `.gitignore` covers `pharn/.run/` and `pharn/.backup/`, appending only the missing lines. The dry runs preview the change and the real runs report it.
- layer(s): `src/lib` (a new `.gitignore` axis + atomic text write), `src/steps` (init apply), `src/commands` (update apply), the report/render libs, tests, docs. Release 0.16.0.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]
- base: origin/main fe16608 (branch `feat/gitignore-run-state`)

## Live state (read this run, P6)

- **Trigger.** pharn-oss 7.2.0 fixed issue #408: reconcile counted PHARN's run state (`pharn/.run/`) as build escapes because installed projects do not ignore it. pharn-oss ≥ 7 writes run state at a FIXED `pharn/.run/` for every layout (`build-gate.mjs` `STATE_ROOT = "pharn/.run"`). pharn-oss's own `.gitignore` lists `pharn/.run/`, `pharn/.backup/`, `pharn/.lock*`.
- **This CLI never writes `.gitignore` today, and says so in several places:**
  - `src/lib/root-migration.ts` `gitignoreHints` reads it bounded and prints `… (pharn never edits .gitignore).`
  - `src/lib/backup.ts` `backupNoticeLines` always prints `pharn/.backup/ is not gitignored — add it to .gitignore …`.
  - `README.md` §172-174, `docs/commands/update.md` (522-524, 851), `docs/commands/add.md` (221-223), plus the notice examples in `remove.md` and `uninstall.md`.
- `root-migration.ts` already normalizes `.gitignore` lines (trim, one leading `/`, one trailing `/`, `/*`, `/**`, `*`). That is the same membership test this increment needs, so it moves to the new lib and both callers share it (P3).
- **Write sites.** `init`: `runInstallArchetype` (`src/steps/install-archetype.ts`, under init's `pharn/.lock`). `update`: `applyPlannedUpdate` (`src/commands/update.ts`, under `withProjectLock`). `add`/`remove`/`uninstall` stay out of scope.
- `init --yes` refuses when ANY of its write targets exists (`planWriteTargets`). `.gitignore` must NOT join that target set, or `init --yes` would refuse in nearly every project. It gets its own channel.
- Atomic writes: `writeJsonAtomic` / `copyFileAtomicSync` (`src/lib/atomic-write.ts`). There is no atomic text/Buffer writer yet.
- Bounded read: `readBoundedFile` (`src/lib/bounded-read.ts`). It returns `absent` / `unusable` / `ok {bytes}`, never throws, and FIFO/dir/oversize come back `unusable`.
- Tests that pin today's wording: `tests/backup.test.ts`, `tests/init-archetype.test.ts:808`, `tests/update.test.ts:2962/3069`, and `tests/commands-integration.test.ts:590`, which asserts `.gitignore` is byte-identical after a root migration.
- Release flow (CLAUDE.md "Releasing"): the bump travels in the PR and merging it IS the release (`publish.yml`). 0.15.0 → **0.16.0**: new behaviour, minor.
- Note: the floor hook runs from the MAIN checkout's cwd and reads its stale `.pharn/writes-scope.json`, so Write/Edit into this worktree is blocked whatever scope is set here. The worktree scope is set per stage (as the commands require), and writes go through Bash (the saved memory note on this hook).

## Behaviour (the spec this plan builds)

- **Entries:** `PHARN_GITIGNORE_ENTRIES = ['pharn/.run/', 'pharn/.backup/']` (see Q2).
- **Covered test (P5, membership on fixed literals).** A line is normalized by:
  1. dropping one trailing CR;
  2. trimming trailing whitespace only (git ignores unescaped trailing spaces, while a leading space is part of the pattern);
  3. dropping one leading `/` or `**/`;
  4. dropping one trailing `/`, `/*` or `/**`.

  An entry counts as **present** when a normalized line equals `pharn/.run` (or `pharn/.backup`). A bare `.run` / `.backup` also counts, because a slash-less pattern matches at any depth. A NEGATION (`!pharn/.run/` etc., the same normalization after the `!`) counts as the user's decision, so pharn never adds the entry. Comments (`#…`) never count.

  Broader patterns that also cover the path (`pharn/`, `pharn/.*`, `*`) are NOT recognized. pharn then appends its line, which is redundant but harmless. This limit is documented.
- **Append-only.** The new file's bytes START WITH the old file's exact bytes (Buffer concat, never a decode/re-encode). No existing line is reordered, rewritten or removed.
  - When the old file is non-empty and does not end in `\n`, one line ending is added first, as a separator.
  - Then come a comment line `# PHARN run state and update backups (added by pharn)` and each missing entry, each ending in a line ending.
- **Line endings:** CRLF when the old file's FIRST line ending is `\r\n`; otherwise LF. The rule is deterministic, and a missing file gets LF.
- **Missing file** → created with the comment and both entries (LF).
- **Idempotent:** both entries are present after a run, so a second run computes an empty addition and writes nothing (byte- and mtime-identical).
- **Refusals (never fatal, never written through), each one a `log.warn` naming the lines to add by hand:**
  - `.gitignore` is a symlink, or crosses a symlinked component (`findSymlinkComponent`);
  - it is not a regular file (dir/FIFO/device), or it is unreadable or oversize (`readBoundedFile` → `unusable`);
  - the write fails (EACCES, …).

  The install's own files have already landed by then, so a `.gitignore` problem warns instead of failing the run.
- **Write** = new `writeFileAtomic(target, data)` in `atomic-write.ts`, with the same exclusive temp, mode preservation and rename as `writeJsonAtomic`, which now delegates to it. So a hard-linked `.gitignore` is replaced, never written into.
- **Where:**
  - `init`: in `runInstallArchetype`, after `writePharnConfig` and before the root-migration moves, under init's lock. The outro gets a line `✔ .gitignore updated → pharn/.run/, pharn/.backup/` (or `created`). Nothing prints when nothing was added.
  - `update`: in `applyPlannedUpdate`, after the config write, under the lock. It prints `log.info` `Added pharn/.run/, pharn/.backup/ to .gitignore.` (or `Created .gitignore with …`).
- **Same-version `update` (see Q1, recommended B).** A missing entry RE-OPENS the same-version early return, the established bounded re-open pattern (`pendingRootMigration`, `findMissingInstalled`). The header note gets one line saying `.gitignore` is missing pharn's entries and this run adds them.

  The re-open counts only a `.gitignore` the run CAN write: an absent file, or a regular, non-symlinked, bounded-readable one. The opened run adds the lines and the next run early-returns. Residual: a regular file whose write fails (EACCES) re-opens every run. That is stated, the same shape as `pendingRootMigration`'s residual.
- **Dry runs** (they write nothing and share the planner):
  - text: `init --dry-run` and `update --dry-run` add one `PLAN` line, `.gitignore: would add pharn/.run/, pharn/.backup/ (would create it)`;
  - JSON: additive `gitignore: {action: 'create' | 'append', entries: string[]}` (`init --dry-run --json`, top level) and `plan.gitignore` (`update --dry-run --json`). The key is ABSENT when nothing would be added, the `absentUpstream` convention, so the existing byte pins hold and `schemaVersion` stays 1. A refusal shows as `{action: 'refused', reason}` (enum reason: `symlink` | `not-a-file` | `unreadable`).
- **The backup notice** (`backupNoticeLines`) prints its `.gitignore` advice ONLY when the project's `.gitignore` does not cover `pharn/.backup/`. It uses the same covered test, so `add`/`remove`/`uninstall` stop advising what is already done. Because `backupNoticeLines` is pure, it takes a `gitignored: boolean` input; `printBackupNotice` computes it.
- **root-migration** keeps its hints for old entries (pharn never rewrites a user's line) and imports the shared normalizer. Its parenthetical becomes `(pharn only appends its own entries; it never rewrites yours)`.
- **uninstall** leaves the lines in place: they are harmless, and removing user-file lines is a rewrite. This is documented.

## Files

- `src/lib/gitignore.ts` (NEW) — `PHARN_GITIGNORE_ENTRIES`, `normalizeGitignoreLine`, `coveredEntries(bytes)`, `gitignoreAddition(bytes | null)` (pure: the Buffer to append + the entries), `planGitignore(projectRoot)` (read-only: `{action: 'none' | 'create' | 'append', entries} | {action: 'refused', reason}`), `applyGitignore(projectRoot)` (re-plans, then writes atomically; returns the outcome; never throws a write error, it returns `{action: 'failed', reason}`). One axis: pharn's lines in the project `.gitignore`. — layer: lib
- `src/lib/atomic-write.ts` — add `writeFileAtomic(target, data: string | Buffer)`; `writeJsonAtomic` delegates to it, with byte-identical output. — layer: lib
- `src/lib/root-migration.ts` — use `normalizeGitignoreLine` from `gitignore.ts`; reword the parenthetical. — layer: lib
- `src/lib/backup.ts` — `backupNoticeLines(notice, {aborted, gitignored})`; `printBackupNotice` computes `gitignored` from `coveredEntries`. — layer: lib
- `src/steps/install-archetype.ts` — `applyGitignore` after the config write; the warning and outro line. — layer: steps
- `src/commands/update.ts` — `applyGitignore` in `applyPlannedUpdate`; the re-open signal plus its header line. — layer: commands
- `src/lib/update-plan.ts` — `report.gitignore` from `planGitignore`. — layer: lib
- `src/lib/update-report.ts` — additive `plan.gitignore` (absent when `none`). — layer: lib
- `src/lib/update-render.ts` — the dry-run PLAN line + a shared `gitignoreLines(outcome, tense)` renderer used by init too. Init and update share it through lib, never command→command (P3). — layer: lib
- `src/lib/init-plan.ts` — `InitPlanReport.gitignore`. — layer: lib
- `src/lib/init-report.ts` — additive top-level `gitignore`. — layer: lib
- `src/commands/init.ts` — the text dry run prints the line. — layer: commands
- `tests/gitignore.test.ts` (NEW) — the unit evals below. — layer: tests
- `tests/atomic-write.test.ts` — `writeFileAtomic` (Buffer + string, mode kept, hard link not written through). — layer: tests
- `tests/backup.test.ts`, `tests/init-archetype.test.ts`, `tests/update.test.ts` — adjust the advice assertions (shown both ways: covered → no advice; uncovered → advice). — layer: tests
- `tests/init-dry-run.test.ts`, `tests/update-dry-run.test.ts` — the preview line + the JSON key present/absent; the whole-tree snapshot proves no write. — layer: tests
- `tests/commands-integration.test.ts` — real `init --yes` creates/appends `.gitignore`; a real `update --yes` at the same version with the entries present early-returns, and with one removed re-opens and re-adds it. Line 590's expectation becomes "old lines kept byte-for-byte as the prefix, pharn's lines appended". — layer: tests
- `tests/root-migration.test.ts` — the parenthetical wording, if pinned. — layer: tests
- `README.md`, `docs/commands/init.md`, `docs/commands/update.md`, `docs/commands/add.md`, `docs/commands/remove.md`, `docs/commands/uninstall.md`, `docs/troubleshooting.md` (only if it repeats the rule) — the "never edits `.gitignore`" sentences become the append-only rule, plus the JSON key rows. — layer: docs
- `CLAUDE.md` — one paragraph on the `.gitignore` axis (it is the architecture map). — layer: docs
- `CHANGELOG.md` — `## [0.16.0] — 2026-11-02` with an `### Added` entry + compare links. — layer: docs
- `package.json`, `package-lock.json` — `npm version --no-git-tag-version 0.16.0`. — layer: release

### Files added by amendment (human-approved 2026-11-02, after the regress scope check flagged them)

- `src/commands/add.ts`, `src/commands/remove.ts` — pass `gitignored: backupDirIgnored(cwd)` to the backup notice — layer: commands
- `src/commands/uninstall.ts` — the same, plus the PLAN note names the `.gitignore` lines it leaves — layer: commands
- `tests/uninstall.test.ts` — pins that wording — layer: tests
- `tests/init-report.test.ts`, `tests/update-report.test.ts` — fixtures gain `gitignore: {action: 'none'}` — layer: tests
- `tests/init-dry-run-json.test.ts`, `tests/update-dry-run-json.test.ts` — the JSON `gitignore` / `plan.gitignore` evals — layer: tests
- `tests/release-consistency.test.ts` — `v0.15.0` joins `KNOWN_TAGS` (it exists on origin) — layer: tests
- `.dev/features/gitignore-run-state/PLAN.md`, `.dev/features/gitignore-run-state/GRILL.md`, `.dev/features/gitignore-run-state/BUILD.md`, `.dev/features/gitignore-run-state/REGRESSION.md`, `.dev/features/gitignore-run-state/regression-report.json`, `.dev/features/gitignore-run-state/VERIFY.md`, `.dev/features/gitignore-run-state/verify-report.json`, `.dev/features/gitignore-run-state/REVIEW.md`, `.dev/features/gitignore-run-state/SHIP.md` — the pipeline's own artifacts — layer: dev-loop
- `.pharn/writes-scope.json` — the per-stage scope file (local state; restored before push) — layer: dev-loop

## Contracts satisfied

- CLAUDE.md "Releasing": the bump + the CHANGELOG section travel in the PR; `tests/release-consistency.test.ts` checks them.
- CLAUDE.md JSON-report convention: additive keys absent when empty, `schemaVersion` 1 kept (`absentUpstream`/`plan.orphans` precedent).
- CLAUDE.md "the dry run reaches no write function" (`snapshotTree` pins), extended to `applyGitignore`/`writeFileAtomic`.
- `init --yes` never-overwrite contract: `.gitignore` stays outside `planWriteTargets`, so `--yes` behaviour is unchanged.

## Evals to write (P1)

- missing `.gitignore` → created, exactly `# PHARN …\npharn/.run/\npharn/.backup/\n`
- existing LF file without entries (`node_modules\n`) → old bytes are the prefix; comment + both entries appended
- existing file without a trailing newline (`node_modules`) → one `\n` separator, then the block
- each equivalent spelling present (`pharn/.run/`, `/pharn/.run/`, `pharn/.run`, `pharn/.run/**`, `pharn/.run/*`, `**/pharn/.run/`, `.run/`, `pharn/.run/   ` with trailing spaces) → that entry is not added (the other one still is)
- `  pharn/.run/` (LEADING space) → NOT counted (git reads it as a different pattern), so the entry is added
- comment `# pharn/.run/` → not counted
- negation `!pharn/.run/` → counted as decided, so the entry is not added
- both present → no write (bytes and mtime unchanged)
- CRLF file (`a\r\nb\r\n`) → appended lines use `\r\n`, old bytes are the prefix, no bare `\n` introduced
- second `applyGitignore` → `none`, file unchanged
- `.gitignore` is a symlink → refused, link and target untouched; a directory → refused; a FIFO → refused without hanging
- hard-linked `.gitignore` → replaced, and the other link keeps the old bytes
- `writeJsonAtomic` output byte-identical after delegating (the existing tests stay green)
- backup notice: advice shown when uncovered, omitted when covered
- `init --dry-run` / `update --dry-run` (text + JSON): line / key present when needed, absent when not; tree unchanged
- integration: `init --yes` fresh → `.gitignore` has both; `update --yes` same version, entries present → `up-to-date`; one entry deleted → re-opens, re-adds, next run `up-to-date`

## Guarantee audit (P0)

- "existing `.gitignore` bytes are never rewritten, reordered or removed" → floor: Buffer prefix (`Buffer.concat([old, addition])`), asserted byte-for-byte by tests
- "no entry is duplicated across the recognized spellings" → floor: regex/literal membership over normalized lines (P5)
- "idempotent" → floor: the addition is a pure function of the bytes; it is empty once both entries are covered, and an empty addition does not write
- "never written through a symlink or a hard link" → floor: `findSymlinkComponent` + lstat regular-file check + exclusive-temp-then-rename
- "the dry run writes nothing" → floor: `snapshotTree` + zero-call spies (existing pattern)
- "run state will never be committed" → **advisory.** A `.gitignore` line does not untrack files already committed, and a user can delete it or force-add. Broader covering patterns are not recognized (redundant append only). This is stated in the docs.
- "the same-version re-open is bounded" → floor for the counted cases (only a writable-shaped file counts). The EACCES residual is named.

## Trust audit (P2)

- `.gitignore` is project content (user-owned, possibly hostile checkout). It is read bounded (`readBoundedFile`, `O_NONBLOCK`, regular-file `fstat`, 16 MiB cap) and only membership-tested against fixed literals. Its text is never echoed to the terminal, never executed, and never drives a path join. The only write target is the fixed `safeJoin(root, '.gitignore')`.

## Determinism audit (P5)

- Every branch is a membership test (normalized-line ∈ fixed set; first line ending is `\r\n`; lstat type). Anything unrecognized falls to "append" (harmless) or "refused + warn naming the lines" — never a guess that removes or rewrites.

## Open questions (resolved by the human, 2026-11-02)

- Q1 same-version `update` with entries missing → **B: re-open the early return** (bounded, like `pendingRootMigration`).
- Q2 entries → **the two asked for** (`pharn/.run/`, `pharn/.backup/`).
- Plan → **approved as written**.
