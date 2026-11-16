# PLAN — core-159-held-unit-pending (Linear CORE-159, C1.2)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: a version bump withheld only by the user's own edits — including one that held the executable unit — records `pendingSkillsVersion`, so `pharn add` keeps working; a hold with any non-user-edit blocker still records nothing, and `add`'s refusal then points at `pharn update --dry-run` and the two ways out; the EXECUTABLE UNIT note names unit files that are missing and were not restored (additive `UnitHold.missing`).
- base: origin/main @ 991b229 (0.19.0 + CodeRabbit chore). Worktree branch; delivery branch `przemek/core-159-c12-a-held-executable-unit-no-longer-locks`. No version bump.
- layer(s): CLI source (`src/lib/*`, `src/commands/*`, `src/types.ts`), tests, user docs (`docs/commands/update.md`, `docs/commands/add.md`, `docs/reference/pharn-config.md`), `CLAUDE.md`, `CHANGELOG.md`. No trusted (hook-protected) doc changes.
- constitution_refs: [P0, P1, P4, P5, P7]

## Discovery (live state at 991b229; the ticket's line numbers moved)

- `src/lib/update-plan.ts:310-315` — `pendingSkillsVersion = versionWithheld && installedVersion !== nextSkillsVersion && plan.skipped.every(g => USER_EDIT_SKIPS.has(g.label))`. `USER_EDIT_SKIPS` at `:78`. Comment `:306-309`.
- `src/lib/update-decision.ts:322-359` — `holdUnitWrites`; `UnitHold {blocking, held}` at `:199`. A held write whose label was `restored` is an absent file.
- `src/commands/add.ts:93-97` (gate comment), `:118-122` (the two refusal messages), `:129-133` (`addStamp` comment).
- `src/commands/update.ts:293-295` (ahead-guard comment) and `:319` (message "every file you did not edit at v…").
- `src/types.ts:84-87` — the `pendingSkillsVersion` field comment says the same.
- `src/lib/update-render.ts:157-182` — `executableUnitLines`. `src/lib/update-report.ts:143-149` + `:293-302` — `plan.executableUnit` type + projection.
- Docs: `update.md:217` (`version.pending`), `:221` (`plan.executableUnit`), `:479-483` (the false paragraph), `:632-633` ("every other file is already at that version"); `add.md:78-95`; `reference/pharn-config.md:128-133` ("the version it applied to everything else"). CLAUDE.md: the `add` gate sentence, the update paragraph's "When a run withholds the `skillsVersion` bump SOLELY…" and "So `versionWithheld` is true and `pendingSkillsVersion` null (`held` ∉ `USER_EDIT_SKIPS`)".
- Readers of `pendingSkillsVersion` (ticket list) re-checked: load, writer, update's ahead guard, config write/clear (`update.ts:998, 1012`), `add` gate + `addStamp`, dry-run line (`update-render.ts:456`), JSON `version.pending`. All stay correct; `status` does not read it.

## Files

- `src/lib/update-plan.ts` — the pending rule becomes `plan.skipped.every((g) => USER_EDIT_SKIPS.has(g.label) || g.label === 'held')`. `USER_EDIT_SKIPS` unchanged (`held` NOT added). Rewrite the comment: withheld only by user edits, or by a unit hold those edits caused (`held` exists only when a unit file was skipped, and that blocker's own label is in `skipped`, so an `unverifiable`/`unreadable` blocker fails the test); every file outside the unit and the kept edits is at `installedVersion`; `add` writes capability dirs only — outside the unit, and written at the new version even under a hold — so the pending gate is correct for it.
- `src/lib/update-decision.ts` — `UnitHold` gains `missing?: string[]` (set only when non-empty). `holdUnitWrites` collects held rels whose label was `restored` AND that were installed before (see Open question 2 for the exact rule), sorted.
- `src/lib/update-render.ts` — `executableUnitLines`: when `hold.missing` is non-empty, add a block after the held count: these unit files are missing and `were not restored` / `would not be restored`; they stay missing until the hold ends (capped like blockers, `terminalSafe` per path). Without `missing`, the note's lines are byte-identical.
- `src/lib/update-report.ts` — `plan.executableUnit.missing` additive, present only when non-empty (type doc + projection). `schemaVersion` stays 1.
- `src/commands/add.ts` — refusal messages: no-pending → names the target version, `pharn update`, and, when it cannot finish, `pharn update --dry-run` (shows which files block it) and the two ways out (revert them, or `pharn update --force`, backs up first), then re-run `pharn add` (see Open question 3). Pending-but-third-version → same tail, with "(partly at v<pending>)" instead of "(… apart from files you edited)". Fix the gate comment (`:93-97`) and `addStamp` comment (`:129-133`).
- `src/commands/update.ts` — comment `:293-295` and the outro `:319` (`every file you did not edit at v…` → `partly upgraded to v…`). No logic change.
- `src/types.ts` — `pendingSkillsVersion` field comment.
- `tests/update-plan.test.ts` — INVERT 'the executable-unit hold' › 'holds the new floor file, withholds the version, records nothing pending' (the one ticket-named inversion): title + `pendingSkillsVersion` → `'7.0.0'`; `apply.nextSkillsVersion` stays `'6.0.0'`. NEW: a hold whose blocker is `unrecorded` → pending `'7.0.0'`; a hold with an `unreadable` blocker (a directory at the floor path) → pending `null`; a hold with no usable store (`unverifiable`) → `null`; a hold plus a non-unit `modified` skip → pending.
- `tests/update-decision.test.ts` — NEW: `missing` lists a held, previously-recorded, absent unit file; a new upstream unit file (no record) is not in it; absent `missing` when none.
- `tests/update-render.test.ts` — NEW: the missing block in both tenses, capped, control chars stripped; no block without `missing`.
- `tests/update-report.test.ts` — NEW: `missing` projected inside `executableUnit` only when non-empty (the existing toEqual stays).
- `tests/add.test.ts` — NEW: the no-pending refusal names `pharn update --dry-run`, `pharn update --force` and `revert`; the third-version refusal also names `--dry-run`. Existing assertions unchanged.
- `tests/commands-integration.test.ts` — NEW case: init, edit `PLAN_COMMAND`, delete `.claude/hooks/guard.cjs`, upstream 2.0.0, `update --yes` → hold, hook not restored, note names it as missing, `skillsVersion` 1.0.0, `pendingSkillsVersion` 2.0.0; `add a11y` → exit 0 (stamp stays 1.0.0/SHA_V1); revert the edit, `update --yes` → complete: `skillsVersion` 2.0.0, pending cleared, hook restored. Plus the forced flip in the existing hold case (Open question 1).
- `tests/update-dry-run-json.test.ts` — the forced flip (Open question 1) + `missing` absent/present check if cheap.
- `docs/commands/update.md` — `:479-483` rewritten (pending recorded when every blocker is a user edit; not when any is `unverifiable`/`unreadable`; a deleted unit file such as a hook stays missing until the hold ends); `:217` `pending` wording; `:221` `missing`; `:632-633` "every other file" → accurate.
- `docs/commands/add.md` — the refusal example text and the "Kept local edits" paragraph (a hold counts; the new refusal names `--dry-run`).
- `docs/reference/pharn-config.md` — `:128-133` `pendingSkillsVersion` description made accurate.
- `CLAUDE.md` — the three sentences listed above.
- `CHANGELOG.md` — `### Fixed` bullet under `## [Unreleased]`.
- `.dev/features/core-159-held-unit-pending/*` — the pipeline artifacts.

## Contracts satisfied

- `CLAUDE.md` § `pharn add` addressing — the version gate's pending exception and `addStamp` (unchanged mechanism; its precondition widened).
- `CLAUDE.md` § `pharn update` — "The executable unit is written all-or-nothing (0.18.0)": the hold itself is unchanged (`USER_EDIT_SKIPS` unchanged, `--force` never holds, `rootMigration` still null while held); only what is recorded about it changes.
- `--dry-run --json` additive-key convention (`plan.orphans`/`plan.absentUpstream`): `missing` absent when empty, so a hold without missing files keeps its 0.18.0 bytes.
- `CLAUDE.md` § Testing: tests first; the integration suite exercises real modules.

## Evals to write (P1) — the NEW ones must FAIL before the code change

- planner: hold by a `modified` floor file → `pendingSkillsVersion === '7.0.0'` (FAILS today: null).
- planner: hold by `unreadable` / `unverifiable` blocker → `null` (passes today; pins the boundary).
- decision: held absent recorded unit file → `held.missing` contains it (FAILS today).
- render: `missing` block printed (FAILS today).
- report: `executableUnit.missing` projected (FAILS today).
- add: no-pending refusal contains `pharn update --dry-run` (FAILS today).
- integration: edit command + delete hook → update → `add` exit 0 (FAILS today: exit 1), revert → update completes, pending cleared.

## Guarantee audit (P0)

- "pending is recorded only when every skip is a user edit or `held`" → floor: enum membership over `SkipLabel` (P5), unit-tested.
- "a hold with a non-user-edit blocker records nothing" → floor: the blocker's label is in `plan.skipped`, so the same membership fails; unit-tested.
- "`add` at a pending version never writes inside the executable unit" → structural: `add` copies capability directories only (`installCapabilityDirs`), and `isExecutableUnitPath` never matches a capability subtree. Advisory statement in the comment; no new mechanism.
- "the note names missing unit files" → floor: label `restored` on a held unit file + a record key; unit-tested. The wording ("stay missing until the hold ends") is advisory prose.
- The JSON key shape → pinned by `update-report.test.ts`.

## Trust audit (P2)

- `missing` rels come from the clone's manifest keys (already `COPY_FILENAME_RE`/`safeJoin`-validated paths) and are printed through `terminalSafe` like blockers, and escaped once by `serializeJsonReport` in JSON. No new untrusted input.

## Open questions (HALT) — RESOLVED at GATE 1 (orchestrator, 2026-11-16)

- Q1 → invert both extra assertions; list all three inversions with their reason in the PR body.
- Q2 → `missing` = held ∧ label `restored` ∧ in the previous records; with no usable store every held `restored` rel, worded "not on disk". Existing toEquals untouched; one test for the no-store wording.
- Q3 → the recommended wording; "partly at vX" for the pending case. pharn-config.md fix in scope.

Original questions:

1. **More than one assertion flips.** The ticket allows exactly one assertion change (`update-plan.test.ts`). Two more pin the same 0.18.0 decision and fail under the new rule: `tests/commands-integration.test.ts:563` (`expect(cfg.pendingSkillsVersion).toBeUndefined()` after a hold caused by a `modified` floor file, with the comment "nothing is pending: the unit is not at 2.0.0") and `tests/update-dry-run-json.test.ts:550` (`version: {withheld: true, pending: null}` after a hold caused by a `modified` hook). Recommendation: invert both (`'2.0.0'` / `'1.1.0'`, comments rewritten), and keep the "records nothing" boundary covered by the new `unreadable`/`unverifiable` planner tests; explain all three in the PR body. Alternative: change those two fixtures to an `unverifiable` blocker so `null` still holds — rejected by me, it silently changes what the tests cover.
2. **Which files count as `missing`.** The ticket says "held rels whose label was `restored`". That label also covers a file NEW upstream (never installed — e.g. `NEW_FLOOR` in the existing fixtures), so the literal rule would add `missing` to three existing `toEqual` assertions on the hold object and call a never-installed file "missing / not restored". Recommendation: `missing` = held, label `restored`, AND the previous records baseline has the rel (it was installed and is gone); with NO usable store, every held `restored` rel (pharn cannot tell deleted from new then; the wording says "not on disk"). This covers the ticket's case (a deleted hook has a record), leaves the existing `toEqual`s untouched, and keeps "missing" true. Alternative: the literal rule, with the three `toEqual`s extended by a `missing` field.
3. **`add`'s no-pending refusal wording.** The ticket says not "run `pharn update` first", but the same message is also the answer for a user who simply has not run `update` yet (add cannot tell the two apart). Recommendation: `… installs only at the version your project is already on. Run \`pharn update\` to move it to v<fetched>; if update cannot finish (\`pharn update --dry-run\` shows which files block it), revert those files or run \`pharn update --force\` (it backs them up to pharn/.backup/ first), then re-run \`pharn add\`.`Alternative: drop "Run`pharn update`" entirely.
