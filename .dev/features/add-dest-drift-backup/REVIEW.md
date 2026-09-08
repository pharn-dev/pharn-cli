# REVIEW — add-dest-drift-backup

**Floor first (P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`,
exit 0. (Vacuously green — this repo ships no markdown capability — so it is a precondition met, not
evidence of quality. Stated rather than counted.) The standing stage verdicts are `/pharn-dev-regress`
`no-regressions` and `/pharn-dev-verify` `PASS`.

> **Trust (P2).** The increment is `trust: untrusted`. Nothing in the reviewed diff attempted to
> instruct this reviewer; every `problem` / `evidence` below quotes it as DATA.

---

## Floor-gate findings (blocking)

**None.** Every guarantee the increment states reduces to a floor primitive or carries an advisory
label:

- drift membership → **content-hash** (`sha256File`, `ARCHITECTURE.md §2` #2);
- containment → **path-containment** (`safeJoin`) + the physical gate (`findSymlinkComponent`);
- symlink exclusion → **type check** (`Dirent.isSymbolicLink()` / `lstat().isFile()`);
- "the backup completes before any original is touched" → correctly left **advisory**: `add.ts:489`
  cites `createBackup`'s contract rather than restating it as a guarantee, and `backup.ts:13-16`
  already labels that ordering "deterministic control flow demonstrated by a test, NOT a floor
  primitive." The increment inherits the label instead of quietly upgrading it. This is the lens that
  most often catches the disease; here it finds nothing.

The one claim worth naming explicitly: **"backed up" never means "safe."** `add.ts:483` and
`docs/commands/add.md` both say `add` still overwrites and only stops doing so irrecoverably.
Recovery is the user's action. That is the honest framing, and it is the one used.

---

## Advisory findings

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'src/lib/install-manifest.ts:236'
  problem: 'capabilityCloneFiles claims to enumerate what a copy would write, but nothing pins its output against a REAL installCapabilityDirs run — while its sibling in the same file has exactly that mirror test.'
  evidence: "The project-root-relative paths of ONE capability's files, enumerated in the CLONE — what a copy of that dir would actually write."
```

The file's own header states the standard: _"tests/install-manifest.test.ts pins the mirror against a
REAL installCapabilities run so the two cannot silently drift."_ `capabilityCloneFiles` now drives a
**destructive** decision (which files get backed up) and a **durable** one (which get recorded), so a
silent divergence from `cpSync`'s `noSymlinks` filter is more costly here than for the read-only
manifest — yet it is the one of the two without the pin. Its seven unit tests assert the guards; none
asserts the _agreement_. A non-regular clone entry (fifo/socket) is the concrete divergence: `walkFiles`
yields it as a file, `cpSync` throws on it.

**Recommended:** one mirror case — real clone tree → real `installCapabilityDirs` → assert the copied
file set equals `capabilityCloneFiles`' output. Cheap, and it converts an argued invariant into a
tested one.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/add.test.ts:0'
  problem: "The design decision that the drift scan must not pre-empt installCapabilityDirs' curated missing-capability message is argued in the code and tested in two halves, but the join is never exercised end-to-end."
  evidence: "The scan skips an unreadable source rather than throwing, so a missing/symlinked capability dir still gets the pre-flight's curated message rather than a raw ENOENT from here."
```

`capabilityCloneFiles → []` is pinned in `install-manifest.test.ts`; the curated message is pinned in
`install-capabilities.test.ts`. Nothing runs `add` against a clone missing the capability and asserts
which message surfaces — and `add.test.ts` cannot, since it mocks the installer file-wide. A named
limit rather than a defect: the two halves are each tested, the composition is reasoning.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/add.test.ts:0'
  problem: 'The picker-path backup test asserts the saved bytes and the two directories but not that the backup path is NAMED on that path, which is the one assertion the named-path test makes.'
  evidence: "expect(saved.sort()).toEqual(['MY GRILLER EDIT', 'MY LENS EDIT']);"
```

The file argues twice elsewhere that a shared code path still needs asserting at both entry points.
The message assertion is the half left off.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/dest-drift.ts:60'
  problem: 'The destination side is guarded per-component with findSymlinkComponent, but the untrusted CLONE side is guarded only by a leaf lstat, so a symlinked intermediate directory in a caller-supplied rel would let sha256File read outside the clone.'
  evidence: 'const src = safeJoin(repoDir, rel); if (!lstatSync(src, { throwIfNoEntry: false })?.isFile()) continue;'
```

Not reachable through the only caller: `capabilityCloneFiles` component-guards its root and
`walkFiles` recurses only into real directories, so no rel it produces can carry a symlinked
intermediate. But `collectDestDrift` is **exported**, its parameter is a plain `readonly string[]`,
and the untrusted side is the one left thinner — the inverse of this repo's usual posture
(`install-records.ts:51-53` shape-validates a key "even though it is never path-joined"). One
`findSymlinkComponent(repoDir, rel)` line makes the two sides symmetric.

Everything else on this lens is clean: file contents are hashed and never parsed or executed, no
clone-derived string reaches a network call or a command, and no decision anywhere rests on free text.

### L-axis → P3

**No findings.** `dest-drift.ts` owns one axis and knows nothing of capabilities, roles, or layouts —
it takes a rel list. `capabilityCloneFiles` sits in `install-manifest.ts`, whose axis ("what an
install writes, enumerated from the clone") it belongs to rather than extending; the header's consumer
list was updated with it. `add.ts` imports only from `lib/`; no command→command or step→step edge was
introduced. Deleting `capabilityRecordPaths` rather than repointing it kept the "install record store"
axis from acquiring a clone walk, and left no dead symbol (P7).

### L-floor → P0 (documentation)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'docs/commands/add.md:131'
  problem: 'The new Overwrite protection section introduces .pharn-backup/ to add users without the retention guidance update.md carries, so a reader who only ever runs `add` is never told the directory accumulates and is not gitignored.'
  evidence: 'Backed up 1 file(s) to .pharn-backup/20260908-141530 before overwriting.'
```

`docs/commands/update.md:168-170` — _"Retention is yours. pharn never prunes `.pharn-backup/` and never
edits your `.gitignore` — so backups accumulate and are committable by accident."_ `add` can now
create one directory **per pick** in a picker run, so the accumulation story is if anything sharper
here. A one-line cross-reference closes it. (The abort-on-failed-backup wording itself is consistent
with `update.md:157`, so no finding there.)

---

## Verdict

**GREEN — 0 floor-gate findings; 5 advisory (2 important, 3 minor).**

The increment does what it set out to do and labels what it cannot promise. Nothing blocks it. The two
important advisories are both "the argument is right, the pin is missing" — a mirror test and a
documentation cross-reference — and neither changes behavior.

---

## Proposed lesson (candidate for canon — NOT written here)

`/pharn-dev-review` writes only `REVIEW.md`; promotion is a separate human-gated
`/pharn-dev-memory-promote` run under its own scope, behind `check-provenance`. Proposed:

> **A test fixture that fabricates outputs its input does not contain is a fiction with an expiry
> date.** `tests/add.test.ts`'s installer mock wrote `pharn-pipeline/grillers/a11y/a11y.md` against the
> clone dir `/repo`, a path that never existed. Four exact-equality assertions passed for as long as
> the code derived its file list from the DESTINATION; the moment it derived from the CLONE — the
> correctness fix itself — all four broke at once, and the fixture, not the code, was wrong. When a mock
> stands in for a copy, make it COPY: point it at a real source tree so source and destination agree by
> construction. A mock that invents the result cannot detect a change in where the result comes from.

- **Provenance:** increment `add-dest-drift-backup`; the four tests are the ones the FABLE 4.2 finding
  predicted would break (`tests/add.test.ts`, the record-derivation cases), reworked in this diff onto
  a real clone tree plus a `copyingInstaller()` helper.
- **Real, not hypothetical (P7):** the failure occurred in this run, exactly as predicted.
