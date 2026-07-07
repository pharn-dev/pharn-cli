# SHIP — hallucinated-api lens (gated `/pharn-dev-ship` roll-up)

**Advisory roll-up only.** This records that the chain ran and its floor verdicts; it is **not** a "shipped", an
approval, or a `PHARN ✓ reviewed` seal. The standing decision is the human's, at GATE 2.

## Stages run, in order — ended at GATE 2 (post-review human decision)

| stage   | command              | structural floor verdict (read, not judged)                                          |
| ------- | -------------------- | ------------------------------------------------------------------------------------ |
| plan    | `/pharn-dev-plan`    | GATE 1 — **human approved "as written"** (advisory-only, P2, sev `important`)        |
| grill   | `/pharn-dev-grill`   | advisory; gates nothing — 4 minor/build-time concerns, 0 blocking                    |
| build   | `/pharn-dev-build`   | `validate.mjs` exit **0** → **GREEN, 22 capabilities** (21 → 22)                     |
| regress | `/pharn-dev-regress` | `regression-report.json` `.verdict` = **`no-regressions`** (exit 0)                  |
| verify  | `/pharn-dev-verify`  | `verify-report.json` `.verdict` = **`PASS`** (exit 0; all 5 gates green)             |
| review  | `/pharn-dev-review`  | GATE 2 — floor GREEN; **no floor-gate (blocking) findings**; 2 advisory observations |

**Where the run ended:** **GATE 2** (post-review). No RED-verdict STOP occurred — every structural floor verdict
came back GREEN/clean/PASS.

## The structural verdicts, verbatim (the floor-grade reads `/pharn-dev-ship` branched on)

- **build → `validate.mjs` exit 0:** `FLOOR: GREEN — 22 capabilities checked in .`
- **regress → `regression-report.json` `.verdict`:** `"no-regressions"` (base `2698dd9`; outside gates
  `tests` / `validate` / `structural:trust-fence` all `0/0`; `regressions: []`, `pre_existing: []`).
- **verify → `verify-report.json` `.verdict`:** `"PASS"` (`gates: {test:0, validate:0, lint:0, format:check:0,
lint:md:0}`, `failing_gates: []`, `verifiers: {registered:0}`).

## Pointers (cite, don't restate — P4)

- **`.dev/features/hallucinated-api-lens/REVIEW.md`** — the 4 advisory lenses + the two GATE-2 advisory
  observations (furthest-advisory value question; `finding_count` pins an expected judgment). Read it before
  deciding.
- **`.dev/features/hallucinated-api-lens/GRILL.md`** — advisory pre-build interrogation (4 minor/build-time
  concerns; finding F3 — the ★ trip-wire `file` line — was caught and fixed at build).
- **`.dev/features/hallucinated-api-lens/{PLAN,REGRESSION,VERIFY}.md`** + `*.json` — the full trace.

## What landed (product surface — `git status`: two untracked dirs)

- `pharn-review/hallucinated-api/` — 1 lens (`hallucinated-api.md`, `role: lens`, advisory-only, `enforces: [P2]`)
  - 3 eval cases + 6 expected (10 files), mirroring `input-validation`. Advisory-only floor (membership); **no
    scanner** (no honest deterministic API-existence check exists — investigated and rejected).
- Nothing else changed — no floor tooling, no command, no trusted-doc edit (fix #2 intact).

## Honest close (P0)

The chain ran; the named floor verdicts are as shown above (build GREEN, regress `no-regressions`, verify `PASS`,
review floor GREEN with 0 blocking findings). **This is NOT a judgment that the increment is good or wise to
ship** — the advisory observations in `REVIEW.md` (an advisory-only lens with zero deterministic API-existence
signal) are exactly the kind of thing the human weighs. That is the human's call at the **post-review gate**
(merge / fix / abandon). `/pharn-dev-ship` does not merge, push, or apply the `PHARN ✓ reviewed` seal.
