# SHIP — retire-degit-present-tense

Advisory roll-up of one gated `/pharn-dev-ship` run. **Not** a "shipped" mark, not an approval, and not
a `PHARN ✓ reviewed` seal.

## Stages run, in order

| #   | Stage                | Outcome                                                             |
| --- | -------------------- | ------------------------------------------------------------------- |
| 1   | `/pharn-dev-plan`    | `PLAN.md` written; **GATE 1** — pre-approved by the human for finding P-11, and the plan did **not** grow past the six approved sites, so the pre-approval held |
| 2   | `/pharn-dev-grill`   | `GRILL.md` — 4 concerns (0 blocking, 2 important, 2 minor). Advisory; gates nothing. Proceeded, as the stage requires |
| 3   | `/pharn-dev-build`   | six sites reworded + one CHANGELOG entry; floor **GREEN** |
| 4   | `/pharn-dev-regress` | `regression-report.json` — **no-regressions** |
| 5   | `/pharn-dev-verify`  | `verify-report.json` — **PASS** |
| 6   | `/pharn-dev-review`  | `REVIEW.md` — GREEN, 0 floor-gate findings, 5 advisory |

**Ended at GATE 2** — the human decides merge / fix / abandon. No stage returned a non-GREEN floor
verdict, so no RED-verdict STOP occurred.

## AMENDMENT 1 — the chain was re-run over nine sites, not six

After the six-site version was pushed, the human approved growing the plan to fold in three stale
mirrors in `tests/` that the survey had reported. `PLAN.md` gained an `## AMENDMENT 1` section and two
entries in `## Files`; `set-writes-scope --from-plan` then resolved **8** paths instead of 6, which is
the mechanism that made the two test files writable at all. Editing them *without* amending the plan
would have been a fix #7 escape, and `check-regress.mjs scope` would have exited 1 naming them.

The reason it belongs in this PR rather than a follow-up: `tests/validate.test.ts:101` is a verbatim
mirror of `src/lib/validate.ts:21`, so the six-site version would have **created** a contradiction
between a source comment and the test that exists to pin it. That is the increment's own defect, not a
pre-existing one.

Every verdict below is a **re-measure after** the amendment, on the rebased tree — not a carry-over.

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code **`0`**
  (`FLOOR: GREEN — 0 capabilities checked in .`)
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`**
  (`check-regress.mjs verdict` exit 0; `regressions: []`, `pre_existing: []`; base
  `a382bc3447016af8a28abe16e5cf2e8d35b74c78`, passed explicitly as `origin/main` so the whole
  nine-site increment is measured rather than only the amendment)
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`**
  (`check-verify.mjs` exit 0; `failing_gates: []`; gates `test`/`validate`/`lint`/`format:check`/`lint:md`/`typecheck` all exit 0)

Each verdict is a sub-stage's own deterministic checker. `/pharn-dev-ship` **added no floor primitive**
in this run; it read those three values and proceeded.

## Pointers (cited, not restated — P4)

- `.dev/features/retire-degit-present-tense/REVIEW.md` — the 4 review lenses and the 5 advisory
  findings, including the one-line follow-up at `tests/validate.test.ts:102` and the human-only
  `CONSTITUTION.md:21,60` correction. Also carries a **proposed** lessons-learned candidate, which is
  a proposal only — canon is written solely by a human-gated `/pharn-dev-memory-promote` run.
- `.dev/features/retire-degit-present-tense/GRILL.md` — advisory, pre-build.
- `.dev/features/retire-degit-present-tense/REGRESSION.md`, `VERIFY.md` — the human renders of the two
  machine verdicts.

## Two grill findings were acted on during the build (recorded, not hidden)

`GRILL.md` gates nothing, but two of its concerns were cheap and were folded into the build rather
than deferred. `PLAN.md` is left as the versioned record of the intent, with `GRILL.md` as its
correction — which is how the artifact pair is meant to work:

1. **The roadmap row was trimmed.** The plan proposed "…`codeload` tarball (no `git` binary, no
   cache)"; the grill objected that this mints a third, unverified copy of a security claim already
   maintained in `THREAT-MODEL.md`/`SECURITY.md`, inside the one user-facing table **no gate reads**.
   The parenthetical was dropped; the row states the mechanism only.
2. **The `validate.ts` wording was tied to the validated value** ("before **that value** becomes the
   final segment…") rather than to the URL in general, so the degraded path — where the SHA is `null`
   and the ref is `refs/heads/main` — is not implied to be SHA-pinned.

## One correction the build made to itself

Running `prettier --write` over `docs/roadmap.md` and `CHANGELOG.md` during Step 2b reformatted both
files wholesale (every table cell padded), because **neither is in `format:check`'s scope** —
`prettier` is configured for `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts` only. That would have turned
a one-row change into a whole-file reformat and conflicted with every sibling PR. Both files were
reverted and the two targeted edits re-applied by hand. Final diff: **one** changed line in
`docs/roadmap.md`, a **pure 14-line insertion** into `CHANGELOG.md`'s existing `### Fixed`.

## The standing decision is the human's

The chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
