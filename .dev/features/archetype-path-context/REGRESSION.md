# REGRESSION — archetype-path-context

**Verdict (FLOOR, `check-regress.mjs verdict`):** `no-regressions` — exit `0`.

Did building this feature break anything OUTSIDE it? No deterministically-detectable breakage outside the
feature. This is a pure exit-code comparison (zero LLM judgment): what was GREEN at the baseline and RED at
HEAD is a regression; nothing flipped.

## Base + scope partition

- **base:** `186b55d` (`186b55d4c9be259142fc9f7513828a06aa86191c`) — the parent of the feature commit
  `b7dc5b6 "feat: scope archetype file-tree signals to path context"`. The environment auto-committed the
  build, so the feature lives in `b7dc5b6`, and the pre-build baseline is its parent (NOT `HEAD`, which
  already contains the feature).
- **inside (declared `## Files`, from the plan):** `src/lib/detect-archetype.ts`,
  `src/lib/capability-index.ts`, `tests/detect-archetype.test.ts`, `tests/capability-index.test.ts`.
  `scope` exit `0`, `escaped: []` — no path outside the declared writes (the pipeline's own artifacts under
  `.dev/**` / `.pharn/**` are stage/scratch output, excluded from the changed set; the fix #7 hook already
  pinned the build to `## Files`).
- **outside gate set:** `tests` (44 stdlib `node --test` floor + hook tests) and `validate`
  (`.dev/floor/validate.mjs .`, whole-repo). Style gates (`lint`/`format:check`/`lint:md`) **skipped** —
  `inside` touches no shared style config, so an outside style flip is provably impossible (P5/P7). No
  committed eval pairs are outside the feature (`outside_eval_pairs: []`).

## Per-gate base → head (exit codes)

| gate       | base | head | classification |
| ---------- | ---- | ---- | -------------- |
| `tests`    | 1    | 1    | **pre_existing** (RED→RED, not a flip) |
| `validate` | 0    | 0    | clean (GREEN→GREEN) |

- `regressions[]`: **none**.
- `pre_existing[]`: `tests`.

**On the pre-existing `tests` RED (honest note):** `node --test` over the 44 outside `.mjs`/`.cjs` tests
reports **665 tests, 665 pass, 0 fail** at HEAD, yet the runner's aggregate exit is `1` — a pre-existing
non-test-failure runner quirk (a stderr warning, not a failing assertion), and it is **identical at base
(`186b55d`) and head**. It is therefore `pre_existing`, not a regression: it predates this feature and this
feature (which touches only `src/lib` product code + vitest `.test.ts`, never the `.mjs` floor scripts those
tests exercise) has no causal path to it. With `fail 0` at head, nothing is masked behind the aggregate
exit. The repo's substantive gate for the changed code — `npm run check` (vitest, 566 passed) — is GREEN
(see the build note); `/pharn-dev-verify` re-runs it as the owning gate.

## Honest residual (P0/P7)

`/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. A regression that no
deterministic check covers (a broken behavior with no test/rule/eval) is invisible to it. The claim here is
"deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." This
certifies only the comparison, not the feature as a whole.
