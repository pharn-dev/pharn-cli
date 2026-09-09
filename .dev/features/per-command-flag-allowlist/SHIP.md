# SHIP — per-command flag allowlist (audit P-13)

## Stages run, in order

| stage    | outcome                                                                   |
| -------- | ------------------------------------------------------------------------- |
| plan     | `PLAN.md` written; halted at **GATE 1**                                   |
| _human_  | **approved** with one change (gate above the `--help`/`--version` short-circuits) + 3 answered questions |
| grill    | `GRILL.md` — 7 advisory concerns (0 blocking); 4 acted on before build     |
| build    | 7 files written, all inside the plan's `## Files`                         |
| regress  | `regression-report.json`                                                  |
| verify   | `verify-report.json`                                                      |
| review   | `REVIEW.md` — 0 floor-gate findings, 4 advisory (all minor)               |

**The run ended at GATE 2** — the post-review human decision. No stage returned a non-GREEN verdict,
so nothing STOPped the chain.

## The structural verdicts read, verbatim

- **build** → `node .dev/floor/validate.mjs .` exit code **`0`** (`FLOOR: GREEN — 0 capabilities
  checked in .`). `npm run check` was GREEN before this: format:check, lint, lint:md, typecheck, and
  1149 vitest tests across 56 files.
- **regress** → `regression-report.json` `.verdict` = **`"no-regressions"`** (helper exit 0).
  `regressions: []`, `pre_existing: []`, `escaped: []`.
- **verify** → `verify-report.json` `.verdict` = **`"PASS"`** (helper exit 0). `failing_gates: []`;
  gates `format:check`/`lint`/`lint:md`/`test`/`typecheck`/`validate` all `0`.

Separately (not a stage verdict): `npm run test:coverage`, the gate CI actually runs, exits **0** —
97.08 / 92.5 / 97.58 / 97.94 against floors of 97 / 92 / 97 / 97.

## Pointers (cited, not restated)

- `.dev/features/per-command-flag-allowlist/PLAN.md` — the approved intent, with the GATE 1 decisions
  folded in at the top and the four grill follow-ups marked.
- `.dev/features/per-command-flag-allowlist/GRILL.md` — advisory; gated nothing.
- `.dev/features/per-command-flag-allowlist/REVIEW.md` — advisory; read it for the four minor
  findings and the note about `tests/lint-gate.test.ts`'s pre-existing load-sensitivity.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** No merge, no seal, no
`PHARN ✓ reviewed`.
