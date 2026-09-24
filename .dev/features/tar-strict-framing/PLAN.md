# PLAN — tar-strict-framing (PHARN-18: bounded pax parsing and strict tar framing)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the extractor (1) refuses a pax `g`/`x` header whose payload exceeds a fixed cap (64 KiB)
  BEFORE parsing its records; (2) after the first all-zero block requires every remaining byte to be zero
  (a zero block mid-archive no longer silently truncates the tree; garbage after the end marker is
  refused); (3) refuses an archive that ends without an end-of-archive marker; (4) refuses a header
  without the `ustar` magic; (5) refuses empty (`a//b`) and `.` path segments explicitly, instead of
  relying on `safeJoin`'s backstop.
- layer(s): the CLI itself (`src/lib/tar-extract.ts`)
- constitution_refs: [P1, P2, P5]

## Discovery — verified this run (P6)

Review repro: a 192,449-byte archive whose global header expands to ~128 MB of tiny records costs
12.99 s CPU and 1,115 MiB RSS in `readPaxKeywords`; with `--max-old-space-size=512` the process aborts
(exit 134) and leaves the clone in the temp dir. Framing: `if (isZeroBlock(header)) break;` stops at the
first zero block (entries after it are silently dropped); a missing end marker, trailing garbage and a
missing `ustar` magic are all accepted; `resolveEntryPath` rejects `..`/absolute/root but not `''`/`.`
segments below the root. Every codeload archive (git archive) has `ustar\0` magic, a pax global header
of one `comment=` record (~52 bytes) and zero-padded end blocks, so none of these rules touches it.

## Files

- `src/lib/tar-extract.ts` — `MAX_PAX_BYTES` gate; end-marker + all-zero tail; missing-marker refusal;
  `ustar` magic check; `''`/`.` segment refusal — layer CLI/lib
- `tests/tar-extract.test.ts` — an oversized `g` payload refused fast (bounded time, before parsing);
  zero block mid-archive followed by an entry → refused; trailing garbage → refused; no end marker →
  refused; missing magic → refused; `a//b` and `a/./b` → refused; the codeload-shaped fixture still
  extracts

## Contracts satisfied

- `THREAT-MODEL.md` §2 "post-decompression cap bounds the compression bomb" — now also bounds the cost of
  parsing pax records.

## Evals to write (P1)

- listed above; each fails (is accepted, or is slow) on the base source.

## Guarantee audit (P0)

- "a pax payload parse is O(64 KiB)" → floor: size check before `readPaxKeywords`.
- "no entry after the end marker is ever skipped silently" → floor: all-zero tail check.

## Trust audit (P2)

- Only narrows what an untrusted archive may contain.

## Determinism audit (P5)

- Pure byte checks.

## Open questions (HALT)

- none
