# REGRESSION — publish-oidc-trusted

**Deterministic verdict (floor, `check-regress.mjs`): `no-regressions` — no deterministically-detectable breakage outside the feature (exit 0).**

- **base:** `HEAD` (working-tree dogfood build — `git status --porcelain` non-empty → base = HEAD, per the stage's deterministic base rule).
- **inside (the feature's scope):** `.github/workflows/publish.yml`. `scope` exit **0**, `escaped: []` — the build stayed within its declared `## Files` (fix #7 cross-check passed).

## Per-gate exit codes (base → head)

| gate       | base | head | classification                |
| ---------- | ---- | ---- | ----------------------------- |
| `tests`    | 1    | 1    | **pre-existing** (excluded)   |
| `validate` | 1    | 1    | **pre-existing** (excluded)   |

- `regressions[]`: **none**.
- `pre_existing[]`: `tests`, `validate` — red at the baseline too, therefore **never blamed on this feature** (`check-regress.mjs`: `base != 0 → PRE-EXISTING`).

## Why both gates are pre-existing-red — and why that is NOT this feature (the honest measurement note)

This repo's working tree contains **untracked local `test-*/` app installs** (`git ls-files 'test-*'` → 0 tracked). Those installs each contain full copies of PHARN capabilities, which **inflate every whole-repo-scanning gate**:

- **`tests` = 1** because `.dev/floor/lens-scanner-map.test.mjs` scans the live tree and asserts the lens-scanner map matches the live `role: lens` count; the untracked installs push that count to 142, so the test fails. (The remaining floor/hook tests pass.)
- **`validate` = 1** because `.dev/floor/validate.mjs .` walks every `.md` and hits the untracked installs' intentional negative fixtures (`test-*/pharn/floor/test-fixtures/red/skill.md`). The one *tracked* red fixture, `.dev/floor/test-fixtures/red/skill.md`, is excluded (validate skips `.dev/`), so **all** of validate's RED originates in untracked apps.

Both conditions pre-date this increment and are independent of it.

### How base and head were measured comparably (and why `publish.yml` was never touched)

A `git worktree` baseline omits untracked files, so it would read these whole-repo gates **GREEN at base / RED at head** — a **false regression** that is purely a measurement artifact of the untracked apps. To avoid that (and to leave the open `publish.yml` untouched), both sides were measured **over the same working tree**, holding the untracked-app context constant. This is sound because the base and head gate-inputs are **byte-identical**:

- `git diff --name-only HEAD` = `.github/workflows/publish.yml`, `.pharn/writes-scope.json` — **zero** `.md` / `.test.mjs` / `.test.cjs` / `findings.json` paths (the regress gates' entire input domain).
- Therefore every gate reads identical bytes at base (HEAD-commit) and head (working tree); the only difference is the untracked apps, which are held present on both sides. `base == head` for every gate **by path-membership**, not by assertion.

The feature's one tracked change, `publish.yml`, is a `.yml` file read by **no** regress gate (validate → `.md`; tests → `.test.*`; structural → `findings.json`) — so it is provably incapable of flipping any gate.

## Gate-set notes

- **`structural`**: `outside_eval_pairs` = `[]`. No committed eval pair is cleanly available at a tracked path for this run (the trust-fence `expected` the stage doc references is not tracked under `.dev/features/trust-fence/`), so no structural gate was run — recorded honestly, not silently dropped.

## Honest residual (P0/P7)

`/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** Here both suite gates are pre-existing-red (untracked local apps), so they cannot themselves catch a *new* pass→fail flip; the guarantee this run provides rests on the floor-grade fact that the feature changed **no gate-domain file** (0 `.md`/`.test.*`/`findings.json` in the diff), so no deterministically-detectable outside breakage is possible from a `.yml`-only change. This is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." The report certifies the comparison, not the feature as a whole.
