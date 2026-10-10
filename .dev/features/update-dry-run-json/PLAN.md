# PLAN — `pharn update --dry-run --json`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn update --dry-run --json` prints the dry-run plan (or the early-return outcome) as ONE JSON object on stdout with an explicit `status` field, matching `pharn status --json`'s contract exactly; `--json` without `--dry-run` is refused through a new cross-flag table in `src/index.ts`.
- layer(s): single package, no `pharn-contracts` change. `src/index.ts` dispatches (flag tables, USAGE); `src/commands/update.ts` owns the verb (control flow); new `src/lib/update-report.ts` is shared pure logic reached from the command (ARCHITECTURE.md §4 / P3). The one serializer is generalized in place, not forked.
- constitution_refs: [P0, P1, P2, P3, P5, P6, P7]

## Discovery (live state, read this run)

- Branch `feat/update-dry-run-json` = `feat/update-dry-run` + 0. `src/lib/update-plan.ts` exists: `buildUpdatePlan` → `{report, apply}`; `UpdatePlanReport` is plain data (files `PlannedFile{rel,action,label,backup,forced}`, writes, backups, skipped, counts, capabilityChanges, models `ModelsUpdate`, modelsFloor, hookWiring `HookWiringDiff`, recordsNote, unknownWarning, versionWithheld, pendingSkillsVersion, frozenCapabilities, layout, abandonedLayout, featuresReadmeRelocation, capCount, three version strings).
- `src/commands/update.ts` (1157 lines): `runUpdate` (`intro`, `runNodePrereq`, `loadArchetypeConfigOrExit`, TTY gate skipped for dry run) → `runArchetypeUpdate` (proxy `log.warn`, spinner, `resolveSource`, ahead-of-release `outro` return :~252, same-version `outro` return :~289, `note`, `if (dryRun) runDryRun`). `runDryRun` (:~800): spinner, `fetchRepo`, `checkMinCli` (logs `log.warn` on STDOUT-capable clack + refusal), `buildUpdatePlan({onUnknownWarning: log.warn})`, cleanup in `finally`, exits after cleanup; `reportDryRun` renders text.
- **The JSON helpers this task must reuse are NOT on this branch.** `git merge-base --is-ancestor feat/status-json HEAD` → false; PR #261 (`feat/status-json`) is OPEN against `main`. They exist only there: `escapeUnsafe` (`src/lib/terminal-safe.ts`), `logErrorPlain` / `reportFatalPlain` (`src/lib/report-error.ts`), `loadArchetypeConfigOrExit(cwd, {json})`, `serializeStatusReport` + `cap` + `STATUS_SCHEMA_VERSION` (`src/lib/status-report.ts`), the `status` `ALLOWED_FLAGS` row, and the `JSON output` docs structure (`docs/commands/status.md`). See Q1.
- `status --json` conventions (read from `feat/status-json`): `schemaVersion: 1`; no `intro`/clack at all in json mode; proxy notice, fatals via the `*Plain` helpers on stderr with stdout empty and `process.exit(1)`; ONE `console.log(serialize(report))` after the fetch clone is cleaned up; exit code via `process.exitCode`, never `process.exit`, on the success path; free text is untrusted and capped (`cap`), serialization escapes the `terminalSafe` class + U+2028/2029 as `\u`.
- `src/index.ts`: `ALLOWED_FLAGS` `update: force, yes, ref, dry-run`; `unsupportedFlags(allowed)` (second minimist parse) runs ABOVE the `--version`/`--help` short-circuits; `DECLARED_BOOLEANS` is derived from the table, so adding `json` to the `update` row declares nothing new (`json` is already declared via `list`). No cross-flag check exists. `tests/index.test.ts` pins `runUpdate`'s arg object (exact key lists) at several sites and `--dry-run` cases :135-192.
- `steps/node-prereq.ts` `runNodePrereq('update')` reports through `logError` (clack, with chrome) → must have a plain-stderr variant for json mode.
- Docs: `docs/commands/update.md` ends its dry-run section with "A machine-readable (`--json`) form of the plan is not available yet." (must be replaced, not left stale); README :269; `docs/troubleshooting.md` exit table + the per-command flag table :622; `CLAUDE.md` dispatch paragraph (`update: force, yes, ref, dry-run`) and the `update` paragraph ("a later `--json` serializes it as is"); `CHANGELOG.md` `[Unreleased]`.
- Trusted docs (CONSTITUTION/ARCHITECTURE/THREAT-MODEL/LIMITS): human-only, no change needed. LIMITS.md §3 makes no claim about CLI JSON output; THREAT-MODEL's "untrusted text reaches a terminal" stance is already satisfied by the same escape the status report uses.

## Design

### 1. Cross-flag table (`src/index.ts`)

```ts
// A flag valid for a command only in the PRESENCE of another flag.
const REQUIRED_WITH = new Map<string, readonly { flag: string; requires: string }[]>([
  ['update', [{ flag: 'json', requires: 'dry-run' }]],
]);
```

`Map` for the same reason as its siblings. `unmetFlagRequirements(cmd, argv)` returns the offending `{flag, requires}` pairs; presence = `Boolean(argv[flag])` (same reading as the dispatch's `Boolean(argv.json)`, so `--json=false` is absent and `--dry-run=false --json` refuses). It runs immediately AFTER the `unsupportedFlags` gate and BEFORE the `--help`/`--version` short-circuits (a genuine `--help` licenses no misapplied sibling), reached only when the command is in the table (absent row → no check, so `pharn bogus --json` keeps "Unknown command"). Refusal: `refuse('Option requires another', …)` shaped as ``Unsupported combination for `update`: "--json" needs "--dry-run"`` → stderr + USAGE + exit 1, via the existing `refuse()`. `update` row gains `json`. The `update` case passes `json: Boolean(argv.json)`. USAGE `--json` line gains `update: with --dry-run, emit the plan as one JSON object`.

### 2. One serializer (`src/lib/json-report.ts`, new, moved from status-report)

`serializeJsonReport(report: object): string` (the body of `serializeStatusReport`: `JSON.stringify(…, null, 2)` → split `\n` → `escapeUnsafe` each line) and `cap(value, max)` move here; `serializeStatusReport` becomes a typed one-line wrapper, `cap` is re-imported by `status-report.ts`. No second escaping implementation exists afterwards (a test pins that `escapeUnsafe` is referenced from this file only among `src/lib/*report*.ts`).

### 3. The projection (`src/lib/update-report.ts`, new, pure — no I/O, no clack, no exit)

`buildUpdateReport(input): UpdateReport` with `UPDATE_SCHEMA_VERSION = 1` (a separate constant from status's: each report's contract versions on its own). It is an EXPLICIT field-by-field allowlist projection of `UpdatePlanReport`, never a spread, so a later internal field cannot leak into the contract. Shape:

```jsonc
{
  "schemaVersion": 1,
  "command": "update",
  "dryRun": true,
  "status": "planned" | "up-to-date" | "ahead-of-release",
  "force": false,
  "channel": "main" | "latest",
  "channelChange": null | { "from": "...", "to": "..." },   // what the text prints as "Would record channel"
  "source": { "kind": "main"|"release", "tag": null | "v1.2.3" },
  "version": { "installed": "…", "latest": "…", "recorded": "…"|null, "withheld": bool|null, "pending": "…"|null },
  "archetypes": [...],
  "plan": null | {
    "layout", "abandonedLayout", "featuresReadmeRelocation",
    "capabilities": { "count", "changes": [{ "role","name","source","reason" }] },
    "files": [{ "rel","action","label","backup","forced" }],
    "writes": [...], "backups": [...],
    "skipped": [{ "label","rels":[...] }],
    "counts": { "updated","restored","ok","forced","skipped" },
    "models": { "outcome","label","replacedLegacyDefault","backup","conversion": null|{changes,leftovers},"problems":[...],"upstreamReasons":[...] },
    "hooks": { "status","missing":[HookEntry],"localOnly":[HookEntry],"file","reason" },
    "frozenCapabilities": [...],
    "unknownCapabilities": [{ "role","name","subtree","reason" }],
    "recordsNote": null|"…"
  }
}
```

- `status` is an enum from this file's own membership tests, never from input. `planned` ⇒ `plan` non-null; the two early returns ⇒ `plan: null`, `version.recorded/withheld/pending` null. The early returns reuse the exact predicates `runArchetypeUpdate` already has (no re-derivation: they are computed once and passed to both the text `outro` and the report).
- `models.next` and `models.nextRecord` are deliberately OMITTED (the block is upstream's/the user's arbitrary JSON, and the record is an internal hash); the outcome, label and reasons are what an agent decides on (Q3).
- `plan.unknownCapabilities` needs the structured list, which `UpdatePlanReport` only carries as the prose `unknownWarning`: `UpdatePlanReport` gains `unknownCapabilities: UnknownCapability[]` (= `index.unknown`, additive; `unknownWarning` stays for the text path). The JSON drops the prose.
- Untrusted free text (`problems`, `upstreamReasons`, `conversion.*`, `recordsNote`, hook strings, unknown-capability fields) is capped with `cap` (same limits as status: 300 / 200) and serialized by `serializeJsonReport`. `rel`s and capability names are already validated by `CAPABILITY_NAME_RE`/`safeJoin` upstream but are escaped by the same serializer anyway (defense in depth, no trust placed on that).

### 4. Command flow (`src/commands/update.ts`)

`runUpdate` opts gain `json?: boolean`. Under `json` (only reachable with `dryRun` — the dispatch refuses otherwise; `runUpdate` additionally throws no new path: `json && !dryRun` is treated as a programming error via an `assert`-style early `reportFatalPlain` + exit 1, so a direct caller cannot reach a half-JSON real run):

- no `intro`/`outro`/`note`/`spinner`/`log.*` anywhere on this path; `runNodePrereq('update', { json })` and `loadArchetypeConfigOrExit(cwd, { json })` take the plain-stderr route (the latter already does on #261); proxy notice → `logErrorPlain`; resolve/fetch/plan failures and the `MIN_CLI` refusal → `reportFatalPlain` + `process.exit(1)` AFTER clone cleanup, stdout empty; the unknown-capabilities warning → `logErrorPlain` via `onUnknownWarning` (stderr; its content is also in the JSON).
- `checkMinCli` is split so the warning is returned (not logged) and the caller picks the sink — text path logs it as before (byte-identical text output), json path sends it to stderr.
- The fetch+plan block of `runDryRun` is extracted to `fetchAndPlan(source, …)` returning `{planned} | {refusal} | {failure}` (cleanup inside, exits outside) and shared by the text and JSON dry runs — one copy of the clone/cleanup discipline.
- success: `console.log(serializeJsonReport(report))`, return, exit code 0 via normal return (no `process.exit`, so a large object piped to `jq` is flushed). There is no `--strict` analogue: a dry run's exit is 0 for `planned`/`up-to-date`/`ahead-of-release`, 1 only for failures.

## Files

- `src/index.ts` — `REQUIRED_WITH` table + `unmetFlagRequirements`, `update` row gets `json`, dispatch passes `json`, USAGE line — layer index/dispatch (§4)
- `src/commands/update.ts` — json branch, `fetchAndPlan` extraction, `checkMinCli` returns warning, early-return outcomes computed once — layer commands
- `src/lib/update-report.ts` — NEW pure projection + `UpdateReport` type + `UPDATE_SCHEMA_VERSION` — layer lib
- `src/lib/json-report.ts` — NEW `serializeJsonReport`, `cap` (moved from status-report) — layer lib
- `src/lib/status-report.ts` — `serializeStatusReport` delegates; imports `cap` (behavior unchanged) — layer lib
- `src/lib/update-plan.ts` — `UpdatePlanReport.unknownCapabilities` (additive) — layer lib
- `src/steps/node-prereq.ts` — optional `{ json }` → `logErrorPlain` — layer steps
- `tests/update-report.test.ts` — NEW
- `tests/update-dry-run-json.test.ts` — NEW
- `tests/json-report.test.ts` — NEW
- `tests/index.test.ts` — cross-flag cases
- `tests/node-prereq.test.ts` — json variant
- `tests/update-dry-run.test.ts` — text output unchanged
- `tests/update-plan.test.ts` — `unknownCapabilities`
- `tests/status-report.test.ts` — serializer move is a no-op
- `tests/status-json.test.ts` — serializer move is a no-op
- `tests/helpers.ts` — shared helper if needed
- `docs/commands/update.md` — "JSON output" subsection under the dry-run section; delete the "not available yet" sentence — docs
- `README.md` — :269 row — docs
- `docs/troubleshooting.md` — exit-code row + flag table + a "reading the plan" JSON note — docs
- `CLAUDE.md` — dispatch rows + update paragraph + the cross-flag table — docs
- `CHANGELOG.md` — `[Unreleased]` — docs

## Contracts satisfied

- `pharn-contracts` — none touched; this is CLI surface only (P4: nothing restated). The `schemaVersion: 1` stdout contract is the same one `pharn status --json` established (#261), cited rather than redefined.

## Evals to write (P1)

- cross-flag table → `update --json` ⇒ exit 1, stderr names `--json`/`--dry-run`, usage printed, stdout empty, `runUpdate` never called; `update --dry-run --json` ⇒ `runUpdate({…, dryRun:true, json:true})`; `update --json --help` refuses; `update --dry-run=false --json` refuses; `status --json`, `list --json` unaffected; `bogus --json` still "Unknown command"; table pin: exactly one row today.
- projection (pure) → a fully-populated `UpdatePlanReport` maps every field (files carry `action/label/backup/forced`, forced/unreadable labels, backups incl. `pharn.config.json`); key-set snapshot per level proves no extra internal key leaks (`models.next`, `nextRecord`, `unknownWarning`, `modelsFloor` absent); early-return statuses give `plan: null`; hostile strings (`\x1b[31m`, U+2028, bidi U+202E, a 10 kB reason) → capped and, after `serializeJsonReport`, no raw unsafe char in the output and `JSON.parse` returns the exact original.
- serializer → output parses back to input for hostile strings in KEYS and values; only `\n` structural raw control char; `serializeStatusReport` output byte-identical to before (status suite stays green).
- integration (`runUpdate` with a fake clone, as in `update-dry-run.test.ts`) → stdout is exactly ONE parseable object (spy on `console.log` and on every `@clack/prompts` call: zero clack calls, one stdout write); `status:"planned"` for restored/updated/modified/unrecorded/unverifiable under `--force`; `up-to-date` and `ahead-of-release` early returns; withheld/pending/frozen/abandonedLayout/featuresReadmeRelocation/unknown-capability fixtures; `channelChange` under `--ref`; text-mode and json-mode `counts`/`writes` agree on the same fixture (single source); whole-tree `snapshotTree` before/after and zero write-function spies (same pins as the text dry run).
- failure shapes → no config / legacy config / node floor / resolve failure / fetch failure / MIN_CLI refusal / plan throw ⇒ exit 1, stdout EMPTY, stderr non-empty with no clack glyphs; clone temp dir removed before exit; `PHARN_DEBUG=1` dumps the cause on stderr only; proxy notice on stderr.
- text path regression → `update --dry-run` (no `--json`) output unchanged (existing `update-dry-run.test.ts`), `checkMinCli` warning still logged on the text path.

## Guarantee audit (P0)

- "stdout carries exactly one JSON object and nothing else under `--dry-run --json`" → floor: construction — the json path imports/calls no clack function and emits via a single `console.log`; pinned by tests spying on both (a test, not a hook) → floor reduction = membership test on the call spies; remains advisory for future edits outside the tests' fixtures.
- "failures leave stdout empty, exit 1" → floor: the exit sites are the existing `process.exit(1)` after cleanup; the test asserts exit code + empty stdout per site.
- "`--json` requires `--dry-run`" → floor: enum/membership test against `REQUIRED_WITH` on parsed argv before dispatch.
- "no write happens under `--json`" → floor: whole-tree snapshot equality + zero-call spies (same mechanism as the dry run); the json path adds no write function.
- "unsafe characters never reach a terminal raw" → floor: `escapeUnsafe` regex over every output line (enum-regex); lossless round-trip tested.
- "`status` enum / `schemaVersion` are stable" → advisory (a documented contract; the floor cannot stop a future edit) — labelled advisory in the docs, as status does.
- "the plan is what a real run would do" → advisory, as the text dry run already says: a snapshot, a real run re-fetches and re-decides under its lock.

## Trust audit (P2)

- Ingested: the clone's capability index (names, unknown-capability reasons), models blocks (upstream's and the user's), hook entries (upstream settings), `recordsNote`, release tag, `rel` paths. All are UNTRUSTED DATA. Taint propagation: each is serialized only as a JSON string value (never interpreted, never a key — except none), capped, then escaped by `serializeJsonReport`; enum fields (`status`, `action`, `label`, `outcome`, `reason`, `channel`, `source.kind`, hook `status`) come from this CLI's own membership tests, never from input. `models.next` is omitted precisely so arbitrary upstream JSON structure is never embedded. An agent consuming the JSON must still treat the string fields as data (documented in the docs section).

## Determinism audit (P5)

- Every branch is a membership test: `status` ← the two existing early-return predicates + default; cross-flag check ← Map lookup + presence test; json-vs-text ← one boolean. Fallbacks end in refusal/exit 1 with stdout empty (never a guess). Array order = the planner's manifest/`SKIP_ORDER`/`CHANGE_ORDER` order (already deterministic); the projection does not re-sort except nothing.

## Resolved decisions (GATE 1, 2026-10-10)

Human approved "with recommendations": every question resolves as the planner's recommendation.

- **Q1 — base for the shared helpers:** RESOLVED. PR #261 and #262 are merged; this branch sits on main 37c6f15 and has `escapeUnsafe`, `logErrorPlain`, `reportFatalPlain`, `loadArchetypeConfigOrExit({json})`, `serializeStatusReport`/`cap`. The "NOT on this branch" Discovery bullet above is superseded. Reuse them; do not fork.
- **Q2 — `status` vocabulary:** `planned` | `up-to-date` | `ahead-of-release`; no `refused` status object (failures stay stderr + empty stdout + exit 1).
- **Q3 — `models.next` / `nextRecord`:** OMITTED from the JSON.
- **Q4 — `runUpdate({json:true})` without `dryRun`:** fail closed (plain stderr, exit 1) at runtime.
- **Q5 — early-return shape:** same object, `plan: null`, version fields populated.
- **Q6 — flag-table shape:** minimal `REQUIRED_WITH` (flag needs requires); no `CONFLICTS_WITH` now.
