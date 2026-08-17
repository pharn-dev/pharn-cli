# REGRESSION — dead-legacy-symbols

**Base:** `e097adb` (working tree non-empty → `base = HEAD`, the dogfood-build branch of the
deterministic base rule, P5). **Verdict computed by** `.dev/floor/check-regress.mjs verdict`,
**exit 0**.

## Partition (floor: `check-regress.mjs scope`, exit 0)

`inside` (11) ≡ the plan's declared `## Files` (11). **`escaped: []`** — no path was changed
outside the declared writes, so no fix #7 breach.

| set | count | note |
| --- | --- | --- |
| `inside` | 11 | exactly the plan's `## Files` |
| `outside_tests` | 46 | every `*.test.mjs` / `*.test.cjs` — the hooks + the whole `.dev/floor/` suite |
| `outside_eval_pairs` | 0 | no committed eval pair lies outside the feature |

**Declared orchestration exclusions (advisory, stated not hidden):** `.pharn/**` (always-writable
scratch, named as such by the stage) and `.dev/features/dead-legacy-symbols/**` (this run's own
loop-owned artifacts) were excluded from `--changed`. Both are non-product; including them would
have manufactured a false fix #7 breach. This is the orchestration half of the two clocks — the
verdict below rests on exit codes, not on this choice.

**Style gates skipped, deterministically (P5/P7):** `inside` touches no shared style config
(`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so over
the byte-identical outside files a style flip is provably impossible. Skipped on **both** sides,
absent from **both** maps — and the baseline `npm ci` cost is avoided with it.

## Per-gate comparison (`base → head`, exit codes)

| gate | base | head | classification |
| --- | --- | --- | --- |
| `tests` (46 outside files, `node --test`) | 1 | 1 | **PRE-EXISTING** — already red at baseline, never blamed on the feature |
| `validate` (`.dev/floor/validate.mjs .`, whole-repo) | 0 | 0 | OK |

- `regressions[]`: **none**
- `pre_existing[]`: `tests`

### The pre-existing red, named rather than left as a bare number

The `tests` gate is red at **both** ends, so the helper excludes it by construction. Investigated
anyway, because "pre-existing" should not mean "unexamined":

- The aggregate run reports `pass 748 · **fail 0**` — **no assertion fails**.
- Every one of the 46 files **exits 0 when run individually** (per-file scan, all clean).
- So the nonzero aggregate exit is a **runner-level artifact of running all 46 together under
  parallel load**, not a failing test. It reproduces identically at `e097adb` with none of this
  increment's changes applied.

It is therefore **feature-independent and correctly excluded** — and it is *not* this stage's job
to re-decide that. Worth a human's eye as separate maintenance (it makes the `tests` gate
permanently uninformative in this repo), but it is **out of this increment's axis**, so nothing
here touches it. It is the same species as the `tests/lint-gate.test.ts` timeout disclosed in
`PLAN.md:12`: load-sensitive, pre-existing, disclosed both times rather than quietly retried.

## Coverage note (honest, P7)

`outside_tests` is the stdlib universe (`*.test.mjs` / `*.test.cjs`) — that is the stage's design,
so the baseline worktree needs no `npm ci`. The **vitest TypeScript suite is not in this
comparison**; it was gated separately by `/pharn-dev-build`'s floor (`npm run check` GREEN, 734
passing) and is re-gated by `/pharn-dev-verify`. Stated so no one reads this report as covering
more than it does.

---

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

This certifies **the comparison**, nothing more: `/pharn-dev-regress` catches exactly what its suite
catches. A regression that no deterministic check covers — a broken behavior with no test, rule, or
eval — is invisible here. This is **not** a statement that nothing broke, and **not** a statement
that the increment is good.
