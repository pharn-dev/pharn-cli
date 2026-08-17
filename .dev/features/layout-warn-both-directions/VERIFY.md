# VERIFY — layout-warn-both-directions

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | command                       | granularity | exit |
| -------------- | ----------------------------- | ----------- | ---- |
| `test`         | `npm test` (vitest, 755 tests) | whole-repo  | 0    |
| `validate`     | `node .dev/floor/validate.mjs .` | whole-repo  | 0    |
| `lint`         | `npm run lint` (eslint, `--max-warnings 0`) | whole-repo | 0 |
| `format:check` | `npm run format:check` (prettier) | whole-repo | 0 |
| `lint:md`      | `npm run lint:md` (markdownlint-cli2, 23 files) | whole-repo | 0 |

`structural:*` gates: **none** — this feature ships no committed eval-actual pair
(`git ls-files '*/evals/expected/*.json'` is empty in this repo), so no such gate exists in the map,
exactly as `/pharn-dev-regress` handles the same absence. Not a skipped check: there is nothing to range
over.

The `test` + `lint` + `format:check` + `lint:md` set is exactly the repo's `npm run check` aggregate, so
this verdict tracks the full `check` — including the two style gates that L9 identified as the coverage
hole (`.dev/memory-bank/lessons-learned.md` L9 — cited, not restated, P4). Both `.md` files this
increment touched (`docs/commands/update.md`, `CHANGELOG.md`) are inside `lint:md`'s 23-file sweep, and
both were `--fix`ed at `/pharn-dev-build` Step 2b so the style result here was not a surprise.

**Two clocks, kept honest (P0).** `check-verify.mjs` is generic over gate keys — it computes
`PASS iff every gate === 0` over whatever map this stage assembles. So the floor verdict mechanically
covers `format:check` + `lint:md`, but **which** gates went into the map is this stage's **advisory**
composition; nothing floor-locks the style gates into the set. Do not read "verify runs the style gates"
as floor-locked.

## Verdict (FLOOR — `check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.** `failing_gates[]`: empty.

The verdict rests entirely on the helper comparing five integers against zero. No model judgment
entered it, and none could have — the helper's only input is the gate→exit-code map; it cannot receive a
finding (P2: only ints and a feature-name path string were read).

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}`, a deterministic `role:`-frontmatter read (P5), never a prose grep.
Step 2 is therefore a no-op and this stage made **no `claude -p` call**. Zero verifiers is the honest
P7 state — none is authored speculatively — so no verifier free-text exists to quote, and the taint
boundary (verifier findings never reach the verdict helper) is in place for when one lands.

## Feature-specific evidence, and what it is not

The whole-repo gates above answer "is the repo green with this in it". The signal specific to **this**
increment is the feature's own `*.test.*`, collected by `npm test`:

- the new pin — `warns that the abandoned pharn/ tree is no longer managed` — green;
- the pre-existing flat pin (`tests/update.test.ts`, `warns that the abandoned flat tree is no longer
  managed`) — green and **untouched**, which is the byte-identity evidence for the message this
  increment was required not to churn;
- `tests/update.test.ts` as a whole: 49 tests green; repo total 755, up exactly 1 from the 754 baseline
  measured before the diff.

## The honest residual (P0/P7)

**Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check** — verifier concerns would be advisory help, not assurance, and today there are none. A defect
that no test, eval, lint rule, or `validate` check covers is invisible to this verdict. Two such gaps
are already named rather than hidden:

- the `abandonedLayout === null` case (nothing abandoned ⇒ nothing printed) is pinned by **no** test —
  raised as a `minor` P1 finding in `GRILL.md`, pre-existing and outside this increment's approved
  whitelist;
- the totality of "both directions are covered" holds only because `Layout` is a closed two-member type
  (`src/types.ts:154`), and **nothing gates that closure** — a third member would leave the claim
  silently false with no red gate. The `else if`-over-`else` choice makes that failure quiet rather than
  wrong, which is the mitigation, not a guarantee.

Writing "`/pharn-dev-verify` ensures the feature is correct" would be the disease this repo exists to
prevent. It certifies only the five gates it ran.
