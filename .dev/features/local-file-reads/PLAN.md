# PLAN — local-file-reads (no pharn-owned project file can hang a command)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: every file pharn itself keeps in the project — `pharn.records.json`,
  `pharn.config.json`, `.pharn.lock` — is read through one bounded, non-blocking reader. A FIFO, a
  directory, a device or an oversize file there is reported as unreadable, the same as any other
  unreadable file today, instead of hanging the command or reading without bound.
- layer(s): the CLI itself (`src/lib/`, `src/steps/`), docs
- constitution_refs: [P0, P2, P5, P6]

## Discovery — verified this run (P6), code read on HEAD `9d2d574`

- **The hang.** Each of these reads with `readFileSync`, which on a FIFO blocks in `open(2)` until a
  writer appears, i.e. forever:
  - `readRecords` (`install-records.ts:125`, after an `existsSync`): read by `update`, `add`,
    `remove`, and since #223 by every re-run `init` (`reinstallBaseline`), before its prompt and
    again under the project lock;
  - `readPharnConfig` (`pharn-config.ts:310`) and `configFingerprint` (`:483`): read by every
    command, `status` and `list` included;
  - `recordedSkillsVersion` (`overwrite-check.ts:70`) and `readCarriedEntries`
    (`install-archetype.ts:373`), init's two tolerant config reads;
  - `readRawAt` (`project-lock.ts:175`): the lock payload, read whenever a lock already exists.

  A hang while holding `.pharn.lock` also refuses every other `pharn` command in the project until
  the lock goes stale.
- **No bound.** The same reads have no size cap: a symlink to `/dev/zero` at any of these paths
  reads until memory runs out.
- **Precedent.** `hook-wiring.ts` (`readSettings`, #222) and `detect-archetype.ts`
  (`readPackageJsonText`, PHARN-15) already read user-adjacent files through one descriptor opened
  `O_NONBLOCK`, `fstat`-checked as a regular file and size-capped. These three files never got it.
- **Threat model.** Only a local actor can plant such a file; `THREAT-MODEL.md` models remote
  content. This is hardening against a hang and unbounded memory, not a remote-attack fix.

## Files

- `src/lib/bounded-read.ts` — layer CLI/lib. New: `readBoundedFile(path, maxBytes)` returns
  the bytes, absent, or unusable with a named reason. One descriptor, opened `O_RDONLY` +
  `O_NONBLOCK` (absent on win32, so `?? 0`); `fstat` must show a regular file within the cap; the
  bytes are read from that same descriptor. A symlinked FILE is still followed, as today. Never
  throws.
- `src/lib/install-records.ts` — layer CLI/lib. `readRecords` reads through it; unusable → the
  existing `invalid` outcome, with the reason named.
- `src/lib/pharn-config.ts` — layer CLI/lib. `readPharnConfig` and `configFingerprint` read through
  it; unusable → the same results an unreadable file gives today (`null`, and
  `unreadable:<reason>`).
- `src/steps/overwrite-check.ts` — layer CLI/steps. `recordedSkillsVersion` reads through it.
- `src/steps/install-archetype.ts` — layer CLI/steps. `readCarriedEntries` reads through it.
- `src/lib/project-lock.ts` — layer CLI/lib. `readRawAt` reads through it; unusable → `null`, the
  existing never-wedge rule.
- `tests/bounded-read.test.ts` — layer tests. New: a regular file, absent, a directory, a FIFO (in
  a child process with a hard timeout), over the cap.
- `tests/install-records.test.ts` — layer tests. A FIFO at `pharn.records.json` → `invalid`, not a
  hang (child process + timeout; FAILS on base by hanging); a directory → `invalid`, naming it.
- `tests/pharn-config.test.ts` — layer tests. A FIFO at `pharn.config.json` → `readPharnConfig`
  returns `null` and `configFingerprint` an `unreadable:` value, not a hang (FAILS on base).
- `tests/project-lock.test.ts` — layer tests. A FIFO at `.pharn.lock` does not hang acquisition
  (FAILS on base).
- `docs/reference/pharn-records.md` — layer docs. The unreadable list names a non-regular or
  oversize file.
- `docs/reference/pharn-config.md` — layer docs. The same, for the config, where it names an
  unreadable file.
- `docs/troubleshooting.md` — layer docs. The "cannot be read at all" list for the config gains a
  FIFO, a device and a file over 16 MiB (amended during build: that sentence is where the config's
  unreadable cases are listed).
- `CLAUDE.md` — layer docs. The `pharn-config` / `install-records` / `project-lock` descriptions.
- `CHANGELOG.md` — `[Unreleased]` → `### Security`, one entry.

## Contracts satisfied

- The read-side posture `hook-wiring.ts` and `detect-archetype.ts` already hold, extended to the
  three files pharn owns (cited, P4).

## Evals to write (P1)

- Listed under Files. The three FIFO cases FAIL on the base by hanging (killed by the timeout).

## Guarantee audit (P0)

- "no pharn-owned project file can block a read" → floor: `O_NONBLOCK` + `fstat` in one reader,
  plus the FIFO tests.
- "no such read is unbounded" → floor: the size cap, plus a test.

## Trust audit (P2)

- These files are local and hand-editable; their bytes are data. Nothing new is printed except a
  fixed reason string.

## Determinism audit (P5)

- A type check and a size compare; every failure is a named outcome the callers already handle.

## Open questions (HALT)

None open. Resolved at GATE 1 (human, 2026-09-25): both questions below → **(a)**, the recommended
answer. Kept for the record:

1. Scope. (a) All three pharn-owned files (records, config, lock), through one reader —
   recommended: fixing only the records leaves the identical hang one file over. (b) Only
   `pharn.records.json`, as first reported.
2. The cap. (a) 16 MiB for all three — recommended: records for ~160k files fit, the other two are
   a few KB, and one number is easier to reason about. (b) A cap per file.
