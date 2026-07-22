# VERIFY — npm-publish-metadata

Feature: `npm-publish-metadata` (rename package to `pharn` + publish metadata; 4 files, no `src/` change).

## FLOOR layer — deterministic gates (own the verdict)

| gate | exit | notes |
| --- | --- | --- |
| `test` (`npm test` → vitest) | 0 | 378/378 pass, my changes present |
| `validate` (`.dev/floor/validate.mjs .`) | 0 | tracked-repo value — see confound note |
| `lint` (`eslint src`) | 0 | |
| `format:check` (prettier) | 0 | |
| `lint:md` (markdownlint) | 0 | README/CLAUDE clean (CHANGELOG is ignored by config) |

**Deterministic verdict (`check-verify.mjs`): `VERIFIED — floor gates PASS`** (exit 0). `failing_gates: []`.

## The `validate` gate — measured over tracked content, disclosed both ways (P0/P6)

`node .dev/floor/validate.mjs .` returns **two different values** here, and I used the tracked-repo one — with the reason stated, not hidden:

- **Working tree: exit 1 (RED).** `validate.mjs .` walks the whole tree and finds intentional red fixtures inside the gitignored `test-*/` scratch installs (`test-next/pharn/floor/test-fixtures/red/skill.md`, `test-spa/...`). These are **untracked local scratch**, not part of the repo.
- **Clean checkout: exit 0 (GREEN).** In a fresh `git worktree` of HEAD — i.e. exactly what CI's `.github/workflows/floor.yml` runs on `actions/checkout` — validate reports `FLOOR: GREEN — 0 capabilities checked in .` The tracked pharn repo ships **zero markdown capabilities** (per `pharn-dev-build.md`: "pharn is TypeScript … the structural `validate.mjs` floor stays vacuously-green until a markdown capability is actually added").

The verdict uses the **clean/tracked** value (0) because verify asks "is *the repo* green with this feature in it," and the repo = tracked content = what CI and `npm publish` see. The untracked scratch is neither committed, nor in CI, nor in the tarball. This increment adds no capability, so it cannot change either value. **This is a real captured value from a clean worktree, not an assertion** — and it matches CI floor.yml exactly.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor gates only.** (Unlike the griller count, the scratch installs register no `role: verifier` capabilities, consistent with P7 — zero verifiers exist today.)

## Verdict

**VERIFIED: floor gates PASS.** The feature's own surface is green (vitest 378/378, `npm pack --dry-run` pristine at 34 files, lint/format/markdownlint clean), and the tracked-repo structural floor is green (matching CI).

**Honest residual (P0/P7):** verified = the named gates passed; this is **not** a guarantee of correctness beyond what those gates check. The gates here are whole-repo style/test + the (vacuous) structural floor; there is no feature-specific eval gate because this packaging increment ships no capability/eval. The pre-existing `test-*/` scratch pollution that reddens `validate.mjs .` / `lens-scanner-map.test.mjs` in the working tree is a **dev-loop repo-hygiene issue** (the floor scans should exclude gitignored scratch trees), surfaced at grill/regress/verify and flagged for the human — **out of scope** for this increment, and provably not caused by it.
