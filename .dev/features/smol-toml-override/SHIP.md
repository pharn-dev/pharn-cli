# SHIP — smol-toml-override

A thin, **advisory** roll-up of one `/pharn-dev-ship` run. It records **that the chain ran and its floor
verdicts** — nothing more. Source: Dependabot alert 11
(`https://github.com/pharn-dev/pharn-cli/security/dependabot/11`).

## Stages run, in order

| # | stage | outcome |
| - | ----- | ------- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; **GATE 1** reached |
| — | **human** | plan **approved as written** (`~1.7.1`; test included) |
| 2 | `/pharn-dev-grill` | `GRILL.md` written; advisory, gates nothing → proceeded |
| 3 | `/pharn-dev-build` | 4 files written; floor run |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` written |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` written |
| 6 | `/pharn-dev-review` | `REVIEW.md` written |

**Where the run ended: GATE 2** — the post-review human decision. No stage returned a RED verdict.

## The structural verdicts read, verbatim

| stage | verdict source | value |
| ----- | -------------- | ----- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **`0`** |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`"no-regressions"`** |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`"PASS"`** |

Each was read as a value, never inferred from prose. `/pharn-dev-verify`'s gate map:
`test` 0 · `validate` 0 · `lint` 0 · `format:check` 0 · `lint:md` 0 · `typecheck` 0;
`failing_gates[]` empty. `/pharn-dev-regress` `regressions[]` empty, `pre_existing[]` empty, base
`a289d27b2785f1766aa4ae8805686854693c9683`.

**One qualification on the `/pharn-dev-build` row, stated because the number alone overstates it:**
`validate.mjs` reported `GREEN — 0 capabilities checked`. This increment adds no PHARN markdown
capability, so that exit code is **vacuous** — it inspected nothing. The gate that actually
exercised the increment at build time was `npm run check` (GREEN: 1236 vitest assertions).

## Pointers (cited, not restated — P4)

- [`PLAN.md`](PLAN.md) — the approved intent; `spec_content_hash` matched at grill and at build.
- [`GRILL.md`](GRILL.md) — **advisory**; 7 concerns (0 blocking-severity). Two were addressed inside
  the approved `## Files` during build; one (`CHANGELOG.md:23`) was not, `/pharn-dev-review` re-raised it, and
  the human resolved it at GATE 2 (below).
- [`REGRESSION.md`](REGRESSION.md) / [`regression-report.json`](regression-report.json)
- [`VERIFY.md`](VERIFY.md) / [`verify-report.json`](verify-report.json)
- [`REVIEW.md`](REVIEW.md) — **advisory**; 0 floor-gate findings, 5 advisory (1 important, 4 minor).

## Two orchestration deviations, disclosed

1. **`/pharn-dev-regress` ran the style gates although the skip rule said skip.** The rule keys on four
   shared style configs, none touched. Its rationale — that a style flip over byte-identical outside
   files is *provably impossible* absent a config change — does not hold for a **lockfile** change,
   because `lint:md` runs `markdownlint-cli2`, which imports `smol-toml` eagerly. The baseline
   worktree resolved `smol-toml@1.7.0` and head carries `1.7.2`, so that row is a real A/B. The
   deviation only widens coverage and was applied identically to both sides.
2. **The first `tests` capture was hollow and was re-taken.** All 46 paths reached `node --test` as a
   single argument (zsh does not word-split an unquoted expansion), giving exit 1 at both ends — a
   correct comparison over a gate that measured nothing. Re-captured via `xargs`: 748 tests, 0 fail,
   exit 0 both sides. Recorded in `REGRESSION.md` and proposed as a canon lesson in `REVIEW.md`.

## What this file is not

`/pharn-dev-ship` **added no floor primitive** in this run: every guarantee above belongs to a **sub-stage**
(`validate`, `check-regress`, `check-verify`, the writes-scope hooks). Running the stages in order is
**advisory orchestration**; only the three verdicts are floor-grade. Nothing here was merged, pushed,
committed, or sealed, and no `PHARN ✓ reviewed` seal was applied.

**The chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.**

## GATE 2 — the human's decision (recorded, not self-issued)

The human decided: **fix the one important review finding, then open a pull request.**

- `CHANGELOG.md:23` was rewritten to say that the range **permits** future `1.7.x` patches without a
  `package.json` edit while **pinning nothing** — the lockfile still fixes `1.7.2` until a Dependabot
  pull request regenerates it. This closes the `/pharn-dev-review` P0/important finding and the `GRILL.md`
  P7 finding that preceded it.
- Because that edit lands inside a file the whole-repo `lint:md` gate reads, **both floor verdicts
  were re-derived against the shipped tree** rather than carried over: `/pharn-dev-verify` → `PASS` (exit 0),
  `/pharn-dev-regress` → `no-regressions` (exit 0), against the same base
  `a289d27b2785f1766aa4ae8805686854693c9683`. `regression-report.json` and `verify-report.json` above
  are the re-derived values, not the pre-edit ones.
- A pull request was then opened. **`/pharn-dev-ship` did not decide to merge and applied no
  `PHARN ✓ reviewed` seal** — opening the PR is the human's instruction carried out, and the merge
  decision remains theirs on the PR.
