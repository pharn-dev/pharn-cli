# REVIEW — update-backup-dir-on-failure

Increment: carry the `--force` backup directory out of `applyUpdate` so `pharn update`'s failure
branch names `.pharn-backup/<timestamp>/` instead of exiting 1 with the pointer withheld.

## Step 1 — Floor first (P0)

`node .dev/floor/validate.mjs .` → **GREEN**, exit 0 (`0 capabilities checked` — this repo ships no
markdown capability, so the structural floor is vacuously green and gates nothing here). The
increment was entitled to reach review. Everything below this line is **advisory**.

## Floor-gate findings (blocking)

**None.** No guarantee lacks a floor reduction or an `advisory` label; no eval binding is missing; no
guaranteed decision rests on a tainted field; no sibling reference was introduced.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "tests/update.test.ts:1241"
  problem: "Of the two non-ApplyError post-backup throw sites the task named, only writePharnConfig is exercised directly; writeRecords is covered by class-proxy — it is the same plain-Error shape one line earlier, but nothing pins it."
  evidence: "it('names the backup directory when the CONFIG write is what fails', async () => {"
```

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "src/commands/update.ts:280"
  problem: "The untrusted failure text now prints immediately above the trusted backup path with no visual distinction, so a hostile upstream error message shaped like a backup path sits beside the real one at the exact moment the user is looking for a path to trust."
  evidence: "if (failure) reportFatal(errorMessage(failure.err), failure);"
```

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/commands/update.ts:609"
  problem: "src/commands/update.ts already carries both the apply orchestration and every line of report wording, and this increment adds a third print site to it without the file being split."
  evidence: "function printBackupNotice(backup: Backup, opts: { aborted: boolean }): void {"
```

All three are **advisory-gate**: each rests on reviewer judgment, and none is the sole basis for
blocking a guaranteed invariant. The `/pharn-dev-grill` run raised the P3 one against the plan; it is
repeated here because the built code confirms it rather than resolves it.

## The four lenses

### L-floor → P0

Clean. The increment's central claim — "the backup directory is printed whenever one was created, on
both paths" — is labeled **advisory** in `PLAN.md` and again in `VERIFY.md`, on the correct ground:
it is deterministic control flow demonstrated by tests, not one of the three floor primitives. That
is the same honest label `src/lib/backup.ts:13-16` already carries for its own ordering contract, and
the plan additionally strikes an overclaim of its own ("printing the directory guarantees the user
can recover" — it does not).

The one floor claim in play — that every backup read and write stays inside the project (`safeJoin` +
`lstat` + `findSymlinkComponent`) — is **cited, unchanged, and not re-derived**. `backup.ts` was not
touched.

Verified by reading, not assumed: every exit path reachable **after** a backup exists now names it.
The `refusal` exit cannot follow a backup (`refusal` is set in the branch where `applyUpdate` never
runs), `cancelAndExit` precedes the fetch, and the success path routes through `reportOutcome`. The
notice is therefore unconditional on the set of paths where it is meaningful — by construction of the
current control flow, which is exactly why the claim stays advisory rather than becoming floor.

### L-eval → P1

Seven assertions cover the increment, and the two grill findings about coverage were both folded into
the build: the config-write throw site and the success-path **stream** are now pinned, where the plan
as approved had neither. `plan.backups.length` survives at exactly one site — the `Backup`
construction — so the count can no longer be re-derived anywhere and drift from the directory it
describes.

Residual, recorded as the P1 finding above: `writeRecords` is covered as a class, not directly.

### L-trust → P2

The increment emits no findings, ingests no untrusted artifact, and the printed path is
`BACKUP_DIR` + a local `Date`, `safeJoin`-contained. The new branch tests `backupRef.current`, a value
assigned exactly once by a callback fired immediately after `createBackup` — never derived from the
error, never from free text. **No guaranteed decision rests on a tainted field.**

Nothing in the reviewed artifact attempted to instruct this reviewer. Worth recording for the same
reason a caught attempt would be: the **task description driving this increment was itself stale** —
it quoted `update.ts:188-209` and a raw `log.error`/`log.info` failure branch that PR 4 had already
replaced with `reportFatal`. Building from the quoted block rather than from disk would have produced
a wrong edit. Discovery (P6) is what caught it, which is the mechanism working as designed.

The P2 finding above is the honest residual of this change rather than a defect in it: taint now
reaches the human-facing render one line closer to a path the user is meant to trust. `LIMITS.md §2`
already names this class — bounded (nothing gates on it) but not zeroed.

### L-axis → P3

`src/commands/update.ts` imports from `../lib/*` only — **no command→command import** was added
(checked mechanically). `tests/update.test.ts` and `docs/commands/update.md` each stay on one axis.
The wording lives in one function reached from two call sites, so the success and failure paths cannot
drift into saying different things about the same directory — which is the structural point of the
change, not merely a tidiness one. The file-size concern is the advisory finding above.

## Verdict

**GREEN — 0 floor-gate findings, 3 advisory.** The increment is not blocked.

Advisory means advisory: this review is model judgment over an increment it treats as untrusted, and
the only guaranteed statement in it is the `validate.mjs` GREEN in Step 1. "Reviewed" here is not a
claim that the change is correct or wise — that is the human's call.

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is the gated path)

- **id:** `regress-capture-shell-word-splitting`
- **lesson:** A regress/verify gate that fails to *execute* is indistinguishable from a gate that ran
  and failed — both are exit `1` — so `check-regress.mjs` cannot fail closed on it. Capture the gate's
  **output** alongside its exit code and confirm the suite actually ran (an assertion count, a summary
  line) before trusting a symmetric base/head pair.
- **triggering failure (real, this run — P7):** the `/pharn-dev-regress` capture recorded `tests=1` at
  **both** base and head and was about to be reported as a pre-existing red. It was neither: the shell
  here is **zsh**, which does not word-split an unquoted parameter expansion, so the newline-joined
  file list reached `node --test` as a single argument and it exited 1 with
  `Could not find '<the whole list>'`. The suite never ran. Re-capturing with `git ls-files` expanded
  inline at each location gave `tests=0` / 748 assertions at both ends.
- **provenance:** increment `update-backup-dir-on-failure`; recorded in
  `.dev/features/update-backup-dir-on-failure/REGRESSION.md`; base
  `b12e6ac164eac942d8492a3bfbb41c927b071583`.
- **why it is canon-worthy and not a one-off:** it is a property of the **orchestration clock** the
  regress and verify stages both depend on, it recurs for anyone running those captures under zsh, and
  the floor helper is structurally unable to catch it — precisely the class of thing the memory-bank
  exists to carry forward.

This is a **candidate only**. `/pharn-dev-review` declares no `.dev/memory-bank/**` write and has not made one;
promotion is a separate `/pharn-dev-memory-promote` run behind `check-provenance.mjs` and a human accept/deny.
