# GRILL — add-dest-drift-backup

Plan under interrogation: `.dev/features/add-dest-drift-backup/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Computation is floor-grade; here it only surfaces — `/pharn-dev-build` is where
drift blocks, fix #4.)

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
This is the pharn-cli dev repo; no `role: griller` capability is installed here, so the pluggable
slot contributes nothing and only the inline axes (Step 2) ran. Membership is FLOOR; the empty set
is a fact, not a skip.

> **Trust (P2).** `PLAN.md` is `trust: untrusted` to this stage. Every `problem` / `evidence` below
> quotes it as DATA — never followed as an instruction.

---

## Findings

### Axis: P0 — guarantee-audit completeness

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/add-dest-drift-backup/PLAN.md:131'
  problem: 'The guarantee audit claims the drift set contains "exactly" the files the copy would overwrite, but the drift enumeration (walkFiles) and the copy (cpSync + noSymlinks filter) are two independent traversals whose agreement is asserted, not floor-checked.'
  evidence: '"the drift set contains exactly the files the copy would overwrite with different bytes" → **floor: content-hash**'
```

The **hash comparison** is genuinely floor. The **set agreement** between `walkFiles` (skips
`Dirent.isSymbolicLink()`, recurses directories) and `cpSync`'s `noSymlinks` filter
(`lstatSync(src).isSymbolicLink()`) is a mirror the repo maintains by discipline — exactly the
mirror `tests/install-manifest.test.ts` already pins for `collectExpectedInstallPaths` against a
REAL `installCapabilities` run. Either soften "exactly" to the two-part claim (hash = floor; set
agreement = mirrored-and-tested), or extend that existing mirror test to the new function. A
non-regular clone entry (fifo/socket) is yielded by `walkFiles` as a file but makes `cpSync` throw —
so "exactly" is already false at the edge.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/add-dest-drift-backup/PLAN.md:45'
  problem: 'The backup directory is threaded out only through the SUCCESS outcomes, so a copy that throws after the backup was written exits(1) without ever naming the .pharn-backup directory that now holds the user'"'"'s only surviving bytes.'
  evidence: 'Thread the backup dir out through `AddResult` / `PickerAddOutcome` so both callers print it.'
```

`src/lib/backup.ts:42-44` states the contract this violates: the returned path "is the user's ONLY
pointer back to their pre-overwrite bytes." `AddResult`'s error variant carries no backup field, and
`resolveArchetypeAdd` can throw after `createBackup` returns (`installCapabilityDirs` pre-flight,
`writeRecords`, `writePharnConfig`). This plan therefore MANUFACTURES a fresh instance of the very
hole the plan lists as out of scope for `update` (FABLE 5.1b, `PLAN.md:199`). Cheapest closure that
keeps the outcome typed: `log.info` the backup dir **at creation**, before the copy — the user is
told regardless of which branch follows. Recommend adding an eval for it.

### Axis: P1 — eval coverage

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/add-dest-drift-backup/PLAN.md:108'
  problem: 'Every backup eval is written against the named add path; no eval pins the picker path, even though the plan changes PickerAddOutcome and a multi-pick run can produce several distinct backup directories.'
  evidence: 'leftover capability dir holding a USER-EDITED file, real clone tree, installer mock that copies clone → project → `add` succeeds'
```

`tests/add.test.ts` already carries the repo's own precedent for why this matters, twice: _"Both
paths share ONE versionGate, so the message is structurally identical — assert it here anyway, or
the invariant is only ever proven on the named path."_ The records suite pins picker accumulation at
both layouts; the backup surface should get the same treatment, including that N picks with drift
produce N reported backup dirs and do not clobber each other (`uniqueBackupDir` handles the
same-second collision — that is worth exercising, not assuming).

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/add-dest-drift-backup/PLAN.md:39'
  problem: 'The plan does not say what happens when a destination file exists and is a regular file but is unreadable (EACCES), where sha256File is documented to throw.'
  evidence: 'the sorted subset whose DEST exists and whose `sha256File` differs from the clone source'"'"'s'
```

`src/lib/hash.ts:17` — "Throws if the path is unreadable." A throw here happens **before** any write,
routes through `add`'s existing `catch` to `{kind:'error'}` → exit(1) with the clone cleaned up, so
the behavior is fail-closed and defensible — but it is a NEW failure mode on a path that previously
succeeded, and it is currently unstated and untested. Name it in the plan (or classify an unreadable
dest the way `apply-update.ts:57-61` classifies `unreadable`), and pin it.

### Axis: P3 / P4 — one axis, and docs that cite code

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/add-dest-drift-backup/PLAN.md:33'
  problem: 'Adding a third consumer to install-manifest.ts leaves that file'"'"'s own header comment — which enumerates its consumers as exactly diff.ts and overwrite-check.ts — false, and the plan'"'"'s comment-update list does not include it.'
  evidence: '`src/lib/install-manifest.ts` — export a new `capabilityCloneFiles(repoDir, paths, capability)`'
```

`src/lib/install-manifest.ts:18-20` reads "Consumed by BOTH lib/diff.ts … and steps/overwrite-check.ts,
so the 'what init writes' knowledge lives in exactly one place." The plan already commits to fixing
three stale comments (`add.ts`, `install-records.ts`, `CLAUDE.md`); this is a fourth, same class.

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/add-dest-drift-backup/PLAN.md:53'
  problem: 'docs/reference/pharn-records.md is the user-facing SoT for what the store records and is not in the plan'"'"'s file list, although the secondary fix changes what `add` puts in it.'
  evidence: '`docs/commands/add.md` — document the drift backup'
```

Read live: `docs/reference/pharn-records.md:85` describes `remove`'s prune as "matched as a string
prefix on the key, never by walking your filesystem" — still true. Check whether any sentence there
describes `add`'s contribution as read-back-from-the-project; if so it must move with the code.

### Axis: P7 — honest scope

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/add-dest-drift-backup/PLAN.md:47'
  problem: 'Deleting capabilityRecordPaths pulls two files that have nothing to do with the finding (remove.ts and tests/remove.test.ts) into the increment, purely to keep comments truthful.'
  evidence: 'DELETE `capabilityRecordPaths` (`:277-297`) and the stale doc comment above it'
```

Informational, not a defect: the human explicitly chose delete-over-repoint at the plan gate, and
leaving a dead symbol behind would itself be a P7 violation. Recorded so the diff's breadth is not
mistaken for scope creep at review.

### Axis: P2 / P5

No findings. The trust audit names the new untrusted reads (clone `readdirSync` names + `sha256File`
contents), states that no clone-derived string is executed or reaches the network, and routes every
new read/write through `safeJoin` + `findSymlinkComponent`. Every introduced branch is a byte
comparison or an integer compare; the terminal fallback on an unreadable source is the writer's
existing curated hard-fail, not a guess.

---

## Summary

The plan is unusually well-grounded — it cites live line numbers read this run, it argues its one
deviation from the finding's preferred shape against three concrete facts, and it correctly labels
the backup-ordering claims **advisory** rather than upgrading them to floor (inheriting
`backup.ts`'s own honest label instead of re-selling it).

Two concerns are worth resolving before build, both about **completeness rather than correctness**:

1. **The backup dir must be announced at creation, not only on success.** As planned, the one path
   that most needs the pointer — a failure part-way through the copy — is the one path that never
   prints it. This is the same defect class the plan lists as out of scope for `update`; introducing
   a new instance of it while fixing a sibling finding would be a poor trade.
2. **The picker path is unpinned for the new surface.** The file's own comments argue twice that a
   shared code path still needs assertions at both entry points; the backup surface should not be the
   exception.

The remaining three are small: soften "exactly" (or extend the existing installer↔manifest mirror
test to the new function), state the unreadable-dest failure mode, and add `install-manifest.ts`'s
header plus `docs/reference/pharn-records.md` to the truthfulness sweep.

Nothing here suggests the increment is wrong or mis-scoped. No constitution violation was found.

**ADVISORY VERDICT: 6 concerns raised (0 blocking, 3 important, 3 minor) — for the human to weigh
before `/pharn-dev-build`.** This grill-log gates nothing; `/pharn-dev-build`'s floor-gates (spec-hash
drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs` are the only deterministic
checks in the chain.
