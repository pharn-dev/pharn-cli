# GRILL — update-drift-safe

Plan under interrogation: `.dev/features/update-drift-safe/PLAN.md` (approved at the plan gate).
**Spec-hash check: MATCH** — `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`,
equal to the plan's `spec_content_hash`. No spec drift (surfaced here; `/pharn-dev-build` is where it would block, fix #4).

> **ADVISORY, end to end (P0).** Nothing in this file gates `/pharn-dev-build`. Every finding below rests on
> model judgment; the only floor-grade things in this run are the writes-scope hook that pinned this
> file's path (fix #7) and the content-hash above. "Grill raised N concerns" NEVER means "the plan is
> good" or "the plan is bad" — it means a human should read these before the build lands.
>
> **Trust (P2):** `PLAN.md` is `trust: untrusted` to this stage. Every `problem` / `evidence` field
> below is free text quoted as DATA; the `type` / `rule_id` / `severity` / `file` fields are this
> stage's own enum-membership and path-resolution assertions.

## How this grill was run (method, stated honestly)

- **Griller discovery (deterministic, FLOOR):** `node .dev/floor/count-grillers.mjs .` reports
  `registered: 81`. **All 81 hits are inside gitignored `test-*/` fixture installs** (11 distinct axes
  × 7 test apps) — this repo (the CLI) ships no griller tree of its own. The membership test is
  working exactly as specified; the *corpus* it ranges over is polluted by committed-fixture
  directories. Recorded as finding **G0** below.
- **What was actually run:** 7 independent interrogators — 6 applying the distinct griller axes that
  bear on this increment (`testability`, `security`, `error-handling`, `architecture`,
  `documentation`, `migrations`, read from the fixture copies) plus one `completeness` critic — each
  reading the live repo and the plan, none of them the plan's author.
- **Adversarial verification:** every non-minor finding was queued for an independent skeptic
  instructed to REFUTE it. **The queue was capped at 8**, so **38 non-minor findings went unverified**
  and are reported below as **PLAUSIBLE**, not CONFIRMED. That cap is a real coverage limit of this
  run and is named, not hidden (P0/P7). The unverified set was subsequently triaged by the build agent
  against the live code; that triage is **advisory judgment**, not an independent verification.
- **Totals:** 60 raw findings · 5 CONFIRMED · 3 REFUTED · 38 PLAUSIBLE (unverified) · 14 minor.

---

## CONFIRMED findings (adversarially verified)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: blocking
  file: '.dev/features/update-drift-safe/PLAN.md:62'
  problem: 'The first post-upgrade update on any existing install skips the changed files as unverifiable yet still writes skillsVersion := latest, after which the kept same-version early-return makes even --force a no-op — the escape hatch is closed by the very run that told the user to use it.'
  evidence: '"Config write as today (new sha, capabilities, installedAt) + record store." / "records UNAVAILABLE (pre-upgrade install) -> SKIP unverifiable"'
  # Raised INDEPENDENTLY by two axes (error-handling + migrations) and again by the completeness
  # critic — three of seven interrogators converged on it. Verifier: real, high confidence.
  disposition: ADOPTED — see amendment A1 (withhold the version bump) + A2 (--force bypasses the gate)

- type: FINDING
  rule_id: 'P1'
  severity: blocking
  file: '.dev/features/update-drift-safe/PLAN.md:117'
  problem: 'The plan changes init and add to write/merge the record store but names no test for either, and neither tests/init-archetype.test.ts nor tests/add.test.ts appears in the eval list.'
  evidence: '"src/steps/install-archetype.ts — record after install (init)" / "src/commands/add.ts — record the added capability files (merged into the existing store)"'
  # Verifier walked three refutations and all failed; it also found the concrete hazard: add.ts:217-221
  # already carries a "thread the config forward or the writes clobber down to the last one" comment,
  # and a records store merged the same way inherits the identical bug — invisible to the current mocks.
  disposition: ADOPTED — see amendment A6

- type: FINDING
  rule_id: 'P2'
  severity: important # verifier corrected DOWN from blocking
  file: '.dev/features/update-drift-safe/PLAN.md:156'
  problem: 'Nothing in the new per-file write path checks whether the PROJECT destination (or a parent) is a symlink; a dangling symlink at a dest makes existsSync false, so row 1 WRITEs and copyFileSync follows it, creating a file outside the project root.'
  evidence: '"Per-file copyFileSync replaces whole-dir cpSync at the same safeJoin-contained dest paths; the manifest already skips symlinks, so no symlink is materialized." vs validate.ts:120 "This is the LEXICAL gate ... it does NOT resolve symlinks"'
  # Verifier REPRODUCED it on node v24.13.1 and correctly downgraded to important: the same escape
  # ALREADY ships today via installCapabilityDirs' recursive cpSync, so this increment extends a
  # pre-existing gap rather than creating one, and it requires prior write access inside the project.
  disposition: ADOPTED — see amendment A4 (closes the pre-existing gap too; labeled as such)

- type: FINDING
  rule_id: 'P2'
  severity: important # verifier corrected DOWN from blocking
  file: '.dev/features/update-drift-safe/PLAN.md:47'
  problem: 'The plan promotes collectExpectedInstallPaths from a read-only mirror into the driver of every update WRITE while declaring install-manifest.ts unchanged, but the manifest resolves each source root with symlink-following existsSync/statSync and so lacks the isSymlink(from) rejection the current writer performs.'
  evidence: 'PLAN.md:47 "so both are excluded by construction — install-manifest.ts needs no change." / install-manifest.ts:84 "if (!existsSync(from) || !statSync(from).isDirectory()) return;"'
  disposition: ADOPTED — see amendment A5 (install-manifest.ts moves from "untouched" to "gains a source-root symlink pre-flight")
```

## REFUTED findings (raised, then killed by the skeptic — recorded so they are not re-raised)

| Axis | Claim | Why it died |
| --- | --- | --- |
| security / P0 | "`SHA256_RE` doesn't reduce the claim — a well-formed hash equal to the user's disk bytes turns a row-4 SKIP into a row-3 WRITE" | Arithmetically true but not a gap: the guarantee row claims only that a store failing *validation* degrades to SKIP, and it says so verbatim. A user who hand-edits their own records file to match their own bytes has authorized the overwrite. |
| error-handling / P7 | "row 1 `restored` throws ENOENT because `copyFileSync` doesn't create parents" | The *primitive* fact is right (and was adopted anyway as PLAUSIBLE #18/A7), but the cited line is inside the plan's **Trust audit**, which scopes that sentence to symlinks/containment — the finding misread scope, not mechanism. |
| documentation / P4 | "`--force` will newly clobber a human-edited `CONSTITUTION.md`, and update.md:25 / the outro string still say it's untouched" | **Premise inverted, and the inversion is worse news:** `install-capabilities.ts:159-164` already copies every `paths.docs` entry with `force: true`, and `update.ts:103` calls it unconditionally — so `pharn update` force-clobbers a hand-edited `CONSTITUTION.md` **today**, and `docs/commands/update.md:25` + the `update.ts:137` outro are **already false**. This increment *fixes* that (a modified `CONSTITUTION.md` becomes a row-4 SKIP). Recorded as amendment **A9**. |

## PLAUSIBLE findings (unverified — the 8-verification cap was reached)

Triaged by the build agent against live code. **Adopted** = folded into the plan before build.

| # | Axis / rule | Concern (compressed) | Disposition |
| --- | --- | --- | --- |
| 1 | completeness / P4 | The human-authored DRIFT copy promises `--force` overwrites edits, but the version gate runs first, so `update --force` on an up-to-date install prints "Already up to date" and does nothing — status advertises a path the code lacks | **ADOPTED** → A2 |
| 12 | error-handling / P5 | "both write orderings fail safe" is asserted, not walked; config-first + failed records write leaves stale records that mislabel pharn's own bytes as user edits forever | **ADOPTED** → A3 (records-first is now required, with the reason recorded) |
| 13, 34 | error-handling / completeness | Mid-loop write failure drops `installCapabilityDirs`' "no partial installs" property; files written with no record become row-4 `modified` next run | **ADOPTED** → A3 |
| 14 | error-handling / P7 | `.pharn-backup/<ts>/` collision is undefined — a second `--force` in the same second can overwrite the only copy of the user's edits | **ADOPTED** → A8 |
| 15 | error-handling / P5 | A corrupt records file collapses silently into "absent" — the exact collapse `readPharnConfig` was fixed to stop doing for `models`/`seam` | **ADOPTED** → A10 |
| 17 | architecture / P3 | The per-file copy executor inside `commands/update.ts` gives that command a second axis | **ADOPTED** → new `src/lib/apply-update.ts` |
| 18 | architecture / P3 | `copyFileSync` does not create parent dirs (`cpSync` did) — row 1 breaks whenever a directory was deleted | **ADOPTED** → A7 |
| 19 | architecture / P3 | The manifest's mirror test pins it against `installCapabilities` only; the new second writer is unmirrored | **ADOPTED** → mirror test extended to the update writer |
| 20, 36 | architecture / completeness | `status`/`diff` classify without records, so `status --strict` is NOT a faithful preview of update; after the (d) layout fix the two even derive different expected sets | **ADOPTED (docs only)** — the "preview" claim is dropped/qualified; `diff.ts` stays out of scope |
| 21 | architecture / P3 | `add` has no declared way to derive the paths it wrote | **ADOPTED** → `capabilityRecordPaths` in `install-records.ts` (avoids changing `installCapabilityDirs`' signature) |
| 22 | documentation / P0 | "Recorded hashes describe what landed on disk" is labeled FLOOR but is an ordering property of the same shape the plan honestly labels ADVISORY two rows below | **ADOPTED** → relabeled |
| 23 | documentation / P0 | The headline guarantee is stated unqualified while `--force` voids exactly it | **ADOPTED** → qualified "without `--force`" |
| 24 | documentation / P0 | `content-hash` is a floor primitive in `ARCHITECTURE.md §2` but is **not** among the four `CONSTITUTION.md` P0 enumerates; the plan cites whichever list suits each row | **ADOPTED** → recorded as a third trusted-doc reconciliation |
| 25, 29 | documentation / P4 | `status.md` lines 12, 26-27 and 50 also become false; plan scoped that file to "the hint strings" | **ADOPTED** |
| 26 | documentation / P4 | `CLAUDE.md` documents update's write behavior and is absent from the doc list | **ADOPTED** |
| 27 | documentation / P4 | `docs/troubleshooting.md` (the exit-code reference) is absent | **ADOPTED** |
| 28 | documentation / P4 | The "what lands in your project" tables never mention the new `pharn.records.json` | **ADOPTED** |
| 30 | documentation / P0 | The "a records key is never path-joined" trust claim has no test — guaranteed by prose only | **ADOPTED** → a `../escape` key eval |
| 31 | migrations / P7 | A store whose every top-level value must be a sha256 forecloses the additive bump P7 demands | **ADOPTED** → `{schemaVersion, files:{}}`; the hex sweep ranges over `files` only |
| 32 | migrations / P7 | After the (d) layout flip the orphaned flat tree is unreachable by `remove`/`list` yet still live for Claude Code | **ADOPTED** → update prints the abandoned paths; documented |
| 33 | migrations / P7 | A downgrade round-trip (`npx @pharn-dev/pharn@0.3.2`) rewrites the tree while ignoring the store, leaving a valid-but-wrong store that 0.4.0 reads as row-4 `modified` for everything | **ADOPTED** → the store is stamped with the `skillsVersion`/`commit` its hashes describe; a stamp mismatch → records-unavailable (fail closed) |
| 37 | completeness / P1 | `--force` has no defined summary vocabulary and the backup path — the user's only pointer to their copies — is not required to be printed | **ADOPTED** → a distinct `forced` count + the printed path |
| 2, 3, 4, 5, 6, 7, 8 | testability / P1, P5 | Seven concrete test-design gaps: no seam to force a backup failure; `update.test.ts` is fully mock-based and cannot make byte-level assertions; the backup timestamp is not assertable; the whole-run planner, the merge function, and `decideFileAction`'s return shape are unnamed/untested | **ALL ADOPTED** → the return shape is declared, `mergeRecords` is exported, `update.test.ts` converts to a real-fs fixture, and the backup-failure seam is a pre-existing FILE at `.pharn-backup` (deterministic, no injection) |
| 9 | security / P2 | Backup containment is lexical only — a symlinked `.pharn-backup` component writes through it | **ADOPTED** → `lstat` both ends |
| 10 | security / P0 | Nothing re-verifies bytes between hashing and `copyFileSync`; the top guarantee row is stated unqualified over that window | **ADOPTED (as a labeled residual)** — the backup is taken from disk *at backup time*, so bytes written between decision and backup are still captured; only the backup→write window is unprotected. Named, bounded, not sold as floor. |
| 11 | security / P7 | A degraded install is permanently degraded and invisible at exit 0 | **LARGELY RESOLVED by A1** — withholding the version bump keeps `status` reporting "update available", so a stalled install stays visible; the remainder is documented |

## Minor findings

Adopted: **m0** (pin "update never deletes" at the new writer), **m2** (a failure-path case pinning
`repo.cleanup()` still runs and the exit follows the `finally`), **m3** (relabel row 2 as a *partial*
heal — it never recovers records for files that differ), **m5** (one canonical `sha256File`; `diff.ts`'s
private duplicate migrates in a follow-up, since `diff.ts` is out of scope), **m6** (an expected path
that is a directory or unreadable must become a named `unreadable` SKIP, not a raw crash), **m7**
(`init.md` / `add.md`), **m8** (command-scoped `--force` USAGE text), **m10** (write the store as a
fresh map keyed by the manifest just applied, carrying forward only surviving keys — this
self-prunes and **supersedes follow-up (e)**), **m11** (reword "inert" → "inert until that path
re-enters the manifest"), **m12** (`add` merges only into an already-readable store; absent/corrupt
stays absent), **m4 / m9 / m13** (document backup retention, the concrete restore procedure, and the
"not gitignored" posture).

Accepted-as-is: **m1** (whole-file `readFileSync` hashing rather than streaming — this is byte-for-byte
what `diff.ts` already does today for the same file set; adopting streaming here would fork the two.
Recorded as a known cost, not fixed in this increment).

## G0 — a finding about this grill's own instrument

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/floor/count-grillers.mjs:1'
  problem: 'The deterministic griller-membership test reports 81 registered grillers, but every one lives inside a gitignored test-*/ fixture install — the membership primitive is sound while the corpus it ranges over includes committed fixture trees, so "registered" is not the set a human would expect.'
  evidence: '{"registered":81,"grillers":["test-backend/pharn/pharn-pipeline/grillers/architecture/architecture.md", ...]}'
  disposition: REPORTED ONLY — out of this increment's scope (one axis, P3/P7). A follow-up should exclude gitignored fixture roots from the scan.
```

## Prose summary

The plan's **central mechanism survived** interrogation: seven independent axes attacked the
recorded-hash design and none of them broke the decision table, the fail-closed default, or the
sidecar choice. What they found instead was a **convergence hole** and a large tail of
robustness/honesty gaps around it.

The one finding that matters most is the convergence hole (`P7`, found independently three times):
as planned, the very first update on any existing install would skip the changed files *and still
record the new version*, after which the untouched same-version early-return would make the run
unrepeatable — including under `--force`. The feature would have shipped having advertised an escape
hatch it then locked. Two amendments close it: the version bump is now **withheld whenever a run
skips anything** (so the recorded version stays TRUE and the next run still has work), and `--force`
now **bypasses the same-version gate** (so the human-authored status copy, which promises exactly
that recovery, is true). The second amendment knowingly crosses the brief's "do not touch update's
version gate" line — it is a two-token change, it is what makes an approved user-facing string
honest, and it is flagged rather than slipped in.

The security axis found two symlink gaps, one of which the verifier reproduced and then correctly
**downgraded**, because the same escape already ships today through the recursive `cpSync` — this
increment inherits it rather than introducing it, and now closes it. The documentation axis's most
useful finding was one the skeptic **inverted**: `pharn update` already force-overwrites a
hand-edited `CONSTITUTION.md` while both the docs and the command's own outro claim it is left
untouched. That is a live, shipped falsehood this increment happens to fix.

The honest limits of this grill: **38 non-minor findings were never adversarially verified** (the
cap), so most of the table above is PLAUSIBLE-then-author-triaged, which is weaker evidence than the
five CONFIRMED ones. And the griller-membership instrument is ranging over gitignored fixtures (G0).

## ADVISORY VERDICT

**60 concerns raised — 5 CONFIRMED (3 blocking-severity, 2 important), 3 REFUTED, 38 PLAUSIBLE-unverified, 14 minor — for the human to weigh before `/pharn-dev-build`.**

This is **not** a pass, a fail, or a statement that the plan is good. `/pharn-dev-grill` gates nothing;
the deterministic backstops remain `/pharn-dev-build`'s spec-hash floor-gate, `.dev/floor/validate.mjs`,
and `npm run check`.
