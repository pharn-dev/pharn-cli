# SHIP — `fold-changelog-unreleased`

Gated mode (no `--loop`). Increment: fold `CHANGELOG.md`'s `[Unreleased]` into the existing
`## [0.4.0]`, add the missing `[0.4.0]:` link definition, and drop `CHANGELOG.md` from
`.markdownlint-cli2.jsonc`'s `ignores` — finding **P-6**, the last of the adversarial audit.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; **GATE 1** was pre-approved by the human ("go ahead with P-6") before the chain started |
| 2 | `/pharn-dev-grill` | `GRILL.md` written — **advisory, gates nothing**; 7 concerns (0 blocking, 3 important, 4 minor); proceeded regardless, as the stage requires |
| 3 | `/pharn-dev-build` | files written, floor run |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md` |

**Where the run ended: GATE 2** — the post-review human decision. No stage returned a non-GREEN
verdict, so there was no RED-verdict STOP.

## The structural verdicts read, verbatim

These, and only these, decided proceed-or-stop. None of them is this command's judgment.

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **0** |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`"no-regressions"`** |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`"PASS"`** |

`/pharn-dev-regress` `.regressions[]` is empty; `/pharn-dev-verify` `.failing_gates[]` is empty and
`verifiers.registered` is `0` (no verifiers exist — floor gates only).

`/pharn-dev-review` has **no** structural verdict and this command did not invent one. Its four
lenses are advisory and its `severity` values are LLM-assigned; the human reads `REVIEW.md` at GATE 2.

## Pointers (cited, not restated — P4)

- `.dev/features/fold-changelog-unreleased/REVIEW.md` — the four review lenses and their findings.
  **Read this one at GATE 2**; its headline is a single `important` advisory finding.
- `.dev/features/fold-changelog-unreleased/GRILL.md` — advisory pre-build interrogation.
- `.dev/features/fold-changelog-unreleased/REGRESSION.md` / `VERIFY.md` — the human renders of the two
  floor verdicts above.

## Notes on this run

- **Committed mid-chain, deliberately.** A previous attempt at this increment lost its worktree before
  writing anything, so the build was committed (`316f32b`) and pushed as soon as `npm run check` went
  green — before stages 4–6 ran — rather than at the end. `/pharn-dev-regress` therefore resolved its
  base explicitly (`git merge-base HEAD origin/main` = `5fd0714`) instead of via the working-tree
  heuristic, which would have compared HEAD to itself.
- **The style gates ran at both sides** rather than being skipped: the skip rule fires only when
  `inside` leaves shared style config untouched, and this increment's whole point is an edit to
  `.markdownlint-cli2.jsonc`.
- **`prettier --write` was never run on `CHANGELOG.md`.** No style gate globs it, and prettier would
  rewrap the release notes wholesale, destroying the conservation proof. `/pharn-dev-build`'s Step 2b
  formatter is advisory and its glob excludes both written files, so this is a no-op deviation, stated
  rather than silent.

---

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment
is good or wise; that is the human's call at the post-review gate. Nothing here is a `PHARN ✓ reviewed`
seal, an approval, or a self-issued "shipped".
