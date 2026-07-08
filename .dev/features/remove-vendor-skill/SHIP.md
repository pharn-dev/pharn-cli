# SHIP — remove-vendor-skill

Advisory roll-up of the gated `/pharn-dev-ship` chain. This file records **that the chain ran and its
floor verdicts** — it is **not** a "shipped" mark, an approval, or a `PHARN ✓ reviewed` seal.

## Stages that ran (in order) and where the run ended

`plan → [GATE 1 ✓ approved] → grill → build → regress → verify → review → [GATE 2 — human decides]`

The run reached **GATE 2** (post-review human decision) — no RED-verdict STOP occurred at any stage.

## Structural floor verdicts read (verbatim)

| Stage      | Verdict source                                    | Value read |
| ---------- | ------------------------------------------------- | ---------- |
| **build**  | `node .dev/floor/validate.mjs .` exit code        | `0` (GREEN) |
| **regress**| `regression-report.json` `.verdict`               | `no-regressions` |
| **verify** | `verify-report.json` `.verdict`                   | `PASS` |

- **build**: `npm run check` exit 0 (format:check · lint · typecheck · vitest 496 pass) and `validate` GREEN.
- **regress**: base `74c5653` → HEAD; outside gates `tests` / `validate` / `vitest` each `0 → 0`, no flip, `regressions: []`, no fix#7 scope breach.
- **verify**: floor gates `test` · `validate` · `typecheck` · `lint` · `format:check` · `lint:md` all `0`; `failing_gates: []`; 0 verifiers registered.

## Advisory artifacts (cited, not restated — P4)

- **`GRILL.md`** — advisory; 3 important concerns raised pre-build (loop-back coverage, forward-compat
  test, P2 audit wording), **all folded into the build**. Gated nothing.
- **`REVIEW.md`** — advisory; **verdict GREEN, 0 floor-gate findings**; 2 minor advisory notes
  (trusted-doc wording drift in `CONSTITUTION.md:119` / `ARCHITECTURE.md:170`, for human reconciliation,
  never agent-edited). See the file; not restated here.

## Human reconciliation surfaced (never agent-edited — hook-protected)

- `CONSTITUTION.md` P7 (L119) and `ARCHITECTURE.md` (L170) reference the now-removed `vendorSkills` /
  official-skill seam. These are `trust: trusted`, write-protected at the floor; the additive P7
  *principle* is unaffected (a config with a stray `vendorSkills` key still loads — new test proves it).
  Wording reconciliation is a human decision.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** Nothing has been merged, committed,
pushed, or sealed. The working tree holds the change (21 files: 4 deleted, 8 src edited, 7 tests
edited, 3 docs edited — plus this feature's `.dev/features/remove-vendor-skill/` artifacts).
