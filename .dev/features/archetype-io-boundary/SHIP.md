# SHIP — archetype-io-boundary (gated `/pharn-dev-ship` roll-up)

**Advisory roll-up only.** This records that the chain ran and its floor verdicts. It is **not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal. `/pharn-dev-ship` adds no new floor primitive — every verdict below belongs to a sub-stage.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | **GATE 1** — plan written + human-approved *"Approve as written"* (scope reconciled at a discovery halt: **Add I/O boundary** + **Drop — stay spec-aligned**) |
| 2 | `/pharn-dev-grill` | advisory — 4 minor concerns (0 blocking); gates nothing |
| 3 | `/pharn-dev-build` | floor **GREEN** |
| 4 | `/pharn-dev-regress` | **no-regressions** |
| 5 | `/pharn-dev-verify` | **PASS** |
| 6 | `/pharn-dev-review` | GREEN (0 floor-gate, 1 advisory) — reached **GATE 2** |

**Where the run ended:** at **GATE 2** (post-review). No stage returned a non-GREEN structural verdict, so there was no RED-verdict STOP.

## Structural verdicts read (verbatim — the proceed/stop basis)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **0** (GREEN). *(The real correctness floor `npm run check` was also exit 0 — 372 tests, format/lint/typecheck clean; the build HALTs on a red floor, so a clean handoff is itself the green build verdict.)*
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (outside gates `tests` 0→0, `validate` 0→0; `regressions[]` empty).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates[]` empty; gates `test`/`validate`/`lint`/`format:check`/`lint:md` all 0; verifiers registered: 0).

Each verdict is floor-grade (its stage's own checker). `/pharn-dev-ship`'s act of reading them and proceeding is advisory orchestration.

## Pointers (cite, do not restate — P4)

- **Review (GATE 2 reading):** `.dev/features/archetype-io-boundary/REVIEW.md` — 4 lenses GREEN; the one advisory finding is a **P5 intent question** (missing `package.json` silently collapses to `['lib']`, `src/lib/detect-archetype.ts:39`), built as approved and surfaced for your decision.
- **Grill (advisory):** `.dev/features/archetype-io-boundary/GRILL.md` — 4 minor concerns; the two cheapest, in-scope ones (a valid-no-deps test; a non-object guard + mis-shaped-`dependencies` test) were folded into the build.
- Machine reports: `regression-report.json`, `verify-report.json`. Human renders: `REGRESSION.md`, `VERIFY.md`.

## What landed

- `src/lib/detect-archetype.ts` — `detectArchetypesFromProject(cwd): Archetype[]`, the I/O boundary reading `<cwd>/package.json` and delegating to the pure `detectArchetypes`.
- `tests/detect-archetype.test.ts` — 12 assertions (incl. the frontend-only→`spa` inverse, missing/malformed/mis-shaped→`lib`, determinism).

## The standing decision is yours (GATE 2)

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or seal. Decide **merge / fix / abandon**.
