# GRILL — update-proxy-notice

Plan under interrogation: `.dev/features/update-proxy-notice/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash` (`PLAN.md:3`). No spec drift to surface; `/pharn-dev-build` re-enforces this as a
floor-gate (fix #4).

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
No `role: griller` capability is installed in this repo, so Step 2b contributes nothing and the
findings below come from the inline axes only (P7 — stated, not silently skipped).

> The plan is `trust: untrusted` to this stage. All `problem` / `evidence` free-text below quotes it
> as DATA.

---

## Findings

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/update-proxy-notice/PLAN.md:31'
  problem: 'The hoist CHANGES observable behavior on the lock-refusal path — a run refused by ProjectLockedError goes from silent to warning — and the plan names that path in the defect section but omits it from both the eval list and the "exact delta", so the one behavior change outside the two fetch sites ships unpinned and unenumerated.'
  evidence: 'a **lock refusal** (`ProjectLockedError`, thrown before the closure body runs) likewise fetched first and warned never.'
```

This is the highest-value finding in this grill, and it is a **coverage** gap, not a correctness one.
The new behavior is right: by the time the lock is attempted, `fetchRemoteSkillsVersion` has already
gone over the wire (`update.ts:144`), so a lock-refused run warning about a proxy is describing a
fetch that **actually happened**. That is precisely what the old comment got wrong.

But the plan treats this as a corollary of "it cannot fire spuriously" rather than as a delta. Two
consequences:

- **A reviewer will ask.** "Did you intend a lock-refused `update` to now print a proxy warning?" The
  answer is yes, it is correct, and nothing in `PLAN.md` says so under `## Evals` or the exact-delta
  count — so the reviewer has to re-derive it.
- **Nothing pins it.** `tests/update.test.ts` has lock-refusal coverage (the `ProjectLockedError`
  branch at `update.ts:316-318`), so the case is mechanically available. Without it, a future edit
  that re-buried the notice inside the closure would be caught by the early-return case but the
  lock-refusal behavior would stay unspecified either way.

Recommend one more row: proxy set + the lock held → the run is refused **and** the warning was
emitted, because the version fetch already happened. That converts the plan's strongest argument
(the old premise was false) from prose into a test.

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/update-proxy-notice/PLAN.md:181'
  problem: 'The claim "no reachable path warns without fetching" is credited to a structural argument that enumerates only two exits, but three exits sit between the notice and the lock — the fetch failure, the up-to-date return, and the confirm cancel — and the cancel is named nowhere in the plan.'
  evidence: '"the notice never fires on a run that makes no network call" → **floor: vitest** for the two refusals that precede it (config, TTY), and **structural** past them'
```

The claim is **true** — `update.ts:197` `cancelAndExit()` is reached only after `:144` has fetched —
so this is a completeness issue in the argument, not a defect in the fix. But the plan's own
enumeration under "The defect" lists three post-notice exits and the guarantee audit reasons about
two, which leaves the reader to check the third. Name the cancel path: a user who answers No now sees
a proxy warning first, and that warning is honest because the version check already ran.

Worth stating plainly for the human, because it is the one place where **more** output appears on a
path that writes nothing: cancel and lock-refusal both gain a warning they did not have. Both are
correct; both are new.

### Axis: honest scope / precision (P4, P6)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/update-proxy-notice/PLAN.md:124'
  problem: 'A cited path:line range is off by one at its start — the `it(...)` the plan is inverting begins at tests/update.test.ts:346, while :345 is the preceding comment the plan separately (and correctly) cites as the case comment.'
  evidence: '`:345-358`, `it(''says nothing when update returns early without cloning'')`'
```

Substance is right; the citation is not. `tests/update.test.ts:345` is
`// No clone on the up-to-date early return, so no transport to describe.` and `:346` opens the
`it(...)`, closing at `:358`. The plan cites `:345` twice — once for the comment (correct) and once as
the start of the `it` (off by one). This repo's discipline is that a cited `path:line` resolves;
`:346-358` is the case, `:345` is its comment. The same off-by-one is repeated at `PLAN.md:187` and
`PLAN.md:210`.

```yaml
- type: FINDING
  rule_id: 'P6'
  severity: minor
  file: '.dev/features/update-proxy-notice/PLAN.md:44'
  problem: 'A provenance claim is stated as established history when it is an inference, and the two sentences it links are not verbatim identical — add.ts says "never fetches" where update.ts says "performs no fetch".'
  evidence: 'The sentence was copied from `src/commands/add.ts:178-179`, where it is **true**'
```

The **substance** checks out and is the plan's best insight: `add` genuinely has no pre-lock fetch, so
its version of the sentence is sound, while `update`'s is not. That comparison is verified and load-
bearing. What is not verified is the word "copied" — no commit history was read this run, and the two
comments differ in wording. P6 says do not assert what was not read this run. Recommend softening to
what is observable: the two commands carry the same reasoning, and the precondition holds in only one
of them.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/update-proxy-notice/PLAN.md:165'
  problem: 'The disposition of an existing test is left to the builder''s judgment with a conditional, in a document /pharn-dev-build reads as its instruction set, while the plan elsewhere establishes that this same test was green throughout the bug.'
  evidence: 'must stay green unmodified (retitled only if the title becomes misleading; the assertion is not touched)'
```

Decide it here. The plan's own first-fetch-order bullet establishes that `warns before the clone`
(`tests/update.test.ts:326-343`) **was green throughout the defect** — it is a weak test, not a wrong
one. "Retitled only if the title becomes misleading" hands a judgment call to `/pharn-dev-build` that
the plan is better placed to settle: the title is accurate post-fix, so leave it, and let the new
first-fetch case carry the discrimination. State that, rather than a condition.

---

## What the interrogation CONFIRMED (not findings — recorded so the human need not re-derive them)

Checked against the live source this run:

- **Exactly two fetch sites exist in `update.ts`.** `grep` over `src/commands/*.ts` this run:
  `fetchRemoteSkillsVersion()` at `:144` and `fetchRepo()` at `:273`. No third path, no fetch inside
  `applyUpdate` or `reportOutcome`. The plan's dominance claim is checkable and holds.
- **`:144` is unconditional.** It is the first statement of the `try` opened at `:143`, which is the
  first statement of `runArchetypeUpdate` after the spinner. Every run that reaches the notice's new
  position also fetches, so the notice cannot fire spuriously — the property that makes ONE hoisted
  call site correct rather than merely convenient.
- **`runArchetypeUpdate` has exactly one caller** (`runUpdate:103`), reached only past
  `loadArchetypeConfigOrExit` (`:76`) and the TTY gate (`:90-101`). Both ordering invariants survive
  the hoist by construction, not by assertion.
- **The contradiction the plan identifies is real.** `update.ts:232-236` (P-9's lock comment) states
  "the `fetchRemoteSkillsVersion` check further up has already run, so a refused `update` still makes
  ONE small guarded GET", while `:258` states "a refused run performs no fetch". Same function,
  opposite claims about the same run. P-9's is the correct one.
- **Both trusted-doc citations resolve.** `LIMITS.md:117` carries the "every network-bearing command"
  promise, and `:114-116` names `pharn update`'s version check as a plain-`fetch` call in the same
  paragraph. `docs/troubleshooting.md:113` lists that fetch and `:204` promises the warning precedes
  it. This is code-catches-up-to-docs; no doc edit is in scope and none is planned.
- **`LIMITS.md` is correctly excluded** (P2, floor-write-protected by
  `.claude/hooks/protect-trusted-paths.cjs`) and the plan does not plan an edit to it.
- **Scope holds.** No sibling-PR file appears in `## Files` — `src/lib/*`, `src/commands/status.ts`,
  and `docs/roadmap.md` are all absent. Three files exactly.
- **Four of the planned cases genuinely discriminate the fix from the bug.** Against the unfixed
  source, the inverted early-return case, the first-fetch-order case, the fetch-failure case, and the
  early-return half of the fire-exactly-once case would each go RED; the two refusal-precedence cases
  would stay green either way, and the plan already frames those as over-reach guards rather than
  bug detectors. That honesty is worth noting because the temptation is to claim all six.
- **The P0 relabeling is carried, not re-litigated.** "There is exactly one call site in the source"
  is labeled advisory with the reason (a `log.warn` count cannot see source shape; mutually exclusive
  branches would each still warn once). Inheriting that from the `status` grill rather than
  rediscovering it is the right move.

## Summary

The plan is small, correctly scoped to three pre-approved files, and grounded in reads taken this
run — the two fetch sites, the unconditional first fetch, the single caller, the contradicting P-9
comment, and both trusted-doc citations all check out against live files. Its strongest move, as in
the `status` increment, is refusing to hide the test inversion: an existing assertion encodes the
violation of a documented guarantee, and the plan names that rather than quietly flipping it.

The one concern worth acting on before build is the **P1 coverage gap**: the hoist changes behavior on
two paths the plan does not enumerate as deltas — the lock refusal and the confirm cancel now emit a
warning they previously did not. Both changes are **correct** (a fetch really did happen), and the
lock-refusal case is the plan's own best evidence that the old comment's premise was false — which is
exactly why it deserves a test rather than a paragraph. The remaining three findings are precision
fixes to a document `/pharn-dev-build` reads as instructions: one off-by-one citation repeated three
times, one inference stated as history, and one disposition left conditional that the plan is better
placed to settle.

Nothing here suggests the increment is wrong or should not proceed. No constitution violation was
found.

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 1 important, 4 minor) — for the human to
weigh before /pharn-dev-build.** This grill-log is advisory end-to-end and **gates nothing**: it does
not block, approve, or certify `/pharn-dev-build`. The deterministic backstops remain
`/pharn-dev-build`'s own floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and
`.dev/floor/validate.mjs`.
