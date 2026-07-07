# REGRESSION — path-traversal-lens

- **Base:** `HEAD` (working-tree dogfood build — `git status --porcelain` non-empty, so base = the committed
  `HEAD` `51905ce`; the increment is uncommitted/untracked, compared against pre-build).
- **Verdict (deterministic, `check-regress.mjs verdict`):** `no-regressions` — exit 0.

## Inside / outside partition (deterministic, `check-regress.mjs scope` — exit 0, no scope breach)

- **inside (12 — the feature's declared `## Files`):** `pharn-review/path-traversal/**` (10) +
  `.dev/floor/scan-code-path-traversal.mjs` + `.dev/floor/scan-code-path-traversal.test.mjs`. `escaped: []` —
  every changed build file is covered by the plan's `## Files` (fix #7 holds).
- **outside:** 24 tracked test files + `validate` (whole-repo) + the `structural:trust-fence` committed eval pair.

## Per-gate exit codes (base → head)

| gate                     | base | head | result |
| ------------------------ | ---- | ---- | ------ |
| `tests` (24 outside)     | 0    | 0    | OK     |
| `validate` (whole-repo)  | 0    | 0    | OK     |
| `structural:trust-fence` | 0    | 0    | OK     |

- `regressions: []` · `pre_existing: []`. Baseline `node --test` ran **279 pass / 0 fail**; head identical.

## Two orchestration notes (advisory — the verdict is floor either way)

1. **Trace artifacts excluded from `--changed`.** The git-changed set also contains this run's pipeline trace
   (`.dev/features/path-traversal-lens/{PLAN,GRILL}.md`), written by the plan/grill stages under **their own**
   enforced fix #7 scopes — not build outputs. They were excluded from `--changed` so the build-scope-breach
   check ranges over the build's files only; including them would spuriously flag a fix #7 escape. No real escape
   is hidden — the pre-write hook enforced each stage's scope at write time.
2. **A first run reported `tests:1` falsely** — a shell word-splitting artifact (the newline-separated file list
   reached `node --test` as one argument → "Could not find"; the tests never ran). Corrected by passing the list
   via `xargs`; the tests then ran for real (279 pass). The verdict above rests on the corrected, real exit codes.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A
regression no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This
is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." The increment
is purely additive (zero existing files modified), which is why no existing gate could flip.
