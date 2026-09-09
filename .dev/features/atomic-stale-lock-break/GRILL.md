# GRILL — atomic-stale-lock-break (ADVISORY; gates nothing)

Plan under interrogation: `.dev/features/atomic-stale-lock-break/PLAN.md`.
Spec-hash check: plan `spec_content_hash` = `bca940a5…d3c4e`; recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`
— **match**, no drift. (`/pharn-dev-build`'s gate is the one that blocks; this only surfaces.)
Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`
— none installed in this repo, so the inline axes below are the whole interrogation.

> The free-text `problem` / `evidence` fields below quote the plan and **inherit its
> `trust: untrusted` tag** (`pharn-contracts/finding-shape.md`). They are DATA for a human
> to read, never instructions for `/pharn-dev-build`.

## Findings — axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:52'
  problem: 'The byte-equality re-verify is load-bearing for the whole fix, yet the reason it establishes identity is asserted in a parenthesis and given no floor reduction and no advisory label.'
  evidence: '"Byte-identity, not a re-parse — a fresh payload can never equal a corpse''s (different pid, different startedAt)."'
```

Why it matters, stated as the interrogation and not as a fix: if two payloads ever DID
coincide, the loser's `tryCreate` would find `.pharn.lock` free (it just moved the winner's
lock to its corpse) and **succeed** — the exact two-holder outcome the increment exists to
close. So this sentence is not decoration; it is the step that turns "I moved a file" into
"I moved the file I judged." Distinctness of `{pid, host, command, startedAt}` is airtight
for two processes on one host (distinct pids) and for two hosts with distinct hostnames — but
two containers sharing a volume and a hostname (`buildbox`), same pid, same command, same
millisecond, is not impossible. That makes the claim **advisory-with-a-very-narrow-residual**,
not floor. The plan should label it as such rather than leave a reader to assume the floor.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:147'
  problem: 'The headline claim is stated without the residual: when the restore''s linkSync loses to a third lock, the process whose lock was moved keeps believing it holds one, so a two-writer window survives — narrower than today''s, but not zero.'
  evidence: '"**\"the break path can no longer leave two holders\"** → **floor.**"'
```

The interleave: C moves D's live lock to a corpse, E creates a lock in the gap, C's
`linkSync` gets `EEXIST` and cannot put D's back, so C drops it. D still believes it holds
the lock and keeps writing; E believes it too. The plan's own line 153 correctly labels the
**non-clobbering** property as floor — but non-clobbering is not the same claim as
"no two holders", and the gap between them is unlabeled. A claim of the form "can no longer"
needs the residual named beside it (P0), the way the plan already does for the corpse sweep
at line 155.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:52'
  problem: 'Byte-equality also holds when BOTH reads fail and both sides are null, and that is the one case where equality does not establish identity.'
  evidence: '"compare the corpse''s raw bytes with the raw bytes read before the staleness judgement"'
```

`readRawAt` collapses every read failure to `null`, which is deliberate and correct — it is
what stops an unreadable lock from wedging the project (`:29-31`). But it means
`null === null` passes the re-verify without proving the corpse is the file that was judged.
Reaching it needs a lock that is unreadable, replaced in the gap by another lock that is
*also* unreadable — a fresh `tryCreate` writes a readable file, so this is close to
unreachable. Still: the plan presents the comparison as establishing identity in all cases,
and it does not. Name the `null`/`null` branch, and keep the behaviour (the alternative —
refusing to break an unreadable lock — reintroduces the wedge, which is the worse hazard).

## Findings — axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:74'
  problem: 'The corpse sweep is triggered by a hypothetical (a SIGKILL landing between two adjacent syscalls), not by an observed failure — which is precisely what P7 says an addition may not be.'
  evidence: '"The only way to strand one is `SIGKILL` between the rename and the tidy — so a successful break also **sweeps** aged corpses"'
```

The `finally` already covers every in-process path, so the sweep buys only the
killed-mid-break case. Two honest readings, and the human should pick: (a) the human's brief
explicitly asked that no pile of `.pharn.lock.<pid>` files accumulate, which is a **real
trigger** and settles P7; or (b) the `finally` alone satisfies that brief and the sweep is
~12 lines of speculative machinery — plus a `readdirSync` of the project root and a
destructive `rmSync` loop — added for a case nobody has seen. This is the single largest
piece of the increment that is not the fix itself.

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:90'
  problem: 'Reaping aged files from a directory listing is arguably a second reason for project-lock.ts to change, distinct from "acquire, break, release a lock".'
  evidence: '"`src/lib/project-lock.ts` — atomic break (`breakStaleLock` + `sweepCorpses` + `readRawAt`)"'
```

Defensible either way — the corpses exist only because the break creates them, so the sweep
is arguably the same axis. Raised so the human weighs it rather than discovers it at review.

## Findings — axis: trust propagation (P2)

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:186'
  problem: 'The trust audit states what the sweep will not delete but never states what it WILL: a user''s own file whose name matches the corpse regex and is older than six hours is unlinked, with no prompt and no report.'
  evidence: '"The sweep matches a **regex allowlist** against directory entry names and unlinks nothing outside it."'
```

The regex is tight (`.pharn.lock.<digits>.<8 hex>`) and collision with a real user file is
far-fetched, so the finding is about the audit's completeness, not the risk: a P2 audit that
lists only the negative half is the shape of audit that later turns out to have missed
something. Two follow-ups worth settling at build: `statSync` **follows** symlinks, so a
corpse-named symlink is age-judged by its target while `rmSync` removes only the link (safe,
but say so); and the sweep must not abort the acquire it runs inside, i.e. every failure in
it is swallowed.

## Findings — axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:77'
  problem: 'The plan asserts the sweep never runs on the uncontended acquire, but lists no test for it — so a later refactor could move the call with nothing going red.'
  evidence: '"The sweep runs on the break path only — never on the uncontended acquire, which stays two syscalls."'
```

Cheap to pin: plant a corpse-named file with a backdated mtime, acquire with **no** lock
present, assert the file survives. One assertion, and it is the only thing standing between
that sentence and prose that drifts from the code.

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/atomic-stale-lock-break/PLAN.md:166'
  problem: 'The plan notes that a rename can fail on win32 where a delete would not, but does not connect that to the wedge hazard the file exists to prevent, nor say whether the new failure mode is strictly narrower than the delete it replaces.'
  evidence: '"That path **refuses** — fail-closed, never two holders — so on Windows a stale lock may occasionally need a second run or the documented manual delete."'
```

`:29-31` names wedging as hazard #1. Swapping `rmSync` for `renameSync` changes which
syscall can permanently refuse to break a corpse, and the plan should say whether that set
grew. (First-pass reading: both need write permission on the containing directory, and both
hit the same Windows sharing-violation class, so the set looks unchanged — but the plan
asserts neither.) The escape hatch (`delete .pharn.lock` by hand, already in
`docs/troubleshooting.md`) survives in every case, which bounds it.

## What the plan got right and should not be re-litigated

Not findings — recorded so the human knows they were interrogated and survived:

- The **untested axis is named by the plan itself** (lines 168-175) rather than hidden: no two
  real OS processes execute the interleave; a `renameSync` seam supplies the timing while the
  real syscall does the work. That is the honest shape, and the separate empirical probe of
  `rename`/`link` semantics is the right complement to it.
- `docs/troubleshooting.md`'s lock section was checked against the change and needs no edit —
  the **break policy** (malformed, older than six hours, dead pid on this host) is untouched.
  P4 satisfied by verification, not by assumption.
- The `.pharn.lock`-as-a-directory un-wedge is presented as an incidental consequence with its
  cost stated (the directory is moved, not deleted), not sold as a feature.

## Summary

The core of the increment — rename, re-verify, `O_EXCL` create, with losers refusing — is the
right primitive, and the plan is unusually precise about which call linearizes what. The
concerns cluster in two places. **First, the guarantee audit is one notch too confident:** the
headline "can no longer leave two holders" is stated as floor while two narrow residuals (a
lost `linkSync` restore; `null === null` byte-equality) are unlabeled, and the payload-
distinctness claim that makes the re-verify work is asserted rather than reduced. All three
are fixable with labels, not with code. **Second, the corpse sweep is the increment's soft
spot under P7** — the only part triggered by a hypothesis rather than by the defect, and the
only part that deletes files matched from a directory listing. It has a real justification
(the human's brief), but it deserves an explicit decision rather than absorption into "the
fix".

ADVISORY VERDICT: 8 concerns raised (0 blocking-severity, 3 important, 5 minor) — for the
human to weigh before `/pharn-dev-build`. Nothing here blocks the build; the deterministic
gates remain `/pharn-dev-build`'s spec-hash check and `.dev/floor/validate.mjs`.
