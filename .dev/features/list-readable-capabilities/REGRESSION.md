# REGRESSION — list-readable-capabilities

- Base: `HEAD` (working-tree dogfood build — `git status` dirty, so base = HEAD per the deterministic base rule).
- Verdict: **`no-regressions`** (`.dev/floor/check-regress.mjs verdict` exit 0).

## Inside / outside partition

Inside (the feature's changed product files = its declared `## Files`; `scope` exit 0, **no escaped paths** — the build stayed within its plan):

- `src/lib/capability-groups.ts`, `src/lib/capability-picker.ts`, `src/commands/list.ts`
- `tests/capability-groups.test.ts`, `tests/list.test.ts`
- `docs/commands/list.md`, `CHANGELOG.md`

Outside: 44 `*.test.mjs` / `*.test.cjs` suites (floor + hooks) and 0 committed eval pairs. Dev-loop scratch (`.pharn/**`, `.dev/features/**`) is framework orchestration output, not a feature write, so it is excluded from `--changed` (including it would be a false fix#7 breach).

## Per-gate base → head (exit codes)

| gate       | base | head | flip?            |
| ---------- | ---- | ---- | ---------------- |
| `tests`    | 1    | 1    | no (pre-existing) |
| `validate` | 0    | 0    | no               |

Both base and head were measured in **fixture-free worktrees** (baseline via `git worktree add HEAD`; head via the same worktree with this feature's product diff applied). This deliberately excludes the gitignored `test-*/` fixture installs, whose red-by-design capability fixtures otherwise make a whole-tree `validate` spuriously flip 0→1 in a dirty working tree — an environmental artifact, never a regression. Measured identically on both sides, `validate` is a clean 0→0.

## Regressions / pre-existing

- `regressions[]`: **none.** No outside gate flipped pass→fail.
- `pre_existing[]`: `tests` — the `node --test` aggregate over the 44 `.mjs/.cjs` suites exits 1 at **both** base and head (identical, so not introduced by this feature; the feature touches only `src/**.ts` + docs + CHANGELOG, which cannot affect the stdlib floor/hook suites).

## Verdict

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Honest residual (P0/P7): `/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. This is "no deterministically-detectable breakage outside the feature," not "nothing broke." It certifies the base→head comparison, not the feature's correctness.
