# SHIP — release-0-7-0

Gated mode. Increment: bump `package.json` / `package-lock.json` from `0.6.0` to `0.7.0` and fold
`CHANGELOG.md`'s `[Unreleased]` into `## [0.7.0] — 2026-09-26` — the release half of roadmap Phase 2.0
(#231).

## Gate decisions — model decisions under delegation, NOT human approvals

The maintainer delegated plan approval (GATE 1) and the merge/fix decision (GATE 2) to the model on
2026-09-25, and authorized cutting the GitHub release that publishes to npm. Both gates below were
decided by the model (`claude-opus-5-5`) under that delegation; no human approved them.

| gate   | decision (model, under delegation)                                                                |
| ------ | ------------------------------------------------------------------------------------------------- |
| GATE 1 | Plan approved as written (version fixed by the maintainer and by #231's "before 0.7.0" wording).  |
| GATE 2 | **Merge** once the PR's required checks are green; then `gh release create v0.7.0 --target main`. |

## Stages run, in order

| #   | stage                | outcome                                         |
| --- | -------------------- | ----------------------------------------------- |
| 1   | `/pharn-dev-plan`    | `PLAN.md`; GATE 1 (delegated)                   |
| 2   | `/pharn-dev-grill`   | `GRILL.md` — 3 advisory concerns, none blocking |
| 3   | `/pharn-dev-build`   | 3 files; `npm run check` GREEN                  |
| 4   | `/pharn-dev-regress` | `regression-report.json`                        |
| 5   | `/pharn-dev-verify`  | `verify-report.json`                            |
| 6   | `/pharn-dev-review`  | `REVIEW.md`; GATE 2 (delegated)                 |

## Structural verdicts read, verbatim

| stage                | verdict source                             | value              |
| -------------------- | ------------------------------------------ | ------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit code | `0`                |
| `/pharn-dev-regress` | `regression-report.json` `.verdict`        | `"no-regressions"` |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`            | `"PASS"`           |

This repo has no `pharn.config.json`, so no `models` block assigns stage models: every stage ran on the
session model, `claude-opus-5-5`.

Pointers: `REVIEW.md` (GATE 2), `GRILL.md` (advisory), `REGRESSION.md` / `VERIFY.md`.

---

The chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate, made here by the model under the
maintainer's explicit delegation and recorded as such. Nothing here is a `PHARN ✓ reviewed` seal, an
approval, or a self-issued "shipped".
