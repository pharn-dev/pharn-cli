# PLAN — tar-entry-names (judge the name that is written; bound pax work per archive, not per header)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the extractor (1) decodes each entry's `prefix`/`name` fields ONCE, as strict UTF-8,
  refuses a field that is not valid UTF-8, runs the control/format-character check on that decoded
  string, and uses the SAME string for the path rules and the write; (2) bounds pax work per
  ARCHIVE — a cumulative 64 KiB payload budget across every `g` header, and every `g` header counts
  toward `maxEntries`; (3) renders a malformed numeric field without its raw bytes, so no newline or
  control byte from a header reaches the fatal-error sink.
- layer(s): the CLI itself (`src/lib/tar-extract.ts`)
- constitution_refs: [P0, P1, P2, P5]

## Discovery — verified this run (P6)

- `readString` (`tar-extract.ts:100-104`) decodes header fields as latin1; the entry path is built
  from it (`:442-445`) and written as that latin1 string (`:477-480`), which fs encodes as UTF-8.
  `assertDisplayablePath` (`:206-217`, PHARN-17) checks a DIFFERENT string — the UTF-8 decoding of
  the latin1 bytes. Reproduced by review (end-to-end with `extractTar`, then real `runStatus` /
  `runUpdate` on a git-archive of pharn-oss): a raw `0x9B` byte decodes to U+FFFD for the check
  (passes) and lands on disk as U+009B (bytes `c2 9b`, the C1 CSI); `status`'s MISSING list and
  `update`'s SKIPPED list then print it raw. A legitimate UTF-8 name (`a—b.md`) lands as mojibake
  (`a` U+00E2 U+0080 U+0094 `b`). The latin1 decoding predates the range (#153); PHARN-17's check
  is the part that disagrees with the write.
- Every codeload entry in the live archive is ASCII (review: pharn-oss@b31e540 via `git archive`,
  2623 entries), so strict UTF-8 changes nothing for the real archive.
- pax (PHARN-18): `MAX_PAX_BYTES` (64 KiB) is checked per header (`:397`), `g` headers are unlimited
  in number and skip the `entries`/`totalBytes` accounting (`:421-438` vs `:459-471`). Measured by
  review on node 22: 2030 `g` headers × 64 KiB (a 288 KiB .tgz) → accepted after 8.9 s CPU / 375 MB
  RSS, vs 11.5 s / 906 MB for the single-header archive PHARN-18 fixed. Real archives carry exactly
  one `g` (`comment=<sha>`, ~52 bytes). `MAX_ENTRIES` is 20 000 (`repo.ts:21`).
- `readOctal` (`:112-126`) interpolates the raw field text; `logError` keeps `\n`, so a size field
  `1\n Done` prints an attacker-chosen second line on the fatal path (reproduced by review). The
  checksum field reaches the same `readOctal`.

## Files

- `src/lib/tar-extract.ts` — `readPathField` (strict `TextDecoder('utf-8', { fatal: true })`, refusal
  message renders the bytes as printable ASCII + `\xNN` escapes, capped); `assertDisplayablePath` runs
  on the decoded path with no re-decoding; the decoded path feeds `resolveEntryPath` and the write;
  a per-archive `paxBytes` budget checked BEFORE `readPaxKeywords`; `g` headers increment `entries`;
  `readOctal`'s message shows the field via the same escaped rendering — layer CLI/lib
- `tests/tar-extract.test.ts` — raw `0x9B` in `name` → refused, nothing written (FAILS on base);
  invalid UTF-8 in `prefix` → refused; valid UTF-8 `a—b.md` → written as exactly those bytes (FAILS
  on base); valid-UTF-8 U+009B and U+202E still refused; the refusal message holds no C0/C1 byte;
  two `g` headers each under 64 KiB but over it together → refused (FAILS on base); `maxEntries`+1
  empty `g` headers → refused (FAILS on base); a numeric field containing `\n` → message has no
  newline (FAILS on base); the codeload-shaped fixture still extracts
- `CHANGELOG.md` — `[Unreleased]` → `### Security` entry

## Contracts satisfied

- `THREAT-MODEL.md` §2 surface 7 / §3 "malformed / hostile archive entry" and PHARN-17's
  "no such name is installed or printed" — now true of the bytes written (cited, P4).

## Evals to write (P1)

- listed under Files.

## Guarantee audit (P0)

- "an extracted entry's on-disk name is its archive bytes decoded as UTF-8 and contains no C0/C1/Cf
  character" → floor: fatal UTF-8 decode + the `hasUnsafeChars` regex over the exact string written.
- "pax parsing costs O(64 KiB) per archive" → floor: cumulative size compare before any parse.
- "every header counts toward `maxEntries`" → floor: counter + compare.
- "no header byte reaches a message raw" → floor: the escaped rendering is total over bytes
  (printable ASCII 0x20-0x7E kept, everything else `\xNN`).

## Trust audit (P2)

- Only narrows what an untrusted archive may contain; untrusted bytes reach messages only in the
  escaped rendering.

## Determinism audit (P5)

- Byte/regex checks and integer compares; no fallback decoding (invalid UTF-8 is a refusal, not a
  replacement character).

## Open questions (HALT)

- none
