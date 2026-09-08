# REVIEW — update-network-exit

Increment: two tests in `tests/update.test.ts` pinning what `pharn update` leaves behind, and how far
it got, when either of its two network calls fails. No `src/**` change.

## Step 1 — Floor first (P0)

`node .dev/floor/validate.mjs .` → **GREEN**, exit 0 (`0 capabilities checked` — this repo ships no
markdown capability, so the structural floor is vacuously green and gates nothing here). The
increment was entitled to reach review. Everything below this line is **advisory**.

## Floor-gate findings (blocking)

**None.** No guarantee lacks a floor reduction or an `advisory` label; no eval binding is missing; no
guaranteed decision rests on a tainted field; no sibling reference was introduced. `src/**` is
byte-identical to base, so nothing in the product's guarantee surface moved at all.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: "tests/update.test.ts:421"
  problem: "Five of the nine assertions in each new test were not falsified by any of the seven source breaks attempted, so a green suite is weaker evidence for the nothing-written invariant than the assertion count suggests."
  evidence: "expect(body(DOC)).toBe('constitution v1');"
```

```yaml
- type: FINDING
  rule_id: "P7"
  severity: important
  file: "tests/update.test.ts:391"
  problem: "The spec driving this increment asserts both catches are dead to the suite; they are not, and delivering its literal acceptance criteria therefore ships a rejects-ProcessExit(1) assertion that duplicates tests/update.test.ts:255 and :273."
  evidence: "await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));"
```

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "tests/update.test.ts:391"
  problem: "tests/update.test.ts is now 1818 lines describing the same two failure paths from two suites 150 lines apart, joined only by a comment; a reader who lands on one has no structural signal that the other exists."
  evidence: "describe('network failure', () => {"
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "docs/commands/update.md"
  problem: "The docs say nothing about what update leaves behind when the network fails, so the behavior this increment newly pins is now demonstrated in tests but still undocumented for the user who meets it offline."
  evidence: "no docs change was in scope for a tests-only increment"
```

All four are **advisory-gate**: each rests on reviewer judgment, and none is the sole basis for
blocking a guaranteed invariant.

## The four lenses

### L-floor → P0

The increment makes no new guarantee, and says so. The plan's guarantee audit labels every claim
`advisory`, explicitly downgrades the `exit(1)` pin to "advisory, and NOT new", and strikes an
overclaim of its own ("these tests make `update`'s network paths safe" — they make two specific
regressions detectable). That is the correct shape.

The residual is the P0 finding above, and it is the honest one: ten of eighteen assertions have no
demonstrated detection power. `VERIFY.md` reports this per assertion rather than reporting a green
table and stopping, which is the difference between a verification and a formality. The reason those
assertions cannot be falsified is itself worth recording — every write in `update.ts` is inside
`applyUpdate`, which neither failure path reaches — because it means the invariant is currently a
property of the control-flow SHAPE, and the tests document rather than defend it.

One thing verified by reading rather than assumed: `expect(cleanup).not.toHaveBeenCalled()` is
guarding an invariant that belongs to `src/lib/repo.ts`, not to `update.ts` — `fetchRepo` `rmSync`es
its own temp dir in its catch and returns a handle only on success (`repo.ts:82-98`). The assertion
is still correct, but its subject is one layer down from where the test lives, and the pairing with
`toHaveBeenCalledTimes(1)` is what keeps it from being a tautology.

### L-eval → P1

Two tests, nine assertions each, seven source breaks measured and reverted. The breaks are the
review-relevant artifact, not the tests: **breaks B and F each redden exactly one test out of 79**,
which is the only kind of evidence that distinguishes a guard from a comment.

Two things the eval layer gets right that are easy to get wrong:

- `mockRejectedValueOnce` (not `mockRejectedValue`) is what makes `toHaveBeenCalledTimes(1)` exact —
  a retry resolves on the second call, so the count assertion has real teeth rather than restating
  the mock.
- The record snapshot is taken **before** the run (`const recorded = { ...records()! }`), so
  `expect(records()).toEqual(recorded)` cannot pass by re-reading a store the run rewrote. Comparing
  against a literal would have been the weaker and more obvious choice.

Residual: the P0/P1 overlap above, and the duplicate `rejects` assertion (P7 finding). The latter is
defensible — it is the precondition the effect assertions hang off, and removing it would turn one
clear failure into a confusing cascade — but it is duplication, and it should be named as such
rather than counted as coverage.

### L-trust → P2

No untrusted artifact is ingested: both tests construct a local `Error('offline')` and feed it to a
`vi.fn()`. No clone, no fetch, no network, no filesystem read outside the per-test tmpdir. The one
adjacent taint — `errorMessage(err)` rendering clone-derived text into the terminal — is deliberately
NOT asserted on, which narrows the surface rather than widening it and also keeps this increment out
of 4.06's way.

Worth recording for the same reason a caught prompt-injection would be: **the spec driving this
increment was materially wrong about live state**, in four separate claims (line numbers, the shape
of both catches, whether the suite rejects the mocks, and degit vs the codeload tarball). Building
from the quoted block rather than from disk would have produced a test asserting `log.error` wording
against code that no longer calls `log.error` directly. Discovery (P6) caught it — the mechanism
working as designed. `PLAN.md` records the drift as a table rather than silently routing around it.

### L-axis → P3

One file changed. `tests/update.test.ts` stays on one axis (it is the `update` command's suite), and
the new block is a sibling `describe` at the same level as the suites around it. No `src/**` change,
so no command→command import could be introduced.

The axis concern is size, not layering: the file now holds two suites covering the same two failure
paths from different angles, 150 lines apart. The header comment on the new block names the other
suite and the split of responsibility, which is the weakest acceptable form of that signal.
Co-locating them was considered and rejected — the `fatal-error reporting` suite's `beforeEach`
manipulates `PHARN_DEBUG`, and effect assertions have no business inheriting that.

## Verdict

**GREEN — 0 floor-gate findings, 4 advisory.** The increment is not blocked.

Advisory means advisory: this review is model judgment over an increment it treats as untrusted, and
the only guaranteed statement in it is the `validate.mjs` GREEN in Step 1. "Reviewed" here is not a
claim that the change is correct or wise — that is the human's call.

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` is the gated path)

- **id:** `test-only-increment-needs-isolated-red`
- **lesson:** For a tests-only increment, the deliverable is not the test — it is the demonstration
  that the test fails when the behavior regresses, **and that it fails alone**. Count, per assertion,
  how many pre-existing tests the same break reddens: a break that reddens ten tests proves the
  suite works, not that the new test was needed. Report isolated / shared / never-falsified
  separately.
- **triggering failure (real, this run — P7):** the spec claimed both of `update`'s network catches
  were "dead to the suite". They were not — `describe('fatal-error reporting')` already rejected both
  mocks and pinned both `exit(1)`s. Five of seven breaks reddened the new tests only alongside
  pre-existing ones; only two (a hoisted confirm, a salvage fetch) isolated a new assertion, and ten
  of eighteen assertions were not falsifiable at all.
- **provenance:** increment `update-network-exit`; recorded in
  `.dev/features/update-network-exit/VERIFY.md`; base `47b1f98feb075bff48caa3b6c87d51205d5dc650`.
- **why it is canon-worthy and not a one-off:** the PR bundle this belongs to is a run of tests-only
  increments driven by coverage-gap specs, and a coverage gap is measured in uncovered LINES, which
  says nothing about whether an added assertion can fail. The isolated-RED count is the missing
  measurement, and it recurs for every increment of this class.

This is a **candidate only**. `/pharn-dev-review` declares no `.dev/memory-bank/**` write and has not
made one; promotion is a separate `/pharn-dev-memory-promote` run behind `check-provenance.mjs` and a
human accept/deny.
