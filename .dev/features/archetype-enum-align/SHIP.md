# SHIP — archetype-enum-align (gated `/pharn-dev-ship` roll-up, ADVISORY)

Increment: map DB signals (`.sql` files, `migrations/` dirs, and `prisma` / `@prisma/client` /
`drizzle-orm` deps) onto the existing `backend` archetype — the one residual after discovery found the
archetype↔pharn-oss enum alignment already implemented (#17/#20/#21). Knowingly reverses decision #2 of
`archetype-file-tree-scan`.

## Stages that ran, in order, and where the run ended

| stage           | what happened                                                              | how it gated                                   |
| --------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| `/pharn-dev-plan`    | Discovery found the enum already aligned; scoped the DB→backend residual   | **GATE 1** — human approved ("Map DB → backend", "Approve as written") |
| `/pharn-dev-grill`   | Advisory; caught 1 important scope gap + 1 minor (`GRILL.md`)              | advisory — gates nothing; proceeded            |
| `/pharn-dev-build`   | Wrote the 4 planned files; incorporated grill Finding 1                    | FLOOR verdict below                            |
| `/pharn-dev-regress` | Compared outside-scope gates base↔HEAD                                     | FLOOR verdict below                            |
| `/pharn-dev-verify`  | Re-ran the deterministic gates whole-repo                                  | FLOOR verdict below                            |
| `/pharn-dev-review`  | 4 advisory lenses (`REVIEW.md`)                                            | **GATE 2** — no structural verdict; human decides |

**The run ended at GATE 2** (post-review human decision) — not at a RED-verdict STOP. Every floor verdict
below came back GREEN, so the chain proceeded through each stage.

## Structural verdicts read (verbatim — the only proceed/stop inputs, P5)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **0** (GREEN). `npm run check` also GREEN
  (format:check → lint → typecheck → vitest 409/409).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (`check-regress.mjs verdict`
  exit 0; outside gates `tests` 0→0, `validate` 0→0; escaped `[]`).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (`check-verify.mjs` exit 0; gates test /
  validate / lint / format:check / lint:md all 0; `failing_gates: []`; 0 verifiers registered).

## Pointers (cited, not restated — P4)

- **`REVIEW.md`** — the 4-lens advisory review. Verdict: GREEN, 0 floor-gate (blocking) findings, 2 advisory
  (minor: `drizzle-kit`-only detection edge; `.sql`-anywhere breadth). It also proposes one lesson candidate
  (the zsh word-split gate-capture gotcha) for a **separate** human-gated `/pharn-dev-memory-promote` run — not
  promoted here.
- **`GRILL.md`** — advisory pre-build interrogation (gated nothing). Its important finding (the unlisted
  `tests/archetype.test.ts` pin) was incorporated at build.
- **`REGRESSION.md`** / **`VERIFY.md`** — human renders of the two floor verdicts above.

## Standing decision — the human's (GATE 2)

`SHIP.md` records **that the chain ran and its floor verdicts** — it is **not** a self-issued "shipped", an
approval, or a `PHARN ✓ reviewed` seal. `/pharn-dev-ship` did not merge, push, commit, or seal, and set no scope
beyond this file.

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or
wise; that is the human's call at the post-review gate (merge / fix / abandon).
