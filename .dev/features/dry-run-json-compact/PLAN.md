# PLAN — `pharn update --dry-run --json --compact`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, read this run
- increment: add an opt-in `--compact` flag to `update --dry-run --json` that omits the `noop` (label `ok`) entries from `plan.files` and says so in the output, leaving the default `schemaVersion: 1` output byte-identical.
- layer(s): CLI (`src/index.ts` dispatch, `src/commands/update.ts`, `src/lib/update-report.ts`) + user docs. No `pharn-contracts` change.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Discovery (live state, read this run)

- `plan.files` is one entry per installed file (`rel`, `action`, `label`, `backup`, `forced`), built by `planReport` in `src/lib/update-report.ts`. `action: 'noop'` ⇔ `label: 'ok'` ⇔ decision row 2 of `decideFileAction` (`src/lib/update-decision.ts`), and each one adds 1 to `counts.ok`. So `counts.ok === count(noop entries)` always.
- Every other `files` entry is already mirrored in `writes` / `backups` / `skipped`, but only `files` carries the per-write `label` (`restored` vs `updated`) and `forced`. So dropping ONLY `noop` loses no decision data; dropping all of `files` would.
- Measured on a synthetic 502-file plan with realistic paths (500 noop, 1 write, 1 skip; `scratchpad/m.ts` through the real `buildUpdateReport` + `serializeJsonReport`): **103,891 B full → 1,631 B with noop omitted (−98.4 %, 63.7×)**. That matches the argus measurement (99.7 KB → well under 1.5 KB of decision data).
- `src/index.ts`: `ALLOWED_FLAGS.update = [force, yes, ref, dry-run, json]`; `REQUIRED_WITH.update = [{json → dry-run}]`; `DECLARED_FLAGS`/boolean list is DERIVED from `ALLOWED_FLAGS`, so a new flag is declared by adding it to the row. `unmetRequirements` is single-level (`Boolean(argv[flag]) && !argv[requires]`), reported as `--flag (needs --requires)` before the `--help`/`--version` short-circuits.
- `runUpdate` (`src/commands/update.ts:85-95`) already fails closed on `json && !dryRun`; `buildUpdateReport` is called from the early-return sites (`status` `up-to-date` / `ahead-of-release`, `plan: null`) and from `runDryRun`.
- `tests/index.test.ts:~880-900` asserts `runUpdate` `toHaveBeenCalledWith({force,yes,dryRun,json[,ref]})` exactly: adding a key that is always passed breaks those expectations (see Files).
- `docs/commands/update.md` § "JSON output" (key table + example), `README.md:269`, `CHANGELOG.md` (the 0.10.0 entry is released; new entry goes under Unreleased), `USAGE` in `src/index.ts`, and `docs/troubleshooting.md` (exit-code table) mention the flags.

## Design decision (recommended: (a), named `--compact`)

**Recommend (a): additive opt-in flag `--compact`.** Under it `plan.files` keeps every non-`noop` entry and omits the `noop` ones, and the report carries two additive markers that exist ONLY under `--compact`:

- top-level `"compact": true` — present on every `--compact` report, including the `plan: null` early returns, so a consumer reading `status: up-to-date` can still tell which view it asked for;
- `plan.filesOmitted: { "action": "noop", "count": N }` — what was left out and how many; `N === plan.counts.ok` (pinned by a test), so a consumer can reconstruct the total installed-file count as `files.length + filesOmitted.count`.

**How a consumer tells the shapes apart.** Default output contains neither key; it is byte-identical to 0.10.0 (a snapshot-style test pins that: same input → same serialized bytes as before the change). A `--compact` report is recognized by `compact === true` (top level) and `plan.filesOmitted` (the plan). A consumer that never passes the flag can never receive a filtered list, so it cannot mistake one for a full one; a consumer that passes the flag and reads `plan.files` without checking the marker is the one case the markers exist for. `schemaVersion` stays `1`: keys are only ADDED, and only on an opt-in path (the documented "new keys may appear within 1" rule); no field is dropped or renamed on any path a v1 consumer can reach.

**Flag-table and `REQUIRED_WITH` implications (`src/index.ts`).**

- `ALLOWED_FLAGS.update` gains `compact` (so the derived boolean declaration list gains it, and every other command still REFUSES it — `status --compact`, `list --compact`, `add --compact` exit 1 as "Unsupported option").
- `REQUIRED_WITH.update` gains `{ flag: 'compact', requires: 'json' }`. `--compact` is meaningless without `--json` (the text preview has no `files` list to filter), and `--json` already needs `--dry-run`, so the chain is `--compact` → `--json` → `--dry-run`. `unmetRequirements` is single-level and is kept so: `update --compact` alone refuses naming `--compact (needs --json)`; `update --compact --dry-run` refuses the same way; `update --compact --json` (no `--dry-run`) refuses naming only `--json (needs --dry-run)` — one more error is revealed after the user fixes it, each message true and actionable. (Alternative considered: make `unmetRequirements` transitive so one message lists the whole chain; rejected as a new mechanism for one pair — P7.)
- `runUpdate` gets `compact?: boolean`; like `json`, a direct call with `compact && !json` fails closed via `reportFatalPlain` (stderr, exit 1, nothing run), so the library entry point cannot be less strict than the dispatch.
- `main()` passes `compact: Boolean(argv.compact)`. `--compact=false` is read like every other boolean (`Boolean(false)`), and `--compact=false` alone is refused by the same presence rule the existing `--dry-run=false --json` row uses — documented, not new.
- `USAGE` text gets one line.

**Alternatives listed (not chosen).**

- **(b) Compact by default + `schemaVersion: 2`, opt-in for the full list.** Rejected: `schemaVersion` is matched exactly (P5), so every consumer of the 0.10.0 contract — including the shipped `pharn-cli` skill 0.2.2 — breaks on upgrade, and the CLAUDE.md constraint says v1 output must stay compatible. It also makes the safe-by-default shape the lossy one. Revisit only if a v2 is needed for other reasons; the opt-in flag then gets promoted to the default at that time.
- **(c1) Drop `plan.files` entirely under the flag** (the same info is in `writes`/`backups`/`skipped`). Rejected: loses the per-write `label` (`restored` vs `updated`) and `forced`, which only `files` carries; saving over (a) is ~0.1 KB.
- **(c2) Field projection (`--fields plan.writes,…`) / a general filter.** Rejected: a mini query language to solve one measured problem; new validation surface for untrusted argv (P7).
- **(c3) Single-line JSON (no indentation) under the flag.** Rejected as unrelated to the measured noise (the 70 KB is entries, not whitespace) and it hurts the `cat`-ability the docs promise; could be a later, separate need.
- **(c4) Auto-compact above a size threshold.** Rejected: a heuristic that changes the shape by project size — the opposite of P5; a consumer could never predict the shape.
- **Name alternatives for the flag:** `--changes-only`, `--omit-ok`. `--compact` is recommended (short, names the property, not the mechanism); see Open questions.

## Files

- `src/lib/update-report.ts` — `UpdateReport` gains optional `compact?: true` and `plan.filesOmitted?: {action:'noop', count:number}`; `UpdateReportInput` gains `compact?: boolean`; `planReport(p, compact)` filters `action === 'noop'` entries and emits `filesOmitted` only when compact; `buildUpdateReport` sets `compact: true` only when asked (the key is absent otherwise — spread-free, so default bytes are unchanged). Explicit field-by-field style retained. — layer CLI/lib
- `src/commands/update.ts` — `runUpdate` opts gain `compact?: boolean`; fail-closed `compact && !json`; thread `compact` through `runDryRun`/`fetchAndPlan` JSON sites and BOTH early-return `buildUpdateReport` calls. — layer CLI/commands
- `src/index.ts` — `ALLOWED_FLAGS.update` += `compact`; `REQUIRED_WITH.update` += `{compact → json}`; `main()` passes `compact`; `USAGE` line. — layer CLI/dispatch
- `tests/update-report.test.ts` — unit: default output unchanged (golden: serialized bytes equal to a pinned literal / equal to the pre-change builder output for the existing fixture); compact omits exactly the `noop` entries, keeps writes/skips/forced/restored entries with all five fields, sets `compact: true` and `plan.filesOmitted.count === counts.ok`; early-return reports carry `compact: true` with `plan: null`; **size pin** (see Evals). — layer tests
- `tests/update-dry-run-json.test.ts` — integration through `runUpdate({dryRun, json, compact})`: one object, nothing else on stdout, `files` has no `noop`, `filesOmitted.count` equals the real clean-file count of the scaffold, a `modified` skip and a `restored` write are still listed, plan identical to the non-compact run apart from `files`/markers; `compact` without `json` fails closed (stdout empty, exit 1, nothing run); under `--force` forced entries remain; compact on `up-to-date` / `ahead-of-release`. — layer tests
- `tests/index.test.ts` — dispatch: `update --dry-run --json --compact` passes `compact: true`; `update --compact` and `update --compact --dry-run` refuse with `--compact (needs --json)`; `update --json --compact` (no dry-run) refuses naming `--json (needs --dry-run)`; `--compact` refused as unsupported on `status`/`list`/`add`/`remove`/`init`; the `--help` ordering cases extended; EXISTING `toHaveBeenCalledWith({...})` expectations updated to include `compact: false` (or the call site omits the key when false — decided in build; see Open question 3). — layer tests
- `docs/commands/update.md` — "JSON output": document `--compact`, the two markers, how to tell the shapes apart, that `counts` are always complete, that it does not help when most files are real changes (e.g. a first restore), plus an example fragment. — layer docs
- `README.md` — one clause on the `update` row (line ~269). — layer docs
- `docs/troubleshooting.md` — exit-code table row for `--compact` without `--json` (refusal, exit 1) if the table lists the `--json` refusal (it does). — layer docs
- `CHANGELOG.md` — Unreleased entry: the flag, the measured size, the byte-identical default. (No version bump: release is a separate, human step.) — layer docs
- `CLAUDE.md` — NOT edited in this plan; the build step may need to add `compact` to the `update` row sentence in the Architecture paragraph (`ALLOWED_FLAGS`/`REQUIRED_WITH` description). Flagged below so the build agent / human decides (CLAUDE.md is project guidance, not a trusted doc, but this plan stays within the declared writes).

## Contracts satisfied

- `pharn-contracts` — none touched. The report schema is this CLI's own (`update-report.ts` header: "its own constant"), versioned independently of `status --json`; no contract cited or changed (P4).

## Evals to write (P1)

- default report bytes → unchanged vs pre-change builder for the same `UpdatePlanReport` (golden), no `compact` / `filesOmitted` key anywhere.
- compact, 500 noop + 1 write + 1 skip → `files` length 2, both entries intact, `filesOmitted = {action:'noop', count:500}`, `counts.ok === 500`.
- compact invariant (property over a mixed fixture): `files.length + filesOmitted.count === full.files.length`, and the compact `files` is exactly the full `files` minus `action==='noop'`, in order.
- **size pin (the measured win):** realistic 504-file fixture (500 noop with 60–80-char paths as on argus, plus a handful of write/skip/forced entries): `serializeJsonReport(compact).length < 0.03 × serializeJsonReport(full).length` AND `< 4096` bytes absolute; assert the full report is `> 60_000` so the fixture cannot silently shrink and make the ratio trivial. Measured today: 103,891 → 1,631 B (1.6 %). Thresholds leave headroom for field growth but fail if noop entries leak back in.
- `compact` + `status: up-to-date` / `ahead-of-release` → `compact: true`, `plan: null`.
- `runUpdate({compact: true})` without `json` → exit 1, stdout empty, no network/fs call (fail closed).
- dispatch: each flag-table refusal listed under Files/`tests/index.test.ts`, and that `--compact` on every other command is `Unsupported option`.
- `--compact` output still passes through `serializeJsonReport` (escaping unchanged): a hostile `rel` on a KEPT entry is escaped; a hostile `rel` on an omitted `noop` entry simply never appears.
- coverage: new branches (compact true/false in `planReport`, `buildUpdateReport`, `runUpdate` guard) are all exercised so the ratchet (97/92/97/97) is not lowered.

## Guarantee audit (P0)

- "Default `--json` output is byte-identical to 0.10.0" → floor: **content-hash** style check — a golden test comparing serialized bytes (exact-match) over a representative plan; the claim covers the fixtures, not every possible plan; pinned shape-wise by the explicit projection (no spread). Advisory beyond the fixtures.
- "`--compact` omits only `noop` entries and counts stay complete" → floor: **enum membership** (`action === 'noop'` filter) + test invariant `files.length + omitted === full.length`, `omitted === counts.ok`.
- "A consumer can tell a filtered list from a full one" → floor: key presence (`compact: true`, `plan.filesOmitted`) set by one code path, tested; that a consumer *reads* the marker is advisory (documented, cannot be enforced).
- "`--compact` is refused without `--json` / on other commands" → floor: **enum/regex-class membership** in `ALLOWED_FLAGS`/`REQUIRED_WITH` (Map membership, P5), tested at the dispatch.
- "Compact output is ≈1.6 KB on a 500-file install" → advisory as a *product* claim (depends on the project); the pinned ratio is a floor test on a fixed fixture only. Docs must say "in a measured 500-file example", not "always".
- "`stdout` is exactly one object, no clack" → unchanged, reuses the existing test helpers (`expectOnlyTheObject`); no new claim.
- "The stable-schema contract" → advisory (as already documented in `update-report.ts`): the floor cannot enforce a consumer's reading.

## Trust audit (P2)

- No new untrusted input is ingested. `--compact` is a boolean read from argv (membership in the declared flag set; value shape not checked, like its siblings). The data filtered is the planner's `files` list: it is derived from the untrusted clone's paths but is only FILTERED by the enum `action`, never interpreted; surviving strings still go through `serializeJsonReport`'s escaping. Taint of every retained field is unchanged; the omission only removes strings.

## Determinism audit (P5)

- The filter is a membership test on the `UpdateAction` enum; the flag requirements are table lookups; the only fallback is "refuse, exit 1" (print the unmet requirement). No size-based or heuristic switching (rejected explicitly in (c4)).

## Resolved decisions (GATE 1, 2026-10-10)

Approved "with recommendations": every question is resolved as the recommended answer.

1. Approach → **(a)** opt-in `--compact` flag; (b) schemaVersion 2 and (c1–c4) rejected.
2. Names → flag `--compact`; markers top-level `compact: true` and `plan.filesOmitted: {action: 'noop', count}`.
3. `main()` → always passes `compact: Boolean(argv.compact)`; exact-match `toHaveBeenCalledWith` expectations in `tests/index.test.ts` are updated.
4. Scope of omission → only `plan.files` `noop` entries; no other list is filtered.
5. `pharn-cli` skill follow-up (pharn-dev/skills) → separate follow-up after a CLI release carries the flag; out of scope here.
6. `CLAUDE.md` → the build edits the `update` flag-table / `REQUIRED_WITH` sentence in the same change (docs discipline); writes-scope for build is widened by `/pharn-dev-build`'s own `writes:`.
