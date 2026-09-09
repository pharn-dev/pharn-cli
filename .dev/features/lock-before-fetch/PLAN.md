# PLAN — acquire the project lock before the download, where no prompt sits under it

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Move the single-writer lock acquisition in `add` and `update` from after `fetchRepo`
  to immediately before it, so a run that will be refused pays zero network round-trips for the
  ~2.5 MB tarball — and deliberately DECLINE the same move in `init`, where the only place before
  the fetch is also before both of init's human prompts.
- layer(s): commands, tests, docs # ARCHITECTURE.md §4
- constitution_refs: [P0, P1, P3, P5, P6, P7]
- audit finding: P-9 (LOW, Dim C)
- hard constraint: `src/lib/project-lock.ts` is NOT touched (sibling PR, finding P-10, is hardening
  its stale-break path). Every change lives in the three command files, their tests, and CHANGELOG.

---

## The finding, verified against live source (P6)

The three cited pairs are real, at the cited lines, on `main` @ 377e1f5:

| file | `fetchRepo()` | `withProjectLock` |
| --- | --- | --- |
| `src/commands/add.ts` (named path) | 164 | 193 |
| `src/commands/add.ts` (picker path) | 261 | 288 |
| `src/commands/init.ts` | 94 | 147 |
| `src/commands/update.ts` | 212 | 255 |

The audit lists three sites; there are **four** — `add.ts` has two independent fetch/lock pairs
(the named path and the bare picker), and both must move or the command is internally inconsistent.

**What the audit did not name, and it matters:** `update` has an EARLIER network call than the one
cited. `update.ts:144` `fetchRemoteSkillsVersion()` runs before the confirm and before `fetchRepo`.
So "acquire before `fetchRepo`" does **not** make `update`'s refusal cost zero round-trips — it
makes it cost one small guarded GET (`redirect:'error'`, 8s timeout, 256 KB cap) instead of that
plus a 2.5 MB tarball. Closing that last round-trip would require acquiring before the confirm,
which is the prompt-under-lock hazard below. The plan does not close it, and says so rather than
overclaiming.

## Why the current placement is where it is (the decision this plan revisits)

The placement is not an oversight. `.dev/features/project-lock/PLAN.md` §"Where exactly the lock is
taken" and the doc-comment on `withProjectLock` (`src/lib/project-lock.ts:203-206`) both state it,
and give **two** reasons:

1. **Prompt-under-lock.** "Holding across an unanswered `confirm` would block an agent hook for as
   long as a human takes to answer, and a short held window is what lets `STALE_MS` stay short."
2. **Stranded lock on fetch failure.** "`update`'s fetch-failure path ends in `process.exit(1)` with
   **no** `finally`, so a lock taken before it would be stranded in the project root on every
   offline / rate-limited / DNS failure — the most common failure that command has."

Reason 2 is an **implementation detail, and this plan fixes it**: the fetch moves INSIDE
`withProjectLock`'s `fn`, its failure becomes a `throw` instead of a `process.exit(1)`, and
`withProjectLock`'s existing `finally { release(cwd) }` then runs. No new lock API is needed.

Reason 1 is a **real trade-off, and it is per-command** — it is what splits this increment.

## The split: two commands move, one does not

The deciding question is *what sits between `fetchRepo` and the first write*.

- **`update`** — the `confirm` (`update.ts:191`) is already **before** `fetchRepo`. Acquiring
  immediately before the fetch puts **no** prompt under the lock. Clean win. **MOVE.**
- **`add`, named path** — no prompt anywhere in the path. **MOVE.**
- **`add`, bare picker** — `groupMultiselect` (`add.ts:361`, inside `resolveAddPicker`) is **already
  inside** `withProjectLock` today. add's picker therefore *already* holds the lock across an
  unanswered human prompt — the doc-comment's "call sites acquire AFTER their last prompt" is
  already inaccurate for this one path. Moving the acquisition earlier adds the bounded download to
  a hold that is already unbounded; it is a change of **degree, not of kind**. **MOVE.**
- **`init`** — both prompts (`runArchetypeSummary` :129, `confirmWriteTargets` :137) sit
  **between** the fetch and the install. Neither can be hoisted above the fetch: the summary needs
  the parsed capability index from the clone, and `confirmWriteTargets` derives its target set from
  the clone's install manifest. So in `init` there is no "before the fetch, after the prompts"
  position at all — the only earlier slot is before **both** prompts. **DO NOT MOVE.**

### Why init is declined, stated as a trade and not as a dodge

Moving init's lock would convert a hold bounded by two `AbortSignal` timeouts into a hold bounded
only by human attention. Concretely: `init` hard-fails off a TTY, so it is **always** a human at a
keyboard; a human who walks away at the archetype summary would refuse every `pharn update` /
`add` / `remove` in that project for up to `STALE_MS` (6 h). That is a real, user-visible
regression traded for a LOW-severity saving on the one command whose concurrent-writer collision is
least likely — `init` is the bootstrap command, run once, interactively.

Named honestly (P7): a second writer racing `pharn init` still pays the full download before being
refused. P-9 is **partially** closed, deliberately, and the residual is recorded here rather than
quietly left as "fixed".

There is a genuine counter-argument, and it is recorded rather than hidden: `confirmWriteTargets`
reads the destination at prompt time while the install writes later, so today another writer can
land in that window and make the answer the human gave stale. Holding the lock from before the
fetch would close that. It is a **different defect** from P-9 (a correctness hole, not a wasted
download), it is not what this increment was scoped to, and the fix for it is not obviously "hold
across the prompt". Recorded as an open question below, not silently bundled.

## Files

- `src/commands/add.ts` — hoist both acquisitions above `fetchRepo`; fetch + gates + install move
  inside `fn`; the two fetch-failure `process.exit(1)`s become re-throws that preserve their
  spinner text — layer `commands`
- `src/commands/update.ts` — hoist the acquisition above `fetchRepo` (already after the confirm);
  same fetch-inside-`fn` restructure and re-throw — layer `commands`
- `src/commands/init.ts` — **comment only**: the lock stays at :147; record why the P-9 move is
  declined here so the next reader does not "fix" it — layer `commands`
- `tests/project-lock-commands.test.ts` — extend past today's `remove`-only coverage: pin that a
  held lock refuses `add` (named + picker) and `update` **without** any fetch — layer `tests`
- `tests/add.test.ts` — adjust the existing lock-wiring pin to the new order — layer `tests`
- `tests/update.test.ts` — pin that a fetch failure under the new order releases the lock — layer
  `tests`
- `CHANGELOG.md` — one Unreleased entry — layer `docs`

Deliberately **NOT** in `## Files`: `src/lib/project-lock.ts` (hard constraint — P-10's PR owns it).
Its doc-comment at :203-206 will be stale after this change ("acquire AFTER their last prompt and
after the network fetch"); that one-line correction is handed to the P-10 PR rather than creating a
conflicting edit in the same file. Also not in scope: `docs/troubleshooting.md` and
`docs/reference/pharn-records.md` — both describe *what* the lock does and *when it refuses*, not
*when it is acquired relative to the download*, so neither goes stale (checked this run, P6).

## The new order, per command (P5 — each step a deterministic local test, no guess)

**`init` — UNCHANGED, restated so the decision is explicit**

1. `showBanner()` / `intro`
2. `runGitPrereq()` — promptless local; the actionable "run git init" error still wins
3. TTY gate (`interactiveAllowed`) — before any network
4. `detectArchetypesFromProject`
5. proxy notice → `fetchRepo` (:94)
6. `minCliGate` → `parseCapabilityIndex` → `resolveCapabilities`
7. prompt: `runArchetypeSummary`
8. prompt: `confirmWriteTargets`
9. **`withProjectLock('init')`** (:147) → `runInstallArchetype`
10. `finally { repo.cleanup() }`; every exit after it

**`add` — named path**

1. `intro('pharn add')`
2. `loadArchetypeConfigOrExit(cwd)` — promptless local; the "re-run `pharn init`" error still wins
3. `parseCapabilityArg(arg)` — local arg validation; a malformed address must still be told it is
   malformed, not told the project is locked
4. **`withProjectLock('add')` ACQUIRE** ← moved here (was step 8)
5. proxy notice (now inside the lock — a refused run should not emit a warning about a fetch that
   will never happen)
6. `fetchRepo` — inside `fn`; on failure, stop the spinner with its existing text and **re-throw**
7. `minCliGate` → `versionGate` → `layoutGate` (the `??` chain is untouched)
8. `resolveArchetypeAdd` — drift scan → backup → copy → records → config
9. `finally { repo.cleanup() }` (inner) → lock release (`withProjectLock`'s own finally) → exit/outro

**`add` — bare picker**

1. `intro`
2. `loadArchetypeConfigOrExit`
3. TTY gate — the non-TTY usage error still wins, and still costs no network AND no lock
4. **`withProjectLock('add')` ACQUIRE** ← moved here
5. proxy notice
6. `fetchRepo` — inside `fn`, re-throw on failure
7. `minCliGate` → `versionGate` → `layoutGate`
8. `resolveAddPicker` — index parse → `groupMultiselect` (prompt under lock: PRE-EXISTING, unchanged
   in kind) → per-pick installs
9. inner `finally` cleanup → release → exit/outro

**`update`**

1. `loadArchetypeConfigOrExit` — promptless local; actionable error wins
2. TTY gate (skipped under `--yes`) — before any network, before the lock
3. `fetchRemoteSkillsVersion` — **still unlocked** (see the residual above)
4. same-version early return (unless `--force`)
5. `note` + `confirm` (skipped under `--yes`) — **still unlocked**
6. **`withProjectLock('update')` ACQUIRE** ← moved here (was step 9)
7. proxy notice
8. `fetchRepo` — inside `fn`, re-throw on failure
9. `minCliGate`
10. `applyUpdate` — plan → backup → writes → records → config
11. inner `finally { repo.cleanup() }` → release → exit

In all three, the lock acquisition slots **after** the command's promptless local step and **before**
its first network call — the same position `CLAUDE.md` pins for the TTY gate, and for the same
reason. No actionable error is displaced: a missing `.git`, a legacy config, a malformed capability
address, and a non-TTY invocation are all still reported as themselves, never as "the project is
locked".

## What the hold becomes, and what the refusal window becomes (stated honestly)

The lock **refuses, it does not queue**, so a longer hold is a wider refusal window — this is a
cost, not a free win.

| path | held today | held after |
| --- | --- | --- |
| `update` | `applyUpdate` only — local hash/plan/backup/write/persist | + `fetchRepo`: one 8 s-capped SHA resolve + one 60 s-capped 2.5 MB download + local extract |
| `add` named | `resolveArchetypeAdd` — local | + the same `fetchRepo` |
| `add` picker | index parse + **unbounded human multi-select** + N installs | + the same `fetchRepo` (already unbounded) |
| `init` | unchanged | unchanged |

**The bound is the whole argument.** The added hold is not "unbounded up to 60 s" — it is bounded
**by construction** at 8 s + 60 s + extraction, by the two `AbortSignal` timeouts already in
`src/lib/repo.ts` (`FETCH_TIMEOUT_MS = 8000`, `CLONE_TIMEOUT_MS = 60_000`). Typical is 1–5 s on a
working link. A human prompt has **no such bound**, which is exactly why the fetch may go under the
lock and init's prompts may not.

**Is the trade right? Yes, for `add` and `update`.** Today a legitimate second run waits out a write
(sub-second) and is refused; after the change it waits out a download too, so the refusal window
widens by seconds — bounded seconds. What it buys is not only the saved bandwidth the audit names:
it also removes a genuine race. Today two `pharn update`s can both complete their downloads, and
the loser discovers the lock only after paying for the clone; worse, the winner's write window and
the loser's fetch overlap, so the loser's clone is fresh but its refusal is late. Acquiring first
makes "who writes" decidable **before** either process spends anything.

**Where it is NOT right: `init`** — see above. Declined.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the audit finding P-9 is consumed as free-text DATA and its
  claim is re-verified against live source rather than trusted (see the table above; one
  discrepancy found). Cited, not restated (P4).

## Evals to write (P1)

- `add` named path, held lock → exit 1 with the refusal message, **and `fetchRepo` was never
  called** (the whole point — a spy/mock on the repo module records zero calls).
- `add` picker path, held lock → exit 1, `fetchRepo` never called, `groupMultiselect` never
  rendered.
- `update`, held lock → exit 1, `fetchRepo` never called; `fetchRemoteSkillsVersion` **was** called
  (pins the named residual as intended behaviour, not an accident).
- `update`, lock free, `fetchRepo` **throws** → exit 1 with the same message and spinner text as
  today, **and `.pharn.lock` is gone afterwards** (the stranded-lock regression the prior plan
  feared, pinned closed).
- `add` named, lock free, `fetchRepo` throws → same: exit 1, no lock left behind.
- `add`/`update` happy path → unchanged outcome, and no lock left behind (already covered; re-run
  under the new order).
- `init`, held lock → **unchanged**: the fetch still happens, the prompts still run, the refusal
  still arrives at the install. Pins the declined move so a later "consistency" refactor has to
  argue with a test.
- `remove` under a held lock → unchanged (existing cases in
  `tests/project-lock-commands.test.ts` must still pass untouched).

## Guarantee audit (P0)

- "a refused `add`/`update` performs no tarball download" → **floor: control flow** —
  `withProjectLock` throws before `fn` runs, and `fetchRepo` is lexically inside `fn`. Pinned by a
  test asserting zero calls on the repo module.
- "a refused `update` performs **no** network call at all" → **STRUCK.** False:
  `fetchRemoteSkillsVersion` precedes the lock. The true statement is "no *tarball* download". The
  test asserts the weaker, true claim.
- "the lock is released on every path — cancel, thrown fetch, refusal, success" → **floor:
  `try/finally`** in `withProjectLock` (unmodified), now reached on the fetch-failure path because
  that path re-throws instead of calling `process.exit`. Pinned by the "no lock left behind" tests.
- "the lock is released on a signal (SIGINT/SIGKILL)" → **advisory, and NOT changed by this
  increment.** There is no signal handler; a `SIGKILL`ed holder never releases. The existing
  stale-break path (age / dead-pid) is the backstop, and it is P-10's file, untouched here. A
  longer hold does widen the window in which a `SIGINT` strands a lock — named, bounded by
  `STALE_MS`, not zeroed.
- "no actionable error is displaced by the lock refusal" → **floor: statement order** in each
  command, pinned by the existing no-`.git` / legacy-config / bad-address / non-TTY tests, which
  must keep passing with the lock in place.
- "the added hold is bounded" → **floor: `AbortSignal` timeouts** (`repo.ts` 8 s + 60 s), not a
  promise about network conditions.
- "`init` is unchanged" → **floor: no behavioural edit**, only a comment; pinned by the `init`
  held-lock test above.

## Trust audit (P2)

No new untrusted ingest. The increment only **reorders** existing steps; `fetchRepo`'s guards
(`redirect:'error'`, timeouts, archive/entry/byte caps) and every downstream `safeJoin` /
symlink guard are untouched and still run in the same relative order to each other. One taint note:
moving the proxy notice inside the lock means a lock-refused run no longer prints it — that is
strictly less output, never a suppressed error, and the notice is advisory guidance about a fetch
that will not occur.

## Determinism audit (P5)

Every branch introduced or moved is a membership/identity test, unchanged in kind:
`err instanceof ProjectLockedError` routes to the refusal (no `PHARN_DEBUG` hint), everything else
routes to the boxed-failure path (hint offered). The `??`-chained `minCliGate → versionGate →
layoutGate` precedence is untouched and still evaluated inside the lock; no fallback ends in a
guess.

## Open questions (HALT)

1. **`init` — decline or move?** The plan declines (reason above). The alternative is to accept a
   lock held across two human prompts in a TTY-only command, in exchange for closing P-9 on init
   *and* closing the stale-`confirmWriteTargets` window described above. **This is the one call the
   plan is least sure of** — it trades a named LOW-severity cost against a named regression, and
   reasonable people could weigh it the other way.
2. **`update`'s residual round-trip.** `fetchRemoteSkillsVersion` stays outside the lock, so a
   refused `update` still makes one small guarded GET. Accept as named residual (the plan's
   position), or pull the lock above the confirm too (re-introduces prompt-under-lock in `update`)?
3. **The stale doc-comment in `project-lock.ts:203-206`** ("acquire AFTER their last prompt and
   after the network fetch") is wrong after this change — and is *already* wrong today for `add`'s
   picker. It is out of scope by the hard constraint. Hand the one-line correction to the P-10 PR,
   or accept a temporarily-stale comment and fix it in a follow-up?

## Open questions — RESOLVED at GATE 1 (human, 2026-09-09)

Approved **as written**, including the `init` decline. All three questions above are answered; none
remains open, and the answers are recorded here rather than only in a transcript.

1. **`init` — decline or move? → DECLINE, confirmed.** A lock held across open-ended human latency
   (up to the 6 h stale window), blocking every other pharn command in the project, is a worse
   defect than the LOW-severity saving. Keep the decline pinned by a test and state it in the PR
   body so a reviewer cannot read the untouched `init` as an oversight.
2. **`update`'s residual round-trip → ACCEPT as a named residual.** `fetchRemoteSkillsVersion`
   stays outside the lock. The honest wording everywhere — code comments, CHANGELOG, PR — is
   **"no tarball download"**, never "zero round-trips".
3. **The stale doc-comment in `project-lock.ts:203-206` → HAND TO THE P-10 PR.** Do not touch the
   file. The human is carrying the one-line correction across.

Additionally directed at GATE 1:

- The fetch-inside-`fn` restructure is approved as **necessary, not scope creep** — without it the
  hoist strands `.pharn.lock` on every offline/DNS failure. A test **must** pin that a failed fetch
  leaves no lock behind.
- The `confirmWriteTargets` prompt-time/write-time staleness hole stays **out of scope**, but must
  be named explicitly in `REVIEW.md` and in one PR-body line so it is on the record as a separate
  defect.
