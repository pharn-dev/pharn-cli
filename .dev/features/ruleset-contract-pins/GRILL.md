# GRILL — ruleset-contract-pins

Adversarial pass over this increment's own PLAN, run before the build. Advisory: it surfaces
concerns, it does not gate.

## Finding 1 — the mirror constant can be made self-updating, which would void the CodeQL pin

**Problem.** The plan asserts `REQUIRED_CONTEXTS` equals "the union of what the pinned workflows
produce". If the CodeQL member of that union is DERIVED from `codeql.yml` at test time, the constant
tracks the file automatically: rename the template to `CodeQL (…)` and the derived context becomes
`CodeQL (javascript-typescript)`, the set equality still holds, and the pin proves nothing about the
context the ruleset actually waits on. The same trap exists for the two bare-id entries if their
contexts are read from the job ids rather than declared.

**Reduction.** Every member of `REQUIRED_CONTEXTS` is a LITERAL — `'floor'`, `'gitleaks'`, and
`CODEQL_CONTEXT = 'Analyze (javascript-typescript)'` — and the workflow-derived value is compared
AGAINST that literal, never substituted for it. A determined editor can still change both, but the
edit then lands in a constant whose doc comment says it mirrors `required_status_checks`, which is
the alarm; an incidental workflow edit cannot pass silently. Stated in the constant's doc comment so
the next editor sees the constraint before breaking it.

## Finding 2 — "the job has no `name:`" passes vacuously when the parse breaks

**Problem.** The load-bearing new assertion is an ABSENCE: `jobNames` is empty for `floor.yml` and
`gitleaks.yml`. An empty result is also what a TOTAL parse failure produces. Change `jobs:` to
`jobs: # gates` and `lines.indexOf('jobs:')` returns -1, no blocks are collected, `jobNames` is `[]`
— and the pin the whole increment exists for reports green while the file it claims to have checked
was never read.

**Reduction.** Three layers, all in the same test. `expect(blocks.size).toBe(1)` runs BEFORE the
emptiness check, so a zero-block parse fails first. Both decoys are asserted present in `source` —
the column-0 workflow `name:` and a six-space step `- name: ` — so "this file happens to contain no
`name:` at all" cannot satisfy the test either. And `jobBlocks` keeps its own `expect(start).
toBeGreaterThan(-1)` with the path in the message.

## Finding 3 — the refactor is the risk, not the new pins

**Problem.** The visible work is three new workflows; the invisible work is rewriting the module
scope every existing assertion reads from (`source` / `blocks` / `jobNames` become `ci.source` /
`ci.blocks` / `ci.jobNames`). A refactor that silently pointed one of those at a different file, or
dropped an assertion while re-typing it, would LOOSEN the only pin that currently works — and every
test would still be green, because the workflows all conform. "All four existing cases still pass"
is not evidence: they passed before the increment too.

**Reduction.** The existing pins get their own RED demonstration, not just the new ones: rename
`Markdown lint` to `Markdown Lint` in a scratch copy of `ci.yml` and confirm the post-refactor file
reddens on it. Two cases fire (the set equality and the per-gate script pin), which also proves the
refactored `ci.blocks` still addresses `ci.yml` and not, say, whatever `parse` was last called with.

## Finding 4 — the increment ADDS a new over-claim surface

**Problem.** Before this change the file contained no list of required contexts, so no reader could
mistake it for a ruleset check. After it, a nine-string constant named `REQUIRED_CONTEXTS` sits at
module scope in a passing test. The natural reading — "the suite verifies these are required" — is
false, and the increment manufactures that reading. Adding a plausible-looking pin that covers less
than it appears to is a worse failure than the gap it closes (P0).

**Reduction.** The limit is stated in three places, deliberately: the file header now says which half
is pinned AND that the original incident stays invisible; the constant's own doc comment calls it a
DECLARED BELIEF, hand-checked; and the PLAN's guarantee audit separates Side A from Side B in as many
words. The constant is also not named `RULESET_CONTEXTS`, which would assert the thing it cannot
check.

## Finding 5 — "report, don't fix" on the sibling over-claim may be scope discipline dressed up

**Problem.** Discovery found that `tests/check-composition.test.ts:81` claims "if a seventh gate is
ever added to CI, this fails", which is false — its gate list is a local literal, not read from
`ci.yml`. The plan declines to fix it and declines to consolidate the three gate lists, both on P7
grounds. Two prior REVIEWs deferred the consolidation TO this increment. Deferring it again, from the
increment it was deferred to, is exactly how a finding becomes permanent.

**Reduction.** The deferral is converted into a decision with reasons rather than another pointer:
the plan's **The decision this plan makes** section answers it (three different list shapes, one of
them introduced by this increment), and the false comment is written into the guarantee audit as a
NAMED RESIDUAL with the specific line and the specific reason it is false — so the next person needs
no rediscovery. The PR body carries it too, so a maintainer can overrule the call at review time
rather than after a merge.

## Verdict (advisory)

**Proceed.** Findings 1 and 2 were design errors that would have shipped a pin proving less than it
claimed; both are reduced inside the test file rather than in prose. Finding 3 changes the evidence
requirement (the ci.yml pins must be RED-demonstrated after the refactor, not merely observed
green). Findings 4 and 5 are honesty obligations, discharged in comments and in the PR body.

The one thing no reduction reaches: nothing here reads the live ruleset, so half the contract stays
advisory by construction. That is the increment's design, not an oversight — and it is why the
guarantee audit leads with it.
