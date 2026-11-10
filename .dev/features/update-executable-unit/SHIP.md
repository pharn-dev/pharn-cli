# SHIP — update-executable-unit

Stages run, in order: `/pharn-dev-plan` → GATE 1 (approved as written; Q1 commands in the unit = yes, Q2 hold root migration = yes) → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`. The run ended at **GATE 2**.

## Structural verdicts (verbatim)

- `/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit **0** (`npm run check` green; `npm run build` clean)
- `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`no-regressions`**
- `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`PASS`**

## Build note

New `src/lib/executable-unit.ts` (`isExecutableUnitPath`, a path-only test: the floor dir, the hooks and the product commands). `planUpdate` gains a hold pass: when the run moves SKILLS_VERSION, there is no `--force`, and any unit file is skipped, every unit write becomes a `held` skip. Effects of a hold:

- the version is withheld;
- `pendingSkillsVersion` is null;
- the root migration waits;
- an `EXECUTABLE UNIT` note prints before the confirm and in the report, and in the text dry run;
- `--dry-run --json` gets the additive `plan.executableUnit`;
- the exit code is 0.

Grill findings folded in: hold only on a version move (keeps same-version re-opens bounded), and name the hold before the confirm.

Deviations from the approved `## Files`, each added to PLAN.md before writing:

- `tests/update-report.test.ts`: the fixture needs the new field.
- `tests/update.test.ts`: an existing test relied on a restored hook being written while every other file was unverifiable, which is exactly the removed behavior. Its failing write moved to a capability file. Hold tests were added.
- `tests/release-consistency.test.ts`: `KNOWN_TAGS` gains `v0.17.0`, as every release PR does.

Release: version 0.18.0 in `package.json` and `package-lock.json`, with a `## [0.18.0]` CHANGELOG section and its compare links.

## Pointers

- `.dev/features/update-executable-unit/REVIEW.md`: GREEN, 0 floor-gate findings, 5 advisory.
- `.dev/features/update-executable-unit/GRILL.md`: advisory, 5 concerns.

Nothing was committed, pushed or merged.

_Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate._
