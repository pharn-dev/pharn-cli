# SHIP — publish-oidc-trusted (advisory roll-up)

`/pharn-dev-ship` ran the gated chain for the six-edit conversion of `.github/workflows/publish.yml` to npm Trusted Publishing (OIDC). This file records **that the chain ran and its floor verdicts** — it is not a judgment, an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order

| # | stage | outcome |
| - | ----- | ------- |
| 1 | `/pharn-dev-plan` | PLAN.md written; **GATE 1** — human **approved** ("accepted, continue"). |
| 2 | `/pharn-dev-grill` | GRILL.md — advisory; **3 minor, 0 blocking**. Gates nothing. |
| 3 | `/pharn-dev-build` | Six edits applied to `publish.yml`. **RED-verdict → human gate** (see below). |
| 4 | `/pharn-dev-regress` | regression-report.json — verdict below. |
| 5 | `/pharn-dev-verify` | verify-report.json — verdict below. |
| 6 | `/pharn-dev-review` | REVIEW.md — advisory GREEN, 0 blocking, 2 minor. |

**Where the run ended:** **GATE 2** (post-review). The human decides **merge / fix / abandon**.

## Structural verdicts read (verbatim — the only inputs to proceed/stop)

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code = `1` (RED).** This is a **RED-verdict STOP**. It was **not** auto-cleared: it was presented at a **human gate**, where the human chose **"Continue the chain"** after it was proven that the RED is entirely from **untracked local `test-*/` app fixtures** (0 offenders outside `test-*/`; `validate` reads only `.md`, the change is `.yml`, so it is invariant; clean-worktree CI-equivalent = exit 0). The increment's operative floor, `npm run check`, was **GREEN** (378 tests).
- **`/pharn-dev-regress` → `regression-report.json .verdict` = `"no-regressions"`** (exit 0). Both suite gates (`tests`, `validate`) classified `pre_existing` (untracked-app artifacts, held constant across base/head; 0 gate-domain files changed). Proceed.
- **`/pharn-dev-verify` → `verify-report.json .verdict` = `"FAIL"`** — sole failing gate `validate` (`test`/`lint`/`format:check`/`lint:md` all GREEN). Recorded **faithfully as FAIL**, not massaged. Proven to be the **same** pre-existing untracked-app `validate` artifact (clean-worktree CI-equivalent = PASS). The chain continued **only** under the human's standing GATE-1/build authorization, given with explicit notice that "verify will surface the same validate.mjs condition."

## Honest note on the two non-GREEN verdicts

`/pharn-dev-build`'s `validate` RED and `/pharn-dev-verify`'s `FAIL` are the **same** repo-level condition: a working tree containing untracked `test-*/` app installs whose intentional `red/` fixtures make the whole-repo `validate` go red. It is **pre-existing**, **invariant under this `.yml`-only increment**, and **GREEN in a clean CI checkout**. This was surfaced honestly at each stage and proceeded past only by **explicit human decision**, never by the agent overriding a floor verdict. (`REVIEW.md` proposes a lesson candidate to codify this — human-gated via `/pharn-dev-memory-promote`, not written here.)

## Pointers (cited, not restated — P4)

- `.dev/features/publish-oidc-trusted/REVIEW.md` — 4 advisory lenses; GREEN, 0 blocking, 2 minor (a cosmetic `NODE_AUTH_TOKEN` comment mention at `publish.yml:44`; the bundled tag-guard, P7).
- `.dev/features/publish-oidc-trusted/GRILL.md` — advisory, 3 minor.
- `PLAN.md` external prerequisites (i)–(iii): the `npm-publish` GitHub environment + npmjs Trusted-Publisher config must exist out-of-band; first publish stays a manual local `npm publish`.

## Standing line

Chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, or seal.
