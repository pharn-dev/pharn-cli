# PLAN — core-164-init-carry-over (Linear CORE-164, C2.2)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: a `pharn.config.json` with a valid `capabilities` array but no `modules` key loads in every command, so a re-run `init` carries its manual capabilities over and names the dropped ones; a previous config that EXISTS but cannot be read as a config makes `init`'s summary (real run, `--yes`, text dry run) say so, with the reason, instead of silently dropping the manual capabilities.
- base: origin/main @ 688a838 (0.19.0 released + CORE-158/159/160/161/162). Delivery branch `przemek/core-164-c22-re-run-init-carries-capabilities-over`. No version bump.
- layer(s): CLI source (`src/lib/pharn-config.ts`, `src/lib/init-plan.ts`, `src/steps/archetype-summary.ts`, `src/commands/init.ts`, `src/steps/install-archetype.ts` comment, `src/types.ts` comment), tests, user docs (`docs/commands/init.md`, `docs/reference/pharn-config.md`), `CLAUDE.md`, `CHANGELOG.md`. No trusted (hook-protected) doc changes.
- constitution_refs: [P1, P4, P5, P6, P7]

## Discovery (live state at 688a838; the ticket's line numbers moved)

- `src/lib/pharn-config.ts:442` — the guard `typeof raw.skillsVersion !== 'string' || !Array.isArray(raw.modules)` → `null`. Comment `:438-441`. Below it: `validateSeamConfig`, `validateCapabilityEntries` (F-30: a present non-array `capabilities` throws), `validateCapabilitySources`, then `validateArchetypes`/`validateStamp` for an array `capabilities` only.
- `src/lib/init-plan.ts:141-161` — `PreviousConfig {fingerprint, config}`; `readPreviousConfig` takes the fingerprint first, then `try { readPharnConfig } catch { null }` (the reason is thrown away). `resolveInitSelection` `:276-306` calls it; `carryOver(previous.config, …)`. `readCarriedEntries` comment `:364-378` cites the `modules` guard.
- `src/lib/init-plan.ts:507-534` `previousChannelLines` — the existing re-run summary lines; `InitPlanReport.channelLines` `:407-408`, filled in `buildInitPlan` `:613`.
- `src/steps/archetype-summary.ts:95-140` `archetypeSummaryLines(archetypes, selection, origin, previous, channelLines)`; `runArchetypeSummary` `:142-175` prints it in a `note` BEFORE its `select` prompt.
- `src/commands/init.ts:286-331` — real run: `resolveInitSelection` → `reportCarry` → `recordedArchetypes` + `previousChannelLines` → `--yes`: `note(archetypeSummaryLines(…))`; else `runArchetypeSummary(…)`. `--yes` then refuses an existing config at `assertNoExistingTargets` (`:370`), AFTER the summary. Dry run `:605-613` `reportInitDryRun` → `archetypeSummaryLines(…, r.channelLines)`.
- `configFingerprint` (`pharn-config.ts:619`) → `'absent'` iff the file is absent.
- `src/lib/init-report.ts` does NOT project `channelLines` (`tests/init-report.test.ts:187` pins its absence); `tests/init-report.test.ts:26` builds an `InitPlanReport` literal.
- No test mocks `src/lib/init-plan.js`. `tests/init-dry-run.test.ts` mocks `pharn-config.js` with pass-through spies only.
- Stale "0.3.0–0.12.0" range: `src/types.ts:121`, `src/steps/install-archetype.ts:352`, `CLAUDE.md:58`. (Every released CLI 0.3.0–0.19.x has the strict guard.)
- Docs: `docs/commands/init.md:476-483` ("Capabilities are carried over only from a config the other commands would accept…"), `docs/reference/pharn-config.md:358-372` (carried keys: "a config missing its `modules` array (the case where they tell you to run `pharn init`)"), `:382-386` (Legacy fields: "deleting either makes the file unreadable … without a `modules` array is treated as absent").

## Files

- `src/lib/pharn-config.ts` — the guard ONLY (keeps the CORE-165 merge trivial): `if (typeof raw.skillsVersion !== 'string' || (!Array.isArray(raw.modules) && raw.capabilities === undefined)) return null;` — i.e. read on `typeof skillsVersion === 'string' && (Array.isArray(raw.modules) || raw.capabilities !== undefined)`. Never requires `capabilities`, so a pre-archetype config (`modules`, no `capabilities`) still loads → `LEGACY_CONFIG_MESSAGE`, and a present non-array `capabilities` (no `modules`) now reaches `validateCapabilityEntries` → `CapabilityEntryError` (F-30). Rewrite the comment above it: why `modules` alone still suffices (pre-archetype), why `capabilities` presence suffices (archetype), and that init still WRITES `modules: []` for older CLIs.
- `src/lib/init-plan.ts` —
  - `PreviousConfig` gains `unreadable: string | null`: why the file that EXISTS could not be read as a config (display text), `null` when it is absent or was read.
  - `readPreviousConfig`: keep fingerprint-first; on a throw, `unreadable = terminalSafe(escapeUnsafe(firstSentence(errorMessage(err))), {max: 200})` (see Q2; the named validation errors already escape offenders; `escapeUnsafe` is lossless defense in depth); on a `null` read with `fingerprint !== 'absent'`, `unreadable = describeUnreadConfig(cwd)` — a private helper over ONE `readJsonBounded(configPath(cwd))` returning fixed text only (never file content): `unusable` → `it ${read.reason}`; `ok` but not a plain object → `it is not a JSON object`; no string `skillsVersion` → `it has no "skillsVersion" string`; else → `it has neither a "capabilities" key nor a "modules" array`; `absent`/`invalid-json` (a race after the first read) → `it changed while init was reading it`. Every branch is a membership test (P5).
  - NEW `previousConfigLines(previous: Pick<PreviousConfig, 'unreadable'>): string[]` → `[]`, or the one summary line `    the previous pharn.config.json could not be read (<reason>); nothing is carried over, so manual capabilities will be dropped`.
  - `InitPlanReport` gains `previousConfigLines: string[]`, filled in `buildInitPlan` (not projected to JSON — see Open question 1).
  - Fix the `readCarriedEntries` comment (no longer "null for a config with no `modules` array").
- `src/steps/archetype-summary.ts` — no signature change; the 5th parameter's doc broadened from "channel change" to "what the replaced config means for this re-run" (`previousConfigLines` + `previousChannelLines`). Optionally renamed `rerunLines` (internal param name only).
- `src/commands/init.ts` — real run and `--yes`: pass `[...previousConfigLines(previous), ...channelLines]` as that parameter (one local `rerunLines`, used by both branches, so both print it). Dry run: `[...r.previousConfigLines, ...r.channelLines]`. Nothing else changes (the overwrite prompt already lists `pharn.config.json`, default No; `--yes` already refuses an existing config).
- `src/types.ts` — `PharnConfig.modules` comment: "0.3.0–0.12.0" → "0.3.0–0.19.x"; a config with neither a `modules` array nor a `capabilities` key reads as NO config to them; this CLI also reads a config with `capabilities` and no `modules`, but still writes the key.
- `src/steps/install-archetype.ts` — the `modules: []` comment's range → "0.3.0–0.19.x". No logic change.
- `tests/pharn-config.test.ts` — NEW: `{skillsVersion, commit:null, archetypes, capabilities:[…]}` with NO `modules` loads (and `isArchetypeConfig` true); `{skillsVersion, capabilities:'x'}` with no `modules` THROWS `CapabilityEntryError` (FAILS today: null); `{skillsVersion}` alone and `{skillsVersion, modules:'oops'}` (the existing test, kept) → `null`; a pre-archetype `{skillsVersion, modules:[…]}` still loads and `isArchetypeConfig` false.
- `tests/init-archetype.test.ts` — in the `` `pharn init` re-run over a capability it drops `` harness (real `runInit`, mocked fetch + prompts), NEW cases (each FAILS today):
  1. no `modules` + `n-plus-one` hand-marked `source: 'manual'` + upstream narrows it → re-run keeps it `manual` in the config, its dir stays.
  2. no `modules` + upstream narrows `n-plus-one` (`auto`) → warned `your archetypes no longer select: lens:n-plus-one`, prompt lists it under `will be DELETED`, dir deleted.
  3. config hand-edited to an invalid `archetypes` (`"ssr"`, an `ArchetypesError` — NOT a `seam` block, CORE-165) → the summary `note` contains the `could not be read (pharn.config.json: archetypes must be an array…); nothing is carried over, so manual capabilities will be dropped` line, and it is printed before the `select` prompt (call order).
  4. same config, `runInit({ yes: true })` → the summary note carries the line, then the existing refusal (exit 1).
  5. a config with no `skillsVersion` string (but a manual capability) → the line with `it has no "skillsVersion" string`.
- `tests/init-dry-run.test.ts` — NEW: the text dry run over an invalid-`archetypes` config prints the line in its summary note; over a no-`modules` config with a manual entry, `carry` keeps it (the existing harness).
- `tests/archetype-summary.test.ts` — NEW unit tests for `previousConfigLines` (null → `[]`; reason → exactly one line, verbatim wording) and `readPreviousConfig` (absent → `unreadable: null`; valid → null; throw → the error's message; directory → `it is not a regular file`; not-an-object; no `skillsVersion`; neither key; a control character in the reason is escaped).
- `tests/init-report.test.ts` — the `InitPlanReport` literal gains `previousConfigLines: []`; assert `previousConfigLines` is not projected (beside the `channelLines` assertion).
- `tests/commands-integration.test.ts` — NEW case (real modules, stubbed fetch only): `init --yes`, `add` a capability (manual), strip `modules` from the config → `list --json`… / `status --json` and `add` of another capability run (exit 0), and `init --dry-run --json` reports the manual entry in `capabilities.carried.manual` (AC 1–2 across modules).
- `docs/commands/init.md` — re-run section: capabilities are carried over from any config with a `capabilities` array (a missing `modules` key no longer matters); a config that exists but cannot be read as a config (invalid JSON, a value `pharn` rejects, not a JSON object, missing `skillsVersion`, …) carries nothing over and the summary says so with the reason, then the overwrite prompt (default No) / `--yes` refusal. `### 6. Summary` mentions the line.
- `docs/reference/pharn-config.md` — Keys-pharn-does-not-own bullet (drop "missing its `modules` array" as a refused case); Legacy fields: `modules` is no longer load-bearing for an archetype config (a config with `capabilities` loads without it) but stays required for a pre-archetype one and is still written for older CLIs (0.3.0–0.19.x read a config without it as absent); `skillsVersion` still load-bearing.
- `CLAUDE.md` — the init paragraph: the "0.3.0–0.12.0" range → "0.3.0–0.19.x"; `readPreviousConfig` returns the reason and `previousConfigLines` prints it in the summary (real run, `--yes`, text dry run); the `pharn-config.ts` paragraph: the shape guard (`skillsVersion` string ∧ (`modules` array ∨ `capabilities` present)).
- `CHANGELOG.md` — `### Fixed` bullet under `## [Unreleased]`.
- `.dev/features/core-164-init-carry-over/*` — the pipeline artifacts.

## Contracts satisfied

- `CLAUDE.md` § `lib/pharn-config.ts` — schema stays additive (P7): every config that loaded before still loads with the same verdict; the only newly loading shape is `{skillsVersion, capabilities}` without `modules`, and the only newly throwing one is a non-array `capabilities` without `modules` (F-30 now holds for it too).
- `CLAUDE.md` § `commands/init.ts` step 5 — the tolerant read and `carryOver` are unchanged; only what the tolerant read reports grows. The fingerprint stays taken first (`assertConfigFingerprintUnchanged` untouched).
- `LEGACY_CONFIG_MESSAGE` / `isArchetypeConfig` — unchanged discriminator; a pre-archetype config still reaches it.
- `init --dry-run --json` byte contract (`schemaVersion` 1): unchanged (Open question 1).
- `CLAUDE.md` § Testing: tests first; the real-`runInit` harness exercises the modules together.

## Evals to write (P1) — the NEW ones must FAIL before the code change

- config: no-`modules` archetype config → loads (FAILS today: null); `{skillsVersion, capabilities:'x'}` → `CapabilityEntryError` (FAILS today: null).
- init re-run, no `modules`: manual kept (FAILS today: dropped silently); auto drop named + dir deleted (FAILS today: no warning, dir kept).
- init re-run, invalid `archetypes`: the line in the summary note before the prompt, under `--yes`, and in the text dry run (FAILS today: no line).
- `readPreviousConfig` reasons + `previousConfigLines` wording (FAIL today: no field / no export).
- Boundary pins (pass today, must keep passing): `modules: 'oops'` without `capabilities` → null; pre-archetype config → `LEGACY_CONFIG_MESSAGE`; `init` writes `modules: []`; absent config → no line.

## Guarantee audit (P0)

- "a config with a `capabilities` key and a string `skillsVersion` is read (validated) rather than treated as absent" → floor: `typeof` + `Array.isArray` + `!== undefined` membership tests; unit-tested.
- "a pre-archetype config is still refused with `LEGACY_CONFIG_MESSAGE`" → floor: unchanged `isArchetypeConfig` (`Array.isArray(capabilities)`); pinned by the existing + a new test.
- "a non-array `capabilities` is a named error, never a legacy install" → floor: `validateCapabilityEntries` now reached without `modules` too; unit-tested.
- "init names an unreadable previous config before it asks" → floor: `fingerprint !== 'absent'` ∧ (throw ∨ null) → one fixed-format line; ordering pinned by mock call order. The reason text is display-only, never a branch input.
- "nothing is carried over from an unreadable config" → existing behaviour (`carryOver(null)`), unchanged; the line states it.
- `init` still writes `modules: []` → existing code, pinned by an assertion in the new re-run case.

## Trust audit (P2)

- The previous config is local, hand-editable input. The reason is either a named validation error's message (offenders already `escapeUnsafe`d + capped by `describeOffender`/`assertSafeString`; `ConfigParseError` never interpolates V8's message), or fixed text from `describeUnreadConfig` (never file content; `read.reason` from `bounded-read.ts` is fixed text + an errno code). The whole reason is passed through `escapeUnsafe` once more before printing (lossless, idempotent for already-escaped text). It never drives a branch.

## Determinism audit (P5)

- Every new branch is a membership/type test (`'absent'` string compare, `kind` enum, `typeof`, `Array.isArray`, `!== undefined`). No fallback guesses: a race between the two reads yields a fixed "changed while init was reading it" reason, and the under-lock fingerprint check still refuses the run.

## Open questions (HALT) — RESOLVED at GATE 1 (orchestrator, 2026-11-16)

- Q1 → no JSON key; `init --dry-run --json` bytes unchanged.
- Q2 → a thrown validation error's reason is its FIRST SENTENCE only (the rest is repair advice aimed at the other commands — several say "do NOT run `pharn init`", which contradicts the line init prints while running), escaped (`escapeUnsafe`) and capped at 200 chars with an ellipsis (`terminalSafe(…, {max: 200})`). First sentence = up to and including the first `.` that is outside a double-quoted (JSON-escaped) span and followed by whitespace or the end; no such `.` → the whole message. Tested: the cap (ellipsis, length), the cut (advice dropped, a `.` inside a quoted offender or in `pharn.config.json` does not cut), and that no reason contains "pharn init".
- Q3 → resolved in discovery (below).

Original questions:

1. **JSON dry run.** The ticket names the real run, `--yes` and the text dry run. `init --dry-run --json` does not carry `channelLines` either. Recommendation: do NOT add a key (scope; `schemaVersion` 1 bytes untouched). Alternative: an additive `previousConfigUnreadable: "<reason>"` key, present only when set.
2. **Reason wording for a validation error.** The named errors' messages are long and end with repair advice ("Fix it by hand — do NOT run `pharn init` to clear it: init overwrites this config."), which is accurate in init's context too (the overwrite prompt defaults to No). Recommendation: print the message verbatim (escaped), uncapped — the offenders inside are already capped at 80 chars. Alternative: cap the reason at ~200 chars.
3. ~~Integration test~~ — resolved in discovery: `init --dry-run --json` projects `capabilities.carried.manual` (`init-report.ts:212`), so the `commands-integration` case is in scope as written.
