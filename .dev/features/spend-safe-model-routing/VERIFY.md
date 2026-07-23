# VERIFY — spend-safe-model-routing

FLOOR layer (owns the verdict) — deterministic gates re-run over the repo with the feature in it
(HEAD = `844bc92`):

| Gate           | Exit | Notes                                                                         |
| -------------- | ---- | ----------------------------------------------------------------------------- |
| `test`         | 0    | `npm test` — full vitest suite, **395/395** (incl. the increment's own tests) |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — **clean checkout** of HEAD (CI truth)            |
| `lint`         | 0    | `npm run lint` (eslint src)                                                    |
| `format:check` | 0    | `npm run format:check` (prettier, whole repo)                                 |
| `lint:md`      | 0    | `npm run lint:md` (markdownlint — covers `docs/reference/pharn-config.md`)     |

> **`validate` note (honest, not hidden).** In the *dirty local working tree* `validate.mjs .` exits **1**,
> caused **only** by gitignored `test-*/` local install trees (intentional red negative fixtures created by
> `build:install-local`) — they are not part of the committed repo and are absent on a clean checkout. A
> fresh `git worktree` of HEAD (what CI sees) yields `validate` = **0**, used above. The `/pharn-dev-regress`
> stage independently captured the same (0 at both base and head in fresh worktrees). The verdict uses the
> clean-checkout truth; the increment added no PHARN markdown capability, so `validate` is vacuously green
> for it regardless.

ADVISORY layer (annotates only, never flips the verdict): **no verifiers registered — floor gates only**
(`count-verifiers.mjs` → `{"registered":0}`). `verifiers: { registered: 0, findings: [] }`.

## Verdict (FLOOR — `check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS** — every gate exit 0, `failing_gates: []`.

Honest residual (P0/P7): verified = the named gates passed; this is **NOT** a guarantee of correctness
beyond what those gates check — verifier concerns would be advisory help, not assurance, and none are
registered today. The one property this increment most wants asserted — that the "Models per stage" block
is rendered **from** the written config and not re-hardcoded — is discharged by a floor test
(`formatModelRoutingLines` fed a non-default routing in `tests/model-routing.test.ts`), which is inside
`npm test` (gate `test` = 0).
