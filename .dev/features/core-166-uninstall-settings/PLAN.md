# PLAN — core-166-uninstall-settings (Linear CORE-166, C2.4)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: a `.claude/settings.json` that `init` wrote fresh is recorded in `pharn.records.json`; `update`/`add`/`remove`/re-run `init` keep that record (update and init only while something is at the path); `uninstall` deletes the file when it still matches the record and keeps + lists it when edited, so `init --yes` → `uninstall --yes` no longer leaves a settings file wiring hooks to deleted scripts. A preserved (pre-existing) settings file is never recorded; an install without the record behaves exactly as today.
- base: origin/main @ 688a838 (0.19.0 released). Branch `przemek/core-166-c24-uninstall-removes-the-settingsjson-that`. Ticket line numbers were at b14cf22; re-located below.
- layer(s): CLI source (`src/lib/*`, `src/steps/install-archetype.ts`, `src/commands/uninstall.ts`), tests, docs (`docs/commands/uninstall.md`, `docs/reference/pharn-records.md`, `docs/commands/init.md`, `docs/commands/update.md`, `docs/troubleshooting.md`), `CLAUDE.md`, `CHANGELOG.md`.
- constitution_refs: [P0, P1, P2, P4, P5, P6, P7]

## Why (discovery, this run)

- `src/lib/install-capabilities.ts:254-260` copies upstream's settings when none exists (`settingsWritten`); `src/steps/install-archetype.ts:389-414` builds `files` from kept + orphans + manifest + models only — no settings key.
- `src/lib/uninstall-plan.ts:81` sends every key failing `isInstallRootPath` to `outside`; `.claude/settings.json` is not an install-root path (`src/lib/install-surfaces.ts`), so even a recorded key would be left.
- `src/commands/uninstall.ts:282` `UNTOUCHED` unconditionally claims settings.json is left untouched; `removeEmptyDirs` already removes `.claude/` when it ends empty (rmdir floor), so deleting the file is enough for that AC.
- `src/lib/missing-installed.ts:50` walks every record key (skips only `MODELS_RECORD_KEY`).
- `findOrphans` / `prettierignoreEntries` / `danglingHookLines` all filter through `isInstallRootPath` → a settings key is ignored by them as long as `isInstallRootPath` is NOT widened (ticket: do not widen).
- `update` (`src/lib/update-next.ts` `nextRecordStore`) writes only frozen + orphan + manifest + models records → today it would DROP a settings record. `add` (`mergeCapabilityRecords`, extends) and `remove` (`pruneCapabilityRecords`, capability-prefix filter) already keep every other key.
- `buildRecords` skips absent / non-regular dests, so recording an un-written path is impossible.
- Protected docs: THREAT-MODEL.md / LIMITS.md never state that uninstall leaves settings.json or enumerate uninstall's delete bound (grep `uninstall`/`isInstallRootPath`: no hits) → no patch script needed.

## Files

- `src/lib/install-records.ts` — layer CLI lib (the record store's axis):
  - ADD `export function carriedSettingsRecord(projectRoot: string, records: FileRecords | null): FileRecords` — returns `{ [CLAUDE_SETTINGS_FILE]: records[key] }` when `records` holds the key AND `lstat(safeJoin(root, key))` finds an entry (any type; a throwing lstat → nothing); else `{}`. Read-only, never throws. The ONE carry rule `init` and `update` share.
  - Header comment: the settings record is a second fixed exception (a file pharn wrote once, never rewritten); uninstall admits that one key besides `isInstallRootPath`.
- `src/steps/install-archetype.ts` — in `files`: `...(settingsWritten ? buildRecords(cwd, [CLAUDE_SETTINGS_FILE]) : carriedSettingsRecord(cwd, baseline))`, placed before the manifest records (keys disjoint). A first install that preserved a file has `baseline === null` → nothing; a re-run over a preserved file carries the previous record only when there was one. Comment.
- `src/lib/update-plan.ts` — `UpdateApplyInputs.settingsRecords: FileRecords` = `carriedSettingsRecord(cwd, records)`; NOT added to `prettierignorePaths` (not an install path).
- `src/lib/update-next.ts` — `nextRecordStore` Pick + spread `apply.settingsRecords` (beside frozen/orphan records). `planStateChanges` reads it through `nextRecordStore` automatically: a record whose file the user deleted is dropped by the next run that plans (a store-only change), and never re-added.
- `src/lib/missing-installed.ts` — skip `CLAUDE_SETTINGS_FILE` like `MODELS_RECORD_KEY` (deleting the file must not re-open the same-version early return) + doc line.
- `src/lib/uninstall-plan.ts` — `if (rel !== CLAUDE_SETTINGS_FILE && !isInstallRootPath(rel)) outside`; the key then goes through the same parent-symlink walk / regular-file / contentHash classification. Header comment updated. `isInstallRootPath` untouched.
- `src/commands/uninstall.ts` — `UNTOUCHED` becomes `untouchedLine(settingsRecorded: boolean)`: with the record, `.claude/settings.json` is dropped from the "left untouched" list (its fate is in the delete / keep / already-gone buckets); without it, the line is byte-identical to today. Both call sites (PLAN note from the preview's records, UNINSTALLED note from `result.records`). Header + `removeEmptyDirs` comments (`.claude/settings.json` no longer always keeps `.claude/`). No backup of settings.json (hash-equal = the exact upstream bytes init copied).
- `tests/install-records.test.ts` — `carriedSettingsRecord`: key + file → carried; key + no file → `{}`; no key → `{}`; null store → `{}`; ENOTDIR (`.claude` is a file) → `{}`.
- `tests/uninstall-plan.test.ts` — settings key hash-equal → `delete`; edited → `edited`; absent → `absent`; symlinked `.claude/` → `unsafe`; `.claude/settings.local.json` key → still `outside` (only the one key is admitted).
- `tests/missing-installed.test.ts` — a recorded, deleted `.claude/settings.json` → `null`.
- `tests/orphans.test.ts` — `findOrphans` ignores a recorded `.claude/settings.json` present on disk (pins the not-an-orphan AC at the unit level).
- `tests/update-next.test.ts` — `nextRecordStore` carries `settingsRecords`; `planStateChanges` reports no store change when the loaded store already has the same record.
- `tests/update-plan.test.ts` — `buildUpdatePlan`: recorded + present → `apply.settingsRecords` carries it; recorded + deleted → `{}`; `prettierignorePaths` never includes it.
- `tests/uninstall.test.ts` — with a settings record: hash-equal → deleted, `.claude/` removed when empty, UNTOUCHED line without `.claude/settings.json`, no HOOKS note from settings.json; edited → kept, listed under "Keep … you changed", HOOKS note as today. Existing no-record cases stay as they are (they pin "installs without the record behave as today").
- `tests/init-archetype.test.ts` — (found at build) two cases pinned the OLD contract ("does not record the user-owned .claude/settings.json", and the exact record key set = manifest + models): rewritten to the new one — a fresh install records `.claude/settings.json` at its dest hash; one over a pre-existing file records nothing.
- `tests/commands-integration.test.ts` (real modules, real tarball):
  - fresh `init --yes` → `records().files['.claude/settings.json'] === sha256(...)`; the existing "user-owned settings.json is not pharn's" comment/filter adjusted.
  - `init` over a pre-existing settings.json → no settings key.
  - `update --yes` (newer upstream, plans) / `add` / `remove` → the record unchanged, file bytes unchanged.
  - re-run `init` (interactive path not reachable via `--yes` on a re-install → use `init --dry-run`? no: records are written only by a real run) — use the existing re-run helper the suite already uses for re-installs if present, else a TTY-stubbed run as CORE-158 did; asserts the record kept.
  - delete settings.json → same-version `update` early-returns (no codeload fetch).
  - `update --dry-run --json` / `status --json` → no orphan named `.claude/settings.json`.
  - REWRITE "uninstall --yes deletes what the records prove, keeps edits and settings": settings now deleted; left = `.gitignore`, edited CONSTITUTION, backup; `.claude/` gone; no HOOKS note.
  - ADD: settings edited after init → uninstall keeps it, PLAN lists it as edited, HOOKS note lists the dangling hook as today.
  - ADJUST "uninstall afterwards leaves no empty pharn/" (`rootEntries` loses `.claude`).
  - Prettier test: `.prettierignore` still has no `.claude/settings.json` line (settings stays under the user's check).
- `docs/commands/uninstall.md` — deletes the settings.json init created when unchanged (kept + listed when edited); `.claude/` removed when empty; "What is never deleted" narrowed to settings.local.json and a settings.json pharn did not create / has no record of; PLAN-note reminder conditional; a short "Installed before this change" note: how to check (`pharn.records.json` has no `.claude/settings.json` entry) and delete by hand.
- `docs/reference/pharn-records.md` — the intro's "excluded" sentence and the "never recorded" paragraph replaced: recorded only when `init` wrote it fresh; who keeps it (`update` only while it exists, `add`/`remove` untouched, re-run `init`); never an orphan, never re-opens `update`; `uninstall` deletes it when unchanged.
- `docs/commands/init.md` ("A fresh `.claude/settings.json`") — one sentence: its hash is recorded so `uninstall` can remove it when unchanged.
- `docs/commands/update.md` (`:1047`) — `update` never touches the file; it keeps the record `init` wrote while the file exists.
- `docs/troubleshooting.md` (`:904-906`) — step 3 unchanged in substance; add that `pharn uninstall` now does this itself for a settings file it recorded.
- `CLAUDE.md` — init paragraph (settings recorded when written fresh, carried on re-run), update paragraph (carries the settings record while the file exists; `findMissingInstalled` skips it), uninstall paragraph ("never writes `.claude/settings.json`" → deletes it only by its record; the UNTOUCHED line conditional), install-records sentence about the two path consumers.
- `CHANGELOG.md` — `## [Unreleased]` → new `### Fixed` section, one bold-claim entry. No version bump.

## Contracts satisfied

- CLAUDE.md "`uninstall` deletes only what the record store proves" — extended by exactly one fixed key, still record- and hash-proved, still behind the parent symlink walk and `safeJoin`.
- CLAUDE.md "`.claude/settings.json` is **never** overwritten or merged" / "`update` never touches it" — unchanged: no new write to the file anywhere; only uninstall's unlink, gated by hash equality.
- `pharn.records.json` schema (`RECORDS_SCHEMA_VERSION` 1): one more ordinary `files` key, accepted by the existing ingest rule; no schema change (P7 additive).
- `update --dry-run --json` / `status --json` / `init --dry-run --json` bytes: unchanged (no new key; the settings key is never an orphan).

## Evals to write (P1) — each fails before the code change

- integration: fresh `init --yes` records `.claude/settings.json` (FAILS today: no key).
- integration: `init --yes` → `uninstall --yes` → no `.claude/settings.json`, no `.claude/`, no HOOKS note (FAILS today: file left, HOOKS note printed).
- integration: edited settings → kept, in the PLAN note's edited list (FAILS today: not listed — it is unrecorded).
- integration: `update --yes` with a newer upstream keeps the record (FAILS today: `nextRecordStore` drops it).
- integration: delete settings.json → next same-version `update` makes no fetch (pins; would fail if the skip in `findMissingInstalled` were missing).
- integration: pre-existing settings → never recorded (passes today; pins AC).
- unit: `planUninstall` classifies the settings key `delete`/`edited`/`absent`/`unsafe` (FAILS today: `outside`).
- unit: `findMissingInstalled` skips it (FAILS today: returns `.claude/settings.json`).
- unit: `carriedSettingsRecord` cases (FAIL today: no function).
- unit: `findOrphans` ignores it (passes today; pins the "never widen isInstallRootPath" invariant).

## Guarantee audit (P0)

- "uninstall deletes `.claude/settings.json` only when it holds the bytes pharn wrote" → floor: exact key equality (`rel === CLAUDE_SETTINGS_FILE`) + `contentHash` equality with the record + `safeJoin` + parent symlink walk (existing `classify`); unit + integration tests.
- "a preserved settings file is never recorded" → floor: the record is built only on `settingsWritten` (the same boolean that gated the copy) or carried from a previous record; a first install's baseline is `null`. Tests.
- "no new writer of settings.json" → floor: no code path added that writes the file (grep at build: no new `copyFile`/`write*` on `CLAUDE_SETTINGS_FILE`).
- "never an orphan / no `.prettierignore` line" → floor: `isInstallRootPath` unchanged + tests.
- "deleting the file does not re-open `update`" → floor: membership skip in `findMissingInstalled` + integration test.
- Residual (stated, advisory): a hand-edited record whose hash matches the user's own settings.json would let uninstall delete it — the same residual every recorded install path already has (the store is local and committed). The PLAN note shows the delete count and the confirm defaults to No.

## Trust audit (P2)

- No new untrusted input. The record key is a fixed literal compared by equality; the store's hash is compared, never parsed. The upstream file's content is hashed at the DEST after the copy (as every record), never parsed for this change.

## Determinism audit (P5)

- Every branch is a membership/equality test: `settingsWritten` boolean, key-in-store, lstat finds-an-entry, `rel === key`, hash equality.

## Open questions (HALT)

- None blocking. Decisions taken (for the orchestrator to accept or change at GATE 1):
  1. The carry rule is "something is at the path" (lstat, any type), shared by `update` and re-run `init`; a symlinked settings leaf keeps its record and uninstall classifies it `unverifiable` (kept), as for every other key.
  2. uninstall does not back up settings.json before deleting it (hash-equal means it is upstream's verbatim bytes).
  3. A stale record left after the user deleted the file is dropped by the next `update` that plans (store-only rewrite), never by a same-version early return; uninstall reads it as `absent` meanwhile.
