# SHIP — ssrf lens (gated `/pharn-dev-ship` roll-up)

**Advisory roll-up.** `/pharn-dev-ship` ran PHARN's build loop in order and stopped at the human gate. It adds **no new floor primitive** — every verdict below belongs to a sub-stage's own deterministic checker. This file records **that the chain ran and its floor verdicts**; it is **not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages run (in order) + where the run ended

| stage                | structural verdict (read verbatim)                                      | source                          |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `/pharn-dev-plan`    | plan written + **approved (GATE 1)** — human chose _Approve as written_ | human gate (scope = scoped set) |
| `/pharn-dev-grill`   | ADVISORY — 2 minor concerns, 0 blocking (gates nothing)                 | `GRILL.md`                      |
| `/pharn-dev-build`   | **FLOOR: `validate.mjs` exit 0** → GREEN, 20 → 21 capabilities          | `.dev/floor/validate.mjs`       |
| `/pharn-dev-regress` | **FLOOR: `regression-report.json` `.verdict` = `no-regressions`**       | `regression-report.json`        |
| `/pharn-dev-verify`  | **FLOOR: `verify-report.json` `.verdict` = `PASS`** (5 gates exit 0)    | `verify-report.json`            |
| `/pharn-dev-review`  | ADVISORY — verdict GREEN, 0 floor-gate, 2 advisory-minor                | `REVIEW.md`                     |

**The run reached GATE 2 (post-review) with every floor verdict GREEN/clean — no RED-verdict STOP.** At GATE 2 the human chose to fold the 2 advisory-minor review notes first (prose-only), after which `/pharn-dev-verify` was re-run green (see `VERIFY.md`).

## Structural verdicts read (verbatim — the proceed/stop basis, P5)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` **exit 0** (`FLOOR: GREEN — 21 capabilities checked`).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (all outside gates `tests` / `validate` / `structural:trust-fence` 0→0; `regressions: []`, `pre_existing: []`). A first capture bug (zsh word-splitting) was caught and corrected before the verdict — see `REGRESSION.md`.
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (`test` / `validate` / `lint` / `format:check` / `lint:md` all exit 0; `failing_gates: []`; 0 verifiers). Re-run green after the GATE-2 polish; build-completeness `prettier --write` conformance disclosed in `VERIFY.md`.

## Advisory stages (pointers — cited, not restated, P4)

- **`GRILL.md`** — 2 minor advisory concerns (injection-immunity phrasing; per-family scanner-test coverage), both folded into the build. Gates nothing.
- **`REVIEW.md`** — GREEN; 0 floor-gate (blocking) findings; 2 advisory-minor observations (the `.fetch(` method-name breadth; `http-request` / bare-`axios(` covered at the scanner-test layer — **both folded at GATE 2**) + **1 proposed lesson candidate** (the zsh multi-file `node --test` capture bug) for a separate human-gated `/pharn-dev-memory-promote`.

## What landed (the increment)

The `ssrf` lens (`pharn-review/ssrf/`, `role: lens`, `enforces:[P2]`, `coupling: agnostic`) — reads untrusted CODE and flags a request source (`req.*`) reaching an outbound-request URL sink (`fetch` / `http(s)` / `axios`) — backed by the deterministic floor scanner `.dev/floor/scan-code-ssrf.mjs` (+ 23 hermetic tests) and 4 eval pairs. It is the 21st PHARN capability. Spec-hash `11cd9ad5…d1d969` held across grill → build → verify. Nothing committed, pushed, or sealed.

## Honest close (P0)

Chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, or apply the `PHARN ✓ reviewed` seal. **Decision (merge / fix / abandon) remains yours.**
