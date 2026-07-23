# SHIP — first-feature-spec-entry (roll-up, advisory)

`/pharn-dev-ship` ran the gated chain in order and **stopped at GATE 2 (post-review) for the human**. It did not merge, push, or seal.

## Stages run, in order

| stage | ran | structural verdict (read verbatim) |
|-------|-----|------------------------------------|
| `/pharn-dev-plan` | ✓ | **GATE 1 — human approved** (Option A: spec-first is the new norm; + add guard test) |
| `/pharn-dev-grill` | ✓ | advisory — 4 concerns (0 blocking, 1 important, 3 minor); the important one (apostrophe in the label) was handled in build |
| `/pharn-dev-build` | ✓ | **floor GREEN** — `npm run check` exit **0** (386 tests; the repo's real floor for a non-capability increment) |
| `/pharn-dev-regress` | ✓ | `regression-report.json.verdict` = **`no-regressions`** |
| `/pharn-dev-verify` | ✓ | `verify-report.json.verdict` = **`PASS`** (every floor gate exit 0) |
| `/pharn-dev-review` | ✓ | `REVIEW.md` verdict **GREEN** — 0 floor-gate findings, 3 advisory (no structural verdict; not a proceed/stop input) |

**Run ended at:** GATE 2 (post-review). No RED-verdict STOP occurred.

## The structural verdicts, verbatim

- `/pharn-dev-build` floor: `npm run check` → **exit 0 (GREEN)**. `validate.mjs .` raw = 1 is **gitignored `test-*/` build-scratch** (proven byte-identical stashed vs applied, disjoint from this no-capability increment); tracked-repo-with-feature `validate` = **0**.
- `/pharn-dev-regress`: `.verdict` = **`no-regressions`** (outside gates `tests`/`validate` both pre-existing red, base=head, no pass→fail flip).
- `/pharn-dev-verify`: `.verdict` = **`PASS`** (`test`/`validate`/`lint`/`format:check`/`lint:md` all exit 0; validate measured CI-equivalent).

## Pointers (cited, not restated — P4)

- Advisory review: `.dev/features/first-feature-spec-entry/REVIEW.md` (3 advisory findings — a P1 minor on label-text test coverage; a P4 minor on the same-cycle CHANGELOG stance tension; a **P7 important** on the cross-repo consistency of reversing the "matching pharn-oss" stance — worth confirming before release). A candidate lesson (dogfood-single-tree scoping/validate false-positives) is proposed there for a separate human-gated `/pharn-dev-memory-promote`.
- Advisory grill: `.dev/features/first-feature-spec-entry/GRILL.md`.
- Plan + machine reports: `PLAN.md`, `regression-report.json`, `verify-report.json`.

## What landed (7 files, all within the plan's `## Files`)

`src/lib/constants.ts` (`FIRST_FEATURE_COMMAND = '/pharn-spec'`), `src/steps/install-archetype.ts` (label → "capture your first feature's intent", double-quoted for the apostrophe), `docs/commands/init.md`, `docs/getting-started.md`, `README.md` (all lead the first-run step with `/pharn-spec`, "optional" → "recommended first"), `CHANGELOG.md` (`[Unreleased] → Changed` entry), `tests/constants.test.ts` (new guard). No version bump. Nothing committed.

## Honest line (P0)

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` added no new floor primitive — every guarantee above belongs to a sub-stage's own checker.
