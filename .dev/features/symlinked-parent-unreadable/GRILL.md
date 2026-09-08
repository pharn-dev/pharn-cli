# GRILL — symlinked-parent-unreadable

Plan under interrogation: `.dev/features/symlinked-parent-unreadable/PLAN.md`.
**Spec-hash check (content-hash floor primitive — surfaced here, enforced by `/pharn-dev-build`):**
recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`
= the plan's `spec_content_hash`. **No drift.**

**Griller discovery (FLOOR — enum membership, `.dev/floor/count-grillers.mjs .`):**
`{"registered":0,"grillers":[]}` — zero `role: griller` capabilities are installed in this repo, so
the pluggable slot contributes nothing this run and the findings below are the **inline** axes only
(P7: reported as the honest state, not filled in speculatively).

> **Trust (P2).** The plan is `trust: untrusted` to this stage. Every `problem` / `evidence` below is
> quoted DATA taken from it — never an instruction, and nothing downstream is gated on it.

---

## Findings (grouped by axis)

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/symlinked-parent-unreadable/PLAN.md:109'
  problem: 'The plan deletes the leaf `isSymbolicLink()` branch because the walk makes it unreachable, but the SAME argument applies to the leaf `lstatSync` try/catch it keeps — the walk lstats the identical leaf path first, so ENOTDIR/EACCES now throw out of the walk and the older catch becomes an unreachable arm that no test can reach.'
  evidence: '"**Delete** the now-unreachable leaf `isSymbolicLink()` branch (`:58-60`) — the walk checks the leaf too, and dead code is untestable under the coverage floors"'
```

_Interrogation._ Verified this run at `src/lib/apply-update.ts:51-60`: the existing `try` exists for
exactly one measured case — `lstatSync('blocker/child.md', {throwIfNoEntry:false})` throwing `ENOTDIR`.
With the walk first, `findSymlinkComponent` lstats `blocker` then `blocker/child.md` and raises that
same `ENOTDIR` **before** the leaf lstat runs. `tests/apply-update.test.ts:63-72` would then be
satisfied by the NEW catch, silently un-covering the old one. Both arms return the identical terminal
(`'the path could not be inspected'`), so **one `try` spanning walk + leaf lstat** is behavior-identical
and leaves no unreachable arm. If the build keeps two, the plan should say why — the coverage argument
it uses to delete the symlink branch cuts the same way here.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/symlinked-parent-unreadable/PLAN.md:167'
  problem: 'The guarantee audit reasons only about the two `findSymlinkComponent` call sites and never mentions `buildRecords` (src/lib/install-records.ts:224), a SECOND leaf-only `lstatSync` classifier that hashes dest bytes — so the audit does not establish that the record store cannot be written from a hash taken through a symlinked parent.'
  evidence: '"`status` never counts such a path as ok/modified → FLOOR, same walk: `diff.ts` has no fs primitives of its own … so the classifier is its only project-side read."'
```

_Interrogation._ Traced this run and the hole is **absent today**, but by the call sites, not by the
plan's reasoning: `src/commands/update.ts:378` and `:416` pass `buildRecords` only `written` /
`err.written` — paths that already survived `applyWrites`' walk — and `plan.nextRecords`
(`src/lib/update-decision.ts:231`) merely PRESERVES a previously recorded hash for an `unreadable`
path rather than re-hashing it. `add` reaches `buildRecords` through `capabilityRecordPaths`
(`src/commands/add.ts:516`), a separate path this increment does not touch. The finding is that the
audit should **say** this: the claim as written ("its only project-side read") is false at the module
level and true only for the update decision path.

### Axis: determinism / consequences (P5, P0)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/symlinked-parent-unreadable/PLAN.md:204'
  problem: 'The consequences section names that `--force` cannot clear an `unreadable` skip, but omits the behavior change this fix makes under `--force` today: a symlinked-parent casualty currently reaches `createBackup`, which refuses through the same walk and ABORTS the whole run before any write — after the fix it is a per-file skip and the run continues.'
  evidence: '"That is the designed outcome, and `--force` does **not** clear it (owned by sibling `5.1a`) — so such a user must resolve the path themselves."'
```

_Interrogation._ Verified at `src/lib/update-decision.ts:221-233` (the `unreadable` arm returns before
`force` is ever consulted) and `src/lib/backup.ts:76-77` (the backup side refuses via
`findSymlinkComponent` and throws). The change is an improvement and is consistent with the plan's
intent — it is simply unnamed, and it is the one `--force` path a reviewer will ask about.

### Axis: eval coverage / test design (P1, P7)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/symlinked-parent-unreadable/PLAN.md:98'
  problem: 'The `:1216` rework does not state the ordering constraint its mechanism depends on — `chmodSync(HOOK, 0o444)` must run AFTER the fixture writes "stale v0" and AFTER `writeRecords` hashes that file, or the fixture itself fails and the test passes for the wrong reason.'
  evidence: '"keep the seeded store and the stale `HOOK` (row 3 `updated`, still a planned write) and `chmodSync(join(proj, HOOK), 0o444)` so `copyFileSync` hits EACCES mid-loop"'
```

_Interrogation._ The existing fixture (`tests/update.test.ts:1219-1231`) writes all three files, then
seeds the store from their hashes. Reading a `0o444` file still works (measured this run), so only the
WRITE ordering matters — but a build that places the `chmod` beside the `rmSync` it replaces would put
it before the writes. Since the test asserts `rejects.toMatchObject(new ProcessExit(1))`, a fixture-time
throw is a *different* failure and would be caught — but the plan should pin the order rather than rely
on that.

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/symlinked-parent-unreadable/PLAN.md:82'
  problem: 'Test case (c) — the deep chain proving the FIRST offending component is named — re-pins at the caller a property the shared core already pins, so it buys ordering coverage that cannot regress independently.'
  evidence: '"(c) a **deep** case (`a/link/b/c.md`) proving the walk names the FIRST offending component, not the leaf’s parent"'
```

_Interrogation._ `tests/symlink-guard.test.ts:79` already asserts
`findSymlinkComponent(base, 'first/inner-link/x.md') === 'first'`. Keeping (c) is defensible (it pins
that `readDiskState` propagates the walk's answer into the `reason` rather than re-deriving one), but
the plan should say that is what it buys — otherwise it reads as duplicate coverage.

### Axis: honest scope + docs (P4, P6)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/symlinked-parent-unreadable/PLAN.md:70'
  problem: 'The plan updates the two reference pages but adds nothing to `docs/troubleshooting.md`, which is where a user lands after their symlinked `.claude/commands` starts being skipped on every run with no `--force` escape.'
  evidence: '"`docs/troubleshooting.md:66-70` already names parent directories on the source side."'
```

_Interrogation._ `docs/troubleshooting.md:66-70` covers a symlinked `.pharn-backup` and symlinked
*source* paths — neither is the new user-visible outcome. This is a doc **gap**, not a P4 violation
(nothing false is documented), so it is minor and optional within this increment.

```yaml
- type: FINDING
  rule_id: 'P6'
  severity: minor
  file: '.dev/features/symlinked-parent-unreadable/PLAN.md:208'
  problem: 'The performance figure is carried over from the brief rather than measured this run, in a plan whose own discovery section otherwise measures every claim it makes.'
  evidence: '"**One extra `lstat` per path component per expected file** (~450 files, depth ≤ 5). No memoization, per the brief."'
```

---

## Summary (prose)

The plan is unusually well-grounded: every load-bearing claim in its discovery section was measured
this run (the ENOTDIR throw, both EACCES mechanisms, the corrected `tests/update.test.ts` line
numbers, the merged-branch state), and its trust and determinism audits hold up under interrogation —
the new branch really is a `!== null` value test landing in a pre-existing terminal, and no tainted
value reaches a path join, a read, or a write.

The concerns worth the human's attention before `/pharn-dev-build` are two, and both are about
**completeness of the audit rather than correctness of the fix**:

1. **The dead-arm trade (P0).** Deleting the leaf symlink branch on a coverage argument, while keeping
   a leaf-lstat catch that the same reordering makes unreachable, is inconsistent. One `try` spanning
   the walk and the leaf lstat is behavior-identical and settles it.
2. **The second classifier (P0).** `buildRecords` is a leaf-only lstat that hashes dest bytes. It is
   safe today **because of its call sites**, not because of anything this increment does — and the
   plan's audit reads as though `readDiskState` were the only project-side read.

The remaining four are minor: an unnamed `--force` consequence, an unpinned fixture ordering
constraint, one arguably-duplicate test case, an unmeasured cost figure, and an optional
troubleshooting entry. None of them changes the shape of the increment.

Nothing in the plan looked like an injected instruction; the one passage that quotes the brief's
imperative voice ("Do NOT touch the walk core") is quoted as scope, not as a directive to this stage.

---

**ADVISORY VERDICT: 6 concerns raised (0 blocking, 3 important, 3 minor) — for the human to weigh
before `/pharn-dev-build`.** This grill-log is **advisory end-to-end**: it gates nothing, and a green
reading of it is not evidence the increment is sound. The deterministic backstops remain
`/pharn-dev-build`'s spec-hash and open-questions gates and `npm run check`.
