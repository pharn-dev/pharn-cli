# PLAN — pin add.ts's unpinned control flow, then ratchet the coverage floors

- spec_content_hash: 2b28551c52b1c8813922c7bc66db36af8c58d71621314800076db6a1d7b85a8d # fix #4
- increment: Five tests over `pharn add`'s untested branches (ambiguity hard-fail + its disambiguation companion, picker cancel, both clone failures), then — as the bundle's ONE ratchet — raise `vitest.config.ts`'s stale floors to just below the newly measured values. Tests and `vitest.config.ts` only; `src/commands/add.ts` is not modified.
- layer(s): `tests`, build config
- constitution_refs: [P0, P5, P7]

## Discovery (P6 — read live this run)

- `npm run test:coverage` on the FINAL tree (every bundle PR merged) → **97.06 / 92.48 / 97.55 /
  97.92** against floors of
  **90 / 82 / 95 / 92**. The comment above the block claims the floors sit "just below current
  measured coverage"; they sit 7.1, 10.5, 2.6 and 5.9 points below it.
- `add.ts`'s ambiguity branch: `if (matches.length > 1)` with `matches[0]!` on the **next line**, so a
  regression that dropped or inverted the check installs whichever capability the index listed first.
  `remove`'s twin branch IS pinned; this one is not.
- `grep cancelled tests/add.test.ts` → zero. `add`'s cancel exit-code contract is entirely unpinned.
- The fixture already provides everything needed: `mockClone()`, `setTTY`, `lastError()`, and `CANCEL`.

## This is the bundle's LAST increment, which is the whole reason the ratchet is here

The spec is explicit that the ratchet runs **once**, after every test in the bundle has landed —
`5.6a` (#150), `5.6b` (#153), `4.04`'s lifecycle test (#151), and these five. All are merged. Measuring
earlier would have meant measuring twice and discarding the first answer.

## Files

- `tests/add.test.ts` — the five cases — layer `tests`
- `vitest.config.ts` — the ratchet + a rewritten comment — layer `build`

## Evals to write (P1)

- Ambiguous bare name → `exit(1)`, **both** `role:name` addresses named, nothing installed, no config
  write, clone cleaned up.
- Its positive companion: `add('lens:dup')` resolves and installs exactly that one, tagged `manual`.
- Picker cancel → `exit(0)` (a cancel is not a failure), nothing installed, clone cleaned up.
- Clone failure on the named path → `exit(1)`, index never parsed.
- Clone failure on the picker path → `exit(1)`, **the user is never prompted** for a selection the
  command cannot serve.

## Guarantee audit (P0)

- The five pins → **FLOOR**, and two were mutation-verified rather than assumed: widening the
  ambiguity guard (`> 1` → `> 99`) reddens the hard-fail case; turning the picker's `cancelled`
  outcome into an `error` reddens the exit-0 case.
- "the floors now sit just below measured" → **FLOOR at the moment of measurement, ADVISORY over
  time.** Coverage drifts with every PR; the floors are a ratchet, not a proof. Rounding **down** to
  the whole number is what stops a fractional fluctuation from reddening an unrelated PR — a floor set
  to the measured value itself would be a trap for the next contributor, not a guard.
- "coverage is now high" → **NOT a quality claim.** It measures which lines executed, never whether
  the assertions on them are worth anything. Three of the four axes moved because this bundle added
  *pins*, and a pin nobody mutation-checked can lift a number without defending anything.

## Trust audit (P2)

No untrusted input. Tests only, plus four integers in a config.

## Determinism audit (P5)

The new cases are exit-code and call-count assertions; no wording is asserted (the spec says so
explicitly, since a sibling prompt rewrites the network messages).

## Out of scope (P7)

- **`src/commands/add.ts` is not modified.** The branches exist and are correct; they were untested.
- Overshooting the floors into the measured values themselves.
- Any other prompt's tests — this is the last of the bundle, not a place to add more.

## Open questions (HALT)

- None.
