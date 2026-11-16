# SHIP — core-182-update-always-plans (CORE-182, C5.3)

Stages run, in order: `/pharn-dev-plan` (halted at GATE 1; approved by the orchestrator for the user, answers recorded
in PLAN.md) → `/pharn-dev-grill` (advisory, `GRILL.md`) → `/pharn-dev-build` → `/pharn-dev-regress` →
`/pharn-dev-verify` → `/pharn-dev-review` → one advisory fix (a same-version layout-move test) → `/pharn-dev-regress` and
`/pharn-dev-verify` re-run. The run ends at GATE 2.

Build note: update's same-version early return and its eight re-open signals are gone (`missing-installed.ts`,
`agent-surface.ts`, `modelsMigrationPending`, `pendingRootMigration` and the frozen/channel/ignore-file checks); every
run downloads and plans, an empty plan prints `Up to date.` with no prompt and no write, and `--dry-run --json` reports
it as `up-to-date` with `plan: null` (the unreleased `plan.changesNothing` key is gone). The header note prints after
the plan, only when it changes something. The ahead-of-source guard is unchanged. Tests rewritten in place; the
deleted helpers' tests deleted (accepted at GATE 1).

Structural verdicts, verbatim:

- `/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit `0`; `npm run check` GREEN (`CI=1`), `npm run build` and
  `npm run test:coverage` green.
- `/pharn-dev-regress` → `regression-report.json` `.verdict`: `no-regressions` (at `27d96ef0` and again at `3aa4eea6`).
- `/pharn-dev-verify` → `verify-report.json` `.verdict`: `PASS` (at `27d96ef0` and again at `3aa4eea6`).

Review: see `REVIEW.md` (0 floor-gate findings; advisory findings listed there). Grill: see `GRILL.md` (advisory).

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is
the human's call at the post-review gate.
