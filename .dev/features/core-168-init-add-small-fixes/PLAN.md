# PLAN — core-168-init-add-small-fixes (Linear CORE-168, C2.6)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: four small exit-code / message fixes in `init` and `add` — (1) the bare `pharn add` picker counts failed picks, names them in its outro and exits 1; (2) `init` in a subdirectory of a git repository names the repository root instead of advising `git init`; (3) `init --yes` over an existing `pharn.config.json` refuses BEFORE the fetch (zero network), which makes the `--yes` removal branch unreachable, so it is deleted; (4) the init summary prints the archetypes once, `row()` keeps a two-space gap, and the skip reason reads `archetypes […]` instead of `detected […]`.
- base: origin/main @ 688a838 (0.19.0 released). Delivery branch `przemek/core-168-c26-small-exit-code-and-message-fixes-in`. Ticket line numbers were at b14cf22; re-located below.
- layer(s): CLI source (`src/steps/*`, `src/commands/{add,init}.ts`, `src/lib/{format,resolve-capabilities,write-targets,init-report}.ts`), tests, docs (`docs/commands/{init,add}.md`, `docs/troubleshooting.md`, `CLAUDE.md`, `CHANGELOG.md`).
- constitution_refs: [P1, P4, P5, P6, P7]

## Why (discovery, live state this run)

1. `src/steps/add-picker.ts` `resolveAddPicker` loop: an `{kind:'error'}` pick is `logError`ed and the loop continues; the comment calls it "Defensive … unexpected", but `resolveArchetypeAdd` (`src/commands/add.ts`) returns `{kind:'error'}` for a symlinked component under the capability dir (`scan.unsafe`) — reachable. `runAddPicker` then prints `✔ Added N capabilities.` (N may be 0) and exits 0.
2. `src/steps/prereqs.ts` checks only `cwd/.git` and prints `git not found. Run: git init …` — in a monorepo's `apps/web` that creates a nested repository.
3. `src/commands/init.ts`: `fetchRepo` (in `runInitArchetype`) runs before `assertNoExistingTargets` (the `if (yes)` branch after the summary). `conflictingWriteTargets` (`src/lib/install-manifest.ts`) always adds `pharn.config.json` when `existsSync` → a `--yes` re-install is a certain refusal that needs no network. `assertNoExistingTargets`' removal branch (`src/lib/write-targets.ts`) runs first and only picks another message; removals come only from the replaced config's carry-over (`carryOver` / `planInitRemovals`), which requires a readable `pharn.config.json` — so after (3) it is unreachable. Mirrors: init's text dry-run line `--yes would refuse: N capability director…` and `init-report.ts` `yesWouldProceed`'s `!p.removals.some(r => r.present)` clause.
4. `init.ts` prints `note(archetypes, 'Detected archetypes' | 'Archetypes (from --archetype)')` and the summary prints the same block again (`archetypeOriginLines`). `row()` (`src/lib/format.ts`) = `` `  ${label}`.padEnd(28) + value `` — a label ≥ 26 chars runs into the value. `resolve-capabilities.ts` reason = `applies to [..]; detected [..]` even under `--archetype` (and for `update`, whose input is the recorded archetypes).

## Files

- `src/steps/add-picker.ts` — `PickerAddOutcome` `installed` gains `failed: string[]` (the picks' own `role:name` values, from the validated index); an `error` pick is pushed there (still `logError`ed per pick as today, loop continues). The comment is corrected: reachable (e.g. a symlinked directory under the capability dir), not defensive. — layer CLI step
- `src/commands/add.ts` — `runAddPicker`'s final outro: no failures → byte-identical `✔ Added N capabilit(y|ies).`, exit 0; any failure → outro `Added N capabilit(y|ies); M failed: <role:name>, ….` (or `No capabilities were added; M failed: …` when N = 0) and `process.exit(1)`. — layer CLI command
- `src/steps/prereqs.ts` — when `cwd/.git` is absent, walk the ancestors (`dirname` until the filesystem root, `existsSync(join(dir, '.git'))` — the same predicate as today, so a worktree/submodule `.git` file counts) via an exported pure `findAncestorGitRoot(start)`; found → `<cwd> is inside the git repository at <root>, not at its root.\n  Run \`pharn init\` from the repository root (<root>).`(paths through`escapeUnsafe`, the one display escaper for local paths); none → the current message byte-identical. Same exit 1, same stderr / `{json}` plain path. — layer CLI step
- `src/lib/write-targets.ts` — add `existingConfigRefusal(projectRoot): string | null` (`existsSync(safeJoin(projectRoot, PHARN_CONFIG_FILE))`, i.e. `conflictingWriteTargets`' own predicate for that target): `pharn init --yes installs only into a project where none of its files exists yet, and pharn.config.json already exists.` + the SAME two trailing lines (`--yes never overwrites. Run \`pharn init\` in a terminal …` / `` `pharn init --dry-run`… or`pharn update`… ``), single-sourced as a`YES_WAYS_FORWARD`constant shared with`assertNoExistingTargets`. DELETE `assertNoExistingTargets`' removal branch; its parameter type becomes `Omit<WriteTargetsParams, 'removals'>` (a removal is unrepresentable there); header/doc comments updated (why unreachable: a removal needs a replaced config, which is itself a target). — layer CLI lib
- `src/commands/init.ts` — (a) in `runInit`, right after the TTY gate and BEFORE the banner/intro, detection and every network call: `if (yes && !dryRun)` → `existingConfigRefusal(process.cwd())` → `reportFatal(msg)` (a policy refusal, no PHARN_DEBUG hint, as today) + `exit(1)`; (b) the two `assertNoExistingTargets` calls stop passing `removals` (the non-`--yes` branch keeps `planInitRemovals` for the prompt; comment: the conflicts check subsumes any removal, since a config that appears after the pre-fetch check is itself a conflict — and `assertConfigFingerprintUnchanged` refuses first under the lock); (c) delete the separate `note(archetypes…)` (the summary's `archetypeOriginLines` is the one place); (d) the text dry run's `--yes` line drops its `deletes.length > 0` branch (overwrite count only). The `--yes` gate comment above the TTY check is updated. — layer CLI command
- `src/lib/init-report.ts` — `yesWouldProceed: p.counts.overwrite === 0` (the removal clause deleted; its field comment updated). — layer CLI lib
- `src/lib/format.ts` — `row()`: `const left = \` ${label}\`; return left.padEnd(Math.max(28, left.length + 2)) + value;` (labels ≤ 24 chars byte-identical; longer ones keep a two-space gap). — layer CLI lib
- `src/lib/resolve-capabilities.ts` — reason `applies to [..]; archetypes [..]` (neutral: the input is detection, `--archetype`, or `update`'s recorded archetypes). — layer CLI lib
- Tests (written/edited FIRST, see Evals): `tests/add.test.ts`, `tests/prereqs.test.ts`, `tests/init-yes.test.ts`, `tests/write-targets.test.ts`, `tests/init-report.test.ts`, `tests/init-dry-run.test.ts`, `tests/init.test.ts`, `tests/format.test.ts`, `tests/archetype-summary.test.ts`, `tests/resolve-capabilities.test.ts`; skip-reason FIXTURE literals in `tests/merge-capabilities.test.ts` / `tests/init.test.ts` / `tests/init-report.test.ts` / `tests/archetype-summary.test.ts` updated to the new wording for consistency (they are inputs, not assertions). Plus whatever existing assertion the build finds pinning a ≥ 25-char `row()` label or the removed note.
- `docs/commands/init.md` — `--yes` section: a re-install refuses before downloading anything, naming only `pharn.config.json`; delete "It also refuses, the same way, when the install would delete…" and adjust the dropped-capabilities bullet ("`--yes` refuses … anyway, since `pharn.config.json` exists" → refused before the download); mermaid `Detected archetypes note` → archetypes shown in the summary; §"Archetype detection" "shown in a 'Detected archetypes' note" → in the install summary; §5 skip-reason example `applies to [backend]; archetypes [ssr]` + note that `init --dry-run --json` `capabilities.skipped[].reason` carries the same text and `update` resolves through the same function; prerequisites/§git: the subdirectory message.
- `docs/commands/add.md` — bare picker: a pick that fails is named in the outro and the command exits 1.
- `docs/troubleshooting.md` — "Git not found": the subdirectory variant (run from the repository root, never `git init` there); the TTY paragraph's `init --yes` re-install sentence (refused before any download).
- `CLAUDE.md` — the TTY/`--yes` paragraph (re-install refused pre-fetch by `existingConfigRefusal`, before the banner; the in-run check still runs before the lock and under it for every other target), the init removal sentence ("`init --yes` REFUSES any present removal" → unreachable: refused pre-fetch since the config is a target), the step-1 prereq line (ancestor `.git` → repository-root message), the `yesWouldProceed` note (already `counts.overwrite === 0` — verify), and one line for the picker exit code in the `add` paragraph.
- `CHANGELOG.md` — `## [Unreleased]` → `### Fixed`: four bullets (picker exit 1; subdirectory advice; `--yes` refuses before downloading; summary output — archetypes once, gap, skip-reason wording shared by `update` and `init --dry-run --json` `capabilities.skipped[].reason`). No version bump.

## Contracts satisfied

- CLAUDE.md "The two prompting commands hard-fail off a TTY" / `init --yes` contract: `--yes` still never answers the overwrite question; a re-install still refuses with exit 1, nothing written, the same three ways forward — only earlier (before the fetch) and naming only `pharn.config.json`.
- CLAUDE.md `init --dry-run --json` contract: `yesWouldProceed` = `counts.overwrite === 0`; `schemaVersion` stays 1; no key added/removed. `init --dry-run` (with or without `--yes`) is never refused by the new gate (`yes && !dryRun`).
- CLAUDE.md "Every refusal … one stderr line"/"a refused init prints its one stderr error and nothing on stdout": the new refusal sits before the banner/intro.
- P5: every new branch is a membership/existence test (`existsSync`), the fallback is the unchanged message.

## Evals to write (P1) — each fails before the code change

- add (picker, real tmp project `runAdd — pharn.records.json` suite): picks `griller:a11y` (symlinked `evals/` under its dir → refused) + `lens:n-plus-one` → `runAdd(undefined)` rejects `ProcessExit(1)`; `outro` names `griller:a11y` and says 1 failed; n-plus-one still installed. FAILS today (exit 0, "Added 1"). All-succeed case: existing test stays green and additionally asserts the outro is exactly `✔ Added 2 capabilities.` and no exit.
- prereqs: tmp `repo/.git` + `repo/apps/web`, cwd = `apps/web` → exit 1; message contains the repo root path and `pharn init`, does NOT contain `git init`; `{json:true}` → same text via console.error. FAILS today. Outside any repo: the existing 'git not found'/'git init' cases unchanged. `findAncestorGitRoot` unit: nearest ancestor wins; a `.git` FILE counts; none → null.
- init-yes: existing `pharn.config.json` (+ the F-04 re-install case) → exit 1, `fetchRepo` NOT called, `snapshotTree` unchanged, stderr names `pharn.config.json`, `pharn init`, `pharn init --dry-run`, `pharn update`, `never overwrites`, and does NOT contain `never deletes`; nothing on stdout (`intro`/`note` not called). FAILS today (fetch called). `init --dry-run --yes` over an existing config is NOT refused (fetch called, plan printed).
- write-targets: the removal-only case now passes `assertNoExistingTargets` when nothing else exists (the branch is gone — type-level `Omit` pins it); `existingConfigRefusal`: absent → null; present (file, directory, live symlink) → the message; dangling symlink → null (matches `conflictingWriteTargets`).
- init-report: `yesWouldProceed` table — the removal case's fixture made realistic (`overwrite: 1`, since a removal implies an existing `pharn.config.json`), expectation unchanged (`false`); every other existing case unchanged.
- init-dry-run (text): the removal case's `--yes` line now reads `would refuse: N existing file(s) would be overwritten.`. FAILS today.
- init: `note` is never called with `'Detected archetypes'` / `'Archetypes (from --archetype)'` titles. FAILS today.
- format: `row('A','B')` unchanged; a 26-char label → `'  ' + label + '  ' + value` (FAILS today: zero gap); 24-char label byte-identical to today.
- archetype-summary: a long capability name row keeps ≥ 2 spaces before the value (FAILS today).
- resolve-capabilities: skip reason equals `applies to [backend]; archetypes [ssr]` (FAILS today).

## Guarantee audit (P0)

- "`init --yes` over an existing config makes zero network requests" → floor: the gate is a synchronous `existsSync` before `runInitArchetype` (whose first network call is `resolveSource`/`fetchRepo`); pinned by a test asserting `fetchRepo` not called.
- "`--yes` never deletes" (still true after the branch is gone) → floor: any removal requires a readable replaced `pharn.config.json` (`carryOver`), which is itself a `conflictingWriteTargets` target → `assertNoExistingTargets` throws on `conflicts.length > 0` before the lock and under it (and `assertConfigFingerprintUnchanged` refuses first under the lock). Pinned by the existing init-yes F-04 case (rewritten) + the under-lock case.
- "`yesWouldProceed` unchanged" → floor: same reduction (removal present ⇒ config exists ⇒ `counts.overwrite ≥ 1`); every existing integration case keeps its value.
- "the picker exits 1 iff some pick failed" → floor: `failed.length > 0` membership; tests both ways.
- "subdirectory message names the repository root" → floor: `existsSync` ancestor walk; advisory caveat named below.
- "`row()` keeps a two-space gap" → floor: arithmetic, unit-tested.

## Trust audit (P2)

- New display of a LOCAL path (the cwd and the ancestor repository root): the user's own directory names, printed through `escapeUnsafe` (`lib/terminal-safe.ts`), never joined into a write. Picker failure names are the picks' `role:name` values — options built from the validated capability index (`CAPABILITY_NAME_RE`). No new untrusted input.

## Determinism audit (P5)

- All branches are existence/membership tests; the no-ancestor fallback is the unchanged message.

## Named residual (advisory)

- A `.git` in an unrelated ancestor (e.g. a dotfiles repository in `$HOME`) makes a fresh project in a subfolder hear "run from the repository root (~)" rather than `git init`. The ticket asks for this message whenever an ancestor has `.git` and for no `git init` suggestion there; documented in troubleshooting ("if that is not your project's repository, create one in this directory with `git init`" is deliberately NOT printed by the CLI, but the troubleshooting page says so).

## Open questions (resolved by the orchestrator's brief)

- Skip-reason wording: neutral `archetypes [..]` (no origin threading) — decided.
- `yesWouldProceed` unit fixture with removals but `overwrite: 0` is a state the CLI cannot produce; the fixture is made realistic (`overwrite: 1`) with the expected value unchanged. Flagged at GATE 1.
- Picker outro wording (proposed above) — flagged at GATE 1.

## Build note

Landed as planned on the plan's files plus the named tests. Tests were written first and failed (22 new/changed cases red before the code). The picker returns `failed[]`; `runAddPicker` names them in the outro and exits 1. `runGitPrereq` names the nearest strict ancestor holding `.git` (`findAncestorGitRoot`). `existingConfigRefusal` refuses `init --yes` before the banner and any fetch; `assertNoExistingTargets` takes `Omit<WriteTargetsParams, 'removals'>` and lost its removal branch; the text dry run's `--yes` line and `yesWouldProceed` use the overwrite count alone. The archetype note is gone, `row()` keeps a two-space gap, and the skip reason reads `archetypes […]`. Grill responses: a directory at `pharn.config.json` under `--yes` now gets the pre-fetch message (tested); the new refusal test asserts `showBanner`/`intro`/`note` uncalled and a global `fetch` spy untouched; the full suite ran right after the code (no pinned long-label rows broke); the picker comment says a THROWN pick still aborts via the catch. Floor: `CI=1 npm run check` GREEN (109 files, 3681 tests), `validate.mjs` GREEN.
