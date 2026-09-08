# REVIEW — triage-unverified-observations

## Lens 1 — P0 (verify before fixing; a named fix is not a mandate)

**PASS, and item 2 is why the discipline earned its keep.** The claim is true — the overwrite-conflict
set really does omit `pharn.records.json`, which `init` really does write. The spec offers a one-line
fix. Applying it would have **broken an existing pin on purpose**: `tests/install-manifest.test.ts`'s
_CLI-owned metadata is outside the install set_ plants that exact file and asserts an empty conflict
set, because it is derived state a re-install regenerates and a user cannot act on. So the sentence
moved and the set did not.

Four of nine ended as "verified, no action, here is why", which the spec explicitly names as a valid
outcome. A triage that produced nine fixes would have been the failure mode.

## Lens 2 — P5 (a bound has two sides)

**PASS.** Item 1's pins assert depth 24 is found **and** depth 25 is not, and both were shown RED by
mutating `MAX_DEPTH` in each direction. The `MAX_ENTRIES` pin deliberately does **not** build 50,000
files: the property is that skipped entries are not *counted*, and a fixture that exhausts a real
budget measures the machine instead of the rule.

## Lens 3 — P4 (record the trap, not just the gap)

**PASS.** Items 5, 6 and 8 each have an obvious CI-shaped fix, and all three are the same landmine:
matrixing one of the six jobs renames its reported context, so every PR blocks on a required check
nothing produces. Nothing under `.github/` is touched, and the trap is written into
`docs/contributing.md` and `CLAUDE.md` beside the gap — so the next person meets the warning before
the temptation.

## Lens 4 — scope (P7), including one item that was mine

**PASS.** Items 3 and 9 are other prompts' property and the action was confirming they still carry it
(#146 landed; `5.6c` still queued). Item 7 is upstream, and the pharn-cli-side action is *filing the
issue and nothing else* — forking or patching the copied hook would break the verbatim-copy invariant
that is itself a security property.

Folded in, and worth naming: `5.6d` caught `tests/check-composition.test.ts` claiming "if a seventh
gate is ever added to CI, this fails" when its gate list is a local literal. Same class as the nine —
a guarantee that held because it was written down — and it came from my own earlier PR. Corrected
here rather than left for someone to trust.

**Advisory finding (low).** The CI gate list now exists in three test files. `5.6d` recorded the same
observation. Consolidation is a design increment, not a triage item.

## Floor-gate vs advisory split

- **Floor:** six gates green; `validate.mjs` 0; three new tests, mutation-verified both ways.
- **Advisory:** eight verdicts and every prose change. Whether the verdicts are *right* is the
  reviewer's call, which is the honest shape for a triage.
