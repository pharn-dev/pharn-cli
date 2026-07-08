# SHIP — seam-config-block (advisory roll-up)

`/pharn-dev-ship` gated (non-`--loop`) run. This file records **that the chain ran and its floor
verdicts** — it is **not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order, and where the run ended

`plan → [GATE 1: approved as written] → grill → build → regress → verify → review → [GATE 2]`

The run ended at **GATE 2 (post-review human decision)** — the normal terminus, not a RED-verdict STOP.
Every stage proceeded on its own structural floor verdict (below); none came back non-GREEN.

## Structural verdicts read, verbatim (the only floor-grade facts here)

| stage     | verdict source                                          | value read       |
| --------- | ------------------------------------------------------- | ---------------- |
| build     | `node .dev/floor/validate.mjs .` exit code              | `0` (GREEN)      |
| regress   | `regression-report.json` `.verdict`                     | `no-regressions` |
| verify    | `verify-report.json` `.verdict`                         | `PASS`           |

Corroborating (build stage, the repo's real floor): `npm run check` exit `0`
(format:check → lint → typecheck → test, 516 tests). regress base = `d1c4829`; outside gates
`tests` + `validate` held `0 → 0`; scope check `escaped: []` (no build escape). verify floor gates
`test/validate/lint/format:check/lint:md` all `0`; `verifiers.registered = 0` (floor-only).

## Advisory stages (gate nothing)

- **GRILL** → `.dev/features/seam-config-block/GRILL.md`. 2 advisory concerns (the floor-cross-check
  point); **folded into the build** as a test spawning the real `check-seam-config.mjs` against
  `DEFAULT_SEAM_CONFIG`.
- **REVIEW** → `.dev/features/seam-config-block/REVIEW.md` (cited, not restated — P4). No floor-gate
  (blocking) finding; **4 advisory findings** (2 important P1 test-coverage-parity, 2 minor). It carries
  a **proposed lesson candidate** (human-gated via `/pharn-dev-memory-promote`; not written to canon).

## The standing decision is the human's

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push,
commit, or seal. The 2 important REVIEW findings (add `expect(written.seam).toEqual(DEFAULT_SEAM_CONFIG)`
in `install.test.ts` and the `config!.seam` counterpart in `init-archetype.test.ts`) are the concrete,
cheap thing to weigh before merge.
