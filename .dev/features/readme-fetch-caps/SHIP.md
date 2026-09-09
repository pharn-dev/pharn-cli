# SHIP — readme-fetch-caps

Gated `/pharn-dev-ship` run (no `--loop`). Base `377e1f5`, branch `docs/readme-fetch-caps`.

## Stages, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; spec hash pinned. **GATE 1** satisfied by the human's advance approval, conditional on the increment staying within the stated minimal fix — it did (`## Files` = `README.md`, `CHANGELOG.md`; no `src/`, no `SECURITY.md`, no `CONSTITUTION.md`) |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 6 concerns (1 blocking-severity, 3 important, 2 minor). Advisory; gates nothing |
| — | plan correction | The blocking-severity grill finding was acted on **before** build (below) |
| 3 | `/pharn-dev-build` | `README.md` + `CHANGELOG.md` written; `npm run check` green |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md` — 0 floor-gate findings, 1 advisory (important) |

**Where the run ended: GATE 2** — the post-review human decision. Not a RED-verdict STOP; every floor
verdict came back GREEN.

## The structural verdicts read, verbatim

These, and only these, decided proceed-or-stop. No prose and no severity was an input.

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **`0`** (`FLOOR: GREEN — 0 capabilities checked in .`) |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`no-regressions`** (`check-regress.mjs verdict` exit 0; `regressions: []`, `pre_existing: []`) |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`PASS`** (`check-verify.mjs` exit 0; `failing_gates: []`) |

Supporting floor reads: `check-regress.mjs scope` exit **0** (`escaped: []` — the build did not leave its
declared `## Files`); `check-build-complete.mjs` → **`complete`**, exit 0; `count-grillers.mjs` →
**0 registered**; `count-verifiers.mjs` → **0 registered**.

## The one stage-to-stage correction

`/pharn-dev-grill`'s blocking-severity finding (P6) was that `PLAN.md` carried a populated
`## Open questions (HALT)` section — the literal trigger for `/pharn-dev-build` Step 1.1 — holding three
items the approving human's own scope statement had already settled. `PLAN.md` is **outside** build's
writes-scope (parsed from `## Files`), so the builder could not have corrected it. The section was
re-encoded at the plan stage: the questions moved to `## Carried forward`, which is a report rather than
a gate, and the section now reads "None" with the reason recorded. Grill's two minor findings (evidence
precision) were also applied. The three important/minor findings that remain open are the human's to
weigh and are named in `REVIEW.md`.

## Pointers (cited, not restated — P4)

- `.dev/features/readme-fetch-caps/PLAN.md` — the increment, its discovery table, and `## Carried forward`
- `.dev/features/readme-fetch-caps/GRILL.md` — advisory concerns raised before build
- `.dev/features/readme-fetch-caps/REGRESSION.md` — the per-gate `base → head` table, plus a recorded
  non-reproducible first baseline capture
- `.dev/features/readme-fetch-caps/VERIFY.md` — the floor gates, and why none of them can check this
  increment's actual claim
- `.dev/features/readme-fetch-caps/REVIEW.md` — the four lenses, the one advisory finding, and a proposed
  lesson candidate (**not** written to canon)

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.**

No merge, no seal. `/pharn-dev-ship` applied no `PHARN ✓ reviewed` seal and made no decision. Two items are
specifically for the human: `CONSTITUTION.md:64` still carries the identical over-claim this PR fixes in
the README and is agent-unfixable by construction (P0 forbids auto-fixing a constitution violation), and
the README is now the only document printing three of the tarball's constants.
