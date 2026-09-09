# REGRESSION — corrupt-config-named-error

Baseline `80412de` (`origin/main`, "fix: warn about a configured proxy before update's FIRST fetch,
not its second (#171)"), measured in a detached worktree with its own `node_modules`. Head = this
branch, rebased onto that commit.

Measured **three times**, and only the last measurement is recorded. Pass 1 ran against `558b8dd`
(#159), the fork point at build time. Pass 2 against `a382bc3` (#167) after eleven PRs landed —
including #161 (a per-command flag allowlist in `src/index.ts`), #163 (trusted docs moved to the
project root) and #166 (vitest 4 → 5). Pass 3 is this one, after review round 2 added `displayPath`
and `docs/troubleshooting.md` and `main` advanced again to #171. Each pass re-ran the partition and
both gate captures **from scratch** on freshly installed deps rather than carrying numbers forward:
a verdict computed against a superseded base is not a verdict about what is being merged. All three
passes agree.

## Partition

`check-regress.mjs scope` → **`escaped: []`** (exit 0). The four changed paths are exactly the four
the plan declares, so the build did not leave its `## Files`:

| inside (changed)             | declared in `PLAN.md` |
| ---------------------------- | --------------------- |
| `src/lib/pharn-config.ts`    | yes                   |
| `tests/pharn-config.test.ts` | yes                   |
| `CHANGELOG.md`               | yes                   |
| `docs/troubleshooting.md`    | yes (round 2)         |

`docs/troubleshooting.md` was added to the plan's `## Files` **before** it was written, and the scope
was re-derived from the amended plan — so the fix#7 hook gated the docs edit the same way it gated
the first three. Amending the plan is the declared route for widening scope; writing outside `##
Files` and reconciling afterwards is not.

`outside_eval_pairs` is empty (no committed eval pairs), and the 23 `*.test.mjs` / `*.test.cjs`
floor tests are all outside the feature — they run inside the `test` and `validate` gates below.

## Gates — base → head

| gate           | base | head |
| -------------- | ---- | ---- |
| `format:check` | 0    | 0    |
| `lint`         | 0    | 0    |
| `lint:md`      | 0    | 0    |
| `typecheck`    | 0    | 0    |
| `test`         | 0    | 0    |
| `validate.mjs` | 0    | 0    |

The style gates were run even though the deterministic skip rule permits omitting them (`inside`
touches no shared style config, so a style flip over byte-identical outside files is impossible).
Running them is strictly more information and keeps the gate set identical to this repo's
established six-gate table; the sets match on both sides, so the verdict is not `inconclusive`.

`check-regress.mjs verdict` → **`no-regressions`** (exit 0). `regressions: []`, `pre_existing: []`.

## One transient, recorded rather than hidden

The first HEAD capture returned `test: 1`. The failure was
`tests/lint-gate.test.ts > still flags __dirname and require in an ESM .mjs`, and its message was
`Test timed out in 5000ms` — the known load-sensitive gate this repo already warns about, which
shells out to `eslint` under a 5s vitest default while the baseline worktree's gates were competing
for the same machine. It was **not** treated as a result on either reading: the file was re-run
standalone (7/7 pass, 10.2s), `npm test` was then run three further times at HEAD (all exit 0, 1132
passing), and the whole HEAD gate set was re-captured on an idle machine — which is the `test: 0`
recorded above. Nothing about the flake touches `pharn-config`; the timing-out test lints a planted
`.mjs` fixture.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Honest residual (P0/P7): `/pharn-dev-regress` catches exactly what its suite catches, nothing more.
A regression that no deterministic check covers is invisible here. The claim is
"deterministically-detectable breakage outside the feature is caught," **not** "nothing broke."

One gate this table cannot see is `test:coverage`, which CI runs and `npm run check` does not. It
was re-run at head against the ratchet: **exit 0**, 97.28 / 92.85 / 97.66 / 98.14 against the floors
97 / 92 / 97 / 97. `src/lib/pharn-config.ts` itself measured 95.16 / 92.85 / 100 / 98.21.
