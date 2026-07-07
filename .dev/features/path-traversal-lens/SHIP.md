# SHIP — path-traversal-lens (advisory roll-up)

`/pharn-dev-ship` ran the gated build loop for the increment **"add a `path-traversal` lens"**. This is a
thin, **advisory** roll-up: it records that the chain ran and its floor verdicts. It is **not** a
self-issued "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages, in order, and where the run ended

| stage                | verdict read (structural / floor)                    | value            | result     |
| -------------------- | ---------------------------------------------------- | ---------------- | ---------- |
| `/pharn-dev-plan`    | human approval halt (GATE 1)                         | approved         | ✅         |
| `/pharn-dev-grill`   | advisory — no structural verdict (gates nothing)     | 6 concerns       | advisory   |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit code           | `0` (GREEN)      | ✅ proceed |
| `/pharn-dev-regress` | `regression-report.json` `.verdict`                  | `no-regressions` | ✅ proceed |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`                      | `PASS`           | ✅ proceed |
| `/pharn-dev-review`  | no structural verdict (advisory lenses; floor GREEN) | GREEN, 0 floor   | GATE 2     |

**Run ended at GATE 2** (post-review human decision). No RED-verdict STOP is standing.

## The structural verdicts, verbatim (each from its own floor checker)

- `/pharn-dev-build` → `.dev/floor/validate.mjs .` → **exit 0**, `FLOOR: GREEN — 19 capabilities`. (Build emits
  no machine report; the floor exit **is** its verdict.)
- `/pharn-dev-regress` → `.dev/floor/check-regress.mjs verdict` → **`"no-regressions"`** (exit 0). Outside gates
  `tests` / `validate` / `structural:trust-fence` all `0` at base and head; `regressions: []`,
  `pre_existing: []`. (`.dev/features/path-traversal-lens/regression-report.json`.)
- `/pharn-dev-verify` → `.dev/floor/check-verify.mjs` → **`"PASS"`** (exit 0). Gates `test` / `validate` / `lint`
  / `format:check` / `lint:md` all `0`; `failing_gates: []`; verifiers `registered: 0`.
  (`.dev/features/path-traversal-lens/verify-report.json`.)

## One human gate was hit mid-chain (recorded, not hidden — P0/P6)

`/pharn-dev-verify`'s **first** run returned `FAIL` on the whole-repo `lint:md` gate — caused solely by **2
pre-existing MD038 errors** in `.dev/features/deserialization-lens/VERIFY.md:19` (committed in #45,
`51905ce`), a file this increment never touched. `/pharn-dev-ship` **STOPped and presented** (the gated
design). With **explicit human authorization** ("fix pre-existing + continue"), that one file was scoped
**individually** (the fix #7 hook honored, never bypassed) and its trailing-space code spans were
stripped — a cosmetic, no-behavior-change repo-hygiene fix riding alongside this increment. Verify was
re-run → **PASS**. Both human gates held: GATE 1 (plan approval) and GATE 2 (this post-review stop); no
`--yolo`, no self-approval.

## Pointers (cited, not restated — P4)

- **`.dev/features/path-traversal-lens/REVIEW.md`** — the 4 advisory lenses (verdict GREEN, 0 floor-gate
  findings; 2 minor advisory notes; a provenance-tagged **proposed lesson** about trace-artifact lint
  debt tripping later increments' whole-repo verify — for a separate `/pharn-dev-memory-promote` run).
- **`.dev/features/path-traversal-lens/GRILL.md`** — advisory (6 concerns; all folded into the build).
- `PLAN.md` (approved), `REGRESSION.md`, `VERIFY.md` — the per-stage artifacts.

## What landed (product + apparatus)

- **Product:** `pharn-review/path-traversal/path-traversal.md` (the lens, `role: lens`, `enforces: [P2]`)
  - 3 eval trios (fs-concat vuln, safe-comment ★ hostile, safe-config true-negative).
- **Apparatus:** `.dev/floor/scan-code-path-traversal.mjs` (new floor primitive — source-token→fs-path-sink
  scanner) + `.dev/floor/scan-code-path-traversal.test.mjs` (20 hermetic tests). Auto-discovered as the
  19th capability; test glob auto-collects the scanner test.

## Standing decision is the HUMAN's (GATE 2)

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good
or wise; that is the human's call at the post-review gate. `/pharn-dev-ship` does **not** merge, push, commit,
or apply the `PHARN ✓ reviewed` seal. The increment is currently an **uncommitted working-tree change**
(plus the one authorized pre-existing-file edit). Decide: **merge / fix / abandon.**
