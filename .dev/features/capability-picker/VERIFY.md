# VERIFY — capability-picker

**VERIFIED: floor gates PASS (exit 0).** The feature's deterministic gates are all green.

The verdict is floor-grade: `.dev/floor/check-verify.mjs` reduced the gate→exit-code map to `PASS iff every gate === 0`. No verifier judgment enters the verdict (there are none, and by construction they could not).

## Floor gates (gate → exit code)

| gate           | exit | notes                                                         |
| -------------- | ---- | ------------------------------------------------------------ |
| `test`         | 0    | `npm test` — vitest, 414 tests / 33 files (incl. the feature's own) |
| `validate`     | 0    | `.dev/floor/validate.mjs` on the tracked tree — 0 capabilities (this increment adds no PHARN markdown capability) |
| `lint`         | 0    | `npm run lint` — eslint `src` clean                          |
| `format:check` | 0    | `npm run format:check` — prettier clean                      |
| `lint:md`      | 0    | `npm run lint:md` — markdownlint clean (closes L9 style hole at verify) |

`failing_gates`: none. No `structural:*` gate — the feature ships no `evals/expected ↔ findings.json` pair (it is CLI TypeScript; its spec is its vitest suite, run by the `test` gate).

## Verifier layer (advisory)

**No verifiers registered — floor gates only.** `.dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. Step 2 is a no-op; the verdict is the floor gates alone. (No verifier is authored speculatively — P7.)

## Measurement note (advisory orchestration)

`test` / `lint` / `format:check` / `lint:md` were run in the live working tree — each is scoped to `tests/` / `src/` / `docs/**`+`*.md`, so the gitignored `test-*/` fixture installs do not affect them. The whole-repo `validate` gate **is** tree-wide, and in the live working tree it exits RED **solely** from those gitignored `test-*/` fixtures (deliberately-invalid `floor/test-fixtures/red/skill.md` + a fixture `features/…/GRILL.md`) — verified this run: **every** working-tree `validate` finding is under a `test-*/` path (git-ignored), and **none** is one of the increment's files. Measured on a clean detached `git worktree` of HEAD (`7f98902`, tracked files only), `validate` is GREEN (`0 capabilities checked`). The gate uses that tracked-tree measurement — the honest "is the shippable repo green with this in it," not an artifact of the developer's local fixture installs. (`npm run check` — the build floor — was independently GREEN over the same tracked content.)

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check — verifier concerns would be advisory help, not assurance, and none are registered. A defect no test/eval/rule/lint covers is invisible to this verdict. The `/pharn-dev-grill` log raised one substantive concern (F1: the add-picker's config-threading correctness) — that is now pinned by a `tests/add.test.ts` case asserting the **final** persisted `capabilities` holds all picks, which the green `test` gate exercises.
