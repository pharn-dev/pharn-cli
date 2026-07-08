# REGRESSION — harden-install-path

**Base:** `HEAD` (working-tree dogfood build — `git status --porcelain` non-empty, so base = HEAD per the deterministic auto-detect).
**Verdict source:** `.dev/floor/check-regress.mjs verdict` (exit `0`). Machine report: `regression-report.json`.

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no fix#7 escape)

**Inside (the built scope, ⊆ the plan's `## Files`):** the 11 declared files —
`src/lib/{install-modules,repo,installer}.ts`, `src/commands/{init,add,update}.ts`, and their five tests.
`.pharn/**` (always-writable scratch) and `.dev/features/harden-install-path/**` (this loop's own PLAN/GRILL/report artifacts, each written under its stage's own writes-scope) are **not build outputs** and are correctly excluded from `--changed`; `scope` reported **no escaped paths**.

**Outside gate set (run identically at base and head):**

- `tests` — the 44 stdlib `*.test.mjs` / `*.test.cjs` files (`.dev/floor/*`, `.claude/hooks/*`) via `node --test`. Run in a detached `git worktree` at HEAD (baseline) and in the working tree (head); stdlib-only, so no `npm ci`.
- `validate` — `node .dev/floor/validate.mjs` (whole-repo; vacuously green — 0 markdown capabilities).
- `structural:*` — **none.** The only candidate eval pair (trust-fence) has a committed actual (`findings.json`) but **no committed `expected`**, so it is not a complete pair; `outside_eval_pairs = []`.
- style gates (`lint` / `format:check` / `lint:md`) — **skipped** (deterministic config-touch rule): `inside` touches no shared style config, so an outside style result cannot flip.

## Per-gate exit codes (base → head)

| gate       | base | head | flipped? |
| ---------- | ---- | ---- | -------- |
| `tests`    | 0    | 0    | no       |
| `validate` | 0    | 0    | no       |

`regressions[]`: none. `pre_existing[]`: none.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

**Honest residual (P0/P7):** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. The outside gates here are the stdlib floor/hook tests + whole-repo `validate`; the increment's own behavior is covered by the `vitest` suite (527 green), which is `/pharn-dev-verify`'s gate, not this stage's. This verdict certifies the **comparison** (was-GREEN-still-GREEN outside the feature), **not** that the increment is whole or correct.
