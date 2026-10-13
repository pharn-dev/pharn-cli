# PLAN — orphan-detection: `update` and `status` name the files upstream stopped shipping

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: A file pharn recorded writing (a key in a usable `pharn.records.json`) that is no longer in the expected install set but still exists on disk is an **orphan**. `update` keeps its record (instead of pruning it) while the file exists, reports it in an `ORPHANED` note and an additive `plan.orphans` field of `--dry-run --json`; `status` reports it in an `ORPHANED` note and an additive `orphans` field of `--json`. Nothing is deleted. Closes finding F-12 (Medium, correctness): stale commands/hooks/floor checkers accumulated invisibly and kept running.
- layer(s): one new lib leaf (`src/lib/orphans.ts`, detection + note lines), wiring in `src/lib/update-plan.ts`, `src/commands/update.ts` (write half + renderers), `src/commands/status.ts`, `src/lib/status-report.ts`, `src/lib/update-report.ts`, `src/steps/install-archetype.ts` (carry, see Q4); tests; docs. No `pharn-contracts` change. No trusted-doc edit by the agent.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (read this run, P6)

- `src/lib/update-decision.ts:182-186,264-267` — `planUpdate` builds `nextRecords` keyed by the manifest only ("entries for paths no longer installed are pruned rather than accumulating forever"). `src/lib/update-plan.ts:179-184` reads the baseline once (`recordsBaseline`); `:221-234` already carries one non-manifest subset forward (`frozenRecords` via `recordsUnderCapabilities`). `src/commands/update.ts:638-649` writes `{...frozenRecords, ...nextRecords, ...buildRecords(written), models}`; the `ApplyError` path (:618) writes `{...records, ...}` (keeps everything).
- `src/lib/install-records.ts:22-28,120-127` and `docs/reference/pharn-records.md` "Trust": "a record KEY is never path-joined". Orphan detection must stat/hash a path named by a key → this invariant changes and needs a floor (see Trust audit).
- `src/lib/apply-update.ts:45` `readDiskState(projectRoot, rel)` — total classifier (`absent` / `file{hash}` / `unreadable{reason}`), `safeJoin` + `findSymlinkComponent` + `lstat` regular-file check, never throws, never opens a FIFO. Reusable verbatim for the orphan read.
- `src/lib/update-plan.ts:273-280` `featuresReadmeRelocation` = `FEATURES_README in records && resolved !== FEATURES_README`; `abandonedLayout` warns when the layout flips. With kept orphan records the relocation warning would repeat on every later run while the root copy exists (Q5).
- `src/commands/status.ts:145-166` (json) and `:270-293` (text) compute drift from a clone at `configLayout`, excluding frozen capabilities; status reads no records today (CLAUDE.md, `docs/commands/status.md:19,82,220`). `strictFails` (`lib/status-report.ts`) is the one `--strict` predicate.
- `src/lib/update-report.ts` — explicit field-by-field projection, `schemaVersion: 1`; `--compact` filters only `plan.files`.
- `src/steps/install-archetype.ts:320-330` — re-run `init` writes records `{...keptRecords(baseline,…), ...buildRecords(manifest)}` → it would drop orphan records (Q4).
- Docs that state the gap: `docs/commands/update.md:355-356`, `docs/roadmap.md:35` (Planned row), `README.md:349`, `LIMITS.md:81` (human-only), `docs/reference/pharn-records.md` (Pruning, Trust).
- Concurrent F-04 (another agent): `update` will delete the dirs of capabilities it DROPS from config. Capability dirs of dropped capabilities are therefore excluded from orphan detection here (see Design 1c), keeping the two changes disjoint.

## Design

1. **`src/lib/orphans.ts` (NEW; one axis: which recorded files the install no longer owns).**
   `findOrphans({ projectRoot, records, expected, installed }): { orphans: Orphan[]; records: FileRecords }` — pure of writes. A record key `k` is an orphan candidate iff ALL of:
   a. `records !== null` (a usable, stamp-matched baseline — otherwise nothing is reported; `update` already prints the records note);
   b. `k !== MODELS_RECORD_KEY` and `!expected.has(k)`;
   c. `k` lies under an **install root** — membership in the set derived from `layoutPaths('flat')` ∪ `layoutPaths('pharn')` (capability subtrees, contracts, core, floor dirs as `dir/` prefixes; docs, license dests, features READMEs as exact paths) plus `.claude/commands/pharn-*.md` (not `pharn-dev-`) and `.claude/hooks/*.cjs`, one level deep. Single-sourced from `layoutPaths`, so it tracks the manifest;
   d. NOT under `<subtree>/<name>/` (either layout) of a capability that is not in `installed` — dropped capabilities are F-04's (out of scope; their records keep today's pruning);
   e. NOT under a frozen capability (those are carried by `frozenRecords`; caller passes `installed` minus frozen + excludes frozen prefixes);
   f. `readDiskState(projectRoot, k)` is not `absent`.
   State: `file` with hash === record → `unchanged`; `file` otherwise → `edited`; `unreadable` → `unreadable` (+reason). Returned sorted by path (code-unit). `records` = the orphan keys with their PREVIOUS hash (to be carried).
   Also `orphanNoteLines(orphans, { preview })` (grouped UNCHANGED / EDITED / UNREADABLE, each group capped at 20 paths with "… and N more", plus a hint: delete by hand, e.g. `git rm <path>`; pharn stops listing a path once it is gone; `update` never deletes). If P3 review wants it, the renderer splits to `orphans-format.ts`.
2. **`update` keeps them visible (option (a)).** `buildUpdatePlan` calls `findOrphans` with `expected`, `records`, the next membership (`configCapabilities` minus frozen). `report.orphans: Orphan[]` (JSON-safe), `apply.orphanRecords`. `applyPlannedUpdate` writes `{...frozenRecords, ...orphanRecords, ...nextRecords, ...}` — orphan keys are disjoint from the manifest, so they never enter the 6-row table and never affect `versionWithheld`/`pendingSkillsVersion`/the early return. A record is pruned only once its file is gone (or once it leaves the candidate set, e.g. its capability is dropped). Benefit: if upstream re-ships the path later, the carried record turns it into a clean `updated` instead of an `unrecorded` skip. Stamp invariant holds: an orphan record still describes bytes pharn wrote (it is not re-hashed, never minted when `records === null`).
3. **Renderers.** `update`: `note(orphanNoteLines(...), 'ORPHANED')` in `reportOutcome` and `reportDryRun` (after SKIPPED, before layout warnings); nothing when empty. `--dry-run --json`: additive `plan.orphans: [{ path, state, reason? }]` (always present when `plan` is; `[]` when none; not filtered by `--compact`), `schemaVersion` stays 1, free text through the existing serializer escape. Same-version early return: no plan, no orphan note (status covers it; documented).
4. **`status`.** Reads the records baseline (`recordsBaseline(readRecords(cwd), config stamp)`) ONLY for orphan detection, against the same expected set the drift section uses (`collectExpectedInstallPaths` at `configLayout`, frozen excluded) — `diffInstalledCapabilities` gains no records input; drift classification is unchanged. Text: an `ORPHANED` note after DRIFT. JSON: additive `orphans: [{ path, state, reason? }] | null` — `null` when not computed (`--no-drift`, or no usable records). **Not a `--strict` input** (Q2).
5. **`init` (Q4)**: a re-run `init` carries `findOrphans(...).records` from its `reinstallBaseline` against its manifest, so a re-init does not make orphans invisible again. No report from `init`.

## Files

- `src/lib/orphans.ts` — NEW: `findOrphans`, install-root membership, `orphanNoteLines` — layer: lib
- `src/lib/update-plan.ts` — `report.orphans`, `apply.orphanRecords` (localized block) — layer: lib
- `src/commands/update.ts` — carry `orphanRecords` in the records write; ORPHANED note in `reportOutcome` + `reportDryRun` — layer: command
- `src/lib/update-report.ts` — additive `plan.orphans` projection — layer: lib
- `src/commands/status.ts` — read records baseline, compute + print orphans (text and json) — layer: command
- `src/lib/status-report.ts` — additive `orphans` field; `strictFails` unchanged — layer: lib
- `src/steps/install-archetype.ts` — carry orphan records on a re-run `init` (Q4) — layer: step
- `src/lib/install-records.ts` — header comment: keys ARE path-joined in exactly one read-only place (orphans), under the install-root membership + `readDiskState` floor — layer: lib (comment only)
- `tests/orphans.test.ts` — NEW: unit tests for `findOrphans` + `orphanNoteLines` — layer: tests
- `tests/update-plan.test.ts` / `tests/update.test.ts` / `tests/update-dry-run.test.ts` / `tests/update-report.test.ts` (whichever exist; checked at build) — integration + projection — layer: tests
- `tests/status.test.ts` / `tests/status-report.test.ts` / `tests/status-json.test.ts` (whichever exist) — text + json + strict-unaffected — layer: tests
- `tests/init.test.ts` or `tests/install-archetype.test.ts` — re-init carries orphan records — layer: tests
- `docs/commands/update.md` — replace the "never deletes … stays where it is" sentence with an "Orphaned files" section (definition, the note, JSON field, record kept until the file is gone, hint) — layer: docs
- `docs/commands/status.md` — ORPHANED note, `orphans` JSON field, not a `--strict` input, and the now-precise "reads records only for orphans" statement (lines 19, 82, 220) — layer: docs
- `docs/reference/pharn-records.md` — Pruning (orphan records kept while the file exists), Trust (the one read-only key-to-path use and its floor), who reads it (status) — layer: docs
- `docs/roadmap.md` — move "Orphaned-file detection" from Planned to Shipped — layer: docs
- `README.md` — line ~349 "orphaned-file detection is still planned" → shipped wording — layer: docs
- `docs/contributing.md` — test-file table row for `tests/orphans.test.ts` if that table lists tests (checked at build) — layer: docs
- `CLAUDE.md` — `update` paragraph (orphan records kept, ORPHANED note, `plan.orphans`), `status` paragraph ("does NOT read records" → reads them only for orphans; not a strict input; `orphans` json field) — layer: docs
- `CHANGELOG.md` — `### Added` under `## [Unreleased]`; no version bump — layer: docs
- `.dev/features/orphan-detection/{PLAN,GRILL,REGRESSION,VERIFY,REVIEW,SHIP}.md` + reports — dev-loop artifacts — layer: dev

## Contracts satisfied

- No `pharn-contracts` file governs these commands. Reuses `recordsBaseline` (stamp contract), `readDiskState` (read-side physical floor), `layoutPaths` (layout contract), `serializeJsonReport` (JSON escape contract) verbatim (P4).

## Evals to write (P1)

Unit (`tests/orphans.test.ts`):

- recorded, not expected, present + hash equal → `unchanged`; hash differs → `edited`; symlink at the path / under a symlinked parent / a directory → `unreadable` with reason; absent → not reported and not carried
- `records === null` → `[]`, no carried records
- expected key, `MODELS_RECORD_KEY` → never orphans
- key outside every install root (e.g. `src/index.ts`, `README.md`, `.claude/settings.json`, `.claude/commands/pharn-dev-x.md`, `.claude/commands/sub/pharn-x.md`) → never stat'ed, never reported (spy or fixture proving no read)
- key under a capability dir of a capability not installed (both layouts) → excluded; under an installed capability → reported
- old-layout copies after a flat→pharn switch → reported
- sorted output; carried records equal previous hashes
- `orphanNoteLines`: grouping, cap + "… and N more", preview vs real tense, empty → null

Integration:

- `update`: upstream drops `.claude/commands/pharn-old.md` → ORPHANED note lists it as unchanged; the file is still on disk; `pharn.records.json` still has its key; a SECOND update (same-version re-open via `--force` or a version bump fixture) still lists it; after deleting the file the next update prunes the key and prints no note
- `update`: edited orphan → listed as edited; orphan does not withhold the version bump, does not appear in SKIPPED, does not change counts
- `update --dry-run`: note in preview tense; whole-tree snapshot unchanged
- `update --dry-run --json`: `plan.orphans` present (and `[]` when none), unchanged by `--compact`, `schemaVersion` 1
- upstream re-ships a previously orphaned path → `updated` (not `unrecorded`)
- dropped capability's files → not in `orphans` (F-04 boundary)
- `status`: ORPHANED note; `--json` `orphans` array; `--no-drift` → `orphans: null`; unusable records → `null`; `--strict` exit unaffected by orphans
- `init` re-run: orphan record carried (Q4)
- full suite `CI=1 npx vitest run --maxWorkers=2`, `npm run check`, `npm run build`, coverage thresholds

## Guarantee audit (P0)

- "A recorded file upstream no longer ships is listed while it exists" → floor: set membership (`expected.has`, install-root membership) + `readDiskState` presence; conditional on a usable store (stamp exact-match) — stated in docs; with no usable store nothing is listed (named limit).
- "`unchanged` = pharn's bytes" → floor: sha256 equality against the stamp-checked record; the store is hand-editable, so this is bytes-equality, not intent (advisory w.r.t. "safe to delete" — the note says "unchanged since pharn wrote it", never "safe").
- "Nothing is deleted" → no write/delete call is reachable from `findOrphans` (read-only; tested via tree snapshot in the dry run and by file presence).
- "Orphans never change update's decisions" → structural: orphan keys are disjoint from the manifest the 6-row table iterates; counts/withheld version tested unchanged.
- NOT claimed: files pharn never recorded (pre-0.4.0 installs, files written while the store was unusable) are not detected; `status` lists against current upstream, so it can name a file the next `update` will also call orphaned before that update runs.

## Trust audit (P2)

- `pharn.records.json` is local, hand-editable, untrusted. NEW: a record key now drives a READ (lstat + sha256) — only when it (1) passed `isInvalidRecordKey` at ingest, (2) is a member of the install-root set (so a hand-added `src/auth.ts` key is never read nor presented for deletion), (3) is `safeJoin`-contained, (4) has no symlinked component and is a regular file (`readDiskState`; a FIFO is never opened). It never drives a write or delete. Paths printed go through the existing `terminalSafe` note path / `serializeJsonReport` escape. No new network input; the clone is used only as today (manifest).

## Determinism audit (P5)

- Branches: `Map.has`, `Set` membership, `startsWith` on fixed prefixes, `readDiskState` kind, sha256 string equality. Output sorted by code unit. No guess.

## Out of scope (P7)

- Deleting orphans (any `--prune` flag), detecting files pharn never recorded, dropped-capability dirs (F-04), `LIMITS.md` edits (text proposed at GATE 2), a version bump.

## Open questions (HALT)

1. **Option (a) vs (b)** — keep orphan records in `files` until the file is gone (a) vs a separate additive `orphans` section in the store (b). Recommended: **(a)** — no schema change, stamp semantics unchanged, and a re-shipped path upgrades cleanly from its carried record.
2. **`status --strict` and orphans.** Recommended: **report only, not a strict input.** `--strict` gates "the install is current and intact"; no pharn command can clear an orphan (update never deletes), so a strict failure would turn every upstream file removal into a red CI that only a manual delete fixes — and a stale-but-harmless leftover is not drift.
3. **Install-root membership filter (Design 1c).** Recommended: **yes** — otherwise a hand/PR-edited store could make pharn hash, and list "for deletion", any project file. Alternative: no filter (relies on `safeJoin` only).
4. **Re-run `init` carries orphan records.** Recommended: **yes** (5 lines in `install-archetype.ts`, no report) — else a re-init makes orphans invisible again. Alternative: leave init alone and document it.
5. **`featuresReadmeRelocation` repeats** on later runs while the root `features/README.md` still exists (its record is now kept). Recommended: **accept** — the warning stays true until the copy is deleted, and the file is also listed in ORPHANED. Alternative: suppress the warning when the key was already an orphan last run (needs extra state).
6. **States shown.** Recommended: three — `unchanged` ("unchanged since pharn wrote it"), `edited` ("changed since pharn wrote it — review before deleting"), `unreadable` (with reason). The note never says "safe".
7. **Note cap.** Recommended: 20 paths per state group in the text note (a layout switch can orphan hundreds), full list in `--json`.

## Resolved decisions (GATE 1, 2026-10-13)

GATE 1 passed: every recommended answer taken.

1. Option (a): orphan records stay in `files` until the file is gone.
2. Orphans are NOT a `status --strict` input (report only).
3. The install-root membership filter is kept.
4. A re-run `init` carries orphan records (no report).
5. The repeating features-README relocation warning is accepted.
6. Three states: `unchanged` ("unchanged since pharn wrote it"), `edited` ("changed since pharn wrote it — review before deleting"), `unreadable` (with reason).
7. Text note capped at 20 paths per group; the full list in `--json`.
