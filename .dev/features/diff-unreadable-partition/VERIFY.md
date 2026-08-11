# VERIFY — diff-unreadable-partition

## FLOOR layer — the gates that own the verdict

| gate | exit |
| --- | --- |
| `test` (`npm test` — the hermetic vitest suite, incl. this feature's own cases) | 0 |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 |
| `lint` (`eslint src`) | 0 |
| `format:check` (prettier, whole-repo) | 0 |
| `lint:md` (markdownlint, whole-repo) | 0 |

`structural:*` — **no gate.** This increment ships no markdown capability and therefore no
`evals/expected` ↔ `findings.json` pair, so no `structural:*` gate exists to run (absent from the map,
not silently passed).

This set is exactly the repo's `npm run check` aggregate plus `validate`, so the verdict tracks the full
`check`. **Honest caveat (two clocks):** *which* gates are in the map is this stage's **advisory**
composition — `check-verify.mjs` is generic over gate keys and nothing floor-locks the style gates into
the set.

## Suite detail (context, not verdict input)

636 tests across 39 files pass, up from 625 at the baseline — **+11**, all in this increment:
7 in `tests/diff.test.ts` (directory, symlink-different-bytes, symlink-identical-bytes, dangling
symlink, ENOTDIR parent, sort determinism, the no-fs/no-crypto source scan) and 4 in
`tests/status.test.ts` (strict-exits-1-on-unreadable-alone, plain-run-reports-and-exits-0, subsection
ordering, omitted-when-empty).

Coverage (`npm run test:coverage`, exit 0 against the configured thresholds 90/82/95/92):

| file | lines | branch | stmts | funcs |
| --- | --- | --- | --- | --- |
| `src/lib/diff.ts` | 94.11% → **100%** | 75% → **100%** | 94.11% → **100%** | 100% |
| `src/commands/status.ts` | 97.01% → **97.26%** | 82.22% → **88.23%** | 94.59% → **96.29%** | 100% |
| repo total | 96.30% → **96.40%** | 88.01% → **88.48%** | 94.78% → **94.96%** | 98.14% (=) |

No metric dropped anywhere. `diff.ts` reaching 100% required fixing a **pre-existing vacuous test**:
`tests/diff.test.ts`'s "flags a modified + a missing file" claimed a missing file but only rewrote it
with identical bytes, so the `missing` arm had never been exercised — at the baseline either. It now
deletes the file for real and asserts `missing`, which also stops the three new "not reported missing"
assertions from being vacuous.

`apply-update.ts:66` (`'the file could not be read'`, the EACCES arm) stays uncovered, unchanged by this
increment. It is **not** in `diff.ts`'s own code — `diff.ts` has a single `unreadable` arm, fully
covered — and EACCES is not drivable as root. Stated rather than mocked around.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}` (deterministic frontmatter membership, never a prose grep). Step 2 is
a no-op; no verifier free-text exists, so nothing tainted entered this report.

## Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.**

**The honest residual (P0/P7):** verified = **the named gates passed**. This is **not** a guarantee of
correctness beyond what those gates check — a defect no test, eval, rule, or lint covers is invisible to
this verdict, and the verifier layer that might have noticed it is advisory and today empty. In
particular, the four manual end-to-end evidences against a real upstream clone are **not** part of this
floor verdict; they are recorded separately in the ship roll-up.
