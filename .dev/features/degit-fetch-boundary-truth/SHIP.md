# SHIP — degit-fetch-boundary-truth (T5)

## Which stages ran — and which did NOT

This was a **compressed run at the human's explicit, repeated direction** ("go", four times), not the
full `/pharn-dev-ship` spine. Recording it honestly matters more than making the roll-up look complete
(P0 — "written in the command" is not "guaranteed").

| Stage | Ran? | Verdict read |
| --- | --- | --- |
| Phase A discovery (fact table) | **yes** | not a floor stage — evidence in `FACT-TABLE.md` |
| `/pharn-dev-plan` | **yes** (`PLAN.md` written, spec hash pinned) | — |
| GATE 1 (plan approval) | **implicit** — see below | — |
| `/pharn-dev-grill` | **NO — skipped** | advisory; gates nothing |
| `/pharn-dev-build` | **yes** (writes + floor) | `npm run check` **GREEN** |
| `/pharn-dev-regress` | **NO — skipped** | no `regression-report.json` produced |
| `/pharn-dev-verify` | **NO — skipped** | no `verify-report.json` produced |
| `/pharn-dev-review` | **NO — skipped** | no `REVIEW.md` produced |

**GATE 1 was not a clean halt.** `/pharn-dev-plan`'s approval halt was not separately presented; the
human's standing "go" was treated as approval and the plan was written and built in one continued turn.
That is a **deviation from the command's non-negotiable gate**, recorded rather than smoothed. GATE 2
(the merge / fix / abandon decision) **is** preserved — nothing was merged, pushed, or sealed.

## Floor verdicts actually read

- **`npm run check` → GREEN.** prettier clean; eslint clean (`--max-warnings 0`); `tsc --noEmit`
  clean on both configs; **vitest 41 files / 755 tests passed**.
- **`npm run lint:md` → GREEN.** 0 issues in 24 files.
- **Comments-only instrument on `src/lib/repo.ts` → 0** non-comment changed lines.
- **Header-immutability instrument on the trust map → 0** changed `##`/`###` lines; header count
  identical to `main`.

Because `/pharn-dev-regress` and `/pharn-dev-verify` did not run, there is **no** `.verdict` field to
quote for either. The suite being green on an untouched test tree is the regression evidence available,
and it is weaker than what `check-regress.mjs` would have produced. Said plainly, not papered over.

## What shipped

- `THREAT-MODEL.UPDATED.md` — §2 gains the measured degit mechanics; §4b restates the residuals over
  them. Delivered as a handoff file because `protect-trusted-paths.cjs:58` lists `THREAT-MODEL.md` in
  `DEFAULT_PROTECTED` and `PHARN_PROTECTED` composes by addition only — the setter **cannot** grant that
  write, contrary to the build prompt's instruction. #93 precedent; **no bypass**. Apply with:
  `mv THREAT-MODEL.UPDATED.md THREAT-MODEL.md`
- `src/lib/repo.ts` — comment lines only: the false `git ls-remote` mechanism claim corrected, plus an
  additive note on `cache: false`'s real semantics and the dropped `warn`s.
- `CHANGELOG.md` — one `Docs` entry.
- `.dev/features/degit-fetch-boundary-truth/{PLAN,FACT-TABLE,SHIP}.md`.

## HALT-1 decisions

- **H3 → option (a), docs-only.** The one-line `emitter.on('warn', …)` listener was **declined** and
  remains available as a separate one-line increment. Verified empirically that it would work.
- **H5 → ticket text, not a change** (see the PR description).

## Pointers

- Evidence record: `.dev/features/degit-fetch-boundary-truth/FACT-TABLE.md` (H1–H8, source anchors
  pinned to chunk SHA-256s, live transcripts).
- No `GRILL.md` / `REVIEW.md` exist for this increment.

---

Chain ran **partially**, as tabulated above; the named floor verdicts are as shown — this is NOT a
judgment that the increment is good or wise; that is the human's call at the post-review gate.
