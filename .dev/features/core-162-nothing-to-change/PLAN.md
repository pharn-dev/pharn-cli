# PLAN — core-162-nothing-to-change (Linear CORE-162, C1.5)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: after planning, `pharn update` computes ONE "changes nothing" predicate; a run it holds for prints its notes, asks nothing, writes nothing (no lock, no backup, no `pharn.config.json` rewrite — so no `updatedAt`/`pharnVersion` churn) and ends "Nothing to change." (or "Up to date."); the dry-run line and `--dry-run --json` (`plan.changesNothing: true`, additive) read the same predicate; `--force` lists every file it will overwrite before its confirm through the WOULD OVERWRITE sections, extracted into a shared renderer.
- base: origin/main @ 991b229 (0.19.0 + CodeRabbit chore). Worktree branch; delivery branch `przemek/core-162-c15-an-update-with-nothing-to-change-asks`. No version bump.
- layer(s): CLI source (`src/commands/update.ts`, `src/lib/update-*.ts`, one new pure module), tests, user docs (`docs/commands/update.md`), `CLAUDE.md`, `CHANGELOG.md`. No trusted (hook-protected) doc changes.
- constitution_refs: [P0, P1, P3, P4, P5, P7]

## Discovery (live state at 991b229)

1. The ticket's line numbers moved. Live: confirm at `src/commands/update.ts:616-622`, `confirmMessage` `:714-720`, the record + config writes `:979-1026` (`applyPlannedUpdate` `:858-1071`), the dry run's "Nothing would be written." `src/lib/update-render.ts:421-428`, the WOULD OVERWRITE sections `update-render.ts:371-376`.
2. The never-closing re-opens are real: a withheld version keeps `config.skillsVersion !== latest` (so `current` is false and the early return never fires), and `frozenCapabilities` re-opens it at the same version. Each such run today: download, `confirm('Apply this update?')`, then `writeRecords` + `writePharnConfig` with a fresh `updatedAt` — even when `plan.writes`, `removals`, root-migration deletes/moves and the ignore files are all empty.
3. `buildUpdatePlan` (`src/lib/update-plan.ts`) already reads the record store (`readRecords(cwd)`) and holds every input the two writes are built from (`apply.frozenRecords`, `apply.orphanRecords`, `plan.nextRecords`, `models.nextRecord`, `nextSkillsVersion`, `nextCommit`, `pendingSkillsVersion`, `frozenKeys`, `configCapabilities`, `layout`, `models.next`, the channel). So the predicate can be computed ONCE in the planner and carried on `UpdatePlanReport`, which the real run, the dry run and the JSON projection all consume — the "ONE predicate" requirement by construction.
4. In a run whose plan writes no file, `buildRecords(cwd, written)` contributes nothing and `deleteRootDocs` retires nothing (a doc delete is itself a change), so the next record store is a PURE value of the plan. The predicate only consults it after the cheap file/delete/move/ignore checks are already empty.
5. `tests/commands-integration.test.ts` mocks no `src/` module and its clack `confirm` THROWS — the natural place for "kept edit → second run has no prompt" (run without `--yes`, TTY flags set) and for "`--force` lists before the confirm" (confirm stubbed to record order).
6. `tests/update.test.ts` (251 cases, real planner over a temp tree) has cases that assert a confirm on a plan that changes nothing (frozen re-check etc.). Those expectations change by design; each changed case will be named in the build notes.

## Design

**`src/lib/update-next.ts` (NEW, pure, no fs):**

- `nextRecordStore(apply, extra: { written: FileRecords; retired: ReadonlySet<string> }): { skillsVersion; commit; files }` — exactly the object `applyPlannedUpdate` hands `writeRecords` today (frozen ∪ orphans minus retired ∪ `plan.nextRecords` ∪ written ∪ the models record).
- `nextConfig(config, report, apply, channel, stamp: { pharnVersion; updatedAt }): PharnConfig` — exactly today's `writePharnConfig` argument (drops the previous `pendingSkillsVersion`/`frozenCapabilities`/`ref`, then sets them from the plan).
- `planStateChanges({ config, report, apply, channel, loadedRecords }): { config: boolean; records: boolean }` — compares, as PARSED objects (JSON-normalised, `util.isDeepStrictEqual`, so key order and `undefined`-valued keys never count), `nextConfig` minus `updatedAt`/`pharnVersion` against the LOADED config minus the same two, and `{schemaVersion, …nextRecordStore}` against the loaded store (`readRecords` result `ok`; `absent`/`invalid` → records change, as today: the run writes a store). The loaded config is the one `loadArchetypeConfigOrExit` returned, so a value load-time coercion already dropped (a garbage `ref`/`layout`, a stripped `seam`) never forces a write by itself.
- `changesNothing(report, stateChanges): boolean` — the ONE predicate: no `write` row, no present removal, no root-doc `delete`, no user-data `move` (one clause, a single deletion when CORE-158 removes moves), `.gitignore` and `.prettierignore` not pending, `!stateChanges.config && !stateChanges.records`.

**`src/lib/update-plan.ts`:** `UpdatePlanReport` gains `changesNothing: boolean` and `stateChanges: { config: boolean; records: boolean }` (the latter internal: never projected to JSON). `buildUpdatePlan` keeps the `readRecords` result it already makes and computes both before returning (it needs `channel`, already an input).

**`src/commands/update.ts`:**

- `applyPlannedUpdate` builds its two writes through `nextRecordStore` / `nextConfig` (behaviour-identical refactor) and, FIRST, returns `unchangedOutcome(planned)` when `report.changesNothing` — so a run that writes nothing never sets `updatedAt`/`pharnVersion`, in the snapshot path AND under the lock (the locked re-plan is authoritative; another run may have done the work meanwhile).
- The snapshot path: when `snapshot.planned.report.changesNothing`, skip the future-tense pre-confirm notes, the confirm, the lock and every write; `outcome = unchangedOutcome(...)`; the existing post-run reporting prints the notes (SKIPPED, CAPABILITIES' KEPT, MODELS, HOOKS, ORPHANED, NOT SHIPPED, EXECUTABLE UNIT, ROOT MIGRATION with an empty result, the gitignore/prettierignore refusal warnings, the withheld-version warning) and the outro. `rootMigrationFailed` still sets exit 1 for a blocked move, as today.
- Under `--force`, BEFORE the confirm (and before `--yes` would skip it — notes always print): `reportForcedOverwrites(report)` prints a `--force` note listing every forced write by label and `pharn.config.json` when `models.backup`. Nothing to list → no note.
- TTY gate untouched (it runs before any network call and cannot know the plan).

**`src/lib/update-render.ts`:**

- `forcedOverwriteSections(r, verb: 'WOULD' | 'WILL')` — the extracted WOULD OVERWRITE sections, plus a `… OVERWRITE (--force) — your models block` section naming `pharn.config.json` when `r.models.backup`. `reportDryRun` uses it with `WOULD` (so the dry run gains the config line — consistent with the real run); `reportForcedOverwrites` with `WILL`.
- `noChangeVerdict(r)` → `'Up to date.'` iff `changesNothing ∧ counts.skipped === 0 ∧ recordedVersion === installedVersion`, else `'Nothing to change.'` (C5.3 inherits it).
- `reportOutcome`: an `unchanged` outcome ends with the verdict (plus a dim count tail) instead of the ✔ summary.
- `reportDryRun`: "Nothing would be written." is printed iff `r.changesNothing`; when no file/dir/migration/ignore change remains but state does, it says `Would rewrite only pharn.config.json` / `pharn.records.json` / both (closing the old line's lie); the outro of a changes-nothing plan reads `Dry run — <verdict> …` with no "Run pharn update to apply".

**`src/lib/update-report.ts`:** `plan.changesNothing?: true`, present only when true (status stays `planned`; early returns keep `plan: null`); `schemaVersion` stays 1.

## Files

- `src/lib/update-next.ts` — NEW pure next-state builders + the predicate — CLI lib
- `src/lib/update-plan.ts` — `changesNothing` / `stateChanges` on the report — CLI lib
- `src/lib/update-render.ts` — shared forced-overwrite renderer, verdict, dry-run line/outro, unchanged outro — CLI lib
- `src/lib/update-report.ts` — additive `plan.changesNothing` — CLI lib
- `src/commands/update.ts` — skip confirm + writes on a changes-nothing plan; `--force` list before confirm; writes via the pure builders — CLI command
- `src/lib/install-records.ts` — `stampMismatches` reads an absent config `commit` as `null` (gate-1 change: the absent-commit case must settle) — CLI lib
- `tests/install-records.test.ts` — the absent-commit stamp case — tests
- `tests/update-next.test.ts` — NEW unit tests of the builders and the predicate — tests
- `tests/commands-integration.test.ts` — the two integration cases from the ticket — tests
- `tests/update.test.ts` — expectations for plans that now change nothing; `--force` note — tests
- `tests/update-render.test.ts` — forced-overwrite sections (incl. config), verdict, dry-run line — tests
- `tests/update-report.test.ts` — `changesNothing` present only when true — tests
- `tests/update-dry-run.test.ts`, `tests/update-dry-run-json.test.ts`, `tests/update-plan.test.ts` — adjusted only if a pinned expectation changes (named in build notes) — tests
- `docs/commands/update.md` — both behaviours, the JSON key, the flow steps 6–8 — user docs
- `CLAUDE.md` — the `update` flow paragraph (changes-nothing short-circuit, `--force` list, JSON key) — repo doc
- `CHANGELOG.md` — `## [Unreleased]` entry — repo doc
- `.dev/features/core-162-nothing-to-change/*` — stage artifacts

## Contracts satisfied

- CLAUDE.md "pharn update … Planning is separate from writing": the predicate lives in the planner's read-only report; the writer only short-circuits on it.
- CLAUDE.md "`update --dry-run --json` … additive keys absent when empty": `plan.changesNothing` follows the `plan.orphans` / `plan.absentUpstream` convention; schemaVersion 1.
- CLAUDE.md TTY gate paragraph: unchanged; `--yes` still skips only the confirm.
- CLAUDE.md F-24 (plan before ask): the `--force` list is one more thing named before the confirm.

## Evals to write (P1) — tests before code; new ones must FAIL first

- integration: init v1 → edit CONSTITUTION → serve v2 → `update --yes` (writes) → `update` (no `--yes`, TTY on, confirm throws if reached) → returns normally, `confirm` not called, `pharn.config.json` and `pharn.records.json` byte-identical to before the second run, SKIPPED note printed, outro "Nothing to change." (FAILS today: the throwing confirm is reached).
- integration: init v1 → edit a file → serve v2 → `update --force` with confirm stubbed to `true` → a note listing the edited file is recorded BEFORE the confirm call (FAILS today: no such note).
- integration: a run that writes something still asks (confirm called) and sets `updatedAt` (guard, passes today).
- unit (`update-next`): `changesNothing` false for each single clause (a write, a present removal, a doc delete, a move, gitignore pending, prettierignore pending, config differs, records differ); true when all empty and states equal; key order / `undefined` keys do not count; `updatedAt`/`pharnVersion` excluded; absent store → records change.
- unit (`update-report`): `plan.changesNothing` absent when false, `true` when true.
- unit (`update-render`): `forcedOverwriteSections` lists forced rels by label and `pharn.config.json` when `models.backup`; verdict "Up to date." only with no skips and recorded == installed.
- dry run: a changes-nothing plan prints "Nothing would be written."; a config-only change prints "Would rewrite only pharn.config.json" (FAILS today: prints "Nothing would be written.").

## Guarantee audit (P0)

- "A run that changes nothing writes nothing" → floor: test (integration byte-identity + `update.test.ts` write-function spies); the predicate is a conjunction of membership tests over plan data (P5).
- "`--force` lists every overwrite before the confirm" → floor: test (call-order assertion); advisory that a human reads it.
- "The three surfaces agree" → floor by construction: one boolean on `UpdatePlanReport`, read by all three; pinned by tests on each surface.
- "Load-time coercions never force a write" → floor: unit test comparing against the loaded (coerced) config.

## Trust audit (P2)

- No new untrusted input. File lists printed by the forced-overwrite note are manifest rels (CLI-derived, already printed by the dry run unescaped through the same path); kept as is.

## Determinism audit (P5)

- The predicate is a conjunction of exact membership/equality tests; no heuristics. `isDeepStrictEqual` over JSON-normalised values is exact.

## Gate 1 decision (orchestrator, 2026-11-16): APPROVED WITH ONE CHANGE

Load-time coercions must NEVER force a write. `planStateChanges` compares the two configs only after BOTH sides are read the way `readPharnConfig` reads a config (`loadResolved`): `layout` → `configLayout(x)`, `ref` → `"latest"` iff `channelOf(x) === 'latest'` else absent, `commit` → `x.commit ?? null` (absent ≡ null, whether or not CORE-160 has landed). `seam` needs no step: the loaded config already carries the validated/stripped block and `nextConfig` spreads it. The resolution is ONE function applied to the loaded config and the next config alike — it never special-cases the written side. A real value change (the clone's layout differs from the resolved recorded one, a channel switch, a new commit) still counts.

The records store's `commit` stamp is written as `apply.nextCommit ?? null`: a store written with the key omitted (config `commit` absent) is one `readRecords` refuses as `invalid`, so without it the absent-commit case could never settle. Its type is already `string | null`; with CORE-160 the `?? null` is a no-op.

Tests per coercion: a config missing `layout` (flat clone) + a kept edit → second run changesNothing, `pharn.config.json` byte-identical; same for an absent `commit`; a garbage `ref` dropped at load and a `seam` key stripped at load → no write. Plus: a missing `layout` when the clone is `pharn` IS a change.

Open questions resolved: (a) `OVERWRITE` / `WILL OVERWRITE (--force) — <label>`; (b) yes; (c) yes. `update.test.ts` expectations that change by design are named in the PR body; a test whose purpose was the confirm gets a fixture that really writes.

## Risks

- Parallel CORE-158/159/160/161 edit nearby lines of `update.ts` / `update-plan.ts`; the predicate's move clause is one line so CORE-158 deletes it.

## Open questions (HALT)

- None blocking. Choices taken (orchestrator may override at gate 1): (a) the `--force` note is titled `OVERWRITE` with `WILL OVERWRITE (--force) — <label>` headings; (b) the dry run also gains the `pharn.config.json` models line, since it uses the shared renderer; (c) the dry run's outro for a changes-nothing plan drops "Run `pharn update` to apply".
