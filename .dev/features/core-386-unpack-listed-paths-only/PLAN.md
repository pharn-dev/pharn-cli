# PLAN — core-386-unpack-listed-paths-only (Linear CORE-386, epic CORE-380)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the extractor writes ONLY the paths `pharn-install.json` lists plus the four files the CLI reads
  itself; every other archive entry is skipped unwritten, whatever its type or name. Listed paths keep today's rules,
  and `verifyUpstreamManifest`'s hash check still fails a listed file that is missing or altered.
- base: origin/main @ 51a96d29. Branch `feat/core-386-unpack-listed-paths-only`, built in the worktree
  `/Users/pgalarowicz/Projects/pharn-cli-core-386`.
- layer(s): CLI source (`src/lib/tar-extract.ts`, `src/lib/repo.ts`, `src/lib/upstream-manifest.ts`), tests, docs
  (`CLAUDE.md`, `docs/architecture.md`, `docs/contributing.md`, `SECURITY.md`, `CHANGELOG.md`), trusted doc
  `THREAT-MODEL.md` (hook-protected → patch script for the human).
- constitution_refs: [P0, P1, P2, P4, P5, P7]

## Why (live state, measured 2026-11-25)

pharn-oss v7.25.5's codeload archive: 4,939 entries (4,149 files, 783 dirs, 7 symlinks under `.claude/skills/`),
43.0 MB decompressed, 11.5 MB compressed. Its manifest lists 616 files. Today's extractor applies its strict rules to
EVERY entry, so the 7 unlisted symlinks refuse every install on every channel. The CLI reads, beyond the manifest's
list, exactly: `pharn-install.json`, `SKILLS_VERSION` and `MIN_CLI` (both unlisted in v7.25.5), and
`.claude/settings.json` (listed `if-absent` in v7.25.5, but `hook-wiring` reads it whether or not it is listed).

## Design

Two passes over the in-memory `.tar.gz` (already capped at 32 MB by `fetchCapped`), each streamed through
`zlib.createGunzip()`, so the decompressed tar is never held whole (today `gunzipSync` holds it, which is why the
128 MB cap had to bound the whole repo).

1. **Pass 1** writes only `CLONE_READ_FILES` = `pharn-install.json`, `SKILLS_VERSION`, `MIN_CLI`,
   `.claude/settings.json` (each only if the archive has it).
2. The release check (`SKILLS_VERSION` = tag) runs, then `readUpstreamManifest(dir)` validates the manifest exactly
   as today (the one parser).
3. **Pass 2** writes only the manifest's `files[].path` not already written by pass 1.
4. `verifyUpstreamManifest(dir, manifest)` as today.

The extractor's walk, per header (every header, any type): checksum, `ustar` magic, octal `size`, the header cap, the
scanned-bytes cap, the end-of-archive marker and zero tail. These are framing: without them the walk cannot find the
next header, so they stay refusals for any entry. Nothing else is judged on an unselected entry.

Selection key: the raw `prefix`/`name` bytes (latin1, lossless), with everything up to the first `/` stripped. Every
selected path is ASCII (manifest paths pass `MANIFEST_PATH_RE`; the four constants are ASCII), so an exact
membership test on the raw bytes is exact. A header whose key is selected gets TODAY's rules: strict UTF-8 decode,
the control/format-character refusal, regular file only (`0`/NUL), absolute / `..` / `\` / `:` / empty-or-`.`
segment refused, one root (shared by both passes), strip-1, `safeJoin`. A selected path appearing twice is refused.

Pax `x` and GNU `L`/`K` (the headers that modify the NEXT entry's path/size): skipped, and the entry they modify is
skipped as unlisted. If that modified entry's ustar name is a selected path → refused ("pax data on a listed path";
pharn does not honour pax records). If an `x`/`L`/`K`/`g` header's OWN name is a selected path → refused (not a
regular file). If the pax record renamed a listed file away from its ustar name, that file is missing and the hash
check fails.

Caps (`repo.ts`): download 32 MB (unchanged), headers scanned 200,000 (any type, both passes), decompressed bytes
scanned 1 GiB (bounds a compression bomb's CPU now that memory is no longer the bound), bytes WRITTEN 128 MB
(checked at each selected header, before its payload is collected). Files written are bounded by the selection
(manifest ≤ 20,000 files + 4).

API shaped for CORE-387 (`pharn verify-archive <file.tar.gz>`): `extractTarGz(archive: Buffer, destDir,
{ select, limits, root? })` takes a buffer, never a URL; `repo.ts` exports `extractPharnArchive(archive, dir,
checkTree?)` (passes 1-2, manifest validation, hash check), which `fetchAt` calls after the download and a local-file
mode can call with no network. `TarExtractError` keeps its name and export; every refusal still names the entry path
and the rule.

## Files

- `src/lib/tar-extract.ts` — rewritten walker — layer CLI lib (fetch boundary):
  - an incremental `TarWalker` (push chunks / finish) shared by `extractTar(tar: Buffer | readonly Buffer[], …)`
    (sync, for tests and chunk-boundary tests) and `async extractTarGz(archive, …)` (streams `createGunzip`);
  - `ExtractOptions { select: ReadonlySet<string>; limits: TarLimits; root?: string }`,
    `TarLimits { maxHeaders; maxScannedBytes; maxWrittenBytes }`, result `{ written: Set<string>; bytes: number;
root: string | null }`;
  - the selection, modifier (`x`/`L`/`K`) and duplicate rules above; `resolveEntryPath`, `readPathField`,
    `assertDisplayablePath`, `readOctal`, `checksumOk`, `describeBytes`, `describeTypeflag` kept;
  - module header rewritten: what is judged on every header (framing) vs only on a selected one, and why skipping is
    strictly safer (nothing unselected touches disk).
- `src/lib/repo.ts` — `CLONE_READ_FILES`; `extractPharnArchive` (exported); `fetchAt` calls it; limits
  `MAX_HEADERS`, `MAX_SCANNED_BYTES`, `MAX_WRITTEN_BYTES` replace `MAX_ENTRIES`/`MAX_EXTRACTED_BYTES`; the clone
  invariant comment on `FetchedRepo` restated (files + dirs only, and only the listed + CLI-read files).
- `src/lib/upstream-manifest.ts` — `checkLayout`'s tree probe (`isPharnLayout(repoDir)`) also accepts the manifest's
  own `files` listing a path under `pharn/pharn-contracts/` (amended at build: tree OR listing, so on-disk fixtures
  that hold the marker dir keep passing), run after `checkFiles`, so the manifest can be fully
  validated between the passes, before the tree holds anything it lists. Equivalent after extraction: the tree now
  holds the marker iff a listed file is under it (and the hash check proves every listed file is there).
  `MAX_MANIFEST_FILES` comment updated. Header comment: the tree holds only the listed files plus the CLI-read ones.
- `tests/tar-extract.test.ts` — rewritten to the new API. Kept (on a selected path): every framing refusal, every
  path rule, UTF-8/format-character refusals, prefix reassembly, the base-256 cases, non-ASCII names. Inverted:
  "rejects %s entry outright, rather than skipping it" becomes two blocks — OUTSIDE the selection (symlink, hard
  link, char/block device, fifo, pax `x`, GNU `L`/`K`, unknown type, long pax-renamed name, `:` / `\` name, invalid
  UTF-8, control characters, absolute, `..`, second root, no root) → extraction succeeds and writes nothing for that
  entry; AT a selected path → refused. The comment records why the decision was narrowed (degit's silent skip lost
  LISTED files; the manifest hash check now catches a missing or altered listed file). NEW: pax `x` before a selected
  path → refused; pax `x` before an unselected path → both skipped; duplicate selected path → refused; header cap,
  scanned-bytes cap, written-bytes cap; chunk boundaries (odd-sized chunks give identical output); the
  only-files-and-dirs property over the result.
- `tests/repo.test.ts` — NEW: a tree whose archive carries an unlisted symlink, hard link, pax `x` + long-named
  entry, and `:` name installs and none of them is written; the same entry AT a listed path refuses (symlink at a
  listed path, pax `x` before a listed path) or fails the hash check (a pax-renamed listed file → "does not ship as a
  file"); an unlisted file is not in the returned tree; `extractPharnArchive` over a local buffer (no fetch).
- `tests/upstream-manifest.test.ts` — the marker case (manifest lists nothing under `pharn/pharn-contracts`), if a
  unit case exists; else covered by `tests/commands/init.test.ts`.
- `tests/project-lock.test.ts` — (added at build) the signal children's `signalHandled` helper holds the event loop
  open with a ref'd timer until the handlers ran. The SIGINT-after-fetch child exited 13 (unsettled top-level await)
  once `fetchRepo` became streamed: Node's signal handles are unref'd, and the base run had only passed because a
  tsx IPC `ConnectWrap` happened to still be pending. Test harness only; no assertion changes.
- `tests/commands/init.test.ts` — the marker test's expected message → "lists no file under pharn/pharn-contracts".
- `CLAUDE.md` — "The clone is data" bullet: the extractor writes only the manifest's listed paths plus the CLI-read
  files, as regular files and directories; every other entry is skipped unwritten.
- `docs/architecture.md` — step 3 (Source): the two passes and what the tree holds.
- `docs/contributing.md` — the fetch-boundary section and the "Security-sensitive files" bounds bullet (caps), the
  `tar-extract.test.ts` row; the "symlinked sources" claim at line 147 is stale since CORE-173 and is fixed in passing.
- `SECURITY.md` — the "Archive parsing" paragraph (selected vs skipped, the new caps, pax rule) and line 61.
- `CHANGELOG.md` — `## [Unreleased]` `### Fixed` bullet (installs and updates no longer fail on a symlink, hard link,
  pax header, long or `:` name, or repo size outside the listed paths) and `### Security` note (nothing unlisted is
  written). No version bump.
- `THREAT-MODEL.md` — PROTECTED: `$SP/patches/CORE-386.py` for the human (§1 item 1 and 3, §2 "Extraction rejects
  rather than skips" → "selects, then rejects", the caps sentence, the clone invariant, §3 table rows "oversized /
  slow repo tarball" and "malformed / hostile archive entry", §4b caps line). NEEDS USER PATCH.

Not touched: `src/commands/init.ts`, `src/commands/update.ts`, `src/lib/report-error.ts` (CORE-388's files);
`LIMITS.md` (its one extractor mention, "extracting it itself", stays true); `ARCHITECTURE.md`.

## Contracts satisfied

- `CLAUDE.md` invariants "The clone is data", "Containment", "Allowlists for untrusted names", "Network bounds",
  "One unsafe-character set" — each kept on every written path; the new skip never writes.
- `CLAUDE.md` § Testing: update the test first (the new tar/repo cases are written before the code and run RED).

## Evals to write (P1) — tests first; NEW ones must FAIL before the code change

- unlisted symlink / hard link / pax `x` + entry / `:` name / long name → install OK, nothing written for it (FAILS
  today: refused).
- symlink AT a listed path → refused; pax `x` before a listed path → refused; pax-renamed listed file → hash check
  "does not ship as a file" (passes or fails today depending on the case; pinned).
- archive whose unlisted bytes exceed `maxWrittenBytes` → installs (FAILS today: decompressed cap).
- header cap / scanned-bytes cap / written-bytes cap refusals (new limits).
- duplicate selected path → refused (FAILS today: last wins).
- odd chunk boundaries → identical tree (new walker).
- e2e (manual, reported in the PR): built CLI `init` against real pharn-oss on the default `latest` channel
  (v7.25.5, contains the symlinks) and on `--ref main`, plus `update`.

## Guarantee audit (P0)

- "No unselected entry is written" → floor: the only writes are `mkdirSync`/`writeFileSync` behind a `select.has(key)`
  membership test; pinned by tests asserting the tree's exact contents.
- "A selected path is held to today's rules" → floor: the same functions as today on that branch; pinned by the
  at-a-listed-path refusal tests.
- "A listed file that is missing or altered fails loudly" → floor: `verifyUpstreamManifest` (raw sha256), unchanged.
- "pax records are never honoured" → floor: no pax payload is read; a modified entry at a selected path is refused.
- "The tree holds only regular files and directories" → floor: unchanged (selected entries must be typeflag `0`/NUL).
- "Bounds" → floor: download cap (fetchCapped), header count, scanned bytes, written bytes — each a counter compare,
  each tested.
- "Validating the layout marker on the manifest is equivalent to probing the tree" → advisory DERIVATION (stated in
  the code): only listed files are written, and every one is proved present by the hash check.

## Trust audit (P2)

The archive and manifest stay untrusted. Strictly fewer bytes reach disk; unselected names are never decoded, so
they never reach a message. Selected names reach messages only after the control/format-character check, as today.

## Determinism audit (P5)

Every branch is a membership test: key ∈ select; typeflag ∈ {`0`, NUL} (accept), {`x`, `L`, `K`} (modifier), `g`
(skip); counters vs caps. No fallback guesses.

## Open questions (HALT)

- none.

GATE 1 approved by lead (delegated by the user), 2026-11-25. Checked against the ticket: Scope bullets 1-6 → Design

- Files; Done-when tests → Evals; e2e smoke → Evals (manual); no version bump; pharn-oss doc follow-up out of scope.
