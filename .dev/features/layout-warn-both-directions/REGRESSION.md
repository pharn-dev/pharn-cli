# REGRESSION — layout-warn-both-directions

**Base:** `210d0e487ddb6cd6aceba1fa07bf2c4a7574dea9` (`210d0e4`, `main`).
Resolved by the deterministic state test (Step 1.1), not chosen: `git status --porcelain` is non-empty
— a working-tree dogfood build — so `base = HEAD`. The baseline was therefore read from a clean
`git worktree` at that SHA, i.e. the repo **without** this increment's uncommitted changes.

## Inside / outside partition (computed by `check-regress.mjs scope`, not by judgment)

`scope` exit **0** — `"escaped": []`, so **no fix #7 breach**: every changed path is covered by a
declared write pattern.

**Inside (7 paths).** The plan's four `## Files`, plus the loop-owned artifacts that ride along:

| path                                                        | declared by                                        |
| ----------------------------------------------------------- | -------------------------------------------------- |
| `src/commands/update.ts`                                    | `PLAN.md` `## Files`                               |
| `tests/update.test.ts`                                      | `PLAN.md` `## Files`                               |
| `docs/commands/update.md`                                   | `PLAN.md` `## Files`                               |
| `CHANGELOG.md`                                              | `PLAN.md` `## Files`                               |
| `.pharn/writes-scope.json`                                  | always-writable scratch (`enforce-writes-scope.cjs`) |
| `.dev/features/layout-warn-both-directions/PLAN.md`         | `/pharn-dev-plan`'s own `writes:`                  |
| `.dev/features/layout-warn-both-directions/GRILL.md`        | `/pharn-dev-grill`'s own `writes:`                 |

**Declared-set construction is orchestration, and it is advisory — stated because it matters.** The
`--declared` list passed to `scope` is the plan's four paths **plus** `.pharn/**` and
`.dev/features/layout-warn-both-directions/**`. Those two patterns are not padding: `.pharn/**` is
always-writable scratch by the hook's own design, and each `.dev/features/<name>/*` artifact was
written under **its own stage command's** `writes:` frontmatter with the scope re-set immediately
before the write. Had they been omitted, `scope` would have reported a fix #7 escape for files no
build step wrote — a false breach. The **fix #7 guarantee itself remains floor-enforced** at each write
by `enforce-writes-scope.cjs`; this cross-check is a second, coarser look at the same fact.

**Outside:** 46 test files (`*.test.mjs` / `*.test.cjs` — the whole stdlib-testable universe, none of
them inside the changed set) and **0** eval pairs (`git ls-files '*/evals/expected/*.json'` is empty in
this repo, so there is no committed expected↔actual pair to range over).

## Gate set and the style-gate skip

Gate set decided **once** and applied identically to both sides (a mismatch would be `inconclusive`,
never a silent pass): `tests`, `validate`.

The style gates (`lint` / `format:check` / `lint:md`) were **skipped by the deterministic config-touch
rule** — `inside` touches none of `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`. Over the outside files, which are byte-identical at base and head, a style
result can flip **only** if shared config changed, so the flip is provably impossible here and the
`npm ci` cost in the baseline worktree was correctly not incurred. (Style over the **inside** files is
not this stage's job — it was already run at `/pharn-dev-build` Step 2b and is `/pharn-dev-verify`'s
deterministic gate.)

## Per-gate exit codes — `base → head`

| gate       | granularity           | base | head | flipped? |
| ---------- | --------------------- | ---- | ---- | -------- |
| `tests`    | 46 outside test files | 0    | 0    | no       |
| `validate` | whole-repo            | 0    | 0    | no       |

`regressions[]`: **empty**. `pre_existing[]`: **empty**.

**Named granularity limit (P7):** `validate` has no outside-only CLI scope, so a flip would be reported
at repo granularity. It does not fire here — both sides are 0 — and `/pharn-dev-build` halts on a RED
`validate`, which is why the baseline is green. Per-file precision lives in the scoped `tests` gate.

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

This verdict is a comparison of two exit-code maps by `.dev/floor/check-regress.mjs`; it rests on no
model judgment, and none was applied — a flipped gate would be a regression because the helper says so,
not because anyone assessed it. Only **ints and paths** were read; no finding free-text entered the
computation (P2).

**The honest residual (P0/P7):** `/pharn-dev-regress` catches exactly what its suite catches, and
nothing more. A regression that no deterministic check covers is invisible to it. The claim is
"deterministically-detectable breakage outside the feature is caught" — **not** "nothing broke", and
**not** any certification that this increment is correct or wise. Note in particular that the 46
outside gates are stdlib `node --test` files; the `vitest` suite that actually exercises
`src/commands/update.ts` is **inside** the changed scope by construction, so its greenness is evidence
from `/pharn-dev-build`'s floor (`npm run check` exit 0, 755 tests) and from `/pharn-dev-verify` — not
from this stage.
