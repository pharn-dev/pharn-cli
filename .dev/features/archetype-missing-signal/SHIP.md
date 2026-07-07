# SHIP — archetype-missing-signal (gated `/pharn-dev-ship` roll-up)

**Advisory roll-up only.** Records that the chain ran and its floor verdicts. **Not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal. `/pharn-dev-ship` adds no new floor primitive.

This increment is the **fix** the human chose at `archetype-io-boundary`'s GATE 2 — it resolves that increment's advisory P5 finding (missing `package.json` was indistinguishable from a frameworkless project).

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | **GATE 1** — plan approved *"Approve as written"* (contract shape **result object** chosen at the plan halt) |
| 2 | `/pharn-dev-grill` | advisory — 1 minor concern (0 blocking) |
| 3 | `/pharn-dev-build` | floor **GREEN** |
| 4 | `/pharn-dev-regress` | **no-regressions** |
| 5 | `/pharn-dev-verify` | **PASS** |
| 6 | `/pharn-dev-review` | GREEN (0 findings; resolves the prior P5) — reached **GATE 2** |

**Where the run ended:** at **GATE 2** (post-review). No RED-verdict STOP.

## Structural verdicts read (verbatim)

- **`/pharn-dev-build`** → `validate.mjs` exit **0** (and `npm run check` exit 0 — 373 tests).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (`tests` 0→0, `validate` 0→0).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (all gates 0; verifiers registered: 0).

## What changed

- `src/lib/detect-archetype.ts` — `detectArchetypesFromProject(cwd)` now returns `ArchetypeDetection { archetypes: Archetype[]; packageJsonFound: boolean }`. `packageJsonFound` is `true` iff a package.json exists and parses to a non-null, non-array object; missing / malformed / non-object → `false`. Detection stays package.json-only.
- `tests/detect-archetype.test.ts` — updated to the object shape; pins the finding-resolving pair (frameworkless `true` vs missing `false`) + a JSON-array non-object case.

## Pointers (cite, not restate — P4)

- **Review (GATE 2 reading):** `.dev/features/archetype-missing-signal/REVIEW.md` — GREEN, the prior P5 is resolved, 0 new findings.
- **Grill (advisory):** `.dev/features/archetype-missing-signal/GRILL.md` — 1 minor concern (the deliberate missing/malformed grouping).
- Machine reports: `regression-report.json`, `verify-report.json`.

## The standing decision is yours (GATE 2)

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or seal. Decide **merge / fix / abandon**.

> Note on the working tree: both increments (`archetype-io-boundary` and this fix) are uncommitted. This fix **supersedes** the prior increment's `detectArchetypesFromProject` (same two files), so the two increments' code changes are the single current state of those files — the `archetype-io-boundary` artifacts remain as the audit record of how that state was reached.
