# SHIP — capability-resolver (advisory roll-up)

`/pharn-dev-ship` (gated mode) ran the build loop in order. It adds **no** floor primitive: every verdict below belongs to a sub-stage. This roll-up records **that the chain ran and its floor verdicts** — it is **not** a judgment that the increment is good or wise.

## Stages run, in order

| stage | outcome | verdict source (read verbatim) |
| --- | --- | --- |
| `/pharn-dev-plan` | approved as written (**GATE 1**) | human plan-acceptance (+ 3 detail Qs confirmed) |
| `/pharn-dev-grill` | advisory — 6 concerns (0 blocking-severity, 2 important, 4 minor); spec-hash matched | advisory (no structural verdict; gates nothing) |
| `/pharn-dev-build` | **GREEN** | `node .dev/floor/validate.mjs .` exit **0** (and `npm run check` exit 0) |
| `/pharn-dev-regress` | **no-regressions** | `regression-report.json` `.verdict` = `"no-regressions"` (exit 0) |
| `/pharn-dev-verify` | **PASS** | `verify-report.json` `.verdict` = `"PASS"` (exit 0) |
| `/pharn-dev-review` | GREEN — 0 blocking, 4 advisory | advisory (no structural verdict) |

**Where the run ended:** **GATE 2** (post-review). The chain reached the end with every floor verdict green; no RED-verdict STOP occurred.

## Structural floor verdicts (the only guarantees here)

- **build** → `.dev/floor/validate.mjs .` exit **0** (GREEN). Product floor `npm run check` also exit 0 (format:check + lint + typecheck + 361 tests).
- **regress** → `regression-report.json` `.verdict` = **`no-regressions`** (both outside gates `tests`, `validate` were `0→0`; 44 floor/hook suites re-run at base HEAD and at head).
- **verify** → `verify-report.json` `.verdict` = **`PASS`** (gates `test`/`validate`/`lint`/`format:check`/`lint:md` all 0; 0 verifiers registered — floor-only).

## Pointers (cited, not restated — P4)

- `.dev/features/capability-resolver/REVIEW.md` — 4 advisory findings (1 important: the deferred fetch boundary must enum-validate the untrusted index's `applies`/name/role so selection rests on enum-gated fields, P2/fix#1; 3 minor: allowlist-entry data untested, `types.ts` aggregation, both bounded). **GREEN, 0 blocking.**
- `.dev/features/capability-resolver/GRILL.md` — advisory pre-build interrogation (2 important folded into the build: P3 type routing, devDeps coverage; the P4 `role`-enum-width concern was left as the approved 2-value shape and rides here for your call).

## The standing decision is yours (GATE 2)

`/pharn-dev-ship` **presents**; it does not merge, push, commit, or apply the `PHARN ✓ reviewed` seal. The named floor verdicts are as shown above — **this is NOT a judgment that the increment is good or wise; that is your call at the post-review gate** (merge / fix / abandon).
