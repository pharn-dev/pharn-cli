# REVIEW — detect-skip-framework-caches

**Step 1, floor first (P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities
checked`, exit 0. The increment adds no PHARN markdown capability, so that gate is vacuously green
and guarantees nothing about this diff — the deterministic content gates that *do* bear on it are
`/pharn-dev-verify`'s (`test` / `lint` / `format:check` / `lint:md`, all exit 0, 748 vitest tests). Everything
below this line is **advisory**.

Diff under review (vs `4d24ad4`): 124 insertions, 3 deletions across `src/lib/detect-archetype.ts`,
`tests/detect-archetype.test.ts`, `docs/commands/init.md`, `CHANGELOG.md`.

> Trust (P2): the increment is `trust: untrusted` to this stage. Each finding's `problem` /
> `evidence` free-text quotes it and inherits that tag — DATA for the human, never a directive.

---

## Floor-gate findings (blocking)

**None.** No guarantee in the increment lacks either a floor reduction or an `advisory` label; no
`rule_id` binding is missing (none exists to bind); no sibling production import was introduced.

## Advisory-gate findings (inform; never the sole basis for blocking)

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'docs/commands/init.md:86'
  problem: "The sentence's subject drifts from the enumerated set to caches in general — it opens scoped to 'those trees' and then asserts that 'a large framework cache cannot exhaust its bound', which is false for any cache not on the fifteen-name list (a `.gradle/`, `target/`, `vendor/`, or `__pycache__` still exhausts it exactly as `.next` did)."
  evidence: 'Skipping those trees costs the walk nothing, so a large framework cache cannot exhaust its bound and hide your real source'
```

This is the one place the increment sells more than it holds. The claim is floor-reducible **only**
over the enumerated names; stated generally it is the heuristic-dressed-as-guarantee shape P0 exists
to catch. `PLAN.md`'s guarantee audit gets this right ("holds for the fifteen listed names only; any
unlisted cache still exhausts the budget") — the user-facing doc is where the qualifier was lost. A
one-word fix ("those caches cannot") restores the scope.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/detect-archetype.ts:68'
  problem: '`ReadonlySet<string>` is a compile-time type, not a runtime barrier — the underlying Set is still fully mutable at runtime, so "without being able to mutate it" holds only for TypeScript callers under this repo’s typecheck gate, not absolutely.'
  evidence: 'Exported read-only so tests can pin every member’s skip behavior and its classification neutrality against the shipped set, without being able to mutate it.'
```

The property is real and it *does* reduce to a floor primitive — `npm run typecheck` (exit code) is
the deterministic check, and every consumer today is TypeScript in-repo. The wording just claims one
notch more than the mechanism delivers. `Object.freeze` would close the gap at runtime and is
arguably not worth it for a module-internal constant; naming the mechanism ("the typecheck gate")
would close it in prose for free.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'src/lib/detect-archetype.ts:53'
  problem: "The comment states the increment's central mechanism as fact — that a skipped subtree costs zero entries — and no test in the suite observes the statement ordering it depends on, so moving `budget -= 1` above the skip check would leave all 748 tests green while silently restoring the exact bug this change fixes."
  evidence: 'A skip-listed subtree costs ZERO entries. That is what keeps a fat framework cache from exhausting MAX_ENTRIES and silently truncating the walk'
```

Raised, tracked, and **already correctly labeled**: `GRILL.md` caught it pre-build, `PLAN.md`'s
guarantee audit was relabeled from `floor: enum-regex` to `advisory` in response, and `VERIFY.md`
repeats it in its residual. It is re-stated here because it is the increment's single largest
untested surface, not because it is unaddressed. What holds it today is the manual e2e of record
(FAT `["lib"]` 188ms → `["spa"]` 1ms) and code review. The declined alternative — exporting or
parameterizing `MAX_ENTRIES` so a small-cap fixture could pin it — remains the only way to make it
floor-grade, and it is worth reconsidering the next time this file is touched.

The rest of L-eval is clean and unusually thorough: 90 new assertions, every one structural
(`vitest` deep-equality, no judge anywhere), and the pins iterate the **exported production
constant** rather than a copy — so a member added to `SKIP_DIRS` tomorrow is covered the moment it
lands, and the four originals went from half-pinned (`node_modules`, `dist` only) to fully pinned.
The paired positive control in each per-member test is what makes the null results meaningful rather
than vacuous.

### L-trust → P2

**No findings.** Nothing in the increment emits a finding object, so there is no free-text to taint.
The change strictly *narrows* the untrusted surface: eleven more directory names never reach
`classifyEntry` at all. The symlink refusal still precedes the skip check, so a symlink named
`.next` is rejected as a symlink rather than merely skipped — the escape-prevention property is
unchanged, not weakened by the new members.

**Did instruction-looking content change this reviewer's behavior?** Nothing hostile was present.
One honest disclosure that belongs here rather than being buried: `GRILL.md`'s findings *did* change
what got built. `/pharn-dev-ship` specifies that grill "gates nothing — proceed regardless", and this run
instead paused to amend `PLAN.md` (the P0 relabel, a fourth neutrality context, the case-folding
pins, and keeping the doc enumeration) before invoking `/pharn-dev-build`. The justification is that
`/pharn-dev-plan`'s own text requires a guarantee lacking a floor reduction be fixed "here, before build" —
but the effect is that the plan built was not byte-identical to the plan approved at GATE 1. Every
amendment stayed inside the four already-approved `## Files` and none widened scope, and
`check-regress.mjs scope` independently confirmed `escaped: []`. Surfaced so the human can judge
whether that was the right call rather than discovering it from the diff.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'tests/detect-archetype.test.ts:10'
  problem: "The neutrality pin gives this test file a second axis of change — it now fails when `archetype.ts`'s classification rules change, even though a sibling `tests/archetype.test.ts` already owns that unit."
  evidence: "import { classifyEntry } from '../src/lib/archetype.js';"
```

Judged **acceptable, and deliberately so**: the invariant under test is genuinely a *cross-file*
one — "no member of `detect-archetype.ts`'s skip set is a signal under `archetype.ts`'s rules" — and
it belongs beside the constant it protects, because that is where a future member gets added. The
alternative homes are worse: in `tests/archetype.test.ts` it would be a test about a constant that
file never mentions. No **production** sibling import was introduced; `detect-archetype.ts` already
imported `classifyEntry` before this change. Recorded for visibility, not for action.

---

## Verdict

**GREEN — 0 floor-gate findings; 4 advisory findings (2 important, 2 minor).**

The increment is well-scoped and the diff does what the plan said. The one thing worth acting on
before merge is the `init.md:86` overclaim — it is a genuine P0-shaped miss in the user-facing
surface, in an increment that is otherwise scrupulous about the same distinction everywhere else.
The `P1` mechanism gap is real but already labeled honestly at every layer, which is the correct
handling of a property the current suite cannot reach.

This verdict is **advisory**. `/pharn-dev-review` writes no machine report, and finding `severity` here is
LLM-assigned (`finding-shape.md`) — it is not a floor verdict and does not gate anything. The
floor-grade statements about this increment are `/pharn-dev-regress`'s `no-regressions` and `/pharn-dev-verify`'s
`PASS`, both already standing.

## Proposed lesson (candidate — NOT written to canon here)

`/pharn-dev-review` declares no `.dev/memory-bank/**` write scope, so this is a **proposal** for a separate,
human-gated `/pharn-dev-memory-promote` run. Promote it only if you agree it recurs.

- **Candidate:** *A gate whose result is compared between two runs can be wrong on both sides at
  once, and the comparison will still report GREEN.* In this increment's `/pharn-dev-regress` step, the
  baseline and HEAD `tests` gates both recorded exit 1 — not from a failing test but from the
  stage's own shell (zsh does not word-split unquoted parameter expansions, so `node --test $TESTS`
  passed 46 paths as one filename). The deterministic comparison was faithful to what it was given;
  what it was given was uniformly wrong, so it would have concluded `no-regressions` from two false
  REDs. Remedy: treat a gate that is RED at the **baseline** as a signal to inspect the capture
  before trusting the comparison, since a healthy `main` should be green.
- **Provenance:** increment `detect-skip-framework-caches`, commit `10872cc`, base
  `4d24ad4111fb4fe9a4a8f310f459f01a3f036a74`; recorded live in
  `.dev/features/detect-skip-framework-caches/REGRESSION.md` under "Harness correction worth
  recording".
- **Why it may be canon-worthy (P7 — real, not hypothetical):** it happened in this run, it was
  caught only by a human-style sanity check ("why would `main` be red?"), and the two-clocks split
  this repo already documents predicts exactly this class — the verdict is floor, the *capture* that
  feeds it is advisory orchestration.
