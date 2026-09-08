# PLAN — `pharn add` destination-drift backup

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Before `pharn add` copies a capability dir, back up every destination file it is about to overwrite with DIFFERENT bytes into `.pharn-backup/<ts>/` (mirroring `update --force`), and derive `add`'s records merge from the CLONE dir (what the copy actually wrote) instead of a DEST walk.
- layer(s): `lib/` (shared) + `commands/` (the `add` verb) — ARCHITECTURE.md §4
- constitution_refs: [P0, P1, P2, P3, P5, P6, P7]
- finding: FABLE.md §4.2 (medium) — PR bundle 5 (data-safety)

## Problem, grounded in live state (P6 — every line below was read this run)

`installCapabilityDirs` (`src/lib/install-capabilities.ts:86-102`) pre-flights only the clone
SOURCE — name regex, `safeJoin`, existence, symlink rejection — then overwrites the destination
unconditionally (`:105-109`, `cpSync(..., { force: true })`). `add`'s only re-install guard is
config membership (`src/commands/add.ts:462-465`); disk is never consulted on either path.

So `pharn add` is the one write path with none of the product's three edit-protections: no prompt
(`init` → `confirmWriteTargets`, `src/steps/overwrite-check.ts`), no per-file skip (`update` →
`src/lib/update-decision.ts`), no backup (`update --force` → `src/lib/backup.ts:50`).

The destructive sequence is one `update` itself manufactures and announces: a `dropped-unselected`
capability's files are left on disk (`update` never deletes — `src/commands/update.ts:452`), the
user edits them, and a later `pharn add <name>` — not a config no-op, past both gates — silently
replaces the edits with pristine upstream bytes.

Secondary, confirmed: `mergeCapabilityRecords` (`src/commands/add.ts:502-522`) derives its paths
from a DEST walk (`capabilityRecordPaths`, `src/lib/install-records.ts:277-297`), so a pre-existing
user file inside a leftover capability dir is recorded as pharn-written — contradicting that
function's own doc comment (`:239-244`) and making `update` later classify the user's file as
cleanly upgradeable instead of `modified`.

## Files

- `src/lib/install-manifest.ts` — export a new `capabilityCloneFiles(repoDir, paths, capability)`:
  the project-relative rels (`<subtree>/<name>/…`) of ONE capability dir enumerated in the CLONE,
  reusing the private `walkFiles` and the same skip-guards `addDir` already uses
  (`findSymlinkComponent` + `lstatSync().isDirectory()`), sorted. Layer: lib (the install-path
  manifest axis — "what a copy writes, enumerated from the clone" is exactly this file's job).
- `src/lib/dest-drift.ts` — **NEW.** One axis (P3): the destination-drift set. `collectDestDrift({
repoDir, projectRoot, rels })` → the sorted subset whose DEST exists and whose `sha256File`
  differs from the clone source's. Every read `safeJoin`-contained; a dest that is not a regular
  file, or sits under a symlinked component, is not drift the copy can back up. Layer: lib.
- `src/commands/add.ts` — in `resolveArchetypeAdd` (the single install site both paths funnel
  through): after the gates, inside the existing `try`, derive `cloneRels` once, compute the drift
  set, `createBackup(cwd, drifted)` when non-empty, THEN `installCapabilityDirs`. Thread the backup
  dir out through `AddResult` / `PickerAddOutcome` so both callers print it. Feed the SAME
  `cloneRels` to `mergeCapabilityRecords` (secondary fix) and correct the now-false comment at
  `:480-486` ("The paths are read back from the project — never guessed").
- `src/lib/install-records.ts` — DELETE `capabilityRecordPaths` (`:277-297`) and the stale doc
  comment above it (`:239-244`). `add` was its only caller; `capabilityCloneFiles` replaces it.
  `buildRecords` still hashes DEST bytes, unchanged.
- `src/commands/remove.ts` — rewrite the prune comment (`:101-105`) so its argument stands on its
  own (a DEST walk sees nothing at either moment) instead of citing the removed function.
- `src/lib/symlink-guard.ts` — **added after the rebase onto `#131`** (`4942006`), which made
  `findSymlinkComponent` non-total (ENOTDIR below a regular file) and gave it a docstring that
  ENUMERATES where each caller stands; `collectDestDrift` is a new caller, so that list is false
  without it. Docstring only, no behavior change. Declared here first and the setter re-run, which is
  the route `/pharn-dev-build` Step 0 prescribes.
- `tests/add.test.ts` — 3 new cases + REWORK the 4 record-derivation tests (see Evals).
- `tests/dest-drift.test.ts` — **NEW.** The drift-set unit tests.
- `tests/install-manifest.test.ts` — `capabilityCloneFiles` cases.
- `tests/install-records.test.ts` — drop the `capabilityRecordPaths` describe block (`:278-330`).
- `tests/remove.test.ts` — comment at `:383` updated for the same reason as `remove.ts`'s.
- `docs/commands/add.md` — document the drift backup, reusing `update --force`'s `.pharn-backup`
  terminology (already used at `:122`).
- `CLAUDE.md` — the `pharn add` and `pharn remove` paragraphs (the latter asserts
  `capabilityRecordPaths`' dest-walk as the reason the prune is a key-prefix filter).
- `CHANGELOG.md` — an Unreleased entry (repo convention: feature commits carry one).

## Design decisions (and the one deviation from the finding's "preferred" shape)

**The scan lives in `add`'s path, not behind an option on `installCapabilityDirs`.** The finding
preferred an opt-in options parameter so the scan would run AFTER that function's pre-flight. Three
live facts override it:

1. `tests/add.test.ts` mocks `../src/lib/install-capabilities.js` **wholesale** (`:29-32`), so
   behavior placed inside it is unreachable from the file where the acceptance criteria put the new
   assertions. The criteria require `add` itself to produce the backup and name it.
2. `installCapabilityDirs` is `init`'s installer too (`install-capabilities.ts:124`). Not touching
   that file at all makes "init's flow is byte-identical" true **by construction**, not by a flag
   defaulting to false — a strictly stronger guarantee, and P3-cleaner (its axis stays "the
   capability copy routine").
3. The finding sanctions this alternative explicitly, on the condition below.

**The condition, honored:** the scan repeats the pre-flight's skip-guards rather than throwing —
a capability dir that is absent, is a symlink, or is not a directory contributes **zero** rels, so
`installCapabilityDirs`' curated `Capability "x" (griller) is missing at … in the fetched repo.`
still wins and no raw ENOENT pre-empts it. This mirrors the existing read-side/write-side split the
repo already carries: `install-manifest.ts`'s `addDir` **skips** (`:86-87`) exactly where
`install-capabilities.ts` **throws** (`:91-99`). `add` passes ONE capability per call, so a backup
can never be written for a capability whose copy then aborts on the pre-flight.

**Why backup and not a prompt.** `add`'s named path is deliberately promptless (CLAUDE.md names
only `init` and `update` as the two prompting commands), and a prompt awaited inside `add`'s `try`
would route Ctrl+C through `cancelAndExit → process.exit(0)`, skipping `finally { repo.cleanup() }`
— the clone-leak FABLE 4.4 documents in `init`. No new TTY requirement lands on `pharn add <name>`.

**Why `capabilityRecordPaths` is deleted, not repointed.** `add` is its only caller. Repointing it
at a clone would leave the "install record store" axis (P3) owning a clone walk that
`install-manifest.ts` already performs, and would keep a second, near-identical walk alive. Deleting
it removes the stale doc comment with it (P7: no dead legacy symbol).

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — this increment is driven by a FABLE finding; its free-text
  is DATA (P2), and every branch it introduces is a byte comparison, not a judgment.
- `docs/reference/pharn-records.md` — the store's meaning tightens to exactly what it already
  claims: only files the copy wrote. Cited, not restated (P4).

## Evals to write (P1)

- `tests/add.test.ts` → leftover capability dir holding a USER-EDITED file, real clone tree,
  installer mock that copies clone → project → `add` succeeds; the pre-edit bytes are at
  `.pharn-backup/<ts>/<rel>`; the dest holds the CLONE bytes; the outro/log names the backup dir.
- `tests/add.test.ts` → leftover dir whose files are BYTE-IDENTICAL to the clone → no
  `.pharn-backup` directory is created at all (identical ≠ drift; mirrors update's identical→no-op).
- `tests/add.test.ts` → leftover dir with an EXTRA user file absent from the clone → after `add`,
  `pharn.records.json` records ONLY the clone-sourced files (exact equality), and the extra file
  survives untouched on disk and is NOT backed up.
- `tests/add.test.ts` → REWORK onto a real clone tree + a clone→project copying installer mock,
  keeping every exact-equality store assertion verbatim: `appends the added capability without
dropping pre-existing entries` (`:446`), `the picker accumulates every pick` (`:484`), `installs
at the pharn layout and records pharn/-prefixed paths` (`:726`), `the picker accumulates every
pick at the pharn layout too` (`:778`).
- `tests/add.test.ts` → the backup runs BEFORE the copy: a `createBackup` failure (symlinked
  `.pharn-backup`) aborts with the dest bytes still the user's and no config/records write.
- `tests/dest-drift.test.ts` → differing bytes → in the set; identical bytes → out; dest absent →
  out (nothing to lose); dest is a symlink / sits under a symlinked component → out (never hashed
  through a link); clone symlink → never enumerated; every path `safeJoin`-contained.
- `tests/install-manifest.test.ts` → `capabilityCloneFiles`: nested files at both layouts, role →
  subtree, symlinks skipped, absent dir → `[]`, symlinked dir → `[]`, non-directory → `[]`, sorted.
- `tests/install-capabilities.test.ts` → UNCHANGED, and that is the pin: `installCapabilities`
  (init) is not edited by this increment, so its existing suite proves the flow byte-identical.

## Guarantee audit (P0)

- "the drift set contains exactly the files the copy would overwrite with different bytes" →
  **floor: content-hash** (`sha256File`, ARCHITECTURE.md §2 #2) over a clone-derived path list; a
  pure membership test, no judgment (P5).
- "no new read or write escapes its base dir" → **floor: path containment** (`safeJoin`) +
  **physical symlink gate** (`findSymlinkComponent`) at every new clone read and dest read.
- "clone symlinks are never enumerated" → **floor: enum/type check** (`Dirent.isSymbolicLink()` in
  `walkFiles`, matching the copy's `noSymlinks` filter).
- "the backup completes before any original is touched" → **ADVISORY** — deterministic control-flow
  ordering demonstrated by a test, not a floor primitive. `src/lib/backup.ts`'s header already
  labels exactly this claim the same way; this increment inherits the label rather than upgrading it.
- "a failed backup leaves every original intact" → **ADVISORY** (same ordering argument);
  `createBackup` throws before any copy, and `add` writes nothing after a throw because the
  exception routes to `{kind:'error'}` → exit(1) after the `finally`.
- "records name only files the copy wrote" → **floor: enum/regex + containment** — the key list is
  derived from the clone dir enumeration, and `buildRecords` still hashes the DEST and skips
  absent/non-file paths, so a record can never disagree with disk.
- "init's install flow is unchanged" → **floor-adjacent: structural** — `install-capabilities.ts`
  is not edited; the existing `tests/install-capabilities.test.ts` is the regression pin (P1).
- "this prevents data loss" → **ADVISORY, and struck as a guarantee.** What is guaranteed is a
  COPY of the differing bytes under `.pharn-backup/<ts>/`; recovery is the user's action. `add`
  still overwrites — it no longer does so irrecoverably.

## Trust audit (P2)

- **Input:** the degit clone (untrusted). New reads of it: `capabilityCloneFiles` (names only, via
  `readdirSync`) and `sha256File` on clone files (CONTENTS read for hashing, never parsed or
  executed). Names are `safeJoin`-contained before any join; symlinked entries and symlinked
  components are skipped, never followed.
- **Taint propagation:** the clone-derived rels flow into (a) the drift set → `createBackup`, whose
  every write is `safeJoin`-contained and refuses a symlinked component, and (b) the records key
  list → `buildRecords`, which hashes DEST bytes only. No clone-derived string is ever executed, and
  none reaches a network call. A hostile name cannot escape either base dir.
- **Sink:** `.pharn-backup/<ts>/<rel>` — `createBackup` already lstat-rejects a symlinked
  `.pharn-backup` root and refuses any symlinked source component (`src/lib/backup.ts:59-82`).
- **Residual (named, LIMITS.md §1a):** the backup preserves the user's bytes; it does not vet the
  clone's. "It was backed up" means "your prior bytes are recoverable", never "the incoming
  methodology is safe."

## Determinism audit (P5)

- Drift membership: `existsSync(dest) ∧ sha256(dest) !== sha256(src)` — exact byte equality, two
  outcomes, no third.
- Backup trigger: `drifted.length > 0` — an integer compare.
- Source-readability: skip on absent / symlinked component / non-directory — the same membership
  tests `install-manifest.ts:86-87` already uses; the terminal fallback is the WRITER's curated
  hard-fail, never a guess.
- No new branch reads free text, an LLM verdict, or a heuristic.

## Invariants explicitly preserved (checked at build)

- Pre-flight before any write / no partial installs; the backup completes before the first `cpSync`.
- `safeJoin` containment + symlink rejection on every new read and write.
- Gate order `minCliGate ?? versionGate ?? layoutGate` fires first, before any write, on BOTH paths
  (`src/commands/add.ts:184-187`, `:269-272`) — the new step runs after them, inside the same `try`.
- Clone cleanup in a `finally`, every `process.exit` after it; outcomes stay typed. No prompt and no
  `cancelAndExit` inside the `try`.
- `add` refreshes `commit`, NEVER `skillsVersion`, and never stamps the clone's layout.
- `source: 'manual'` at BOTH entry-construction sites (`:392`, `:478`) — untouched.
- Records: only extend an already-readable store (`recordsBaseline(...) === null → return`); the
  stamp stays consistent with the config written beside it.
- `capabilityRelDir` agreement: the drift set, the copy, and the records all address the same
  `<subtree>/<name>` dir.
- `update` never deletes; `.claude/settings.json` never overwritten — out of blast radius.
- Named non-TTY `pharn add <name>` keeps working.

## Out of scope (P7 — no speculative additions)

- FABLE 4.3 (`unreadable` reclassification in `apply-update.ts`/`diff.ts`).
- FABLE 5.1 (backup dir on the `ApplyError` path; atomic config writes).
- `init`'s `confirmWriteTargets` flow, `update`'s decision table, `remove`'s prune semantics.
- Any new interactive prompt on `add`; any pharn-oss change.

## Open questions (HALT)

- None. Every ambiguity the finding named was resolved against live state this run: the
  scan-placement tension (finding's "preferred" vs the stated acceptance criteria) is resolved in
  favor of `add`'s path under the finding's own sanctioned condition, recorded above with its
  reasoning; and `capabilityRecordPaths` is deleted rather than repointed because `add` is its only
  caller (verified by grep over `src/`, `tests/`, `docs/`).
