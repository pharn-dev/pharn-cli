# REGRESSION — first-feature-spec-entry

**Verdict (floor, `check-regress.mjs`): `no-regressions`** — no deterministically-detectable breakage outside the feature. Stage PASSES.

- **Base:** `HEAD` (working-tree dogfood build — `git status` non-empty, so baseline = the committed HEAD, measured = the working tree with this increment).
- **Inside (this feature's product writes):** `src/lib/constants.ts`, `src/steps/install-archetype.ts`, `docs/commands/init.md`, `docs/getting-started.md`, `README.md`, `CHANGELOG.md`, `tests/constants.test.ts` — all ∈ the plan's `## Files` (no build escape).

## Scope-partition note (false-positive `scope` breach, resolved deterministically)

The first `check-regress.mjs scope` pass exited 1, flagging three "escaped" paths:

- `.dev/features/first-feature-spec-entry/PLAN.md` — `/pharn-dev-plan`'s **own** declared write (`writes: [".dev/features/<name>/PLAN.md"]`).
- `.dev/features/first-feature-spec-entry/GRILL.md` — `/pharn-dev-grill`'s **own** declared write (`writes: [".dev/features/<name>/GRILL.md"]`).
- `.pharn/writes-scope.json` — always-writable scratch (`enforce-writes-scope.cjs` never gates `.pharn/**`).

Cause: running the whole `plan → grill → build → regress` chain in **one uncommitted tree** means `git diff HEAD` sweeps in sibling-stage artifacts + scratch, not just `/pharn-dev-build`'s writes. None is a build escape (the pre-write hook was live during build and blocked nothing; all 7 product writes were in-scope). Correction (P5, safe): re-ran `scope` with `--changed` = uncommitted **product** files only (excluding `.dev/**` process artifacts and `.pharn/**` scratch) — this still catches any *real* escape. Result: `escaped: []`, exit 0.

## Outside gate set (identical both sides)

| gate | base (HEAD) | head (working tree) | flip? |
|------|-------------|---------------------|-------|
| `tests` (`node --test` over 44 `*.test.mjs`/`*.test.cjs`, 665 subtests) | 1 | 1 | no |
| `validate` (`validate.mjs .`, whole-repo) | 1 | 1 | no |

Style gates (`lint`/`format:check`/`lint:md`) **skipped** — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc*`, `.markdownlint-cli2.jsonc`), so an outside style flip is provably impossible.

- `regressions[]`: **none**.
- `pre_existing[]`: `tests`, `validate` — both were already red at the baseline; neither flipped.

## Honest measurement notes

- **`validate` and the `git worktree` baseline (corrected).** A first baseline via `git worktree add HEAD` produced a spurious `validate` flip `0 → 1`: the `test-*/` sample apps are **gitignored**, so a clean worktree checkout lacks them and `validate.mjs .` (whole-repo) sees no red fixtures (0); the working tree has them (1). That is an environment differential, **not** this increment. Re-measured **fair** via stash-in-place (revert only the 7 inside files, `test-*/` present on both sides) → `validate` = 1 on both. (Independently: `validate` is byte-identical stashed vs applied, and this increment adds **no** markdown capability, so it is disjoint from `validate`'s inputs.)
- **Pre-existing `tests` red** = `.dev/floor/lens-scanner-map.test.mjs` assertions (`copy-paste-drift` lens present but unwired in `lens-scanner-map.json`; unmapped scanner). Repo-health item that predates and is unrelated to this increment; identical base↔head.

## Residual (P0/P7, named not hidden)

`/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. The claim is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." This is not a certification that the increment is whole — only that no covered outside gate flipped pass→fail.
