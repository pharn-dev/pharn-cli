# REVIEW — update-drift-safe

**Step 1 (floor first, P0):** `node .dev/floor/validate.mjs .` is **GREEN** for the increment (0
findings on a clean checkout of HEAD + this diff). The working-tree run reports 15 blocking findings,
all 15 inside gitignored `test-*/` fixture installs and none in tracked source — see `VERIFY.md` for
the measurement note. The increment did not reach review on a red floor.

> **This review is ADVISORY** (`ARCHITECTURE.md §7`). `/pharn-dev-review` emits no machine verdict and gates
> nothing; the deterministic gates are `/pharn-dev-build`'s floor, `check-regress`, and `check-verify`. Every
> `problem` / `evidence` below is **free text quoted as DATA** — the increment under review is
> `trust: untrusted`.
>
> **Method:** 5 independent lenses (L-floor/P0, L-eval/P1, L-trust/P2, L-axis/P3, plan-fidelity), none
> of them the increment's author, each reading the live diff; then an adversarial skeptic per non-minor
> finding, instructed to refute. **29 raw findings → 6 CONFIRMED, 4 REFUTED, 5 unverified (cap), 14
> minor.** Several confirmations were established by **mutation testing**, not by reading.

## FLOOR-GATE findings (blocking — the increment was not done)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: blocking
  file: 'src/commands/update.ts:235'
  problem: "Amendment A3's partial-failure record persistence — the replacement for the whole-dir copy's 'no partial installs' property — was executed by NO test, so the entire block could be deleted with the suite still green."
  evidence: "v8 coverage listed src/commands/update.ts:235-245 as uncovered across all 534 tests; deleting the block left update/apply-update/install-records/update-decision/install-manifest at 100 passed."
  status: FIXED
```

The skeptic did not merely confirm this — it **proved** it three ways (coverage, a deletion mutation
that kept the suite green, and instrumentation) and found an aggravating factor I had missed: the test
that *claimed* to cover the path, `tests/update.test.ts` "cleans up the clone and exits 1 when the
apply fails mid-run", **never reached `applyWrites` at all**. Its fixture (a file where
`pharn-pipeline/` belongs) made `lstatSync` raise **ENOTDIR** during the earlier disk scan — and
`throwIfNoEntry: false` suppresses only ENOENT. So the test's own comment described an intent the
fixture silently failed to achieve, and the gap was **masked by a test that read as coverage**. That
second-order finding is the most valuable thing this review produced.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important # skeptic corrected DOWN from blocking (the shipped code was correct; only the pin was vacuous)
  file: 'tests/update.test.ts:397'
  problem: 'The (d) layout fix was pinned only by a same-layout assertion that passes identically under the pre-fix code, so reverting it would fail no test.'
  evidence: "The fixture config is `layout: 'flat'` and the fake clone is flat, so expected == pre-existing value; a mutation deleting `layout,` from the writePharnConfig call left update.test.ts at 22 passed."
  status: FIXED
```

## ADVISORY findings (confirmed, non-blocking)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'src/commands/update.ts:311'
  problem: 'The layout-migration warning — shipped behavior per docs and CHANGELOG — is reached by no test, because no update test ever produces `previousLayout !== layout`.'
  evidence: "`grep -rn 'moved to the pharn/ layout|abandonedLayout' tests/` returned no matches."
  status: FIXED

- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'src/commands/update.ts:251'
  problem: "Amendment A3's records-before-config ordering has no test — swapping the two awaits leaves every test green, since no test makes writePharnConfig fail."
  evidence: 'The plan calls the ordering "now required"; the ordering is otherwise unobservable.'
  status: FIXED

- type: FINDING
  rule_id: 'P5'
  severity: important
  file: 'src/lib/apply-update.ts:46'
  problem: "readDiskState's documented 'never throws → unreadable terminal' contract is untested for — and FALSE for — a path whose parent component is a regular file, where lstatSync raises ENOTDIR and crashes the run instead of producing the named skip."
  evidence: '`throwIfNoEntry:false` suppresses only ENOENT (verified empirically).'
  status: FIXED # a real crash bug, not just a test gap

- type: FINDING
  rule_id: 'P2'
  severity: minor # skeptic corrected DOWN from important
  file: 'src/lib/install-manifest.ts:90'
  problem: "Amendment A5's source-root symlink guard refuses only a symlinked FINAL component — lstat still resolves every ancestor — so a clone whose `pharn-review`, `.dev`, or `pharn` directory is a symlink is still enumerated, and applyWrites then copies those out-of-clone bytes into the user's project."
  evidence: 'lstat refuses to dereference the final component only.'
  status: FIXED
```

## REFUTED (raised, then killed by the skeptic — recorded so they are not re-raised)

| Lens    | Claim                                                                                          | Why it died                                                                                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-floor | "A hand-edited record store passing `SHA256_RE` can still force an overwrite, so the floor reduction is oversold" | The reduction's own wording scopes itself to validation failure, and a user hand-editing **their own** store to match **their own** bytes has authorized that overwrite. (Raised twice, by two lenses.)         |
| L-floor | "backup-precedes-overwrite is stated as an unqualified guarantee on every user-facing surface"  | The advisory label P0 requires already exists at the surface P0 targets (`src/lib/backup.ts:12-15` states it is "deterministic control flow demonstrated by a test, NOT a floor primitive").                     |
| L-trust | "Untrusted product-command basenames now reach a write without `COPY_FILENAME_RE`"              | The write is contained as written — `safeJoin` + `assertNoSymlinkPath` run immediately before the copy, and the source side skips symlinks.                                                                     |
| L-floor | "`update` records the SOURCE hash, so 'records describe what landed' is false"                  | Substantively refuted (copyFileSync makes them equal) — **but see below**: the same observation was raised by two other lenses as a **plan-fidelity** gap, and on that narrower ground it was right. **FIXED.** |

## Remediation applied (all within the plan's declared `## Files`)

Every confirmed finding was fixed before this review was filed, and each fix was **verified by the same
mutation technique that proved the defect** — re-introducing the defect now fails a test:

| Finding                              | Fix                                                                                                                     | Mutation re-check                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| A3 partial-failure untested          | A real mid-loop failure test (symlinked hook dir) asserting the already-written files ARE recorded and the stamp still matches | Deleting the block → **1 failed** ✅            |
| (d) layout pin vacuous               | A `pharn`-layout clone fixture; the config must record `pharn`                                                            | Dropping `layout,` → **1 failed** ✅            |
| Migration warning untested           | Same fixture asserts the warning and the surviving flat tree                                                             | covered by the above                            |
| records-before-config untested       | Asserted by CONSEQUENCE (config write forced to fail → records still describe disk), since ESM forbids spying `writeFile` | —                                              |
| `readDiskState` ENOTDIR crash        | `lstatSync` wrapped; ENOTDIR → the named `unreadable` skip                                                               | Removing the catch → **2 failed** ✅            |
| A5 ancestor symlinks                 | `hasSymlinkComponent` checks every component below the clone root, in `addDir` **and** the docs loop                     | new fixture tests                              |
| Backup leaf-only symlink check (m5)  | `assertNoSymlinkComponent` in `createBackup`, mirroring `applyWrites`                                                    | new test                                       |
| Partial-failure store minting (m11)  | The catch now requires `records !== null`, matching `add`'s "never mint a store" rule                                    | new test                                       |
| **Source-vs-dest hashing**           | `update` now re-reads the DEST after the copy (`buildRecords(cwd, written)`) instead of carrying the clone's source hash | —                                              |
| **Unauthorized `package.json` edit** | My JSON round-trip had re-encoded the `description`'s em-dash as `—`; restored, version-only diff                    | `git diff package.json` is now 1 line          |

Floor after remediation: **`npm run check` GREEN, 544 tests** (up from 534), `lint:md` clean.

## Unverified (the 10-verification cap) and minors — NOT fixed, recorded for the human

5 non-minor findings went unverified, and 14 minors were not adjudicated. The substantive ones the
build agent judged worth naming rather than silently dropping:

- **`install-records.ts` owns two axes (P3):** the store **and** capability-directory addressing
  (`capabilityRecordPaths` re-implements the role→subtree ternary that already exists in three other
  files). A real P3 smell; deferred rather than fixed, because moving it touches
  `install-capabilities.ts`, which the plan puts out of scope.
- **`hash.ts` is not yet canonical:** `lib/diff.ts` still carries its private duplicate, since `diff.ts`
  is out of scope. The follow-up is a one-line import swap.
- **`capabilityRecordPaths` records whatever is in the capability directory**, not strictly what the
  copy wrote — a pre-existing stray file there would be recorded as pharn's.
- **The two trusted-doc reconciliations are still live falsehoods in the shipped tree**
  (`LIMITS.md §1b`, `THREAT-MODEL.md §4c` both say pharn stores no per-file content-hash). Correctly
  left to the human — those files are hook-protected and agent-uneditable — but they are false **now**,
  not later. Flagged at the gate.
- **Minor report-surface gaps:** the `UNRECORDED` / `UNREADABLE` headings and the `forced` counter in
  the outro are asserted by no test; the skip-label `switch` in `update.ts` is non-exhaustive with a
  wrong-by-default fallback.

## Proposed lesson for canon (NOT written here — `/pharn-dev-review` may not write memory-bank)

> **Candidate:** _A test whose fixture fails earlier than the code path it names is worse than no test —
> it reads as coverage while proving nothing._ In this increment a test titled "cleans up the clone and
> exits 1 when the apply fails mid-run" died in `readDiskState` (ENOTDIR) and never reached
> `applyWrites`; the untested block survived a deletion mutation with the suite green. **Detection that
> works:** delete the block the test claims to cover and re-run — if the suite stays green, the test is
> decorative. Provenance: increment `update-drift-safe`, `REVIEW.md` finding 1, confirmed by coverage +
> deletion mutation + instrumentation.

Promotion requires a separate human-gated `/pharn-dev-memory-promote` run (`check-provenance` + accept/deny).
The model never self-promotes (P2).

## VERDICT

**GREEN — 0 outstanding floor-gate findings** (1 blocking finding was raised, confirmed by mutation,
and **fixed**; 5 further confirmed findings, including one real crash bug, also fixed and
mutation-verified).

This is not a statement that the increment is correct — it is that the four lenses' blocking findings
are closed and the deterministic gates are green. The unverified/minor findings above are open, and
the review's own coverage was capped at 10 verifications.
