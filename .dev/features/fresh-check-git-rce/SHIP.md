# SHIP — fresh-check-git-rce

Gated `/pharn-dev-ship` run (no `--loop`). Increment: neutralize the git-config-injection RCE in
`src/steps/fresh-check.ts` by routing every git call through one hardened, shell-free helper.

## Stages run, in order

| stage | outcome |
| --- | --- |
| `/pharn-dev-plan` | PLAN.md written; **GATE 1** — human approved as written (fix strategy: harden) |
| `/pharn-dev-grill` | GRILL.md — advisory, 3 concerns (0 blocking); gated nothing |
| `/pharn-dev-build` | files written; floor GREEN; red→green demonstrated |
| `/pharn-dev-regress` | regression-report.json written |
| `/pharn-dev-verify` | verify-report.json written |
| `/pharn-dev-review` | REVIEW.md written; **GATE 2** — run ends here for the human |

**Where the run ended:** GATE 2 (post-review). Not a RED-verdict STOP — every floor verdict came back
GREEN.

## Structural floor verdicts read (verbatim — these, not my judgment, drove proceed)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **0** (GREEN). Also the repo floor
  `npm run check` GREEN (519 vitest tests, incl. the new RCE cases; lint; typecheck; format).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`no-regressions`** (base `c44170e` → head;
  gates `validate` / `floor-tests` / `vitest-outside` all `0→0`; `regressions: []`, `pre_existing: []`).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`PASS`** (`test`/`validate`/`lint`/`format:check`/
  `lint:md` all `0`; `failing_gates: []`; 0 verifiers registered → floor gates own the verdict).

## Pointers (cited, not restated — P4)

- Advisory review: `.dev/features/fresh-check-git-rce/REVIEW.md` — verdict GREEN, 0 blocking, 3 minor
  advisory findings + 1 proposed lesson candidate (a human-gated `/pharn-dev-memory-promote` decision, not
  written to canon).
- Advisory grill: `.dev/features/fresh-check-git-rce/GRILL.md` — its important finding (demonstrate
  red→green) was folded into the build and shown.
- Plan / intent: `.dev/features/fresh-check-git-rce/PLAN.md` (spec_content_hash
  `bca940a5…d729d3c4e`, re-verified at the build gate).

## Honest line (P0)

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment
is good or wise; that is the human's call at the post-review gate. `/pharn-dev-ship` did not merge, push,
commit, or apply any `PHARN ✓ reviewed` seal. Changes remain uncommitted in the working tree.
