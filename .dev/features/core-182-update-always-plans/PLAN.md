# PLAN — core-182-update-always-plans (Linear CORE-182, C5.3, epic CORE-154)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn update` drops its same-version early return and the signals that re-open it; every run (real and dry) downloads and plans, and an empty plan (C1.5's `changesNothing`) is "Up to date": no prompt, no write, exit 0, and in `--dry-run --json` `status: "up-to-date"` with `plan: null`. The ahead-of-source (downgrade) guard stays, before the download.
- base: origin/main @ 0f90e6fd (C1.1/C1.4/C1.5, C5.1, C5.2, C5.4, C5.5, C5.6 merged). Branch `przemek/core-182-c53-update-always-plans-up-to-date-means-an`.
- layer(s): pharn-cli `src/` (commands, lib), `tests/`, `docs/`, `CLAUDE.md`, `CHANGELOG.md`. No protected file needs a change (THREAT-MODEL.md / LIMITS.md / ARCHITECTURE.md never mention the early return; checked by grep this run).
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

## Why (discovery, live state this run)

- `update.ts:301-375` gates on `current && !force` plus EIGHT re-open signals: `recheckFrozen`, `modelsMigrationPending` (models-update.ts), `switchChannel`, `findMissingInstalled` (missing-installed.ts), `agentSurfaceMissing` (agent-surface.ts — not in the ticket's list, same kind), `pendingRootMigration` (root-migration.ts), `gitignorePending(planGitignore)`, `prettierignorePending(planPrettierignore)`. `recordsStampStale` is already gone (C1.4). Header-note lines for each at `update.ts:377-455`.
- C1.5 already gives the planner `changesNothing`/`stateChanges` (`update-next.ts`), the real run's `unchangedOutcome` path (no confirm, no write; outro `Up to date.` / `Nothing to change.` from `noChangeVerdict`), and the text dry run's `Nothing would be written.` + `Dry run — Up to date. …` outro. `--json` today emits `status: 'planned'` + `plan.changesNothing: true` (added in 0.20.0, unreleased).
- KEEP (still used): `gitignorePending` (update-next.ts `changesNoFiles`, gitignore.ts:155), `prettierignorePending` (update-next.ts), `needsModelsConversion` (status.ts, status-report.ts). `AGENTS_FROM_SKILLS_VERSION` (constants.ts) is used only by agent-surface.ts.
- Spike (applied, run, reverted; diff kept at scratchpad `spike182.diff`): removing the gate and the re-open block makes 29 tests fail across `tests/commands/update.test.ts` (25) and `tests/commands/update-dry-run.test.ts` (4); every other command suite, `dist-smoke` and `lock` stay green. tsc and eslint clean.
- User-visible strings that promise the old behaviour: `status.ts` LAYOUT and MISSING notes ("If it answers \"Already up to date\", `pharn update --force` …"), `remove.ts` `warnIfAutoSelected` ("Until then `pharn update` may answer \"Already up to date\" and leave it removed"). A plain update now restores missing files, moves a layout and re-adds a removed auto capability, so those sentences become false (P4).
- Vendored `.agents/skills/pharn-cli/` (not edited) states the old rule in `references/json.md:63,107`, `references/commands.md:70-72,93` and `SKILL.md:115-125` → reported for an upstream pharn-dev/skills fix.
- Stale, not this ticket's: `docs/commands/update.md` "Concurrency" still says the lock is taken AFTER the confirm (C5.2 changed that). Fixed here since the section is rewritten anyway (P4).

## Design

**`src/commands/update.ts`**

- Delete the version gate and all re-open computations (`current`, `recheckFrozen`, `baselineRecords`, `convertModels`, `switchChannel`, `missing`, `agentMissing`, `rootDoc`, `gitignoreMissing`, `prettierignoreMissing`), the `Already up to date (skills v…)` outro and the header-note lines for each signal. Imports go: `gitignorePending`, `planGitignore`, `prettierignorePending`, `planPrettierignore`, `MODELS_RECORD_KEY`, `readRecords`, `recordsBaseline`, `modelsMigrationPending`, `findMissingInstalled`, `agentSurfaceMissing`, `pendingRootMigration`.
- Order after the change: node floor → lock (real run) → config → TTY gate → channel notice → proxy notice → resolve source/version → **ahead-of-source guard** (unchanged, exit 0, no download) → dry run branches → download → MIN_CLI → `buildUpdatePlan` (once) → `changesNothing` ? `unchangedOutcome` (no header, no confirm, no write; outro `Up to date.` or `Nothing to change.`) : header note → capability/root/unit/forced notes → confirm → write-time checks → apply.
- **The header note** (`Skills version vA → vB` / `(re-applying)`, Source, Archetypes, the kept/`--force` line, the CHANGELOG link) moves into `printHeader()` and prints AFTER the plan, only when the plan changes something (real run: right before the confirm notes; text dry run: before `reportDryRun`, with `Preview only — nothing will be written.`). An up-to-date run prints the spinner lines and its outro only. (Open question 1.)
- **`--dry-run --json`**: `report.changesNothing` → `status: 'up-to-date'`, `plan: null` (the early-return shape, via `buildUpdateReport`); otherwise `status: 'planned'` with the plan. The ahead-of guards keep their early returns (no download).
- Comments rewritten: the ahead guard ("runs before the download, so a downgrade is never planned"), the channel-notice comment ("above the ahead-of return and the dry run"), the dry-run comment (it shares the gates and the planner), `emitEarlyReturn` (ahead-of returns + an empty dry-run plan).

**Deleted modules/functions** (ticket): `src/lib/missing-installed.ts`; `src/lib/agent-surface.ts` (+ `AGENTS_FROM_SKILLS_VERSION` in constants.ts, its only user) (open question 2); `modelsMigrationPending` (models-update.ts); `pendingRootMigration` (root-migration.ts) + the "pendingRootMigration apply from it" phrase at root-migration.ts:60 (helpers it alone used, if any, go too).

**`src/lib/update-report.ts`**: drop `plan.changesNothing` (type + serializer) — an empty plan is now `up-to-date` with `plan: null`, so the key can never be emitted; it was added in 0.20.0 (unreleased), so no released byte changes. `UpdateStatus` comment: `up-to-date` ⇒ the plan changes nothing. (Open question 3.)

**Comments that relied on the early return** (ticket list + the rest found by grep):

- `src/lib/update-render.ts` `defaultChannelNotice` doc (no "early return").
- `src/lib/update-plan.ts` holdUnit rationale (:251-252) — kept rule, reworded: at the same version every recorded file is already at that version except the user's kept edits, so a write puts back same-version bytes and nothing is held; :345 "pendingRootMigration re-opens the run later" → "the next run, which plans again, retires them"; :365 "the same-version re-open … stays bounded" → the superset reason without the re-open.
- `src/lib/update-decision.ts:219` "same-version re-open" → "same-version run".
- `src/commands/add.ts` `addStamp` (:120-123) and the VERSION GATE (:78-80): the rationale is no longer "update would early-return", it is: stamping the newer version over a held executable unit would make `update` see the same version, stop holding the unit (`holdUnit` is version-driven) and write it around the kept edits — a mixed floor.
- `src/types.ts:51` `frozenCapabilities`: drop "While non-empty, `update` skips its same-version early return" (every run re-checks them now).
- `src/lib/pharn-config.ts:149` "(`update`'s early return, …)" → "(`update`'s ahead-of check, …)".
- `src/commands/status.ts` comments :347, :396, :453-455.

**User-visible strings**:

- `status.ts` LAYOUT note: drop the two `If it answers "Already up to date", pharn update --force moves it, / but also overwrites…` lines (a plain `pharn update` moves the install at any version). MISSING note: drop the two `If it answers "Already up to date"…` lines. Everything else in both notes unchanged.
- `remove.ts` `warnIfAutoSelected` → exact text: `${names} is selected automatically for your archetypes, so it comes back: the next \`pharn update\` reinstalls it and names it in its report.`(plural form likewise; the "Until then … may answer \"Already up to date\" …`--force` reinstalls it now" sentence goes).

## Files

- `src/commands/update.ts` — no same-version branch; `printHeader` after the plan; `--json` empty plan → `up-to-date`/`null`; imports + comments — layer command
- `src/lib/missing-installed.ts` — DELETED — layer lib
- `src/lib/agent-surface.ts` — DELETED — layer lib
- `src/lib/constants.ts` — `AGENTS_FROM_SKILLS_VERSION` + comment deleted — layer lib
- `src/lib/models-update.ts` — `modelsMigrationPending` deleted (`needsModelsConversion` kept) — layer lib
- `src/lib/root-migration.ts` — `pendingRootMigration` deleted; header phrase — layer lib
- `src/lib/update-report.ts` — `plan.changesNothing` dropped; status comment — layer lib
- `src/lib/update-render.ts` — `defaultChannelNotice` doc comment — layer lib
- `src/lib/update-plan.ts` — holdUnit / root-migration / prettierignore comments — layer lib
- `src/lib/update-decision.ts` — `holdUnit` param comment — layer lib
- `src/commands/add.ts` — `addStamp` + version-gate comments — layer command
- `src/commands/remove.ts` — `warnIfAutoSelected` message + comment — layer command
- `src/commands/status.ts` — LAYOUT/MISSING note lines + comments — layer command
- `src/types.ts` — `frozenCapabilities` comment — layer types
- `src/lib/pharn-config.ts` — stamp-check doc comment — layer lib
- `tests/commands/update.test.ts` — rewritten in place (see Test changes); new AC tests — layer test
- `tests/commands/update-dry-run.test.ts` — rewritten in place (see Test changes) — layer test
- `tests/commands/status.test.ts` — LAYOUT/MISSING note assertions flip to the new text; :650 comment — layer test
- `tests/commands/remove.test.ts` — the auto-selected warning assertion (:364-369) to the new text — layer test
- `tests/update-report.test.ts` — `changesNothing` key never serialized; up-to-date = empty plan — layer test
- `tests/models-update.test.ts` — `modelsMigrationPending` describe deleted — layer test
- `tests/root-migration.test.ts` — `pendingRootMigration` describe deleted — layer test
- `tests/missing-installed.test.ts` — DELETED — layer test
- `tests/agent-surface.test.ts` — DELETED — layer test
- `tests/update-decision.test.ts` — NEW case: `holdUnit: false` (same version) restores a missing unit file while another unit file is skipped — the behaviour the reworded comment states — layer test
- `tests/update-plan.test.ts` — NEW case: at the same version `buildUpdatePlan` restores a deleted floor file with a hook kept edited (no hold), and the next plan is `changesNothing` — layer test
- `tests/constants.test.ts` — only if pharn-ci needs a modified importer of constants.ts (see open question 2) — layer test
- `docs/commands/update.md` — flow steps 4-7 (no step 5 early return; every run downloads and plans; empty plan → "Up to date"); Previewing (no "Already up to date" early return; `up-to-date` in JSON); JSON status table row `up-to-date` = "the plan changes nothing … a real run would ask nothing and write nothing"; `plan.changesNothing` row removed; :408 frozen, :541, :587, :603, :652, :685-686, :725, :841, :910, :934-957, :976-984, :1036-1050, :1064-1068, :1082-1086 rewritten to "a plain `update` …"; Concurrency section to the C5.2 order (lock first, held across the confirm) — layer docs
- `docs/commands/status.md` — :59, :63, :108, :302 (no "Already up to date" fallback) — layer docs
- `docs/commands/add.md` — :72, :154 — layer docs
- `docs/commands/remove.md` — :134 (an auto capability comes back with the next plain update) — layer docs
- `docs/troubleshooting.md` — :57 (`up-to-date` = empty plan), :191 — layer docs
- `docs/architecture.md` — the "Same-version early return" bullet → "Every run plans; an empty plan is up to date" — layer docs
- `CLAUDE.md` — module map: drop `agent-surface`, `missing-installed` — layer docs
- `CHANGELOG.md` — **Changed** under `[Unreleased]`: "`pharn update` always checks upstream" — every run downloads and plans; an empty plan says "Up to date." and asks/writes nothing; `--dry-run --json` `up-to-date` now means that (with `plan: null`), and the 0.20.0 `plan.changesNothing` key is gone; missing files, ignore lines, an old models block, a channel switch, frozen capabilities, root docs and a removed auto capability are all handled by a plain `update` — layer docs

## Test changes needing a decision (pharn-ci TI01/TI02)

**Deleted (the code under test is deleted):**

- `tests/missing-installed.test.ts` — whole file (`describe('findMissingInstalled')`, 11 `it`s).
- `tests/agent-surface.test.ts` — whole file (`describe('agentSurfaceMissing')`, 11 `it`s/`it.each`).
- `tests/models-update.test.ts` — `describe('modelsMigrationPending — what re-opens update’s early return')` (2 `it`s).
- `tests/root-migration.test.ts` — `describe('pendingRootMigration — the bounded re-open signal')` (5 `it`s).
- `tests/update-report.test.ts` — `it('carries plan.changesNothing: true last, status still planned, when nothing changes')` (the key is removed; replaced by a test that a `changesNothing` plan is never serialized as a key).
- `tests/commands/update-dry-run.test.ts` — row `changesNothing` of `carries plan.$key only when there is something to say` (its case — `--force` with nothing to overwrite — moves into the `up-to-date` table below).

**Renamed (rewritten in place; the old name states the removed behaviour):**

- update-dry-run: `at the current version says Already up to date without downloading` → `at the current version says Up to date after one download`.
- update-dry-run: `$status (also marked under --compact), downloading nothing` — the `up-to-date` row leaves this table (ahead rows keep the name) for a new `up-to-date (also marked under --compact): one download, plan null — an empty plan, --force included`.
- update-dry-run: `is planned instead: --force at the current version` keeps its name; its setup gains an edited file so `--force` has something to overwrite (an empty `--force` plan is now `up-to-date`).
- update: describe `the same-version early return` → `at the same version, an empty plan is "Up to date"` (renames every `it` inside: the four below plus the two tables).
  - `says "Already up to date" without downloading or rewriting anything` → `says "Up to date." after one download, with no prompt and no write` (+ a TTY run without `--yes`: the confirm is never called).
  - `re-opens for %s; the run repairs it, and the next run returns early again` (5 rows) → `one plain update fixes %s; the next run is up to date` (same 5 rows; each asserts one download and the repair, then a second run: one download, `Up to date.`, nothing written).
  - `does not re-open for %s` (8 rows) → split by the real outcome: `is up to date with %s, and writes nothing` (symlinked/dir `.gitignore`, symlinked `.prettierignore`, capability dir behind a symlink — exact outcome asserted from the run) and `rebuilds the records store for %s` (absent / corrupt / torn store, Prettier project with no store — the plan writes a store, as a version bump does). Final split decided by the run, reported at GATE 2.
  - `a capability \`remove\`d at the current version stays removed until --force re-applies the install`→`a capability \`remove\`d at the current version comes back with the next plain update`.
- update: `an install at 6.64.0+ an older CLI made without it: plain update --yes adds it, then early-returns` → `…: plain update --yes adds it, then the next run is up to date`.
- update: `below 6.64.0 a missing, unrecorded agent does not re-open update` → `below 6.64.0 a missing, unrecorded agent is restored by a plain update too`.
- update: `deleting it never re-opens update; the next run that plans drops the record once, and the run after asks and writes nothing` → `deleting it: the next update drops its record once without restoring it, and the run after asks and writes nothing`.
- update: `re-opens the same-version return for root docs an older CLI left on a 7.x install` → `one plain update retires root docs an older CLI left on a 7.x install; the next run is up to date`.
- update: `does NOT re-open the same-version return for user data at the root of a 7.x install` → `leaves user data at the root of a 7.x install alone: one download, nothing written`.
- update: `an install on main is told once per run that it stays on main, early return included` → `…, an up-to-date run included`.
- update: `closes the same-version gate once it wrote a block, even one in a convertible shape` → `once it wrote a block, even one in a convertible shape, the next run is up to date`.
- update: proxy row `the up-to-date early return, which still fetches` → `an up-to-date run`.

**Rewritten in place, name kept** (expected values change because behaviour changed — said in the PR body): `--ref latest moves a main install to the release, recorded even at the same version; …`, `a plan whose only root-migration content is a user-data hint changes nothing: …` (no `--force` needed now), `previews, then retires the root docs, leaves the user data with a hint, and status is clean right after`, `names an unchanged orphan, … then one run drops its record`, `init and update keep pharn/.run/ and pharn/.backup/ in .gitignore, idempotently` (comments), `a hostile key in an invalid store …` (comment), the `upToDate()` helper (→ `Up to date.`), status LAYOUT/MISSING assertions, the remove auto-selected warning assertion.

## Contracts satisfied

- CLAUDE.md "`--json` reports keep their `schemaVersion: 1` bytes" — `up-to-date` keeps the 0.10.0 bytes (`plan: null`, the `buildUpdateReport` early-return shape, pinned by `update-report.test.ts` "serializes an early return to the exact 0.10.0 bytes"); a `planned` report is unchanged; only the unreleased `plan.changesNothing` goes.
- CLAUDE.md "Fail closed on release resolution" / "Network bounds" — unchanged; one more download per up-to-date run, through the same `fetchRepo`.
- CLAUDE.md "Records are the proof" / "Back up before overwrite or delete" / "The project lock" — unchanged; a same-version run goes through the same planner and writer as a version bump.
- C1.5 `changesNothing` — the one definition of "up to date".

## Evals to write (P1)

- same version, nothing changed: exactly one tarball download, outro `Up to date.`, no confirm (TTY, no `--yes`), snapshot unchanged, exit 0
- each former re-open scenario fixed by ONE plain `update --yes`: a deleted recorded file, a gone capability dir (no store), a missing `.gitignore` line, a missing `.prettierignore` line, an old `models` block, a frozen capability that parses again, a `--ref` switch, root docs an older CLI left (7.x), a missing agent (≥ 6.64.0 and below) — then the next run: one download, `Up to date.`, nothing written
- a capability removed with `pharn remove` at the current version comes back with the next plain update
- `--dry-run --json` at the current version (and with `--force` and nothing to overwrite): `status: "up-to-date"`, `plan: null`, one download; `--compact` too; a plan with something to write stays `planned`
- `--dry-run` text at the current version: `Dry run — Up to date.`, one download, nothing written
- ahead-of guards: still exit 0 with NO download (unchanged rows)
- status LAYOUT/MISSING notes no longer mention "Already up to date"; remove's auto-selected warning says the next update reinstalls it
- unit: `planUpdate` with `holdUnit: false` restores a missing unit file next to a skipped one; `buildUpdatePlan` at the same version restores a deleted floor file with a hook kept edited, then plans `changesNothing`
- `buildUpdateReport` never serializes `changesNothing`

## Guarantee audit (P0)

- "an up-to-date run asks nothing and writes nothing" → floor (test): `changesNothing` (C1.5, exact equality over plan/config/records) + snapshot/confirm-spy tests.
- "every former re-open case is fixed by a plain update" → floor (test): the integration table; the mechanism is the shared planner, not a per-signal check.
- "a downgrade is never planned without `--force`" → unchanged ahead-of guard (version comparison, `lib/version-status.ts`), still before the download; its table keeps asserting no download.
- "`up-to-date` keeps its `schemaVersion: 1` bytes" → floor (test): the exact-bytes pin in `update-report.test.ts`.
- No new guarantee; one removed class of bounded-loop arguments (each re-open signal's "bounded" claim) — nothing replaces them because nothing re-opens.

## Trust audit (P2)

- No new untrusted input. Same clone (`fetchRepo`, tar-extract admission), same planner, same escaping (`terminalSafe` on the config's version strings in the header note, unchanged).

## Determinism audit (P5)

- The one branch is `report.changesNothing` (a boolean from exact comparisons). The ahead-of guard is unchanged. No fallback guesses.

## Open questions (HALT) — recommended answers

1. **Header note timing.** Recommended: print it after the plan, only when the plan changes something (real and text dry run), so an up-to-date run prints just the spinners and `Up to date.`. Alternative: keep it before the download for every run — an up-to-date run would then open with "Skills version v1.0.0 (re-applying)".
2. **`agent-surface.ts`.** Not in the ticket's list but the same kind of re-open signal (used only by update's gate). Recommended: delete it with `AGENTS_FROM_SKILLS_VERSION` and `tests/agent-surface.test.ts`; touch `tests/constants.test.ts` only if pharn-ci then lacks a modified importer of constants.ts. Alternative: leave it as dead code.
3. **`plan.changesNothing` in `--json`.** Recommended: remove it (unreachable once an empty plan is `up-to-date` with `plan: null`; unreleased 0.20.0 key) — deletes one `update-report` `it` and one dry-run row. Alternative: `up-to-date` only for the `Up to date.` verdict and keep `planned` + `changesNothing: true` for a kept-edit-only plan — contradicts "up-to-date means an empty plan (C1.5's definition)".
4. **Text dry run of an empty plan.** Recommended: keep C1.5's rendering (the PLAN note with `Nothing would be written.` and `Dry run — Up to date. … A real run would ask nothing and write nothing.`). Alternative: a one-line `Up to date.` — loses the kept-edit/skip notes C1.5 chose to print.
5. **Comment-only edits outside the ticket's list** (`types.ts`, `pharn-config.ts`, `update-decision.ts`, `status.ts` comments, `update-plan.ts` :345/:365): Recommended: fix them (they describe the deleted gate); each file is statically imported by a test this PR modifies (`remove.test.ts` imports `types.ts`/`pharn-config.ts`; `update-decision.test.ts`, `update.test.ts` get real new assertions).
6. **Test deletions/renames** listed above — OK to proceed (pharn-ci will flag TI01/TI02 on them; listed in the PR body under "Test-integrity: expected findings")?

## GATE 1 — RESOLVED (2026-11-16, orchestrator for the user)

Approved. (1) Header note after the plan, only when the plan changes something. (2) Delete agent-surface.ts as long as nothing else still needs it (status, init, add); otherwise keep the part used. (3) Remove `plan.changesNothing`, and fix the [Unreleased] CHANGELOG text and docs (JSON reference) that mention it. (4) Keep C1.5's text dry-run rendering. (5) Fix the stale comments outside the ticket's list. (6) The delete/rename list is accepted; listed in the PR body under "Test-integrity: expected findings", with each behaviour-driven expected-value change explained. The vendored .agents/ skill is not edited.
