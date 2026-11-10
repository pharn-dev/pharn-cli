# PLAN — update-executable-unit

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn update` without `--force` writes the executable unit (floor dir + hooks + product commands) all-or-nothing: if any unit file would be skipped, every unit write is HELD, the version stays withheld, and the report names the blocking files and the `--force` remedy.
- layer(s): src/lib (pure decision + membership), src/commands/update.ts (render wiring only), docs, tests
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

## Live state read this run (P6)

- `src/lib/update-decision.ts` `planUpdate` decides each manifest file independently (rows 1-6). Row 1 (`restored`) and row 3 (`updated`) write regardless of whether a sibling was skipped — the measured mixed-version failure.
- `src/lib/update-plan.ts` derives `versionWithheld = counts.skipped > 0` and `pendingSkillsVersion` (only when every skip group is in `USER_EDIT_SKIPS`).
- Upstream pharn-oss 7.3.1 floor (`~/Projects/pharn-oss/pharn/floor`, non-test): 148 `.mjs`, 3 `.json` data maps (`lens-family-map.json`, `lens-scanner-map.json`, `reconcile-ignore.json`, read by floor CLIs), 1 `README.md`. Hooks: top-level `.cjs`. Commands (`.claude/commands/pharn-*.md`) invoke `node pharn/floor/<cli>.mjs --flag …`.
- Floor dir is layout-dependent: `pharn/floor` (pharn) / `.dev/floor` (flat) — `layoutPaths(layout).floor`.
- Skips exit 0 today; root-migration failure is the only `exitCode = 1` in the apply path.

## Design decisions

1. **Unit membership (path only, no content read — required):** a manifest rel is in the unit iff
   - it is under `layoutPaths(cloneLayout).floor + '/'` (EVERY file the install copies there — not just `*.mjs`: the floor's `.json` maps are read by its CLIs, so a new `.mjs` beside an old map is the same break; the README rides along, rarely edited), or
   - it is a top-level file under `.claude/hooks/` (the manifest already limits it to `isInstalledHookFile`), or
   - it is a top-level product command under `.claude/commands/` (`isProductCommandFile`) — **included (Q1, human: yes)**.
   Implemented as one pure predicate `isExecutableUnitPath(rel, paths)` in a new `src/lib/executable-unit.ts`.
2. **Hold rule (in `planUpdate`, pure):** after per-file decisions, if `!force` and a unit file has `action: 'skip'` (any label: `modified`/`unrecorded`/`unverifiable`/`unreadable`), every unit file whose action is `write` becomes `skip` with the new label **`held`**; its record is carried (never refreshed). Row-2 `noop` files are untouched (already at the new bytes; nothing written). Planner returns `held: { blocking: {rel,label}[], held: string[] } | null`.
3. **Consequences, derived, unchanged code paths:** held files count in `counts.skipped` and appear as a `held` skip group, so `versionWithheld` is true and `pendingSkillsVersion` is null (`held` ∉ `USER_EDIT_SKIPS` — correct: the unit is NOT at the new version, so `add` must not install at it). `--force` never holds (backs up then writes all, as today).
4. **Root migration (Q2, human: yes):** the 7.x root migration moves `memory-bank/` and the SPEC template under `pharn/` — paths the OLD floor still reads. When the unit is held, the planner returns `rootMigration: null` (nothing moved or deleted), and `pendingRootMigration` re-opens later as today.
5. **Exit code: 0.** A held unit is a completed, safe outcome of the same class as today's withheld skips: nothing unproven was overwritten and the executable surface is coherent at the old version. The exit code is not the signal; the report is (`EXECUTABLE UNIT HELD` note + `--json` key). Documented in `docs/commands/update.md`.
6. **Report:**
   - text (real run and `--dry-run`): an `EXECUTABLE UNIT` note listing the blocking files with their labels (capped like SKIPPED), the count of held writes, and the remedy: revert the listed files, or `pharn update --force` (backs them up to `pharn/.backup/` first). SKIPPED gains the `held` group label.
   - `--dry-run --json`: additive `plan.executableUnit: { blocking: [{rel,label}], held: [rel] }`, present ONLY when a hold occurs; `held` may appear as a `label` in `plan.files` / `plan.skipped` only then. `schemaVersion` stays 1; default bytes unchanged otherwise.

## Files

- `src/lib/executable-unit.ts` — `isExecutableUnitPath(rel, paths)` + unit doc comment (membership, justification) — lib
- `src/lib/update-decision.ts` — `held` label, `unit` predicate param on `planUpdate`, hold pass, `held` in `UpdatePlan` — lib
- `src/lib/update-plan.ts` — pass the predicate; `report.executableUnit`; null root migration when held — lib
- `src/lib/update-report.ts` — additive `plan.executableUnit` projection — lib
- `src/lib/update-render.ts` — `EXECUTABLE UNIT` note (both tenses), `held` skip label wording — lib
- `src/commands/update.ts` — call the new note in the real run and the text dry run — command
- `tests/executable-unit.test.ts` — membership table (both layouts, hooks, commands, non-members) — test
- `tests/update-decision.test.ts` — hold pass cases — test
- `tests/update-plan.test.ts` — withheld/pending/root-migration consequences — test
- `tests/update-report.test.ts` — fixture gains `executableUnit: null`; projection of the additive key (added at build: the JSON projection's own suite) — test
- `tests/update.test.ts` — the no-mint partial-failure test moves its failing write off the unit (a held hook is no longer written); hold tests for the command (added at build) — test
- `tests/release-consistency.test.ts` — `KNOWN_TAGS` gains `v0.17.0`, the previous release's tag, which every release PR adds (added at build) — test
- `tests/update-dry-run-json.test.ts` — additive key present only on hold; default bytes unchanged — test
- `tests/commands-integration.test.ts` — fixture clone: one skipped (edited) floor file + one new floor file; assert no unit file written, report content, exit code 0 — test
- `docs/commands/update.md` — the unit, the hold, exit code, `--force` remedy, JSON key — docs
- `docs/troubleshooting.md` — "update held the executable unit" entry — docs
- `CHANGELOG.md` — `## [0.18.0]` entry + compare links — docs
- `package.json`, `package-lock.json` — version 0.18.0 — release
- `CLAUDE.md` — one paragraph under the update section — docs

## Contracts satisfied

- None in `pharn-contracts/` (installer behavior, not an inter-layer schema). Satisfies CLAUDE.md "Releasing" (bump travels in the PR; `tests/release-consistency.test.ts`).

## Evals to write (P1)

- isExecutableUnitPath → `pharn/floor/a.mjs`, `pharn/floor/sub/x.json`, `.dev/floor/a.mjs` (flat), `.claude/hooks/h.cjs`, `.claude/commands/pharn-ship.md` → true; `pharn/pharn-review/lenses/x/SKILL.md`, `pharn/CONSTITUTION.md`, `pharn/floorplan/a.mjs` (prefix trap), `.claude/commands/other.md` → false.
- planUpdate hold → one `modified` floor file + one `restored` floor file + one `updated` hook + one `updated` non-unit doc → floor/hook writes become `held`, the doc is still written, `held.blocking` = the modified file.
- planUpdate no hold → no unit skip → output byte-identical to today (deep-equal with/without predicate).
- planUpdate force → no hold, backups as today.
- planUpdate unreadable/unverifiable unit file → hold.
- buildUpdatePlan → versionWithheld true, pendingSkillsVersion null, nextRecords carry previous for held files; root migration null when held.
- dry-run --json → `plan.executableUnit` present on hold, absent otherwise; default bytes unchanged.
- integration (real `runUpdate --yes`) → new floor file NOT written, edited floor file untouched, non-unit file written, config `skillsVersion` unchanged, no `pendingSkillsVersion`, output names the blocking file and `pharn update --force`, exit 0 (no ProcessExit, exitCode unset).

## Guarantee audit (P0)

- "without `--force`, the unit is never written partially" → floor: pure set-membership (path prefix / predicate) over the planner's own skip decisions, which themselves reduce to content-hash equality; tested by the hold cases.
- "membership is by path only" → floor: predicate takes `rel` + layout paths, no fs (the module imports no `node:fs`; pinned by a static test).
- "the unit is coherent at the old version after a hold" → ADVISORY. pharn guarantees only that it wrote no unit file; it cannot prove the user's edited old files work together, nor that a row-2 file already identical to upstream is compatible. Stated in docs.
- "commands and floor are coupled" → ADVISORY rationale for membership; not inferred from contents.
- Non-unit files (capability `.md`, docs, contracts, pharn-core) still upgrade per file — named limit in docs.

## Trust audit (P2)

- Rel paths come from the install manifest (clone-enumerated, already `safeJoin`/symlink-guarded and name-validated). The predicate only tests string prefixes; blocking rels printed in the note go through the same `terminalSafe`/escape path SKIPPED uses; JSON through `serializeJsonReport`.

## Determinism audit (P5)

- Every branch: label membership (`action === 'skip'`), prefix test, `force` boolean. No fallback guesses.

## Open questions (HALT)

- None. Q1 (commands in unit) → YES; Q2 (hold root migration) → YES; plan approved as written (2026-11-10).
