# PLAN — fresh-init-hooks (CORE-172, C3.4)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: A fresh `pharn init` (real run, `--yes`, `--dry-run`, `--dry-run --json`) lists the hook commands, and names the other top-level keys, of the upstream `.claude/settings.json` it writes; a preserved settings.json prints exactly today's output.
- layer(s): lib (hook-wiring, install-capabilities, init-plan, init-report), steps (install-archetype), commands (init), docs
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Files

- `src/lib/install-capabilities.ts` — export `upstreamSettingsCopyable(repoDir)` (exists ∧ not a symlink), use it in the copy; add `settingsWritten` to `InstallCapabilitiesResult` — lib
- `src/lib/hook-wiring.ts` — `FreshSettingsSummary` type, `upstreamSettingsSummary(repoDir)` (reads through the private upstream `readSettings`; `hooks` = `hookEntries(value) ?? []`, sorted `otherKeys` minus `hooks`/`_comment`, `skipped` counted locally), `freshSettingsHookLines(summary)` (ONE note body) — lib
- `src/steps/install-archetype.ts` — `else if (settingsWritten)` HOOKS note from the clone; comment updated — steps
- `src/lib/init-plan.ts` — `InitPlanReport.freshSettings: FreshSettingsSummary | null`, non-null only when not preserved ∧ `upstreamSettingsCopyable(repoDir)` — lib
- `src/commands/init.ts` — dry-run text: HOOKS note beside the preserved one; PLAN line "Would write .claude/settings.json from upstream; see HOOKS" — commands
- `src/lib/init-report.ts` — additive `settingsHooks` key, present only when `freshSettings` non-null, explicit projection; `otherKeys`/`reason` capped; `schemaVersion` 1 — lib
- `tests/hook-wiring.test.ts` — summary + composer cases (listed below) — test
- `tests/install-capabilities.test.ts` — `settingsWritten` true/false cases — test
- `tests/init-archetype.test.ts` — rewrite the fresh-install case (:2023) to assert the new note; preserved cases untouched — test
- `tests/commands-integration.test.ts` — real `runInit --yes` emits one `HOOKS` note with the fixture hook + review line — test
- `tests/init-dry-run.test.ts` — fresh parity with the real run; PLAN line; snapshotTree unchanged — test
- `tests/init-dry-run-json.test.ts` — `settingsHooks` present fresh; absent preserved; absent no-upstream; `schemaVersion` 1 — test
- `tests/init-report.test.ts` — `freshSettings` in the hand-built fixtures; projection, both statuses, absence on null — test
- `docs/commands/init.md` — dry-run section, JSON example + key list, steps-table row "Write or preserve settings", settings.json section — docs
- `docs/getting-started.md` — one sentence (fresh install shows the hooks) at the two places — docs
- `CHANGELOG.md` — `### Added` under `[Unreleased]`, above `### Security` — docs
- `CLAUDE.md` — one clause in the install-capabilities / init paragraphs so the architecture notes stay true (`settingsWritten`, fresh HOOKS note, `settingsHooks`) — docs
- `THREAT-MODEL.md` — hook-protected: NOT written by the agent. A python patch script in the scratchpad (exact old→new with asserts) is handed to the human to run; agent verifies after, deletes the script. §3 table row + §4a clause — human-applied

## Contracts satisfied

- `tests/*.test.ts` as the spec (P1, CLAUDE.md "Testing") — tests updated before code.
- JSON report contract `schemaVersion: 1` additive-key convention (`absentUpstream` / `detectionTruncated`, `lib/init-report.ts`) — `settingsHooks` absent when not applicable, so the default bytes of a preserved / no-upstream dry run are unchanged.
- The one-composition pattern of `preservedSettingsHookLines` (preview = install by construction).

## Evals to write (P1)

- `upstreamSettingsSummary` → hooks listed in file order; `otherKeys` sorted, excludes `hooks` and `_comment`; `skipped` counts members without a string `command` and malformed groups/non-array events; zero-hook file → ok, `hooks: []`; non-object JSON (array, string) → ok, nothing listed, `otherKeys: []`; >256 KiB → unreadable; invalid JSON → unreadable; symlinked upstream file → unreadable; absent → unreadable ("absent" is never reached by callers, but must not throw).
- `freshSettingsHookLines` → head + each hook via `displayHook`; no-hooks line; skipped line (singular/plural); "It also sets:" with ESC / U+202E / U+2028 in a key escaped (`escapeUnsafe`) and capped; unreadable line with reason; review line always last.
- `installCapabilities` → `settingsWritten` true fresh; false preserved; false upstream ships none; false upstream symlink.
- real `init` / `--yes` → one HOOKS note with the hooks + review line; preserved tests unchanged.
- `init --dry-run` text → HOOKS note equals the real run's; PLAN says it would write; nothing written.
- `init --dry-run --json` → `settingsHooks` present only fresh; `schemaVersion` 1.

## Guarantee audit (P0)

- "the preview and the run agree on whether settings.json is written" → floor: one shared predicate (`upstreamSettingsCopyable`) + `existsSync` preserved test, both called by the copy and the planner; pinned by the dry-run parity test.
- "every wired command hook is shown" → floor for the entries `hookEntries` recognises (enumeration over the parsed object); entries it does not recognise are COUNTED (`skipped`) and named, never silently dropped; a file the bounded reader refuses (size/JSON/symlink) prints an explicit "could not list" line. NOT a claim that Claude Code runs exactly these (Claude Code's own parser may differ) → that part is advisory, stated as "review the file".
- "printed text cannot inject terminal control sequences" → floor: `displayHook` (escapeUnsafe + cap) for hooks; `escapeUnsafe` + cap for keys and reason; `serializeJsonReport` escapes the JSON.
- "a preserved settings.json prints exactly today's output" → floor: unchanged code path, pinned by the untouched preserved-case tests.
- Nothing claims the hooks are safe: trust stays provenance (THREAT-MODEL §4a) → advisory, stated in the note's last line and docs.

## Trust audit (P2)

- upstream `.claude/settings.json` (untrusted clone content) → read only via the existing upstream reader (symlink-refused every component, O_NOFOLLOW, O_NONBLOCK, 256 KiB, JSON.parse), never executed; its strings reach the terminal only through `displayHook` / `escapeUnsafe` (capped), and stdout JSON only through `serializeJsonReport`. Taint propagates to display text and JSON values only — no branch, path or write is derived from it (the copy itself is unchanged and decided by the existence/symlink predicate, not by content).

## Determinism audit (P5)

- Branches: preserved (`existsSync`) / copyable (exists ∧ ¬symlink) / reader result kind / `hooks` length / `skipped > 0` / `otherKeys` non-empty — all membership/size tests. No classification.

## Open questions (HALT)

- None blocking. Decisions taken from the brief: (a) also touch CLAUDE.md's architecture paragraphs so they stay accurate (not in the brief's Docs list); (b) `upstreamSettingsSummary` on an ABSENT upstream file returns `unreadable` with reason "it does not exist" (unreachable in practice: callers only call it when the file was/would be written).
