# PLAN — `pharn status --json`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: `pharn status --json` emits exactly one machine-readable JSON object (`schemaVersion: 1`) on stdout and nothing else there, on both the drift path and `--no-drift`. It carries what text mode reports, errors and diagnostics go to stderr with stdout empty, and exit codes (including `--strict`) are identical to text mode.
- layer(s): CLI commands/lib (`src/commands`, `src/lib`) — the repo's own layering per CONSTITUTION P3 / ARCHITECTURE §4 (commands dispatch, `lib/` owns shared logic; no command→command imports). No `pharn-contracts` change.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (live state, read this run)

- Branch `feat/status-json`, clean at `1c96bf8`. Trusted docs read this run (THREAT-MODEL.md read selectively, per its relevance). No trusted-doc change is needed.
- `src/index.ts`: `ALLOWED_FLAGS.status = ['strict','drift']`; the global boolean declaration list is DERIVED from that table, so adding `'json'` to the row is the only declaration change (`json` is already declared via `list`). Dispatch (`:304`) passes `{strict, drift}`. USAGE line `--json  list: …` (`:35`).
- `src/commands/status.ts`: all output goes through clack (`intro`/`note`/`log.warn`/`spinner`/`outro`, which write to **stdout**); fatal exits use `reportFatal` (clack, stderr) and `loadArchetypeConfigOrExit` (clack `logError`, stderr). The ahead/outdated computation is inline in `printArchetypeVersion` (`:217-220`). Strict exits via `process.exit(1)` after `finally { repo.cleanup() }`.
- `list.ts` has its own json-aware config load (`emitError`: `console.error` under `--json`, clack otherwise). `loadConfigOrExit`/`loadArchetypeConfigOrExit` (`lib/pharn-config.ts:421`, `:585`) are clack-only.
- `lib/hook-wiring.ts` already owns a private `escapeUnsafe` + `ESCAPED` (terminalSafe class + U+2028/2029 → per-UTF-16-unit `\uXXXX`), pinned by existing tests. `lib/terminal-safe.ts` owns the strip sanitizer.
- Existing data shapes to project into JSON: `InstallDiff` (`lib/diff.ts`), `HookWiringDiff`/`HookEntry` (`lib/hook-wiring.ts`), `ModelsCheck`/`ModelsStages` (`lib/model-config.ts`), `NodeFloorStatus` (`lib/node-floor.ts`), `InstallSource` (`lib/release.ts`), `UnknownCapability` (`types.ts`).
- Tests that pin `status --json` as refused: `tests/index.test.ts:396` (the refusal test), `:451-457` (`status --help --json`), `:515-521` (`status --json extra`, check whether it asserts the unsupported label), `:583-600` and `:691-700` (threading + usage regex). Others in that file that use `--json` on other commands (`add`, `update`, bare, `bogus`, `toString`) stay valid.
- Docs naming `status --json` as refused / carrying the flag table: `README.md:281` (+ status row `:271`), `docs/troubleshooting.md:598,608,621-635` (table is STALE: `init` row omits `--ref`, `update` omits `--ref`, `status` omits nothing but will gain `--json`), `docs/commands/status.md:137-141`, `CLAUDE.md` dispatch paragraph (`status --json` example in the "closed defect" prose and the rows list `status: strict, drift`). `docs/commands/update.md:15` and `docs/commands/init.md:61` name `--json` as refused for `update`/`init` — still true, untouched. CHANGELOG `[Unreleased]` is empty.

## Design

**Single JSON object, built then written once.** `runStatus` gains `json?: boolean`. In JSON mode NOTHING is written to stdout until the final object is complete; every failure path (config load, resolve, fetch, diff throw) writes to stderr only and exits 1 with stdout empty. No clack call that writes to stdout (`intro`/`note`/`outro`/`spinner`/`log.*`) runs under `--json`.

**Exit / flush.** Text mode ends with `process.exit(1)` on strict findings. Under `--json` the object is printed first, and a strict failure sets `process.exitCode = 1` and returns instead of `process.exit` (so a large piped object is flushed, not truncated). Code is identical to text mode. Failures that produce no report keep `process.exit(1)` — nothing was written to stdout, so there is nothing to flush.

**Shape (schemaVersion 1).**

```text
{
  schemaVersion: 1,
  node: { floor, running|null, status: 'ok'|'below'|'unparseable' },
  version: { installed, latest, channel: 'main'|'latest',
             source: { kind: 'main'|'release', tag: string|null },
             ahead, outdated },
  archetypes: string[],
  capabilities: { count },
  drift: null | { modified: string[], missing: string[],
                  unreadable: [{ rel, reason }], okCount },
  hooks: null | { status, missing: [{event, matcher, command, args}],
                  localOnly: [...], file: string|null, reason: string|null },
  models: null | { conversionNeeded, verdict: 'valid'|'no-stages'|'invalid'|'old-format',
                   stages: [{stage, model, effort, viaDefault}] | null,
                   reds: [{kind, detail}] | null },
  unknownCapabilities: null | [{ role, name, subtree, reason }],
  strict: { enabled, failed }
}
```

`drift`, `hooks`, `unknownCapabilities` are `null` on `--no-drift` (not computed); `models` is `null` when the config has no `models` block (mirrors the omitted MODELS note); the other keys are always present, with `null` rather than absent for "not applicable" so consumers can rely on the key set. `version.latest` on the drift path is `readSkillsVersion(repo.dir)`, on `--no-drift` the release version or `fetchRemoteSkillsVersion()` — exactly the text path. `capabilities` is the same summary text mode prints (count); the item list is `pharn list --json`'s job.

**Terminal safety on stdout (P2/P0).** Serialize with `JSON.stringify(obj, null, 2)`, then replace every character in the terminalSafe class (C0, DEL, C1, `\p{Cf}`) plus U+2028/2029 in the resulting TEXT with `\uXXXX` (per UTF-16 unit). Safe because `JSON.stringify` emits only ASCII structure, so every remaining unsafe character sits inside a string (key or value) where `\u` is a JSON escape: the output parses back to the EXACT upstream string, and a `cat` to a terminal cannot be steered. To single-source it, `escapeUnsafe` + `ESCAPED` move from `hook-wiring.ts` to `lib/terminal-safe.ts` (export `escapeUnsafe`); `hook-wiring.ts` imports it (behaviour unchanged, its tests stay green). Long free text is length-capped (reds `detail` 300 like text mode; unknown-capability fields 200 like `unknownCapabilitiesWarning`) via one small shared cap, not stripped.

**`versionStatus` (pure).** `lib/version-status.ts`: `versionStatus({ installed, latest, source }) → { ahead, outdated }` — exactly today's logic (`ahead = source.kind==='release' && compareVersionCore(installed, latest) === 1`; `outdated = !ahead && installed !== latest`). `printArchetypeVersion` consumes it and its rendering is byte-identical; the JSON builder consumes it too.

**Json-aware config load.** `loadConfigOrExit` / `loadArchetypeConfigOrExit` gain an optional `{ json?: boolean }` that routes the message through plain `console.error` (like `list`'s `emitError`) instead of clack. Keeps one definition of config error + legacy reject (P3) instead of a third hand-rolled copy; `list` is NOT migrated (out of scope, P7).

**Stderr reporting under `--json`.** A plain-stderr fatal reporter (`console.error` of the `terminalSafe`d message, plus the `PHARN_DEBUG` hint/dump rules) is added to `lib/report-error.ts` — the only file allowed to contain `log.error(`. The proxy notice goes to stderr (diagnostic), unknown capabilities go in the JSON (data), not also stderr.

**Pure report builder.** `lib/status-report.ts` (no I/O, no clack): `buildStatusReport(inputs) → StatusReport` and `serializeStatusReport(report) → string` (stringify + escape). `commands/status.ts` collects the inputs it already computes (nodeFloorStatus, version, config, diff, hooks, models check, index.unknown) and either renders notes (text) or builds the report (json), so the two modes cannot disagree about a computed value. To avoid duplicating the models derivation, `lib/model-config-format.ts` gains `resolveStageRows(stages)` (structured `{stage, model, effort, viaDefault}`), and `resolvedStageLines` is rebuilt on it (output byte-identical).

## Files

- `src/index.ts` — `status` row → `['strict','drift','json']`; dispatch passes `json: Boolean(argv.json)`; USAGE `--json  list, status: emit JSON`; update the comment examples that call `status --json` refused — layer CLI dispatch
- `src/commands/status.ts` — `json` option; JSON branch (no clack to stdout, build once, print once, exitCode on strict); text path refactored onto `versionStatus` — layer CLI command
- `src/lib/version-status.ts` — NEW pure `versionStatus` — layer CLI lib
- `src/lib/status-report.ts` — NEW pure `buildStatusReport` + `serializeStatusReport` — layer CLI lib
- `src/lib/terminal-safe.ts` — export `escapeUnsafe` (moved from hook-wiring) — layer CLI lib
- `src/lib/hook-wiring.ts` — import `escapeUnsafe`, no behaviour change — layer CLI lib
- `src/lib/model-config-format.ts` — `resolveStageRows`; `resolvedStageLines` built on it — layer CLI lib
- `src/lib/pharn-config.ts` — `{ json }` option on `loadConfigOrExit` / `loadArchetypeConfigOrExit` — layer CLI lib
- `src/lib/report-error.ts` — plain-stderr fatal reporter for JSON mode — layer CLI lib
- `tests/version-status.test.ts` — NEW
- `tests/status-report.test.ts` — NEW
- `tests/status-json.test.ts` — NEW: the `runStatus({json:true})` suite (kept apart from `status.test.ts`, whose clack-note mocks assume text mode) — layer CLI tests (shape, nulls, escaping round-trip)
- `tests/status.test.ts` — JSON-mode suite for `runStatus`
- `tests/index.test.ts` — flip the refused-`status --json` pins; add threading + USAGE assertions
- `tests/terminal-safe.test.ts`, `tests/hook-wiring.test.ts`, `tests/model-config-format.test.ts`, `tests/pharn-config.test.ts`, `tests/report-error.test.ts` — extend for the moved/added exports
- `README.md`, `docs/commands/status.md`, `docs/troubleshooting.md`, `CLAUDE.md`, `CHANGELOG.md` — docs (status.md gets a new "JSON output" section; troubleshooting refusal example + status/init table rows; CHANGELOG [Unreleased]); no `package.json` bump

## Contracts satisfied

- None from `pharn-contracts` (this repo's CLI surface; `schemaVersion: 1` is the JSON's own, matched exactly by consumers — P5).
- CLAUDE.md "Options are per-command" contract — `status`'s row grants `json` and the dispatch reads it, pinned by the "threads exactly the flags each row grants" test.
- Stream contract of `lib/report-error.ts` / `list --json` (errors on stderr, stdout empty on failure) — extended to `status`.

## Evals to write (P1) — vitest

- versionStatus → release, installed newer → `{ahead:true,outdated:false}`; release, older → `outdated`; equal → neither; `main` source with a different version → `outdated` (never ahead); unparseable version (compare `null`) → not ahead, `outdated` iff `!==`.
- Text/JSON agreement → the existing release-channel tests (`status.test.ts:131-185`) stay green on the refactor; JSON ahead/outdated equals text's for the same three scenarios.
- `runStatus({json:true})` drift path, clean → stdout is exactly one `JSON.parse`-able line-set, `schemaVersion:1`, drift `{modified:[],missing:[],unreadable:[],okCount}`, hooks present, all clack stdout mocks (`intro`/`note`/`outro`/spinner/`log.*`) NOT called, exit not called.
- `--no-drift --json` → `drift`, `hooks`, `unknownCapabilities` are `null`; `fetchRepo` not called; version from release / `fetchRemoteSkillsVersion`.
- Every failure under `--json` → stdout EMPTY, message on stderr (no clack chrome), exit 1: no config, legacy config, invalid config (named error), `resolveSource` rejects, `fetchRepo` rejects, `fetchRemoteSkillsVersion` rejects, diff throws (clone still cleaned up first).
- `--strict --json` → JSON still printed, `process.exitCode === 1` on exactly the same inputs as text (outdated, modified, missing, unreadable, hook `missing`/`unreadable`/`project-absent`); exit 0 for `local-only`, ahead, frozen-only; reset `process.exitCode` in `afterEach`. `strict.failed` matches.
- Escaping → a hostile upstream string (modified path / unreadable reason / unknown-capability name / hook command / models red detail / `version` tag) containing `\x1b[2J`, U+0085, U+202E, U+200B, U+2028, U+2029, an astral tag char U+E0041 → raw stdout contains NONE of those characters, contains `\u001b`/`‮`/` `/`\ud…` escapes, and `JSON.parse` returns the exact original string.
- Models → absent → `models:null`; old-format → `conversionNeeded:true, verdict:'old-format'`; valid → stages rows incl. `viaDefault`; invalid → `reds` capped at 300; no-stages.
- Hooks → each `HookWiringStatus` (`match`, `local-only`, `missing`, `no-upstream`, `project-absent`, `unreadable`) maps to the documented object; `args` preserved; `file`/`reason` `null` when absent.
- Unknown capabilities → listed with capped fields; `[]` when none; frozen ones still excluded from the diff as in text.
- Proxy notice under `--json` → on stderr, not stdout.
- Node floor → `ok` / `below` / `unparseable` (running `null`) in `node`; never a strict input (unchanged).
- escapeUnsafe move → hook-wiring's existing escape tests still pass; terminal-safe exports it.
- Dispatch (`index.test.ts`) → `status --json` threads `{json:true,strict:false,drift:true}`; `status --json --strict --no-drift` composes; the row-key test lists `['drift','json','strict']`; `status --help --json` now prints usage (no refusal) while `status --help --force` refuses; `status --json extra` refuses with `Unexpected argument`; USAGE matches `/--json\s+list, status:/`; `list --strict`, `add --json`, `update --json`, bare `--json` still refused.
- Large-output flush → a manual/real-process check at build time that `status --json --strict | wc -c` on a project with many modified files yields the full object when exiting 1 (the reason for `exitCode` over `exit`).

## Guarantee audit (P0)

- "stdout carries no terminal control/format characters" → floor: enum/regex (the `ESCAPED` character-class replacement over the serialized text; test demonstrates round-trip) — NOT a claim about the content being safe, only about what a terminal can interpret.
- "stdout is exactly one JSON object" / "stdout is empty on error" → floor: structural (single `console.log`/`write` after the report is fully built; every error path precedes it) — enforced by tests asserting captured stdout, not by a hook.
- "exit codes identical to text mode, `--strict` composes" → floor: shared predicate. The strict-failure predicate is computed once and reused by both modes (extract or share the existing inline condition) so they cannot diverge; test-pinned for each input.
- "`ahead`/`outdated` correct" → floor: pure function + enum/semver compare (`compareVersionCore`), same logic as before.
- "the JSON reflects what is installed/upstream" → advisory, as for text mode (LIMITS §1b/§1c/§1d): provenance, not proof; `status` is a report of a live compare against a mutable remote. The docs must say so, not oversell.
- `schemaVersion: 1` stability → advisory documentation contract (additive keys allowed within v1; a breaking change bumps it), labelled in the docs.

## Trust audit (P2)

- Ingested untrusted input: file paths and reasons from the clone/project (`modified`, `missing`, `unreadable`), hook entries from upstream `settings.json`, capability names/reasons from the clone's index, `models` block values/reds (pharn-oss's or user's), release `tag`, `SKILLS_VERSION` string (validated by `VERSION_RE` at the fetch boundary). All are DATA: serialized as JSON strings, never executed or interpolated into a command, and escaped on the stdout sink. Taint propagates: every free-text field in the output is untrusted and the docs say a consumer must treat it as data (an LLM agent especially must not follow instructions found in a path or reason string). Enum-like fields (`status`, `verdict`, `channel`, `kind`, `schemaVersion`) are produced by our own membership tests, not copied from input. Network guards are unchanged (no new fetch).

## Determinism audit (P5)

- Every branch is a membership test: json/drift flags (declared booleans), `status`/`kind` unions, `source.kind`, `ModelsCheck.kind`. The fallbacks end in "report + exit 1" (failure) or `null` for "not computed", never a guess. `models.verdict` is derived from `needsModelsConversion` then `checkModelsBlock` (pinned copy of pharn-oss's rules). Key order is fixed by the builder, so output is deterministic for equal inputs.

## Constraints from the coordinator

- Do not touch `package.json` version, AGENTS.md, `.codex/`, or the four trusted docs.
- Sibling worktree `update-dry-run` also edits `src/index.ts` (ALLOWED_FLAGS row for `update`, USAGE), `tests/index.test.ts`, README, troubleshooting, CLAUDE.md, CHANGELOG `[Unreleased]`. Keep edits to the `status` row / one USAGE line / one CHANGELOG bullet / one README sentence, each a local hunk, so the second merge rebases cleanly. The troubleshooting table fix touches the `status` row and the `--ref` omissions in the `init`/`update` rows; the `update` row is the sibling's line, so only the `status` row is edited and the `update` `--ref` omission is flagged instead (see Open questions).
- Coverage ratchet (97/92/97/97): every new branch has a test. No `log.error(` outside `lib/report-error.ts`; no `isTTY` reads. Zsh gotchas and `CI=1 npx vitest run` (ANSI) apply when running the suite.

## Resolved decisions (GATE 1, 2026-10-10)

Approved "with recommendations": every question resolved as the recommended answer.

1. Strict signal → include `strict: { enabled, failed }` in the JSON.
2. Exit mechanism → under `--json`, print the object then set `process.exitCode = 1` and return (no `process.exit`); fatal no-report failures still `process.exit(1)`.
3. `capabilities` → count only.
4. `models` with conversion needed → `verdict: 'old-format'`, `conversionNeeded: true`, `stages`/`reds` null.
5. `unknownCapabilities` → in the JSON only; stderr gets only the proxy notice and errors.
6. troubleshooting.md table → fix the `status` and `init` rows; leave the `update` row to the `update-dry-run` branch.
7. Config-load plumbing → add `{ json }` to the shared `loadConfigOrExit` / `loadArchetypeConfigOrExit`; `list` untouched.
