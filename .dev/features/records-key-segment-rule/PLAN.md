# PLAN — records-key-segment-rule

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Relax `readRecords`' record-key check from a `..`-substring + backslash ban to a `..`/`.` path-SEGMENT rule, so a benign upstream filename the writer legitimately records can no longer declare the whole store corrupt.
- layer(s): pharn-cli `src/lib/` (the install-record store axis, P3) — this repo is the installer, not a pharn-oss layer
- constitution_refs: [P0, P1, P2, P3, P5, P7]

## Problem (grounded in this run's reads)

`src/lib/install-records.ts:132` rejects a key when `!RECORD_KEY_RE.test(key) || key.includes('..')`,
with `RECORD_KEY_RE = /^[^/\\][^\\]*$/` (`:53`). Two over-rejections follow:

- **`..` as a substring** — `pharn-review/x/migration..v2.md` is rejected though no segment is `..`.
- **a backslash anywhere** — the `[^\\]` classes reject `we\ird.md`, a legal posix filename
  (`src/lib/validate.ts:130-135` states exactly this about `toPosix`).

The writer applies nothing comparable: `buildRecords` (`:217-229`) hashes whatever rels it is handed
and `writeRecords` (`:183-203`) serializes them; the rels come from `collectExpectedInstallPaths`,
which enumerates the untrusted clone and `toPosix`-normalizes at `src/lib/install-manifest.ts:73-75`
without validating basenames. So the writer can record a key its own reader calls corrupt, and the
whole store degrades to `unverifiable` (every present differing file skipped, version bump withheld;
`add`/`remove` silently stop maintaining it, both being `recordsBaseline(...) === null → return`).

The key is genuinely never joined — stated at `install-records.ts:20-26`, pinned by
`tests/install-records.test.ts:169-176`, and the one consumer is a literal lookup
(`records?.[rel]`, `src/lib/update-decision.ts:216`). So the strict test buys **no containment**; it
only manufactures false corruption. Latent today (no such upstream filename exists) — hence low.

## Files

- `tests/install-records.test.ts` — tests FIRST: keep the two existing negatives + the
  no-filesystem-access pin untouched; add positives (`..` in a basename, `..` inside a directory
  NAME, a literal backslash), negatives (a real `..` segment, a bare `..`, a `.` segment), and a
  `writeRecords`→`readRecords` round-trip — layer: tests (P1)
- `tests/update.test.ts` — end-to-end guard: an installed tree carrying a `..`-in-basename file
  upgrades normally instead of degrading the run to `unverifiable`, and the version bump is not
  withheld for that reason — layer: tests (P1)
- `src/lib/install-records.ts` — DELETE `RECORD_KEY_RE`; validate each key on a `toPosix` copy split
  into segments (reject empty, leading `/`, and any segment `..` or `.`); store the ORIGINAL key;
  keep the message shape; rewrite the `:51-53` comment to state what the reader now enforces,
  keeping the "never path-joined / defense in depth (P2)" framing — layer: `src/lib/` (one axis:
  the install record store)
- `docs/reference/pharn-records.md` — line 60 says "a path key that is absolute or contains `..`";
  restate it as the segment rule so docs cite the code (P4) — layer: docs

No other file changes. `SHA256_RE`, `RECORDS_SCHEMA_VERSION`, the stamp checks, `recordsBaseline`'s
note wording, `buildRecords`/`writeRecords`, and `update-decision.ts` are untouched.

## Contracts satisfied

- `pharn.records.json` store schema (`docs/reference/pharn-records.md`, `install-records.ts:39-64`)
  — the accepted-key rule is narrowed; `schemaVersion` 1 is unchanged, so every store pharn has ever
  written still reads (P7, strictly widening). Cite, not restate (P4).
- `toPosix` / `safeJoin` remain the lexical primitives in `src/lib/validate.ts` — the segment rule
  reuses `toPosix` rather than forking a normalizer, mirroring `findSymlinkComponent`'s
  `toPosix(rel).split('/')` idiom (`src/lib/symlink-guard.ts:55`).

## Evals to write (P1)

- reader, positive → `pharn-review/x/migration..v2.md` (a `..` inside a basename) → `ok`, hash intact
- reader, positive → `pharn-pipeline/v1..v2/skill.md` (a `..` inside a directory NAME) → `ok`
- reader, positive → `pharn-review/x/we\ird.md` (literal backslash) → `ok`, hash intact — the case
  that fails if the old regex survives as a second gate
- reader, negative → `a/../b.md` (a real `..` segment mid-path) → `invalid`, `/invalid file path/`
- reader, negative → `..` (bare) → `invalid`
- reader, negative → `a/./b.md` and `.` → `invalid`
- reader, negative (UNCHANGED pins) → `../escape.md`, `/etc/passwd` → `invalid`; and
  `../../../../etc/passwd` causes no filesystem access and does not throw
- round-trip → `writeRecords({'pharn-review/x/migration..v2.md': sha})` → `readRecords` → `ok`, key
  byte-identical
- end-to-end (`tests/update.test.ts`) → a recorded `..`-in-basename file in clone + project →
  `runUpdate()` upgrades it, prints no `UNVERIFIABLE` skip note, and writes `skillsVersion 1.1.0`

## Guarantee audit (P0)

- "a record key never drives a filesystem access" → **floor: structural** — no `safeJoin`, `resolve`,
  or fs call is added on a key path; the only consumer stays the literal lookup at
  `update-decision.ts:216`. Pinned by `tests/install-records.test.ts:169-176`, kept untouched.
- "a root-escaping or absolute key is rejected" → **floor: enum/regex-class check** — an explicit
  segment membership test (`segment === '..' || segment === '.'`) plus empty / leading-`/` rejection,
  computed on `toPosix(key)`.
- "a genuinely bad store still fails closed" → **floor: schema-version exact match + regex** —
  `RECORDS_SCHEMA_VERSION` equality, `SHA256_RE`, and the stamp type checks are all untouched;
  `readRecords` still never throws and `recordsBaseline` still degrades to `records: null` + a named
  note.
- "this reduces spurious skips" → **advisory** — it is a claim about which real-world filenames
  upstream ships, not a floor property. The floor property is only the narrowed accept-set.
- **NOT claimed:** that the reader validates a key is *safe to join*. It does not, and nothing joins
  it. Relaxing here is sound precisely because the containment guarantee lives elsewhere (P0: point
  at the deterministic check, or drop the claim).

## Trust audit (P2)

`pharn.records.json` is LOCAL but user-editable → untrusted input; and its keys ORIGINATE from the
untrusted clone via `collectExpectedInstallPaths`. Taint propagation after this change:

- key → **compared only** (a `Record` lookup and a `startsWith` prefix filter in
  `recordsUnderCapabilities` / `pruneCapabilityRecords`). It never becomes a path, a ref, or a fetch.
  Widening the accept-set therefore widens **no sink**.
- key → **interpolated into report text** (`JSON.stringify(key)` in the invalid message, and the
  update report's file lists). That was already true for every accepted key and is unchanged; the
  content is DATA, never executed.
- value → still gated by `SHA256_RE` before it is stored; an unparseable hash still invalidates the
  whole store, not one entry.
- The write side stays permissive **deliberately**: hard-failing `buildRecords`/`writeRecords` on a
  filename `cpSync` copies happily would convert a latent read problem into a hard failure of
  `init`/`update` — strictly worse, and a different trust decision from the write-side filename floor
  `copyFilteredDir` applies to command/hook basenames (out of scope, sibling surface).

## Determinism audit (P5)

Every branch is a membership test: `segment === '..'`, `segment === '.'`, `key === ''`,
`key.startsWith('/')`. No classification, no heuristic, no guess. The fallback is unchanged and is
the safe terminal: any rejection returns `{kind:'invalid', message}` → `recordsBaseline` →
`records: null` → `update` SKIPS. The withheld-bump rule is untouched.

## Open questions (HALT)

- None. The finding names the fix, the invariants, and the acceptance criteria; live reads this run
  confirmed every cited line, and the one doc statement of the rule
  (`docs/reference/pharn-records.md:60`) is in `## Files`.
