# PLAN — core-183-init-add-per-file-writer (Linear CORE-183, C5.4, epic CORE-154)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `init` and `add` stop copying with recursive `cpSync` and write every file of the install manifest (init) or of `capabilityCloneFiles` (add) through `update`'s per-file writer `applyWrites` → `copyFileAtomicSync`; `.claude/settings.json` is written only when absent via `copyFileSync(…, COPYFILE_EXCL)`; `applyWrites` gains the per-file "changed since plan" compare C5.2 needs; a mid-way write failure names the files written and writes no records or config.
- base: origin/main @ 790d9c3. Branch `przemek/core-183-c54-init-and-add-write-file-by-file-through`.
- layer(s): CLI install path (`src/lib`, `src/steps`, `src/commands/add.ts`), `eslint.config.mjs`, tests, docs, `CLAUDE.md` (one invariant line). Not touched: exit/error plumbing (C5.1), `index.ts` (C5.5), fetch/status (C5.6).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Why (discovery, live state this run)

- `cpSync` sites in `src/` today (re-located; the ticket's line numbers are older): `src/lib/install-capabilities.ts` 119 (capability dirs, `filter: unlinkFirst`), 214 (settings), 222 (docs), 233 (LICENSE), 247 (features README), 255 (contracts), 268 (core), 278 (floor, filter), 450 (`copyFilteredDir` for commands/hooks/agents). No other `src/` file calls it (`dest-drift.ts`, `install-manifest.ts`, `add.ts` mention it in comments only).
- `applyWrites({projectRoot, expected, writes})` (`src/lib/apply-update.ts:79`) already walks each destination for symlinks (`findSymlinkComponent`), `mkdirSync`s the parent and calls `copyFileAtomicSync` (exclusive temp + rename, mode from the source). On failure it throws `ApplyError` carrying `written`. Its only caller is `commands/update.ts:752`.
- `collectExpectedInstallPaths` already maps every file init writes, dest → absolute source, EXCEPT `.claude/settings.json` — capability dirs, commands, hooks, agents, docs, the mapped LICENSE, the features README, contracts, core, floor (minus tests/fixtures). The command/hook/agent `COPY_FILENAME_RE` floor is already applied by the manifest. So the manifest IS the copy plan; "mirror" tests (`install-manifest.test.ts`) become "written set == manifest" tests.
- `capabilityCloneFiles` returns project-relative paths that are also clone-relative (the layout is mirrored), so `add`'s write map is `rel → safeJoin(repoDir, rel)`.
- No eslint rule or lint-rules case mentions `cpSync` today; CLAUDE.md's Hard-link-safe invariant says "every recursive `cpSync` passes a filter".
- No test calls Node's `cpSync` directly. The "Node filter behaviour" pin is the COMMENT on `install-capabilities.test.ts` "never writes through a HARD-LINKED destination"; the test itself asserts our behaviour (outside bytes survive), so it is kept and re-pointed at the new path — nothing is deleted for this item.

## Design

1. `applyWrites` (apply-update.ts) gets an optional `seen?: ReadonlyMap<string, string | null>` — the destination's content hash observed at plan time (`null` = absent). Immediately before each write, a file with a `seen` entry is re-read through `readDiskState`; if its state differs (hash differs, appeared, vanished, or now unreadable) it is NOT written and lands in `changed`. Returns `{ written, changed }` (update.ts's one call site takes `.written` — a one-token change; update passes no `seen` yet, so its behaviour is unchanged; C5.2 wires skip-for-update).
2. `scanDest` (dest-drift.ts) also returns `seen`: for every rel it inspected, the dest hash it computed (or `null` when the dest was absent). init and add hand that map to the writer.
3. `install-capabilities.ts` shrinks to:
   - `prepareInstall` (kept; symlink + type pre-flight). The features-README exception in `assertDestinationTypes` is removed (decision below).
   - `installCapabilities(repoDir, projectRoot, selection, manifest?, seen?)`: pre-flight → capability source check (unchanged names/existence refusal) → `writeInstallFiles(manifest keys)` → settings (`existsSync` → preserved; else `copyFileSync(from, to, constants.COPYFILE_EXCL)`, an `EEXIST` race counts as preserved; parent walked with `findSymlinkComponent` first) → `docs` = the trusted docs that are manifest keys (they are what landed).
   - `installCapabilityDirs(repoDir, projectRoot, caps, paths?, seen?)` (add): same source pre-flight, then `writeInstallFiles` over each capability's `capabilityCloneFiles`.
   - `writeInstallFiles({projectRoot, expected, writes, seen})`: one `applyWrites`; any `changed` file (edited since the scan) is backed up with ONE `createBackup` + `printBackupNotice` and then written by a second `applyWrites` with no `seen`. An `ApplyError` from the second pass carries both passes' `written`.
   - DELETED: every `cpSync`, `copyFilteredDir`, `destAcceptsWrite`, `unlinkFirst`, `inFloorFixtures`, `isTestFile`, and the per-surface copy blocks for docs / LICENSE / features README / contracts / core / floor / commands / hooks / agents (all manifest entries). `noSymlinks`/`isSymlink` no longer exist on this path (verified by grep this run).
4. Mid-way failure: `runInstallArchetype` (init) and `resolveArchetypeAdd` (add) catch an `ApplyError` around the copy, print one `log.warn` naming the files written before the failure (`writtenBeforeFailureLines(written)`, apply-update.ts: count + the first 10 paths + "and N more", values through `terminalSafe`), and re-throw. Nothing after the copy runs, so no records and no config are written (init's `writeRecords`/`writePharnConfig` and add's `mergeCapabilityRecords`/`writePharnConfig` all sit after it — unchanged order). Error/exit plumbing is untouched (C5.1 owns it).
5. Hard links: every write is `copyFileAtomicSync` (replace by name), settings is `COPYFILE_EXCL` (never opens an existing name). Symlinks: the pre-flight refuses before the first write (unchanged); `applyWrites`' per-file walk is the write-time backstop (now covering init/add too).
6. Floor for "no `cpSync` in `src/`": a new `no-restricted-imports` entry (`node:fs`/`fs`, `importNames: ['cpSync']`) in `eslint.config.mjs` `INVARIANTS`, message naming the reason; one new case in `tests/lint-rules.test.ts`.

## Decision: the features-README ENOTDIR case → REFUSE in the pre-flight

A clone that ships the features README while the project has a regular FILE where its directory belongs (`features` in the flat layout or the pharn-layout root fallback) is now refused by `assertDestinationTypes` with the existing "is in the way" message, before anything is written — exactly like every other manifest entry. Reasons: (a) `applyWrites` would otherwise throw part-way; (b) dropping it at plan time leaves a manifest entry that every later `update` reports as `unreadable` and `status --strict` fails on forever, so the skip only hides a permanent drift; (c) it deletes code (the `continue` exception and `destAcceptsWrite`). A clone that does NOT ship the README contributes no manifest entry, so a project with a `features` file still installs (existing test kept). User-visible (edge case) → CHANGELOG **Changed** line; `docs/troubleshooting.md` "Something in your project is in the way" drops its "features/README.md is the one exception" sentence.

## Files

- `src/lib/apply-update.ts` — `seen` compare, `{written, changed}` result, `writtenBeforeFailureLines` — layer lib
- `src/lib/install-capabilities.ts` — the rewrite above (net ≈ −150 lines) — layer lib
- `src/lib/dest-drift.ts` — `seen` in `DestScan`; header comments no longer cite `cpSync` — layer lib
- `src/lib/install-manifest.ts` — header/comments: the manifest is what the install writes (no longer "mirrors" a `cpSync` copy); un-export helpers only the deleted code imported, if any — layer lib
- `src/steps/install-archetype.ts` — pass `scan.seen`; catch `ApplyError` → written-files warning, re-throw — layer step
- `src/commands/add.ts` — pass `scan.seen`; same warning around `installCapabilityDirs`; comment on the symlink refusal re-worded (no `cpSync`) — layer command
- `src/commands/update.ts` — `applyWrites(...).written` (one token) — layer command
- `eslint.config.mjs` — the `cpSync` ban entry + MSG — layer dev tooling
- `tests/apply-update.test.ts` — NEW cases: `seen` match → written; dest edited since plan → not written, in `changed`; appeared since plan (seen `null`) → changed; vanished → changed; result shape; `writtenBeforeFailureLines` cap — layer test
- `tests/dest-drift.test.ts` — NEW case: `seen` holds the dest hash per inspected rel and `null` for an absent dest — layer test
- `tests/install-capabilities.test.ts` — F-19 hard-link test KEPT, comment re-pointed (plus `.claude/agents/` and a core file added to its dests); symlink pre-flight tests KEPT; REWRITTEN: "skips the copy (does not throw) when the project has a FILE named features" → "refuses, writing nothing, when the project has a FILE named features" (renamed `it`); ANCHOR-case comments re-worded (tests kept); NEW: a stale `seen` entry → file backed up under `pharn/.backup/` then overwritten; a mid-way failure (read-only floor dir, skipped as root/win32) → `ApplyError` with the earlier files in `written`; returned/landed set == manifest keys ∪ settings; settings hard-linked/existing → never written (EXCL) — layer test
- `tests/install-manifest.test.ts` — the two MIRROR tests KEPT (they are the "written set == manifest" AC); comments re-worded — layer test
- `tests/commands/init.test.ts` — NEW: mid-way write failure (read-only dir in the project) → exit 1, stderr names files written, no `pharn.config.json`, no `pharn.records.json`; after `chmod` back, a re-run completes and records every manifest file — layer test
- `tests/commands/add.test.ts` — NEW: mid-way write failure → exit 1, files named, config + records byte-identical to before — layer test
- `tests/lint-rules.test.ts` — NEW case: `import { cpSync } from 'node:fs'` in a `src/` file fires the new rule — layer test
- `CLAUDE.md` — Hard-link-safe writes invariant: "every install write is `copyFileAtomicSync` through `applyWrites`; settings uses `COPYFILE_EXCL`" replaces the `cpSync`-filter clause; Destination symlink walks line drops `cpSync/`; lint-invariants list gains "no `cpSync`" — layer docs
- `docs/architecture.md` — "The copy" + `add` sections: per-file writer, settings EXCL, features README refusal; no `cpSync` — layer docs
- `docs/commands/add.md` — the symlink-refusal rationale and "Known limit" paragraph (the per-file walk now runs at write time too) — layer docs
- `docs/commands/init.md` — one sentence: each file is written by replacement (hard links keep their other name's bytes); mid-way failure leaves no config/records and names the files — layer docs
- `docs/troubleshooting.md` — drop the features-README exception sentence — layer docs
- `CHANGELOG.md` — `## [Unreleased]`: **Changed** (features-README refusal; mid-way failure names written files) + an internal line (init/add write through the update writer) — layer docs

No test file, `describe` or `it` is DELETED. One `it` is renamed/rewritten (features FILE case: skip → refuse).

## Contracts satisfied

- CLAUDE.md invariants: Containment (`safeJoin` in `applyWrites`), Destination symlink walks (pre-flight + per-file walk), Hard-link-safe writes (atomic replace; EXCL), Records are the proof (records still `buildRecords` at the DEST after the copy), Back up before overwrite (scan backup unchanged; plus the changed-since-plan backup), The clone is data (contents copied, never executed).

## Evals to write (P1)

- `applyWrites` seen compare → the five cases above, each asserting disk bytes.
- init written set → equals manifest keys ∪ `.claude/settings.json` (mirror tests, real copy).
- add written set → equals `capabilityCloneFiles` (mirror test, real copy).
- hard link → outside victim bytes survive for a dest in every surface (F-19 test, now against `applyWrites`).
- symlink → whole install refused, nothing written (existing PHARN-02 tests) + `applyWrites` per-file refusal (existing apply-update tests).
- features FILE in the way → refused, nothing written.
- mid-way failure → files named; no config, no records (init and add command suites); re-run completes.
- no `cpSync` in `src/` → lint rule fires (lint-rules test).

## Guarantee audit (P0)

- "no `cpSync` in `src/`" → floor: eslint `no-restricted-imports` (+ lint-rules test proving it fires).
- "init/add write exactly the manifest" → floor: the install iterates the manifest map itself (one source); pinned by the mirror tests.
- "a hard-linked destination is never written through" → floor: `copyFileAtomicSync` exclusive temp + `rename` (and EXCL for settings); tests.
- "a symlinked destination is never written through" → floor: `findSymlinkComponent` per file inside `applyWrites` (+ pre-flight); tests. Residual (named, unchanged in kind): a check, not a lock — a link created between the walk and the `rename` of the same file is not seen.
- "a file changed since plan is backed up before overwrite" → floor: `contentHash` equality per file; residual: the same check-then-write window per file.
- "a mid-way failure writes no records or config" → floor: control flow (records/config writes sit after the throwing call); tests.

## Trust audit (P2)

- Clone paths/contents: unchanged ingestion — names already allowlisted by the manifest (commands/hooks/agents) or `safeJoin`-contained (everything); contents copied byte-for-byte, never parsed. Untrusted paths printed in the failure warning go through `terminalSafe`.

## Determinism audit (P5)

- Every branch is a membership/equality test: hash `===`, `seen.has(rel)`, `err instanceof ApplyError`, `err.code === 'EEXIST'`, `existsSync`.

## Net src lines

- Expected: `install-capabilities.ts` ≈ −150; `apply-update.ts` ≈ +35; `dest-drift.ts` ≈ +8; `install-archetype.ts` ≈ +10; `add.ts` ≈ +8; `update.ts` 0. Net ≈ −90. Measured with `git diff --stat origin/main -- src` before the PR.

## Resolved at GATE 1 (orchestrator, 2026-11-16)

1. Features-README ENOTDIR: REFUSE in the pre-flight — names the blocking path, says to move or rename it, writes nothing, exit 1. CHANGELOG **Changed**.
2. Mid-way failure listing: the count, the first 10 paths, then "and N more".
3. Changed-since-plan, init AND add: back up, then write — ONE `createBackup` announced through `printBackupNotice`.
4. The eslint `cpSync` ban + its lint-rules case: yes.

- The renamed/rewritten features `it` is accepted; the PR body lists it under "Test-integrity: expected findings".

## Grill fixes folded in (GRILL.md)

- `changed` holds only a file whose CURRENT state is a regular file with a different hash, or one that appeared where `seen` said absent. A file that vanished since the plan is simply written (nothing to back up); one that is now unreadable (a symlink, a non-file) is not `changed` — the write's own symlink walk / copy refuses it with an `ApplyError`.
- `scanDest`'s `seen` covers each rel whose dest it classified: its hash when a regular file was hashed, `null` when absent; a rel skipped (unsafe, ENOTDIR, non-file dest, non-file source) has no entry and is not compared. Tested.
- init's failure warning prints after the spinner's `s.stop(...)`; the command test asserts it through the clack stub's captured output.
- The PR body states the compare matters once C5.2 moves the prompt between plan and write.
