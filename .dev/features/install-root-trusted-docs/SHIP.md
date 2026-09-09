# SHIP — install-root-trusted-docs

Gated `/pharn-dev-ship` run (no `--loop`). Stages ran in order:

`/pharn-dev-plan` → **GATE 1 (human approved)** → `/pharn-dev-grill` → `/pharn-dev-build` →
`/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → **GATE 2 (this halt)**.

The run ended at **GATE 2**, not at a RED-verdict STOP.

## Structural verdicts read, verbatim

| stage                | verdict source                    | value                        |
| -------------------- | --------------------------------- | ---------------------------- |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .`  | exit **0** (`FLOOR: GREEN`)  |
| `/pharn-dev-regress` | `regression-report.json .verdict` | **`"no-regressions"`**       |
| `/pharn-dev-verify`  | `verify-report.json .verdict`     | **`"PASS"`**                 |

`regressions: []`, `pre_existing: []`, `failing_gates: []`. Verify gates: `test` 0, `validate` 0,
`lint` 0, `format:check` 0, `lint:md` 0, `typecheck` 0. Verifiers registered: **0** (floor gates only).

## GATE 1 record

The plan halted for approval and the human approved it **as written**, resolving all three open
questions: (1) root destination for `THREAT-MODEL.md` / `LIMITS.md` — approved on the measured citation
evidence; (2) `docs/getting-started.md` in scope; (3) outro lists the paths plus a warn for anything the
clone did not ship. Recorded here because `PLAN.md`'s `## Open questions (HALT)` section states the
questions, not their answers.

## Build note

`PHARN_TRUSTED_DOCS`' last two entries changed from `pharn/THREAT-MODEL.md` / `pharn/LIMITS.md` — paths
with no history in pharn-oss — to the root paths upstream actually ships, making the doc prefix per-doc
rather than per-layout. `installCapabilities` now returns the docs it wrote, and
`steps/install-archetype.ts` reports them by name and warns about any the clone omitted, replacing an
unconditional `docs written` line. Two fixtures that had invented the upstream shape were rewritten to
mirror it. Docs and CHANGELOG follow, including the honest note that existing installs do not
self-heal.

Two deviations from the approved plan, both recorded rather than absorbed:

- **`README.md` added to `## Files` at build time.** `tests/docs-install-tables.test.ts` derives its
  `REQUIRED` set from `layoutPaths('pharn').docs`, so correcting the constant made the floor demand it;
  there was no in-scope way to reach green. Amended in `PLAN.md` ("Build-time amendment") and re-scoped
  through `set-writes-scope.cjs --from-plan` — the hook was never bypassed.
- **One P1 finding closed during review.** `/pharn-dev-review` found the zero-docs outro branch untested
  and a test was added; the finding is recorded in `REVIEW.md` rather than erased.

## Pointers (cited, not restated — P4)

- `.dev/features/install-root-trusted-docs/PLAN.md` — the approved intent + the measured evidence table
- `.dev/features/install-root-trusted-docs/GRILL.md` — advisory; 5 concerns (0 blocking, 2 important, 3 minor)
- `.dev/features/install-root-trusted-docs/REGRESSION.md` / `regression-report.json`
- `.dev/features/install-root-trusted-docs/VERIFY.md` / `verify-report.json`
- `.dev/features/install-root-trusted-docs/REVIEW.md` — advisory verdict + a proposed (unpromoted) lesson

## Known local noise (not a verdict input)

`tests/lint-gate.test.ts` fails 2–6 tests per local run by 5000 ms timeout, never by assertion, and
reproduces identically at the untouched baseline `558b8dd`. Outside this increment's scope; detailed in
`REVIEW.md`.

---

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate. No merge, no seal.
