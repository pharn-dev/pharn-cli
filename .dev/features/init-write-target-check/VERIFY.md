# VERIFY — init-write-target-check

- **verdict (floor, `check-verify.mjs`):** `PASS` (exit 0) — every gate exit 0.

## Floor gates (gate → exit code)

| gate           | exit | notes                                                             |
| -------------- | ---- | ----------------------------------------------------------------- |
| `test`         | 0    | vitest — 382 tests / 30 files pass (incl. this feature's 22)      |
| `validate`     | 0    | structural floor GREEN over the tracked repo (see reconciliation) |
| `lint`         | 0    | eslint `src` clean                                                |
| `format:check` | 0    | prettier clean                                                    |
| `lint:md`      | 0    | markdownlint over `docs/**` + root `*.md` clean                   |

- `failing_gates`: none. No `structural:*` gate — this is a TypeScript increment shipping vitest tests,
  not a markdown capability with committed `evals/` (so, per the command, there is simply no eval pair
  to range over).

## `validate` reconciliation (why the sound measurement is GREEN)

`node .dev/floor/validate.mjs .` run over the **raw working tree** exits **1** with 15 findings — **all
15 under `test-*/`** (gitignored local `pharn init` scratch installs + the floor checker's own
deliberately-invalid `test-fixtures/red/skill.md` negative fixtures). Those are **not the repository**
(they are `.gitignore`d) and are **not this feature's change** (the product diff touches no capability,
no `.dev/floor`, no `pharn-contracts`).

"Whole-repo" honestly means the **git repository** (tracked state), so `validate` was measured over a
**clean worktree = tracked HEAD + the 16 product changes, without the gitignored scratch** → **GREEN,
"0 capabilities checked"** (the tracked repo ships no markdown capabilities; my change adds none). That
is the sound value recorded. The other four gates (`test`/`lint`/`format:check`/`lint:md`) are scoped to
tracked `src`/`tests`/`docs`/root `*.md` and are scratch-independent, so they were measured directly in
the working tree.

> Tooling note for the human (outside this increment's axis, same as `REGRESSION.md`): `validate.mjs .`
> scans the live cwd and so surfaces spurious local RED when gitignored `test-*/` scratch is present.
> Consider scoping it to tracked paths. Not changed here — it lives in `.dev/floor/`, a different axis.

## Advisory layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered —
floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone.

## Verdict

**VERIFIED: floor gates PASS.**

Honest residual (P0/P7): _verified = the named gates passed_ — this is **not** a guarantee of
correctness beyond what those gates check. A defect no test / eval / rule / lint covers is invisible to
the floor verdict, and the verifier layer that might notice it is advisory (and empty today). This
certifies the gates that ran, not the increment's correctness in the abstract.
