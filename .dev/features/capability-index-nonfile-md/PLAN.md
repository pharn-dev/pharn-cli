# PLAN — capability-index-nonfile-md (PHARN-08: a non-file `<name>.md` must be one unknown capability, not a dead index)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: in `parseCapabilityIndex`, replace `existsSync(capFile)` with `lstatSync(capFile,
{ throwIfNoEntry: false })` and require `isFile()`: absent → the existing "missing its markdown"
  refusal; present but a directory / symlink / FIFO / other → a new `ManifestValidationError` ("is not a
  regular file"), so the per-capability tolerance reports it as `unknown` instead of the `EISDIR` from
  `readFileSync` escaping as a non-validation error and aborting `init`/`add`/`update`/`status`.
- layer(s): the CLI itself (`src/lib/capability-index.ts`)
- constitution_refs: [P1, P2, P5, P7]

## Discovery — verified this run (P6)

Reproduced in the review: upstream tree `85bdaa37` + `pharn/pharn-review/newcap/newcap.md/` (a
directory) → `parseCapabilityIndex` threw `EISDIR: illegal operation on a directory, read` (not a
`ManifestValidationError`, so the catch rethrows it) → every command that parses the index exits 1 for
every deployed CLI at once, unpathed. Without that directory: `caps 35 unknown 1` (tolerated, as designed).
`capability-index.ts` header: "ANY ManifestValidationError raised while processing ONE capability …
becomes an `unknown` entry"; I/O failures deliberately still propagate. A wrong-TYPE path is a shape
problem of one capability, not a vanished clone, so it belongs on the tolerated side. A FIFO would
additionally make `readFileSync` block forever (the tar extractor rejects FIFOs today; this is the
second floor). Upstream history (264 commits) never had this shape — a future hazard, not an active one.

## Files

- `src/lib/capability-index.ts` — the `lstat` + `isFile()` check above — layer CLI/lib
- `tests/capability-index.test.ts` — `x/x.md` as a DIRECTORY → `unknown` contains `x` with a "not a
  regular file" reason and the other capabilities still parse; `x/x.md` as a SYMLINK to a readable file
  → unknown too (never followed); a missing `x.md` keeps its existing message

## Contracts satisfied

- `LIMITS.md` §3e ("a per-capability grammar violation no longer aborts the parse … skipped and
  reported") — now true for a wrong-type markdown path as well.

## Evals to write (P1)

- listed above; the directory case fails on the base source with EISDIR.

## Guarantee audit (P0)

- "a non-regular `<name>/<name>.md` never aborts the index" → floor: `lstat().isFile()` membership test
  before any read; the refusal is a `ManifestValidationError`, which the existing loop tolerates.
- Genuine I/O failures (EACCES, a vanished clone) still propagate — unchanged, fail-closed.

## Trust audit (P2)

- The path is inside the untrusted clone; `lstat` never follows a link, so a symlinked markdown is refused
  without being read (it could otherwise point outside the clone).

## Determinism audit (P5)

- File-type membership; terminal = the existing unknown-and-report path.

## Open questions (HALT)

- none
