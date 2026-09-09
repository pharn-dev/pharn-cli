# REVIEW — lock-before-fetch

PHARN reviewing PHARN. Increment: move the single-writer lock acquisition ahead of the pharn-oss
tarball download in `add` (both paths) and `update`; deliberately decline the same move in `init`.

**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN** (0 capabilities checked — this
increment adds no markdown capability). `npm run check` green; `/pharn-dev-verify` `PASS`;
`/pharn-dev-regress` `no-regressions`.

> **Trust (P2).** The reviewed increment is `trust: untrusted`. The `problem` / `evidence` fields
> below inherit that tag and are quoted DATA.

---

## L-floor → P0 (the governing lens)

The increment makes four claims. Each was checked for a floor reduction or an `advisory` label.

- *"a refused `add`/`update` performs no tarball download"* → **floor: control flow.**
  `withProjectLock` throws before `fn` runs and `fetchRepo` is lexically inside `fn`; pinned by three
  `expect(fetchRepo).not.toHaveBeenCalled()` cases against real directories.
- *"the lock is released on a failed fetch"* → **floor: `try/finally`** in the untouched
  `withProjectLock`, now actually reached because the fetch re-throws instead of calling
  `process.exit` (which skips `finally`). Pinned by three `.pharn.lock` absence assertions.
- *"the added hold is bounded"* → **floor: two primitives, and the increment names both** —
  `AbortSignal` timeouts in `repo.ts` (8 s resolve, 60 s download) for the network phase, and
  entry/byte caps for the extraction. The grill flagged that the plan attributed the whole bound to
  timeouts; the shipped comments and CHANGELOG name both. Resolved.
- *"the lock is released on a signal"* → **correctly NOT claimed.** There is no signal handler; a
  `SIGKILL`ed holder still never releases, and `STALE_MS` remains the backstop. The increment widens
  the window in which a `SIGINT` strands a lock (the hold is longer), and that is stated rather than
  papered over.

One claim was **struck during planning and stayed struck** — worth recording because it is the exact
shape of the disease:

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'CHANGELOG.md:36'
  problem: 'The audit asked for "a refusal costs zero round-trips", which is false for `update` because fetchRemoteSkillsVersion precedes the lock; the increment ships the weaker true claim instead and pins it with an assertion that the call DID happen.'
  evidence: '"what this closes is **the tarball download**, not every round-trip"'
```

Advisory, and already handled: the honest wording is in the code comment, the CHANGELOG, and a test
(`expect(fetchRemoteSkillsVersion).toHaveBeenCalledTimes(1)`) that fails if someone later "fixes"
the wording upward without moving the lock. No blocking L-floor finding.

## L-eval → P1

Every behavioural change ships a test in the same increment. The increment adds **9** cases (1132
total, up from 1129 before this stage's additions): 4 ordering pins, 3 release-on-failure pins, and
2 in `update.test.ts` for the confirm-outside-the-lock invariant.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/commands/add.ts:171'
  problem: 'The narrowing this increment introduces — an unknown capability name now reports the held lock instead of listing valid addresses — is documented in a code comment but has no test asserting which errors survive the lock and which do not.'
  evidence: '"under a held lock `pharn add bogus` now reports the lock rather than listing the valid addresses"'
```

Advisory. The boundary is real and was surfaced by the grill (P5 finding). What IS pinned is the
side that matters most: the errors decidable **without** the clone — a legacy config, a malformed
address, a non-TTY picker invocation — still win, and existing tests cover each. What is not pinned
is the negative case (that `add bogus` under a held lock says "locked"). Worth a follow-up case;
not worth reopening the plan.

## L-trust → P2

No new untrusted ingest. The increment reorders existing steps; `fetchRepo`'s network guards, every
`safeJoin`, and every symlink guard keep their relative order and their content. No guaranteed
decision rests on a free-text field anywhere in the change.

One behavioural side effect was checked rather than assumed: moving the proxy notice inside the lock
means a lock-refused run no longer prints it. That is strictly less output and suppresses no error —
the notice explains a fetch that will not occur.

Nothing in the reviewed artifacts read as an instruction to this reviewer, and no instruction-looking
content changed behaviour. No blocking L-trust finding.

## L-axis → P3

Each command file changes for exactly one reason (where its lock is acquired). No command imports a
sibling command. `src/lib/project-lock.ts` is untouched, as the hard constraint required.

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/project-lock.ts:203'
  problem: "withProjectLock's doc-comment still says call sites acquire after their last prompt and after the network fetch, which is now wrong for add and update — and was already wrong for add's picker before this increment, since groupMultiselect has always run inside the lock."
  evidence: '"Call sites acquire AFTER their last prompt and after the network fetch"'
```

Advisory, and **deliberately not fixed here**: the file belongs to the sibling P-10 PR, and the
human is carrying the one-line correction across. Recorded so it is not lost between the two PRs.

---

## Out-of-scope defect found during this work (recorded so it does not evaporate)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/commands/init.ts:137'
  problem: 'confirmWriteTargets reads the destination at prompt time while runInstallArchetype writes later with no lock held in between, so a concurrent writer landing in that window makes the overwrite warning the human answered stale — they can approve a file list that no longer describes the tree.'
  evidence: "const overwrite = action === 'install' ? await confirmWriteTargets(repo.dir, cwd, selection) : 'cancel';"
```

**This is a separate defect from P-9, and it is NOT fixed by this increment.** P-9 is a wasted
download; this is a correctness hole in the prompt→write window. It was found while reasoning about
whether to move `init`'s lock, and it is the strongest argument *for* moving it — which is precisely
why it is recorded rather than quietly used as justification. The human's GATE-1 decision was to keep
`init` unchanged and log this separately; holding the lock across two open-ended prompts is not
obviously the right fix for it, and choosing a fix deserves its own plan.

## Summary and gate split

- **floor-gate (blocking): none.** No P0 guarantee lacks a reduction or an `advisory` label; no eval
  binding is missing that the floor disagrees with; no sibling reference exists.
- **advisory (warn): 4** — one struck-claim record (P0, minor), one untested narrowing (P1, minor),
  one stale doc-comment owned by another PR (P3, minor), and one out-of-scope correctness defect
  (P0, important) that this increment deliberately does not fix.

The increment does what it says, states the saving more narrowly than the audit asked for, and
declines one of the three call sites with the reason recorded in the code, in a test, and in the
CHANGELOG. The part most worth a second human opinion is the `init` decline — not because the
reasoning is weak, but because the out-of-scope defect above sits on the other side of the same
trade.

**This review is ADVISORY.** It gates nothing: the blocking verdicts in this chain are
`/pharn-dev-build`'s `validate` exit, `/pharn-dev-regress`'s `no-regressions`, and
`/pharn-dev-verify`'s `PASS`. Merge / fix / abandon is the human's call.
