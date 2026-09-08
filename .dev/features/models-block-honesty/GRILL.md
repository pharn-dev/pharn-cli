# GRILL — models-block-honesty (advisory; gates nothing)

Interrogation of `.dev/features/models-block-honesty/PLAN.md` against live state. Findings are
finding-shape; severity is LLM-assigned and **advisory** — none of this blocks `/pharn-dev-build`.

## F1 — the plan's headline eval has no harness today (gap)

**Problem.** The plan pins "the init outro contains the new hint and not the old promise", but
`tests/init-archetype.test.ts` mocks `outro: vi.fn()` inline (line 10) and **never reads it back** —
there is no `import * as prompts` and no assertion on outro copy anywhere in the file. As written the
eval is unwritable.

**Reduction.** Mirror the shape `tests/status.test.ts` already uses: `const prompts = await
import('@clack/prompts')` plus an `outroBody()` helper over `vi.mocked(prompts.outro).mock.calls`.
That is a copy of an in-repo pattern, not a new mechanism (P3).

## F2 — a bare negative assertion is a tautology risk (unstated assumption)

**Problem.** `not.toContain('Change per-stage routing anytime')` passes for **any** rewrite, including
one that re-promises the effect in different words. The increment's whole value is the removed claim,
so the pin must also assert the **positive** replacement ("recorded", "not yet applied" / equivalent).
Otherwise a later well-meaning copy edit can silently restore the dishonesty with the test green.

**Reduction.** Assert both directions in the same eval — old phrase absent AND the new
not-yet-applied phrase present.

## F3 — `pc.dim()` wraps the hint; pin the phrase, not the line (untested axis)

**Problem.** The outro hint is emitted inside `pc.dim(...)`. Whether picocolors emits ANSI depends on
the runner's TTY / `FORCE_COLOR` state, which vitest does not fix. An assertion on the whole rendered
line would be environment-dependent.

**Reduction.** `toContain` a bare interior phrase — dim wraps text, it does not alter the interior —
and never assert a full line with escapes.

## F4 — prettier owns these markdown tables (collateral-diff risk)

**Problem.** `docs/reference/pharn-config.md`'s top-level table (lines 12-24) carries trailing empty
columns already. Editing the `models` row can make prettier reflow the **whole** table, so the diff
grows far past the increment and `format:check` becomes the thing that tells you.

**Reduction.** Run `npm run format` and read the diff before committing; if unrelated rows reflow,
that is a pre-existing formatting debt landing in this PR — call it out in the PR body rather than
hiding it.

## F5 — "exactly one new Planned row" is an acceptance criterion nothing can verify (honest scope)

**Problem.** No test reads `docs/roadmap.md`. The criterion is real but **advisory** — it is checked by
a human reading the diff, not by a gate.

**Reduction.** None available at this altitude, and none should be invented for it (a docs-shape
checker is a separate increment, P7). Stated so the roll-up does not imply a floor it does not have.

## F6 — `docs/commands/status.md` gains a surface it does not document (scope check)

**Problem.** Adding a qualifier line to the MODELS note changes `status` output. `docs/commands/status.md`
does not mention MODELS at all, so the doc neither gains nor loses accuracy — but the CHANGELOG is
then the only place a user learns the note's wording moved.

**Reduction.** The plan's decision (leave the doc alone) is right; make the CHANGELOG entry name both
surfaces (init outro **and** `status` MODELS note) rather than only the docs.

## Verdict

**Advisory: proceed.** No finding contradicts the plan's intent; F1 and F2 change how the evals are
written and should be folded into the build. `/pharn-dev-grill` gates nothing (`grill.md`) — this is
input to the human and to the builder, not a verdict.
