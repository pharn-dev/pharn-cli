# SHIP — init-archetype-default (gated chain roll-up)

**Increment:** Make the archetype flow the default (and only) `pharn init`; remove the dead legacy module/wizard init path. `runInit()` now calls `runInitArchetype()` unconditionally; `runInitLegacy`/`runInitV2`/`loadManifest` + 19 orphaned legacy files deleted; `--archetype` kept as a documented no-op alias; `manifest.ts`/`install-modules.ts`/`installer.ts`/`wizard.ts` retained for `add`/`update` legacy-config back-compat (Scope B — deleting them — rejected as multi-increment, breaks the documented `pharn update` guarantee).

**Where the run ended:** GATE 2 (post-review human gate). No RED-verdict STOP occurred. Awaiting the human's merge / fix / abandon decision.

## Stages run, in order

| stage         | outcome / verdict read                                               |
| ------------- | ------------------------------------------------------------------- |
| `/pharn-dev-plan`      | Plan written; **GATE 1** approved (Scope A-clean + `--archetype` no-op alias). |
| `/pharn-dev-grill`     | Advisory — 5 concerns (0 blocking, 2 important, 3 minor). Gated nothing. `GRILL.md`. |
| `/pharn-dev-build`     | Floor **GREEN** — `npm run check` exit **0** (561 tests pass).       |
| `/pharn-dev-regress`   | **`no-regressions`** (`check-regress.mjs verdict` exit 0).           |
| `/pharn-dev-verify`    | **`PASS`** (`check-verify.mjs` exit 0; all 5 floor gates 0).         |
| `/pharn-dev-review`    | Advisory — **GREEN**, 0 blocking floor-findings. `REVIEW.md`.        |

## Structural verdicts read (verbatim)

- **`/pharn-dev-build`** → `npm run check` exit code = **0** (the real floor for a TypeScript increment; `validate.mjs` adds no gate here — no markdown capability was added, and its working-tree RED is solely the gitignored `test-app/` fixture, GREEN over the tracked/CI scope).
- **`/pharn-dev-regress`** → `.dev/features/init-archetype-default/regression-report.json` `.verdict` = **`"no-regressions"`**. (Honest note: the first capture showed a spurious `validate` flip from the untracked `test-app/` build artifact; the gate was re-measured over the consistent tracked scope and the deterministic verdict re-run — see `REGRESSION.md`.)
- **`/pharn-dev-verify`** → `.dev/features/init-archetype-default/verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates: []`).

## Advisory inputs for the human (cited, not restated — P4)

- **`.dev/features/init-archetype-default/REVIEW.md`** — 4 lenses GREEN; one **important** advisory finding: deferred doc-sync (CLAUDE.md / `docs/commands/init.md` still describe the deleted legacy init flow — recommend a follow-up increment). Two lesson candidates proposed (the `## Files` deletion/glob format gotcha; the `test-app/` whole-repo `validate` scope gotcha) — NOT promoted; a gated `/pharn-dev-memory-promote` run decides.
- **`.dev/features/init-archetype-default/GRILL.md`** — advisory pre-build interrogation; grill #2 (sharpen the no-404 guard) was folded into the build; grill #1 (doc-sync) is the deferred item above.

## Standing decision

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or wise; that is the human's call at the post-review gate. `/pharn-dev-ship` does not merge, push, commit, or apply the `PHARN ✓ reviewed` seal.

**Human decision required (GATE 2): merge / fix / abandon.** If *merge*, note the deferred doc-sync (CLAUDE.md + `docs/commands/init.md`) as an immediate follow-up.
