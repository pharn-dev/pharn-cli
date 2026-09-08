# REVIEW — init-cancel-clone-leak

## Lens 1 — P0 (fix the structure, do not lean on a backstop)

**PASS, and this was the live temptation.** `5.2c` merged an `exit`-handler backstop that drains live
clones, and `cancelAndExit` is a `process.exit(0)` — so the clone is already removed on this path
today. Closing the prompt on that basis would leave the design rule `init.ts` states in its own header
("every `process.exit`/`cancelAndExit` happens AFTER that `finally`") violated, and the next stage
added to that `try` would inherit the trap with nothing structural to catch it. The spec forbids it in
as many words, and the fix does not lean on it.

## Lens 2 — P4 (cite, do not invent)

**PASS.** `steps/archetype-summary.ts` already returns `'cancel'` as a value one prompt earlier, with
a comment explaining exactly this hazard. The fix mirrors that shape — including calling clack
directly rather than through a helper — so `init` now has one consistent prompt contract instead of
two, and no new pattern was invented.

## Lens 3 — P5 (why a three-state, not a boolean)

**PASS, and it is the root cause.** `Promise<boolean>` had no room for "cancelled", so the only way to
signal it was to exit. `decline` and `cancel` are kept **distinct** even though `init` maps both to
`cancelled`, with a comment saying why — collapsing them back is precisely the pressure that produced
the bug.

## Lens 4 — dead-symbol discipline (P7)

**PASS.** `confirmWarning`'s only caller was this stage; after the refactor it has none, so it goes,
along with its `tests/confirm.test.ts` block — the repo's established practice (commit 2cd061d). Every
helper it offered ends in an exit, which is the one thing this stage must not do, so leaving it would
be leaving a loaded footgun beside the fix.

**Advisory finding (low).** `warnAndConfirm` in the same file also has no `src/` callers. Deliberately
left: one deletion per reason, and it is not in this increment's scope.

## Floor-gate vs advisory split

- **Floor:** six gates green + `build`; `validate.mjs` 0; the induced-regression demonstration.
- **Advisory:** one low finding (`warnAndConfirm` still unused).
