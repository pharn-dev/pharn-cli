# REVIEW — models-block-honesty

Four advisory lenses, each citing a principle. Severity is LLM-assigned — **advisory**. The only
floor-grade content here is `validate.mjs` GREEN, already gated by build and verify.

## Lens 1 — P0 (a guarantee must not exceed what is verified)

**PASS.** This increment is itself a P0 correction: the product was asserting an operational effect
(`edit it and re-run your stages`) with nothing behind it. The new copy states the mechanism's real
scope — written, validated, displayed, unread — on all three surfaces that make the claim (reference
doc, init outro, `status` MODELS note). The PLAN's own guarantee audit declines to claim the docs are
"now honest" as a floor property, which is the right altitude: F5 in the grill names that no gate can
verify a doc's honesty, and the roll-up does not pretend otherwise.

**Advisory finding (low).** `docs/commands/init.md:134` lists `models` among the written fields. That
sentence is true as written (it *is* written) and makes no consumption claim, so it was deliberately
left alone. A reader who arrives there first still gets no signal that the block is inert. Cheap
follow-up, not a blocker.

## Lens 2 — P4 (cite, do not restate)

**PASS.** The roadmap row points back at the reference section rather than re-explaining the
mechanism, and it names its own removal condition ("when a consumer lands, drop this row and the
**Coming soon** marker"), so the two documents cannot drift into disagreeing about whether routing
shipped. The `status.ts` comment cites `docs/roadmap.md` instead of duplicating the rationale.

## Lens 3 — P7 (additive schema; do not widen scope)

**PASS.** Nothing about the block's behavior moved: `DEFAULT_MODEL_ROUTING` is still written on every
fresh install (assertion unchanged and green), `validateModelRouting` and its tests are untouched, and
`printModelRouting` keeps its single `config.models === undefined` early return — the legacy
no-`models` config still renders no MODELS note (test unchanged and green). The temptation this
increment had to resist was deleting the block; it did.

## Lens 4 — testability (does the change have a failure mode a test can see?)

**PASS, with the strongest evidence in the PR.** A copy-only change usually lands untested. Here both
CLI-emitted claims are pinned in both directions — the removed promise asserted absent, the honest
replacement asserted present — and the init pin was demonstrated RED against a revert. The docs
themselves remain unpinned (F5); that is stated, not hidden.

**Advisory finding (low).** `tests/status.test.ts` pins the qualifier by substring
(`'no installed stage reads this yet'`) while `status.ts` renders it inside `pc.dim(...)`. That is
deliberate (grill F3: dim wraps, it does not alter interior text) and matches how the init pin is
written, so it is robust to the runner's color state. Noted so a future reader does not "tighten" it
into a full-line assertion.

## Floor-gate vs advisory split

- **Floor (blocking, already gated):** six gates green; `validate.mjs` exit 0.
- **Advisory (this file):** two low findings above. Neither blocks; both are one-line follow-ups.
