# PLAN — crlf-tolerant-hashing: content identity ignores CRLF vs LF in text files

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: Every drift / records comparison (`status` drift, `update`'s per-file decision, `add`'s and `init`'s destination-drift scan, `remove`'s backup set, and the hashes written to `pharn.records.json`) hashes a file through ONE new primitive, `contentHash`, that folds `\r\n` → `\n` before hashing when the content is text (no NUL byte in its first 8000 bytes). A project committed and re-checked-out with `core.autocrlf=true` no longer reads every installed file as `modified`. Closes finding F-16 (Medium, cross-platform).
- layer(s): one lib leaf (`src/lib/hash.ts`) + the six lib call sites that hash for comparison + tests + user-facing docs. No `pharn-contracts` change. No command file changes. No trusted-doc edit by the agent (Open question 6).
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

## Discovery (read this run, P6)

- `src/lib/hash.ts:17-18` `sha256File(path)` = `createHash('sha256').update(readFileSync(path))` — a WHOLE-FILE read of the raw bytes (not streaming, not bounded; the header comment records that choice deliberately, matching `diff.ts`). Nothing about that changes here.
- Every comparison in `src/` reaches content identity through `sha256File` — six call sites, no other path:
  - `src/lib/apply-update.ts:87` `readDiskState` → `{kind:'file', hash}` — the PROJECT side for `update` (via `update-plan.ts`) and `status` (via `diff.ts`).
  - `src/lib/diff.ts:93` — the CLONE side of `status`'s drift (`state.hash === sha256File(repoPath)`).
  - `src/lib/update-plan.ts:173` — the CLONE side of `update` (`latestHashes`).
  - `src/lib/dest-drift.ts:180-181` `scanDest` — both sides, for `add`'s pre-copy backup and `init`'s re-install prompt/backup.
  - `src/lib/install-records.ts:365` `buildRecords` — the hash WRITTEN into `pharn.records.json` (`init`, `add`, `update`).
  - `src/lib/removal-backup.ts:100` — `remove`'s "provably pharn's" test.
- Raw hashes that must STAY raw (not comparisons of installed content): `src/lib/pharn-config.ts:505` `configFingerprint` (detects a concurrent write of `pharn.config.json`; any byte matters), `src/lib/install-records.ts:63` `modelsRecordHash` (hashes `JSON.stringify`, not a file), and `tests/model-config-parity.test.ts:193` (`sha256File(CHECKER)` pins the vendored checker byte-for-byte).
- `src/lib/update-decision.ts` is pure over hashes (`diskHash`/`latestHash`/`recordedHash`) — it needs no change; feeding it folded hashes is the whole fix.
- **Upstream content, measured this run** (codeload tarball of `pharn-oss@main`, `SKILLS_VERSION` 6.58.0, extracted into its own empty scratch dir, scanned by a script kept outside it, nothing executed): 2907 regular files, **0 contain `\r\n`, 0 contain a lone `\r`, 0 contain a NUL byte** (extensions: .md/.json/.mjs/.cjs/.sh/.patch/.sha256/.jsonl/.yml/.ts/.py/.txt/.svg/.jsonc + 4 extensionless). pharn-oss's own `.gitattributes` is `* text=auto eol=lf` and states "the tree is 100% text". So for every file pharn has written from the current tip, folded hash == raw hash.
- **Upstream precedent:** pharn-oss `pharn/floor/check-spec.mjs:168-186` `bodyHash` folds exactly `\r\n` → `\n` (`body.replace(/\r\n/g, "\n")`) and leaves a lone `\r` byte-exact, and states the cost (a pure CRLF-for-LF rewrite is not a change). This plan adopts the same fold rule so the two repos mean the same thing by "the same content".
- Trusted docs: `ARCHITECTURE.md §2 #2` "Content-hash — identity of _content_" (a line-ending-folded hash is still a deterministic content hash — a floor primitive, P0). `THREAT-MODEL.md §4c` says "A file already **byte-identical** to upstream is never skipped" and `LIMITS.md` names no line-ending residual; both are human-only (CONSTITUTION + `.claude/hooks/protect-trusted-paths.cjs`) → Open question 6.
- Docs that describe the hash (grep `sha256` / `byte-identical`): `docs/reference/pharn-records.md:4,16,38,88`, `docs/troubleshooting.md:84,111`, `docs/commands/update.md:326-332` (row 2 "identical to upstream"), `docs/commands/add.md:159`, `docs/commands/init.md:169`, `docs/reference/pharn-config.md:72`, `docs/getting-started.md:88`, `docs/roadmap.md:18`, `docs/contributing.md:79,187` ("`lib/hash.ts` is the one module with no matching test file"), `CLAUDE.md` (`update`/`status`/`remove`/`add` paragraphs: "sha256-compares", "a sha256 of every file"), `CHANGELOG.md` `[Unreleased]` (has a `### Fixed` list).
- CI: ubuntu/node 24 only; `docs/contributing.md:57` already names Windows as implied-but-untested. This fix is verified on POSIX with CRLF bytes written by the tests; it is NOT run on Windows or under a real `core.autocrlf` checkout (see Guarantee audit).

## Design — option (a), line-ending-insensitive content identity

Option (b) (installing a `.gitattributes`) is NOT taken: `pharn/.gitattributes` covers only the `pharn/` layout's subtree (not `.claude/`, not root docs in the flat layout); a root `.gitattributes` is user-owned; neither renormalizes files already checked out; and it would be a new installed surface needing records/status/update coverage (P7: no speculative surface). Option (a) fixes the comparison itself, for every surface and every existing checkout.

1. **`src/lib/hash.ts`** (one axis kept: how a file's content identity is computed):
   - `BINARY_SNIFF_BYTES = 8000` (exported const).
   - `isBinaryContent(buf)` ⇔ `buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)`. Precise rule: a file is BINARY iff one of its first 8000 bytes is `0x00`; everything else is TEXT. 8000 is git's own `FIRST_FEW_BYTES` sniff; git never line-converts a buffer containing a NUL, so every file this rule calls binary is one `core.autocrlf` leaves byte-exact — the rule can err only toward "text", which merely makes a CRLF↔LF-only change in such a file invisible. The cap bounds the sniff, not the hash (the whole file is already in memory).
   - `contentHashBytes(buf)`: binary, or no `0x0D` byte anywhere → `sha256(buf)` unchanged (fast path; LF-only text hashes IDENTICALLY to the raw `sha256File`). Otherwise feed the hash the buffer in segments, dropping each `\r` that is immediately followed by `\n` (zero-copy `subarray` updates, single left-to-right pass, equivalent to `latin1(buf).replace(/\r\n/g, '\n')` — pinned by a differential test). A lone `\r` is byte-exact; `\r\r\n` → `\r\n`.
   - `contentHash(path)` = `contentHashBytes(readFileSync(path))`. Same whole-file read and same throw-on-unreadable as `sha256File`, so every caller's error handling (readDiskState's `unreadable`, dest-drift's propagate, removal-backup's fail-closed) is unchanged.
   - `sha256File` stays, RAW, documented as "byte identity — not for comparing installed content" (its remaining user is the vendored-checker pin in a test). Open question 1.
2. **Switch the six comparison sites** (`apply-update.ts:87`, `diff.ts:93`, `update-plan.ts:173`, `dest-drift.ts:180-181`, `install-records.ts:365`, `removal-backup.ts:100`) from `sha256File` to `contentHash`, and update their comments that say "byte-identical"/"sha256 of the bytes" where they now mean "identical content". Both sides of every comparison use the same function, so no comparison can mix a folded and a raw hash — except old stores, below.
3. **Records — no scheme marker, schema unchanged (`schemaVersion: 1`).** Old stores hold raw hashes. For a file with no `\r\n` (every file pharn-oss ships today, measured) and for every binary file, folded == raw, so every existing record stays valid and an OLDER CLI reading a store this version wrote agrees for every file pharn wrote (downgrade-safe). The only divergence is a hypothetical upstream text file shipped WITH `\r\n` and recorded raw by an older CLI: then (i) if upstream still ships it unchanged → row 2 `identical` (folded disk == folded latest) → no-op, record refreshed to the folded hash; (ii) if upstream changed it → disk (folded) ≠ record (raw) → `modified` SKIP — the fail-safe direction (never an overwrite; `--force` backs it up), one run, after which the record is folded. A marker would add a schema field to protect a case upstream does not have (P7). Open question 4.
4. **What does NOT change:** `update-decision.ts` (pure table), `configFingerprint` (stays raw), `modelsRecordHash`, every command file, `.claude/settings.json` handling, the backup machinery. Writes still copy upstream bytes verbatim (pharn never rewrites line endings; a no-op file stays CRLF on disk).
5. **Stated cost (docs):** a change that ONLY swaps line endings in a text file is not a change to pharn — `status` reports it `ok`, `update` may upgrade it (writing upstream's LF bytes) without a backup, `add` may overwrite it without a backup, `remove` deletes it without a backup. Only line endings can be lost that way. Any other byte change is still detected exactly as before.

## Files

- `src/lib/hash.ts` — `BINARY_SNIFF_BYTES`, `isBinaryContent`, `contentHashBytes`, `contentHash`; `sha256File` kept raw and re-documented — layer: lib
- `src/lib/apply-update.ts` — `readDiskState` hashes with `contentHash` — layer: lib
- `src/lib/diff.ts` — clone side hashes with `contentHash`; comment update — layer: lib
- `src/lib/update-plan.ts` — `latestHashes` via `contentHash` — layer: lib
- `src/lib/dest-drift.ts` — both sides via `contentHash`; comment ("Byte-identical is row 2") update — layer: lib
- `src/lib/install-records.ts` — `buildRecords` writes `contentHash`; header comment — layer: lib
- `src/lib/removal-backup.ts` — `contentHash`; comment — layer: lib
- `tests/hash.test.ts` — NEW: unit + differential tests for the primitive — layer: tests
- `tests/diff.test.ts`, `tests/update-plan.test.ts` (or `tests/update.test.ts`), `tests/dest-drift.test.ts`, `tests/removal-backup.test.ts`, `tests/install-records.test.ts`, `tests/remove.test.ts` — CRLF integration cases (see Evals); record-building helpers in existing tests switched from `sha256File` to `contentHash` where they stand for "what pharn records" (values identical for LF fixtures) — layer: tests
- `docs/troubleshooting.md` — NEW section "Line endings (Windows, `core.autocrlf`)": what is ignored, the text rule, binary files, the stated cost, CI does not run on Windows; the two "byte-identical" sentences (:84, :111) → "identical (line endings aside)" — layer: docs
- `docs/reference/pharn-records.md` — the `files` row and prose: the hash folds CRLF→LF for text files; old stores stay valid — layer: docs
- `docs/commands/update.md` — row 2 / :332 note that "identical" ignores CRLF vs LF in text files (link to troubleshooting) — layer: docs
- `docs/commands/status.md` — the drift description: a CRLF-only difference is not drift — layer: docs
- `docs/commands/add.md` (:159), `docs/commands/remove.md` (backup set), `docs/commands/init.md` (:169) — "byte-identical" → identical-content wording — layer: docs
- `docs/contributing.md` — :187 sentence removed (hash.ts now has a test file) + a table row for `hash.test.ts`; note the fix is verified with CRLF fixtures on ubuntu, not on Windows — layer: docs
- `CLAUDE.md` — where hashing is described (`update`/`status`/`add`/`remove` paragraphs + `lib/hash.ts` mention): `contentHash` is the one comparison hash; Windows still untested in CI — layer: docs
- `CHANGELOG.md` — `### Fixed` entry under `## [Unreleased]`. No version bump — layer: docs

## Contracts satisfied

- No `pharn-contracts` file governs local hashing. `pharn.records.json`'s contract (`docs/reference/pharn-records.md`, `lib/install-records.ts` `recordsBaseline` + `HASH_RE`) is unchanged in shape: still lowercase sha256 hex, still `schemaVersion: 1` (P4/P7). The fold rule cites pharn-oss `check-spec.mjs` `bodyHash` rather than inventing a new one.

## Evals to write (P1)

Unit (`tests/hash.test.ts`):

- LF-only text → `contentHash` === raw `sha256File` (old records stay valid)
- CRLF copy of an LF file → same `contentHash`; raw hashes differ
- mixed endings (some lines CRLF, some LF) → same as the LF file
- lone `\r` is byte-exact: `a\rb` ≠ `a\nb` ≠ `ab`; `\r\r\n` hashes as `\r\n`
- trailing `\r` at end of buffer kept; `\r\n` split across nothing (single buffer) — empty file → sha256 of empty
- real content change (CRLF + one changed word) → different hash
- binary: NUL within the first 8000 bytes → raw hash (CRLF and LF variants DIFFER); NUL at byte index 8000 → treated as text (folded) — pins the cap
- differential: for a generated corpus of byte strings over `{a, \r, \n, \0}`, `contentHashBytes(b)` === sha256(`b.toString('latin1').replace(/\r\n/g, '\n')` as latin1) whenever the first 8000 bytes contain no NUL, else === sha256(b)
- unreadable path → throws (same as `sha256File`)

Integration:

- `diff.test.ts`: every expected file rewritten with CRLF in the project → `modified: []`, `missing: []`, full `okCount`; one CRLF file with a real edit → `modified: [that rel]`; a binary (NUL) expected file with CRLF↔LF swapped → `modified`
- `update-plan.test.ts`/`update.test.ts`: records written for LF files, project files then CRLF-ized → upstream unchanged ⇒ `noop` (no skip, `skillsVersion` bumped, nothing withheld); upstream moved on ⇒ `write` (upgrade), not `modified` skip; CRLF + real edit ⇒ `modified` skip as before
- `dest-drift.test.ts`: CRLF copy of the clone's file → not drift (no backup); edited → drift
- `removal-backup.test.ts` (+ one `remove.test.ts` case): CRLF copy of a recorded file → NOT in the backup set / no `.pharn-backup`; edited CRLF file → backed up
- `install-records.test.ts`: `buildRecords` over a CRLF dest records the same hash as the LF file
- existing suite green (`CI=1 npx vitest run --maxWorkers=2`), `npm run check`, `npm run build`, `npm run test:coverage` thresholds hold

## Guarantee audit (P0)

- "Two text files that differ only in CRLF vs LF have the same content identity" → floor: content-hash (a deterministic function of the bytes; the text rule is a byte-membership test on a fixed prefix) — demonstrated by `tests/hash.test.ts` incl. the differential test.
- "Any other byte change is still detected" → floor: sha256 over the folded bytes; the fold is injective except on the CRLF→LF swap (and its `\r\r\n` consequence), pinned by tests.
- "Binary files are compared byte-for-byte" → floor for files with a NUL in the first 8000 bytes; a NUL-free binary is folded like text — stated in docs, harmless (both sides folded identically).
- "Windows / `core.autocrlf` checkouts no longer read as modified" → ADVISORY as an end-to-end platform claim: verified with CRLF bytes on ubuntu, NOT run on Windows nor under a real git autocrlf round-trip in CI (`docs/contributing.md` already says Windows is untested). Docs/CHANGELOG say "medium confidence — not run on Windows" in user terms ("not tested on Windows in CI").
- "Old `pharn.records.json` stores stay valid" → floor for LF/binary content (folded == raw, tested); the CRLF-upstream case is bounded fail-safe (skip, never overwrite) and is stated; upstream being LF-only is a MEASURED fact this run, not a guarantee (advisory) — the fallback is the fail-safe skip, not a guess.

## Trust audit (P2)

- Inputs hashed: project files (local) and clone files (untrusted fetched bytes). Bytes are read and hashed only — never parsed, executed or path-joined. The fold changes no path handling, no containment (`safeJoin`/`findSymlinkComponent` callers unchanged), no network guard. Taint does not propagate: the output is a hex digest compared for equality.

## Determinism audit (P5)

- Branches: `includes(0)` on a fixed-length prefix, `indexOf(0x0D) === -1` fast path, byte equality `\r` followed by `\n`. No classification by extension or guess.

## Out of scope (P7)

- Installing any `.gitattributes`; rewriting line endings on write; normalizing a UTF-8 BOM or trailing whitespace; `configFingerprint`; a records schema bump; Windows CI; any trusted-doc edit by the agent.

## Open questions (HALT)

1. **Naming.** Recommended: add `contentHash` (folded) for every comparison and KEEP `sha256File` raw (it still has an honest raw user — the vendored checker's byte pin — and a function named sha256File should mean raw bytes). Alternative: change `sha256File`'s semantics in place (smaller diff, misleading name).
2. **Text rule.** Recommended: binary iff a NUL in the first 8000 bytes (git's sniff size; our binary set ⊆ git's never-converted set). Alternatives: NUL anywhere in the file (whole buffer already in memory — no cap); or fold every file unconditionally (no rule; binary-unsafe in principle).
3. **Fold rule.** Recommended: `\r\n` → `\n` only, lone `\r` byte-exact (= pharn-oss `bodyHash`). Alternative: also fold lone `\r` → `\n` (old-Mac endings; no git setting produces them).
4. **Records scheme marker.** Recommended: none — folded == raw for every file upstream ships (measured: 0 CRLF / 0 NUL in 2907 files at 6.58.0) and the only divergent case fails safe. Alternative: additive `hashScheme: "crlf-folded"` in `pharn.records.json` (needs handling of absent = raw).
5. **Option (b) `.gitattributes`.** Recommended: not installed (partial coverage, user-owned root file, no effect on existing checkouts). Alternative: also install `pharn/.gitattributes` (`* text eol=lf`) in the `pharn/` layout only.
6. **Trusted docs.** `THREAT-MODEL.md §4c` ("A file already byte-identical to upstream is never skipped …") and `LIMITS.md` (no line-ending residual) are human-only. Recommended: the agent edits neither; at GATE 2 I hand over exact replacement/addition text (§4c: "identical (CRLF vs LF in text files aside)"; LIMITS: a short residual "line endings are not part of a text file's identity: a CRLF↔LF-only edit is invisible to status/update/add/remove and may be overwritten or deleted without a backup").

## Resolved decisions (GATE 1, 2026-10-13)

GATE 1 passed: every recommended answer accepted.

1. Naming → add `contentHash` (folded) for every comparison; `sha256File` stays raw.
2. Text rule → binary iff a NUL byte in the first 8000 bytes.
3. Fold rule → `\r\n` → `\n` only; a lone `\r` is byte-exact.
4. Records → no scheme marker; `schemaVersion: 1` unchanged.
5. No `.gitattributes` is installed.
6. `THREAT-MODEL.md` and `LIMITS.md` are not edited by the agent; exact replacement text is handed over at GATE 2. Docs must state the cost plainly: a line-ending-only edit is invisible to pharn.

Process: `.pharn/writes-scope.json` is restored before every commit and never committed. Edits to `update-plan.ts` are limited to the call-site swap (concurrent F-04 / F-12 work there).
