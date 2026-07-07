# SHIP — resource-leak-lens (gated `/pharn-dev-ship` roll-up)

Advisory roll-up of the gated `/pharn-dev-ship` chain for the **resource-leak lens** increment. This records **that the chain ran and its floor verdicts** — it is **not** a self-issued "shipped", an approval, or a `PHARN ✓ reviewed` seal. `/pharn-dev-ship` adds **no** floor primitive; every verdict below belongs to a sub-stage.

## Stages run, in order, and where the run ended

`/pharn-dev-plan` → **[GATE 1: human approved as-written]** → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → **[GATE 2: ends here for the human's decision]**.

The run reached **GATE 2** — no RED-verdict STOP occurred. (One transient, self-inflicted `format:check` FAIL at `/pharn-dev-verify` was a prettier nit in the regress stage's own `REGRESSION.md` trace artifact, normalized with the sanctioned formatter and re-run to an honest PASS — disclosed in `VERIFY.md`; no feature file was involved and no verdict was overridden.)

## Structural verdicts read (verbatim — the FLOOR the proceed decisions rested on)

| stage                | verdict source                      | verdict read                      |
| -------------------- | ----------------------------------- | --------------------------------- |
| `/pharn-dev-build`   | `validate.mjs .` exit code          | **0** (GREEN — 28 capabilities)   |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`"no-regressions"`** (exit 0)   |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`     | **`"PASS"`** (all 5 gates exit 0) |

- **Grill (advisory, gates nothing):** `.dev/features/resource-leak-lens/GRILL.md` — spec-hash matched (no drift); 0 blocking, 5 minor advisories, all folded into the build.
- **Regress detail:** outside gates `tests` / `validate` / `structural:trust-fence` each `0 → 0`; `regressions: []`, `pre_existing: []`; fix#7 `escaped: []` (build stayed in declared `## Files`).
- **Verify detail:** `test` / `validate` / `lint` / `format:check` / `lint:md` all `0`; `verifiers: { registered: 0 }` (floor gates only).

## Review pointer (cite, do not restate — P4)

See **`.dev/features/resource-leak-lens/REVIEW.md`** — verdict **GREEN, 0 floor-gate findings, 1 minor advisory** (`unref` is a weak cleanup token; a P7 refinement for a future increment, non-blocking). `/pharn-dev-review` has **no** structural verdict; its only floor-grade fact is `validate.mjs` GREEN, already gated at build and verify. Its free-text is advisory DATA for the human.

## What landed (increment footprint)

- Product: `pharn-review/resource-leak/resource-leak.md` (28th capability, `role: lens`, `enforces: [P2]`) + 4 eval cases + 8 expected files.
- Build apparatus: `.dev/floor/scan-code-resource-leak.mjs` (deterministic unclosed-resource scanner) + `.dev/floor/scan-code-resource-leak.test.mjs` (19 hermetic tests incl. ★ injection-immunity + fail-closed).
- Trace: `.dev/features/resource-leak-lens/` — PLAN, GRILL, REGRESSION(+json), VERIFY(+json), REVIEW, this SHIP.

## GATE 2 iteration (post-review, human-directed)

At GATE 2 the human chose **"address the `unref` advisory first"** rather than merge immediately. Acted on it within the approved plan's `## Files`: `unref` was dropped from the scanner's cleanup set (it de-refcounts a handle, it does not close/dispose it) and a locking test added (scanner suite **19 → 20**). **Verify was re-run → PASS** (`test`/`validate`/`lint`/`format:check`/`lint:md` all 0). `REVIEW.md` marks the finding **RESOLVED**; `VERIFY.md` records the re-run. The build stayed in-scope (fix #7). The decision is handed back to the human below.

## Standing decision

**The decision is the human's** (GATE 2: merge / fix / abandon). The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or seal.
