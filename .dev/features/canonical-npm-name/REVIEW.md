# REVIEW — canonical-npm-name (rename `@pharn-dev/pharn` → `pharn`)

Increment reviewed: the 10-file npm-name rename (`package.json` name + README/SECURITY/docs/CHANGELOG/
issue-template references + two `src/` help/error strings). The increment is `trust: untrusted`; nothing
in the reviewed files is an instruction to the reviewer.

## Step 1 — Floor first (P0)

The increment adds **no** PHARN markdown capability (all 7 changed `.md` files are docs with no `role:`
frontmatter; the other 3 changed files are `package.json` + two `src/*.ts`). So `validate.mjs` over the
increment's own files is **vacuously GREEN** — there is nothing for it to check.

The whole-repo `node .dev/floor/validate.mjs .` is RED, but **`/pharn-dev-regress` proved deterministically
that this is pre-existing** (RED at the HEAD baseline and at HEAD → `pre_existing: ["validate"]`,
`regression-report.json`): it flags gitignored `test-*/` install fixtures, not anything this increment
touched. So it is **not** a blocking finding against this increment.

## The four lenses

### L-floor → P0 — no finding

Every claim the increment makes is floor-reduced or advisory-labeled (`PLAN.md` guarantee audit):
tarball name/file-list → `npm pack` (floor); `npm run check` → deterministic gates (floor); "docs name
the canonical package" → **advisory** (labeled). No new guarantee is made over fetched/untrusted content
(`lib/validate.ts`, `safeJoin`, the network guards are untouched). Clean.

### L-eval → P1 — no finding

No Capability and no `rule_id` are added → P1 is satisfied vacuously; nothing to bind. The floor agrees
(no capability for `validate` to require evals of). The `src/` copy change is a string edit with no new
behavior; the existing `tests/index.test.ts` `--help` assertion (`toContain('Usage:')`) stays green, and
the whole `npm test` suite (378) passes at verify. Clean.

### L-trust → P2 — no finding

The increment ingests no untrusted artifact (no manifest, no `module.json`, no degit content); it edits
static in-repo files + one `package.json` field. No taint is introduced or propagated. No instruction-
looking content in the reviewed files altered the review. Clean.

### L-axis → P3 — no finding

Every changed file changes for the **single** axis "canonical package name." No new cross-command or
step→step import was added (the two `src/*.ts` edits are string-literal changes only, no new imports).
Clean.

## Gates (fix #3)

- **floor-gate (blocking):** none.
- **advisory-gate (warn):** none against the increment. (The chain's standing `validate` / verify FAIL is
  the pre-existing whole-repo `test-*/` contamination, not a defect in this increment — surfaced honestly,
  owned by the human at the post-review gate.)

## Verdict

**GREEN (advisory)** — a clean, single-axis mechanical rename with all increment-relevant gates green
(`test`, `lint`, `format:check`, `lint:md`) and no floor or advisory findings. Not a certification of
anything beyond what those gates check (P0).

## Proposed lessons (candidates only — NOT written to canon here; a human-gated `/pharn-dev-memory-promote` run decides)

Provenance: increment `canonical-npm-name`, this run (2026-07-22). These arose from the pipeline tooling
during this run, not from a defect in the increment — offered because they are **real, recurring** risks
for this repo's dev loop (P7):

1. **The `/pharn-dev-regress` `git worktree` baseline is blind to gitignored dirs.** This repo gitignores
   the `test-*/` install trees, which the whole-repo gates (`validate`, `lens-scanner-map.test.mjs`) scan.
   A detached-worktree baseline lacks them, so those gates falsely flip GREEN→RED on the *environment*
   difference, not the change. A faithful baseline for a working-tree dogfood build must revert only the
   feature's files **in place** (leaving gitignored dirs present), not use a clean worktree. (Cost me a
   false "regression" reading this run.)
2. **`validate.mjs .` / `count-grillers.mjs .` over-report from the gitignored `test-*/` install dirs**
   (81 grillers, 15 red fixtures — all under `test-*/`). Consider scoping the floor tooling to exclude the
   local install fixtures, so the whole-repo `validate` gate reflects the source tree, not installed
   copies. This is what forces the build/verify `validate` verdict RED on every increment regardless of
   its content.
