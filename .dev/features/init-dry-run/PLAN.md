# PLAN — `pharn init --dry-run [--json]` and a conflict-refusing `init --yes`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: (F-07) `init` gains a read-only preview (`--dry-run`, text; `--dry-run --json`, one `schemaVersion: 1` object) and a non-interactive real install (`--yes`) that skips the summary confirm and installs ONLY when no write target already exists — otherwise it refuses (exit 1) naming the targets; the overwrite confirmation is never skipped, only made unnecessary.
- layer(s): single package, no `pharn-contracts` change. `src/index.ts` dispatches (one row + one REQUIRED_WITH row + USAGE); `src/commands/init.ts` owns the verb; new shared pure/read-only logic in `src/lib/` (`init-plan.ts`, `init-report.ts`, `write-targets.ts`); `steps/` keep one stage each (ARCHITECTURE.md §4 / P3 — no step→step, no lib→step import).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (live state, read this run — worktree `feat/init-dry-run` @ ff9312f)

- `src/index.ts`: `ALLOWED_FLAGS` init row = `['archetype', 'ref']`; `REQUIRED_WITH` has one row (`update`: `json→dry-run`, `compact→json`); `DECLARED_*` derived from the table, so `yes`/`dry-run`/`json` are already declared (update/list/status rows) — adding them to init's row declares nothing new; dispatch `runInit({ ref })`; `tests/index.test.ts` pins `runInit` called with exactly `{ ref: undefined }` (:55, :64).
- `src/commands/init.ts` (398 lines): `runInit` = `showBanner` + `intro` → `runNodePrereq('init')` → `runGitPrereq()` → TTY gate (`interactiveAllowed`, message names "deliberately no --yes", :63-88) → `runInitArchetype(channel)`: `detectArchetypesFromProject` + `note` → proxy `log.warn` → spinner + `fetchRepo(await resolveSource(channel))` → try { `minCliGate` → `parseCapabilityIndex` → unknown warning → `resolveCapabilities` → `readPreviousConfig` + `carryOver` (file-local) + 3 carry log lines → selection → `runArchetypeSummary` (prompt 1) → `installManifest` (only on install) → `preflightInstall` → `confirmWriteTargets` (prompt 2) → `withProjectLock` { `assertConfigFingerprintUnchanged` → `runInstallArchetype` } } catch/finally cleanup → refusal/failure/cancel exits AFTER cleanup.
- `steps/overwrite-check.ts` `confirmWriteTargets`: `conflictingWriteTargets` (manifest keys ∪ `pharn.config.json`, existing only) → `scanDest` labels (`modified`/`unrecorded`/`unverifiable` → `(edited)`/`(no pharn record)`/`(differs from upstream)`) → label-ordered list → `log.warn` + `confirm`. The label/ordering computation is entangled with the prompt.
- `steps/archetype-summary.ts`: builds the summary lines and prompts in one function.
- `steps/install-archetype.ts`: `installManifest`, `preflightInstall` (→ `lib/install-capabilities.ts prepareInstall`), `reinstallBaseline`, `runInstallArchetype` (pre-flight → scan under lock → `createBackup` → `installCapabilities` → settings/HOOKS note → `readUpstreamModels` → `writeRecords` → `writePharnConfig` with file-local `readCarriedEntries`). Settings are "preserved" iff `existsSync(.claude/settings.json)` at copy time.
- `update`'s precedent: `lib/update-plan.ts` (`buildUpdatePlan` → `{report, apply}`, never logs), `lib/update-report.ts` (explicit projection, `UPDATE_SCHEMA_VERSION`), `lib/json-report.ts` (`serializeJsonReport`, `cap`), `fetchAndPlan`/`silentSpinner`/`emitJson` in `commands/update.ts`, `runNodePrereq(cmd, {json})`, `reportFatalPlain`/`logErrorPlain`; `tests/update-dry-run.test.ts` pins no-write with `snapshotTree` + pass-through spies on every write function.
- `steps/prereqs.ts` `runGitPrereq()` reports through clack `logError` → needs a plain-stderr variant for `--json`.
- Tests touching this: `tests/init.test.ts` (mocks prereqs/summary/install-archetype/overwrite-check; TTY-gate cases :901-955 assert "no --yes"), `tests/init-archetype.test.ts` (fixture e2e incl. whole-`init` runs :1364+, HOOKS note :1491+), `tests/overwrite-check.test.ts`, `tests/index.test.ts`.
- Docs that state "init has no `--yes`" / interactive-only: `docs/commands/init.md` :39-63, `README.md` :285-288, `docs/getting-started.md` :10-16, `docs/troubleshooting.md` :16, :134-143, :634 (flag table), `docs/roadmap.md` :24, `CLAUDE.md` (dispatch rows, TTY-gate paragraph, init flow). `CHANGELOG.md` `[Unreleased]`.
- Trusted docs: CONSTITUTION/ARCHITECTURE/THREAT-MODEL/LIMITS read; none needs a change (LIMITS makes no claim about init interactivity; the main checkout's uncommitted LIMITS.md edit is not this increment's).
- Concurrency note: other branches are changing `--archetype` (index.ts STRING_FLAGS / init row) and adding `uninstall`; index.ts edits here are confined to the init row, one REQUIRED_WITH row, the `init` dispatch case and USAGE lines.

## Design

### 1. Dispatch (`src/index.ts`, minimal)

- `ALLOWED_FLAGS` init row → `['archetype', 'ref', 'yes', 'dry-run', 'json']` (so `-y` works for init by the existing alias derivation).
- `REQUIRED_WITH` gains `['init', [{ flag: 'json', requires: 'dry-run' }]]` — same mechanism, same "Incomplete option for `init`" refusal, above the `--help` short-circuit. Consequence: bare `pharn --json` (cmd defaults to `init`) is now refused as incomplete instead of as unsupported — still exit 1, stdout empty.
- `init` case → `runInit({ ref, yes: Boolean(argv.yes), dryRun: Boolean(argv['dry-run']), json: Boolean(argv.json) })`.
- USAGE: `-y, --yes` gains an `init:` line; `--dry-run` gains `init: show what would be installed and write nothing`; `--json` gains `init: with --dry-run, …`.

### 2. Shared, read-only planning (`src/lib/init-plan.ts`, NEW)

Two phases, because the real run must keep "a cancelled summary builds no manifest and runs no pre-flight":

- `resolveInitSelection({ repoDir, cwd, archetypes })` → `{ index, previous: {fingerprint, config}, carry, selection }` — `readPreviousConfig` + `carryOver` + the selection merge MOVED verbatim from `commands/init.ts` (pure; no logging). The real run calls it too, so the carry logic has one copy.
- `buildInitPlan({ repoDir, sha, cwd, archetypes, channel, selected })` → `{ report: InitPlanReport, manifest }`, never logs, never writes: `installManifest` equivalent (`collectExpectedInstallPaths` at `detectLayout(repoDir)`) → `prepareInstall` (the same destination pre-flight; THROWS `ManifestValidationError` → exit 1 exactly as in a real run) → `planWriteTargets` (below) → `scanDest` against `recordsBaseline(readRecords(cwd), carry.previousStamp)` (= what `runInstallArchetype` would back up) → settings preserved = `existsSync(.claude/settings.json)` → `diffHookWiring(repoDir, cwd)` only when preserved → `readUpstreamModels` → `readSkillsVersion` → user-owned keys that would be carried (`readCarriedEntries`, MOVED here from `install-archetype.ts` and exported to it, still total-catch).
- `InitPlanReport` (plain data): archetypes, channel, source, skillsVersion, commit, layout, selection (selected with `matched`, skipped with reason), carry (manual-extra, kept, gone), unknownCapabilities, targets `[{rel, action: 'create'|'overwrite', label: DriftLabel|null}]` over manifest ∪ `pharn.config.json` (exactly `conflictingWriteTargets`'s set), backups, counts `{create, overwrite, backup}`, settings `{preserved}`, hooks (HookWiringDiff|null), models `{outcome: 'copy'|'none'|'rejected', reasons}`, carriedConfigKeys, previousSkillsVersion.

### 3. One label/ordering computation (`src/lib/write-targets.ts`, NEW)

`planWriteTargets({ repoDir, cwd, selection, manifest, records })` → `{ conflicts (label-ordered), labels }` — extracted from `confirmWriteTargets` with no behaviour change; `confirmWriteTargets` becomes "plan → render → confirm". The dry run's `(edited)`/`(no pharn record)`/`(differs from upstream)` marks and the prompt's are therefore the same function's output (MARKERS stay in the step, exported for the dry-run text).

### 4. Projection (`src/lib/init-report.ts`, NEW, pure)

`buildInitReport(plan): InitReport`, `INIT_SCHEMA_VERSION = 1` (own constant), `command: 'init'`, `dryRun: true`, `status: 'planned'`, explicit field-by-field (no spread), untrusted free text capped (`cap`) and printed via `serializeJsonReport`. `models` block itself is omitted (outcome + reasons only), as in update. Adds `yesWouldProceed: counts.overwrite === 0` so a script can ask "would `init --yes` install?" without trying.

### 5. Command flow (`src/commands/init.ts`)

`runInit({ ref, yes, dryRun, json })`:

- `json && !dryRun` → fail closed (`reportFatalPlain`, exit 1), like update.
- Under `json`: no `showBanner`/`intro`/`note`/spinner/`log.*`; `runNodePrereq('init', {json})`; `runGitPrereq({json})` (plain stderr); proxy notice, `MIN_CLI` warning, unknown-capabilities warning → `logErrorPlain`; every failure → `reportFatalPlain` + exit 1 AFTER clone cleanup, stdout empty; success → ONE `console.log(serializeJsonReport(report))` and a normal return.
- TTY gate applies only when `!dryRun && !yes`; its message now names the two ways through (`--yes`, which installs only when nothing would be overwritten, and `--dry-run`).
- `--dry-run` (text): same prelude, same fetch, same `MIN_CLI` gate, `resolveInitSelection` + `buildInitPlan`, then the summary lines (`archetypeSummaryLines`, extracted from `runArchetypeSummary` — no prompt), a `PLAN` note (WOULD OVERWRITE list, labelled first with the prompt's marks; WOULD CREATE as a count; WOULD BACK UP list; `pharn.config.json` create/overwrite + carried keys + carry lines; settings preserved), the `HOOKS` note (`hookWiringLines`), the models outcome, and an outro "Dry run — would create N · overwrite M · back up K. Nothing was changed." plus whether `pharn init --yes` would proceed. No TTY gate, no prompt, no lock, no fingerprint check; no write function reachable.
- `--yes` (real run): identical to today's flow except (a) the summary prompt is skipped (`action = 'install'`), (b) in place of `confirmWriteTargets`, `planWriteTargets` is computed and a NON-EMPTY conflict set is a refusal (exit 1, after cleanup, nothing written, listing the targets capped at `MAX_LISTED` and pointing at interactive `pharn init` / `pharn init --dry-run` / `pharn update`), (c) inside the lock, after `assertConfigFingerprintUnchanged`, `conflictingWriteTargets` is re-checked and a newly-appeared target refuses (the authoritative check — the gap is milliseconds, but "never overwrites without confirmation" must reduce to a membership test under the lock, not to timing). Everything else — pre-flight thrice, fingerprint, backup-before-copy, records-before-config — unchanged and still pinned by the existing suites.
- `--yes --dry-run`: accepted; the dry run reports `yesWouldProceed`.

## Files

- `src/index.ts` — init row (+`yes`,`dry-run`,`json`), REQUIRED_WITH init row, init dispatch, USAGE — layer index/dispatch
- `src/commands/init.ts` — option plumbing, json/dry-run/yes branches, TTY-gate condition + message; carry code moved out — layer commands
- `src/lib/init-plan.ts` — NEW `resolveInitSelection`, `buildInitPlan`, `readCarriedEntries` (moved), `InitPlanReport` — layer lib
- `src/lib/init-report.ts` — NEW pure projection, `INIT_SCHEMA_VERSION` — layer lib
- `src/lib/write-targets.ts` — NEW `planWriteTargets` (extracted) — layer lib
- `src/steps/overwrite-check.ts` — use `planWriteTargets`; export `MARKERS`; prompt unchanged — layer steps
- `src/steps/archetype-summary.ts` — export `archetypeSummaryLines`; prompt unchanged — layer steps
- `src/steps/install-archetype.ts` — import `readCarriedEntries` from lib (behaviour unchanged) — layer steps
- `src/steps/prereqs.ts` — `runGitPrereq({ json })` → `logErrorPlain` — layer steps
- `src/lib/hook-wiring.ts` — `preservedSettingsHookLines`, the one HOOKS-note composition for init's real run and dry run (GATE 2 follow-up) — layer lib
- `tests/hook-wiring.test.ts` — the helper (GATE 2 follow-up)
- `tests/init-dry-run.test.ts` — NEW fixture e2e: text preview, no-write snapshot + spies, refusals
- `tests/init-dry-run-json.test.ts` — NEW: one object on stdout, zero clack, failure shapes
- `tests/init-report.test.ts` — NEW: projection key sets, caps, round-trip
- `tests/init-yes.test.ts` — NEW fixture e2e: fresh install off a TTY, conflict refusal, under-lock re-check
- `tests/write-targets.test.ts` — NEW: extracted ordering/labels
- `tests/init.test.ts` — option plumbing, TTY gate message/conditions
- `tests/index.test.ts` — init row, REQUIRED_WITH init, dispatch arg object
- `tests/overwrite-check.test.ts` — unchanged expectations (regression pin)
- `tests/archetype-summary.test.ts` — `archetypeSummaryLines` extraction
- `tests/prereqs.test.ts` — json variant
- `docs/commands/init.md` — "Preview: `--dry-run`" + "JSON output" + "Non-interactive: `--yes`" sections; replace the "no --yes" section; flow — docs
- `README.md`, `docs/getting-started.md`, `docs/troubleshooting.md` (exit table, flag table, prerequisites), `docs/roadmap.md` — docs
- `CLAUDE.md` — dispatch rows, REQUIRED_WITH, TTY-gate paragraph (the "no `--yes`" reasoning rewritten), init flow — docs
- `CHANGELOG.md` — `[Unreleased]` `### Added` — docs
- `docs/contributing.md` — test-file table rows for the new suites — docs

## Contracts satisfied

- `pharn-contracts` — none touched (CLI surface only). The JSON stdout contract is the one `status --json` / `update --dry-run --json` established (`lib/json-report.ts`), cited not redefined (P4).

## Evals to write (P1)

- dispatch → `init --dry-run`, `init --dry-run --json`, `init --yes`, `init -y` reach `runInit` with the right object; `init --json` / bare `pharn --json` → "Incomplete option for `init`", exit 1, stdout empty; `init --json --help` refuses; `init --force`/`--compact` still unsupported; update rows unaffected.
- dry run (text, fixture clone) → fresh project: N creates, 0 overwrites, no prompt, exit 0, off a TTY; re-install with an edited file, an unrecorded file and no records store → each marked exactly as the prompt marks it and listed under WOULD BACK UP; preserved settings → HOOKS note; manual carry/kept/gone lines; whole-tree `snapshotTree` of project AND clone equal before/after, zero calls to `createBackup`, `installCapabilities`/`runInstallArchetype`, `writeRecords`, `writePharnConfig`, `withProjectLock`, `confirm`/`select`; clone cleaned up; pre-flight symlink refusal → exit 1 nothing written; MIN_CLI refusal → exit 1; parity: the dry run's overwrite/backup sets equal what a subsequent real run warns about and backs up on the same fixture.
- json → stdout exactly one parseable object (spy on `console.log` + every clack fn: zero clack calls); key-set snapshot per level (no `models` block, no internal fields); hostile strings in unknown-capability reasons/models reasons/hook strings capped + escaped, lossless round-trip; failure shapes (node floor, no `.git`, resolve/fetch failure, MIN_CLI, pre-flight) → exit 1, stdout empty, plain stderr; `yesWouldProceed` true on fresh, false on re-install.
- `--yes` → off a TTY on a fresh project installs (config + records written, no prompt called); with ANY existing target (incl. only `pharn.config.json`) refuses exit 1, lists targets, writes nothing (snapshot), no `.pharn-backup/`; a target created between the check and the lock (injected via the lock spy) refuses under the lock; `--yes` in a TTY never prompts; TTY gate still refuses plain `init` off a TTY with the new message.
- refactor regressions → existing `init.test.ts`, `init-archetype.test.ts`, `overwrite-check.test.ts` pass with unchanged expectations (except the TTY-gate wording).

## Guarantee audit (P0)

- "`init --dry-run` writes nothing" → floor: construction (no write function reachable from the dry-run branch) pinned by whole-tree snapshot equality + zero-call spies (membership test on spies); advisory for future edits outside the fixtures — as for `update --dry-run`.
- "`init --yes` never overwrites an existing file" → floor: membership test — `conflictingWriteTargets(...)` (existsSync over manifest ∪ config) must be empty, checked before the lock AND re-checked under the lock immediately before `runInstallArchetype`. Residual (named, not hidden): a file created by another process between that under-lock check and the copy (sub-second, not holding the pharn lock) — the existing backup scan under the lock does not cover a file that appears after it either; documented as the same residual the interactive run already has.
- "stdout carries exactly one JSON object under `--dry-run --json`; failures leave it empty, exit 1" → floor: construction + spies, as update's.
- "`--json` requires `--dry-run`" → floor: membership test in `REQUIRED_WITH`.
- "unsafe characters never reach a terminal raw" → floor: `serializeJsonReport`'s `escapeUnsafe` regex (existing).
- "the dry run's marks equal the prompt's" → floor: one function (`planWriteTargets`) feeds both (construction) + parity test.
- "the preview is what a real run would do" → ADVISORY: a snapshot; the real run re-fetches (the tip may move) and re-checks under its lock. Documented as such.
- `schemaVersion`/field stability → ADVISORY documented contract.

## Trust audit (P2)

- Ingested untrusted: the clone (capability index names/reasons, `rel` paths from the manifest, upstream models block + reasons, upstream hook entries, SKILLS_VERSION, MIN_CLI text), and the project's own existing config (user-owned key NAMES, previous skillsVersion). Taint: names/paths are already allowlist-validated + `safeJoin`-contained upstream of this code; in the report every free-text value is a JSON string value only, capped, escaped by `serializeJsonReport`; text mode goes through clack `note`/`log` exactly like today's prompt (paths) and `terminalSafe` where today's code applies it (models reasons, hooks). User-owned config keys appear as KEY NAMES in an array (values never echoed), capped + escaped. Enum fields (`action`, `label`, `status`, `outcome`, `channel`, `source.kind`, `hooks.status`) come from this CLI's membership tests. Nothing ingested is executed; the dry run adds no new fetch.

## Determinism audit (P5)

- Every new branch is a membership/boolean test: `dryRun`/`json`/`yes` booleans; `--yes` proceeds iff the conflict set is empty (else refusal, never a guess); REQUIRED_WITH Map lookup; `action` = existsSync membership; labels from update's 6-row table. Output order = manifest sort + the prompt's label order (deterministic).

## Open questions (HALT)

- Q1 — flag name for the non-interactive real install: `--yes`/`-y` (recommended: same spelling and alias as `update`, and the semantics "skip the confirm that has nothing to protect; refuse where a confirm would protect something" read naturally; the refusal message makes the difference explicit) vs `--non-interactive` (more literal, but a second spelling for one concept across two commands).
- Q2 — `--yes` scope: refuse on ANY existing target (recommended — zero conflicts, so a re-install, where `pharn.config.json` always exists, always refuses and points to `pharn update` / interactive `init`), vs proceed when every conflict is a clean upgrade (unmarked, no backup). The latter weakens the stated "never skips the overwrite confirmation" reasoning; not recommended now (P7, no triggering need).
- Q3 — text dry-run verbosity: list overwrites in full (labelled first) and creates as a COUNT (recommended — a fresh install is ~450 creates), vs list every file like `update --dry-run`. JSON always lists every target.
- Q4 — `--compact` for `init --dry-run --json`: not now (recommended; P7 — creates are the bulk but a JSON consumer can filter `action`), vs add it mirroring update.
- Q5 — factoring depth: two-phase plan in `lib/init-plan.ts` reused by the real run for selection/carry only (recommended — keeps the real run's prompt-ordering guarantees byte-for-byte and its existing mocks valid), vs a full `{report, apply}` split where the real run applies a plan object (larger diff, rewrites the init test mocks).

## Resolved decisions (GATE 1, 2026-10-13)

Human approved with every recommendation:

- **Q1:** `--yes` / `-y`.
- **Q2:** refuse on ANY existing target. `docs/commands/init.md`'s `--yes` section says a re-install therefore always refuses under `--yes`, and points to `pharn update`.
- **Q3:** text lists overwrites in full (labelled) and creates as a count; JSON lists every target.
- **Q4:** no `--compact` for init.
- **Q5:** two-phase planning; the real run reuses only the selection/carry part.
- **Residual:** the under-lock-to-copy residual is documented in `docs/commands/init.md`, not only here.
- **Bare `pharn --json`:** the new "Incomplete option for `init`" message is accepted, pinned in `tests/index.test.ts`.

## GATE 2 follow-up (2026-10-13)

The human approved GATE 2 and asked for four changes before the PR:

- **REVIEW #1:** `preservedSettingsHookLines` (`lib/hook-wiring.ts`) is now the one HOOKS-note composition.
- **REVIEW #2:** two preview-branch tests were added: the text warning sink and the rejected models block.
- **REVIEW #3:** the troubleshooting wording was fixed.
- **REVIEW #6:** a bare `pharn --dry-run` / `pharn -y` is now documented.

REVIEW #4 and #5 were left as they are.

The branch was then rebased onto origin/main 2d39a62. F-08 (#279) always backs up an existing `pharn.config.json` on re-install (`replacedConfigBackup`). That behaviour is carried into `planWriteTargets`:

- **`configBackedUp`:** a new field on the plan.
- **Ordering:** the backed-up config is ranked right after the labelled files.
- **Marker:** `targetLines` marks it with `CONFIG_MARKER`.
- **Prompt:** keeps F-08's exact list and its reset line.
- **Dry run:** labels the config `rewritten` and adds it to `backups`.
- **`--yes`:** still refuses, because the config exists.
