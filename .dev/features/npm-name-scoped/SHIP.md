# SHIP — npm-name-scoped (`pharn` → `@pharn-dev/pharn`)

Advisory roll-up of a gated `/pharn-dev-ship` run. `/pharn-dev-ship` adds **no** floor primitive — every verdict below belongs to a sub-stage. This file records **that the chain ran and its floor verdicts**; it is **not** an approval, a "shipped", or a `PHARN ✓ reviewed` seal.

## Where the run ended

**GATE 2 (post-review human decision).** The chain reached review; the human decides **merge / fix / abandon**. One mid-chain **RED-verdict STOP** occurred at `/pharn-dev-verify` (below) and was handed to the human, who chose to continue to `/pharn-dev-review` (the FAIL is pre-existing/environmental). GATE 1 (plan approval) was cleared earlier.

## Stages run, in order, with each structural verdict read VERBATIM

| stage | structural verdict (floor) | source |
| --- | --- | --- |
| `/pharn-dev-plan` | approved by human at **GATE 1** (OQ1 edit-src, OQ2 regenerate-lock, OQ3 edit-CHANGELOG-in-place) | `PLAN.md` |
| `/pharn-dev-grill` | **advisory — no verdict** (4 concerns: 1 important lock-diff-scope, 3 minor). Gates nothing. | `GRILL.md` |
| `/pharn-dev-build` | **`npm run check` exit 0 (GREEN floor)**; `npm pack --dry-run` → `pharn-dev-pharn-0.3.0.tgz`. (`validate.mjs` not applicable — no markdown capability added; whole-repo `validate` RED is pre-existing.) | build note / floor |
| `/pharn-dev-regress` | **`.verdict = "no-regressions"`** (check-regress exit 0); `regressions: []`, `pre_existing: ["tests","validate"]` | `regression-report.json` |
| `/pharn-dev-verify` | **`.verdict = "FAIL"`** (check-verify exit 1); `failing_gates: ["validate"]` — pre-existing whole-repo `test-*/` contamination ONLY; `test`/`lint`/`format:check`/`lint:md` all 0 | `verify-report.json` |
| `/pharn-dev-review` | **advisory — no structural verdict** (GREEN advisory; 0 floor-blocking findings). `/pharn-dev-ship` computes no proceed/stop from it. | `REVIEW.md` |

## The `/pharn-dev-verify` RED-verdict, in context

`/pharn-dev-verify` is FAIL because `validate` is **whole-repo** and the repo carries gitignored `test-*/` install fixtures (a deliberate red fixture). `/pharn-dev-regress` **proved** this is RED→RED (`validate` `base:1/head:1`, `pre_existing`), and it is **identical** to the already-shipped `canonical-npm-name` increment. Every gate reflecting **this increment's** files is GREEN. The `test-*/`-scoping of the floor tooling is a known, separate cleanup (REVIEW proposed-lessons / prior REVIEW lesson #2), out of this increment's single axis.

## Pointers (cited, not restated — P4)

- **`REVIEW.md`** — the 4-lens advisory review (verdict GREEN-advisory; one minor P1 note; two proposed lessons on package-vs-local-bin classification and grep-misses-prose). Read it for the human decision.
- **`GRILL.md`** — advisory pre-build interrogation (the important finding — lock-diff scope — was honored: the lock diff is name×2 + version×2 only, no dependency churn).
- **`VERIFY.md` / `verify-report.json`**, **`REGRESSION.md` / `regression-report.json`** — the standing floor verdicts.

## What landed (product diff `907efac..5502b3b`, branch `feat/npm-name-scoped`)

`package.json` name → `@pharn-dev/pharn`; `package-lock.json` name+version; README/SECURITY/CLAUDE.md/CHANGELOG (`[0.3.0]` in place + E403 clarifier)/docs (getting-started, contributing, troubleshooting, RELEASING incl. blockquote rewrite)/issue-template package refs; two `src/*.ts` help/error strings (rebuilt into `dist`). **Binary `pharn` unchanged. `publish.yml` name-agnostic (unedited). Version stays `0.3.0`.**

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, tag, publish, or seal.

## Named operational caveat for the human (release-time, not a code change)

`@pharn-dev/pharn` is currently E404 (its `@0.2.0` was unpublished 2026-07-22, permanently burning `0.2.0`). Publishing `@pharn-dev/pharn@0.3.0` should succeed once outside npm's ~24 h post-unpublish window; attempted too soon it may fail with a policy error **distinct from** the E403 that motivated this change. `publishConfig.access: public` (already present) is now load-bearing for the scoped publish.
