# PLAN — core-306: an `update` interrupted while writing is always healed by a plain re-run

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256(ARCHITECTURE.md), this run
- increment: Before `update` copies a single file, it writes the record store once more with the hashes it is
  about to write in a new optional `incoming` map; the planner accepts a file whose bytes equal its `incoming`
  hash as PHARN's, and the closing store write drops the map.
- layer(s): CLI — `src/lib/install-records.ts` (record store), `src/lib/update-plan.ts` (baseline), `src/commands/update.ts` (write order)
- constitution_refs: [P0, P5, P6, P7]
- ticket: CORE-306 (C10.3), epic CORE-297. Planned on 8cdf9969; rebased onto 11925f08 (#425, #426: no conflict outside CHANGELOG; spec hash unchanged).

## Discovery (live, this run)

- `applyPlannedUpdate` (src/commands/update.ts ~577-618): deletes → `applyWrites` (sync, `copyFileAtomicSync`
  per file, verbatim) → `await writeRecords(nextRecordStore…)` → `await writePharnConfig(…)`. A SIGINT in the
  sync copy loop is handled at the first await (`fatal-signal.ts` `die`), so files are new and records/config old.
- The planner (`buildUpdatePlan`, src/lib/update-plan.ts ~228-276) already hashes every manifest dest
  (`diskStates`) and every source (`latestHashes`), reads the store once (`readRecords`/`recordsBaseline`), and
  hands `records` to `planUpdate` (decision rows 3/4), `planCapabilityRemovals` and `decideModelsUpdate`.
- `plan.nextRecords[rel]` is the source `latestHash` for every planned write (`refreshRecord`), and copies are
  verbatim, so the hash of a planned write's dest after the copy equals it. No new hashing is needed.
- `readRecords` reads only `schemaVersion`/`skillsVersion`/`commit`/`files` and ignores any other top-level key;
  the v0.20.0 reader (`git show v0.20.0:src/lib/install-records.ts`) is identical in that respect. So a new
  optional top-level key is invisible to every CLI in the support window (0.20.x, 0.21.x).
- No "interrupted run's marker" exists today (project-lock.ts only prints `sayInterrupted`).
- update.test.ts already injects state-file failures through a `node:fs/promises` `rename` hook (no src mock);
  two existing tests pin "records are written BEFORE the config" (update.test.ts ~3368, ~3391).

## Options weighed

1. **Chosen — records before files, new hashes beside old ones.** Implemented as an additive optional
   top-level `incoming: { path: hash }` map, NOT as a second hash inside `files` (a `string[]` value would make
   every older CLI in the window read the store as `invalid` → whole install `unverifiable`). Older CLIs ignore
   `incoming` and behave exactly as today (fail-closed, MODIFIED); this CLI heals. `schemaVersion` stays 1 (P7:
   new key optional, absent when empty; not a shim, so no removal version).
2. Rejected — interrupted-run marker. The marker would have to carry the hashes of the version being written
   (else the re-run must re-download the previous release to know them): option 1 in a second file, plus a new
   file to bound-read, lock-order and clean up.

## Design

- `install-records.ts`
  - `RecordStore` gains optional `incoming?: FileRecords`. `readRecords` checks it like `files` (plain object,
    key via `isInvalidRecordKey`, value via `SHA256_RE`), but a malformed `incoming` (wrong type, or ANY entry
    failing) is treated as ABSENT as a whole and never invalidates the store: it only ever widens what counts as
    PHARN's, so ignoring it fails closed (today's MODIFIED), while invalidating would make the whole install
    `unverifiable` over an optional hint. The next store write drops it (lead decision, GATE 1 Q2).
  - `writeRecords` takes optional `incoming`; written only when non-empty (sorted), so every other store's
    bytes are unchanged.
  - New pure `settleIncoming(records, incoming, diskHashOf)`: for each `incoming` key whose current disk hash
    equals its incoming hash, the returned baseline holds that hash. Pure; the key is only looked up, never
    path-joined — `diskHashOf` reads the planner's existing `diskStates` (manifest-keyed, already safeJoined +
    symlink-walked), so a key not in the manifest is simply never settled.
- `update-plan.ts` (~3 lines): `records` = `settleIncoming(baseline, loaded.store.incoming, rel → diskStates)`.
  Every consumer (decision rows, removals' backup set, `apply.records` for `unwritten`) then sees the settled
  baseline. `planStateChanges` compares against the LOADED store, so a store that still carries `incoming`
  counts as a change and is rewritten without it even when no file differs (the same-version re-run heals).
- `update.ts` `applyPlannedUpdate`: just before `applyWrites`, when `records !== null` and the plan writes at
  least one file, `await writeRecords({ stamp: config's, files: apply.records, incoming: pick(plan.nextRecords,
plan.writes) })`. The closing `nextRecordStore` write is unchanged and carries no `incoming`. With records
  unavailable no pre-store is minted (same reason as the ApplyError branch: minting would turn `unverifiable`
  into a false `unrecorded`). Order records→config is kept (the two existing tests stay as they are).
- Why this is safe ("Records are the proof"): an `incoming` hash is the hash of exactly the bytes pharn copies
  verbatim; it settles only a file whose bytes equal it. A file never written still matches `files`; a file the
  user edited matches neither and stays MODIFIED. The `models` block needs no entry: in the AC window the config
  is not written, so the block still matches its old record.

## Files

- `src/lib/install-records.ts` — `incoming` read/validate/write, `settleIncoming` — CLI lib
- `src/lib/update-plan.ts` — settle the baseline over `diskStates` (minimal diff; shared lane) — CLI lib
- `src/commands/update.ts` — the pre-write store in `applyPlannedUpdate`, why-comment — CLI command
- `tests/commands/update-interrupted.test.ts` — NEW file (keeps sibling PRs' update.test.ts conflict-free) — test
- `tests/install-records.test.ts` — `incoming` validation, write-absent-when-empty, `settleIncoming` — test
- `docs/reference/pharn-records.md` — `incoming` row in the field table + update row — docs (P4)
- `docs/reference/update-advanced.md` — "A records store from an interrupted run": the write-window case — docs (P4)
- `CHANGELOG.md` — `### Fixed` line under `[Unreleased]`

## Evals / tests to write (test first; each must fail before the fix)

- AC1 (command, new file): init 1.0.0 → upstream 2.0.0 changes CONSTITUTION (+ a second file); the `rename`
  hook throws on the `pharn.records.json` rename made once CONSTITUTION already holds 2.0.0 bytes (= "after the
  file writes, before records"; ordering-agnostic, so it is RED on 8cdf996). Assert interrupted state (files
  2.0.0, config 1.0.0). Upstream 3.0.0 changes the same files; plain `update --yes` → exit 0, no `modified`,
  no `pharn/.backup`, files at 3.0.0, records = dest hashes, store has no `incoming`, config 3.0.0.
- AC1b: same interruption, no new release: plain re-run heals (records rewritten, no `incoming`, no MODIFIED).
- Kept edit survives: same interruption, user edits CONSTITUTION afterwards → re-run against 3.0.0 skips it as
  `modified` (incoming never launders an edit); `--force` backs it up and writes (existing paths unchanged).
- A successful update leaves a store byte-identical in shape to today's (no `incoming` key).
- Command: a malformed `incoming` (non-hash value) behaves as no `incoming` (MODIFIED as today), the store is
  otherwise valid and is rewritten without it.
- Unit: malformed `incoming` (wrong type / bad key / bad hash) → store `ok` with no `incoming`; `writeRecords` omits empty `incoming`; `settleIncoming` settles
  only exact matches and never a key absent from the disk map.
- Existing suites (update, update-dry-run, status, uninstall, remove, add, lock) unchanged and green.

## Guarantee audit (P0)

- "A file whose bytes equal the hash pharn announced before copying is treated as pharn's" → floor: content-hash
  equality (lib/hash.ts), pinned by AC1 + unit tests.
- "A plain re-run always heals an interruption after the writes" → floor for the copy window (AC1/AC1b). NOT a
  guarantee across the residuals below.
- "Older CLIs in the window are unaffected" → floor: their reader ignores unknown top-level keys (v0.20.0 source
  read this run); advisory beyond that (no older-CLI test runs here).

## Residuals (named, stated in docs/CHANGELOG where user-visible)

- An `add`/`remove`/`init` run between the interrupted update and its re-run rewrites the store without
  `incoming`; the re-run then behaves as today (MODIFIED → `--force` with backup). Fail-closed.
- An older CLI (0.20.x/0.21.x) re-running ignores `incoming`: today's behaviour, fail-closed.
- Interrupted between the closing records write and the config write: files and records are already true;
  only a `models` block changed in that same release reads as edited (kept, `--force`). Not in this ticket.
- `uninstall` keeps (and lists) a file that matches only `incoming`: fail-safe.
- A user who sets a file to exactly the announced bytes is indistinguishable from pharn's write (the same stated
  edge case as the stamp-not-a-gate one).

## Trust audit (P2)

- `pharn.records.json` is user-editable: `incoming` is shape-validated at read; its keys are compared against
  the manifest-keyed disk map and never become paths; the hash only ever widens "may overwrite" for a file whose
  bytes already equal it, and every write still goes through `applyWrites`' safeJoin + symlink walk + `seen`.

## Determinism audit (P5)

- Every new branch is a hash equality or a presence test; the --json report bytes are untouched (no new key).

## Decisions (GATE 1, lead, 2026-11-23)

- Q1 approved: additive optional top-level `incoming` key, absent when empty, `schemaVersion` 1.
- Q2 corrected: a malformed `incoming` is ignored as a whole (store stays valid), dropped by the next write.
- Q3 approved: the records→config window stays a named residual; the existing records-before-config tests are untouched.
