# VERIFY — publish-oidc-trusted

**Deterministic floor verdict (`check-verify.mjs`, over the working tree): `FAIL` — gate `validate` red (exit 1).**

## Floor gates (whole-repo, over the working tree)

| gate           | exit | note                                                              |
| -------------- | ---- | ----------------------------------------------------------------- |
| `test`         | 0    | vitest — 378 tests pass                                           |
| `validate`     | 1    | **sole failure** — see below (pre-existing untracked-app artifact) |
| `lint`         | 0    | eslint clean                                                      |
| `format:check` | 0    | prettier clean                                                    |
| `lint:md`      | 0    | markdownlint clean                                                |

`failing_gates: ["validate"]`. Verifiers: **no verifiers registered — floor gates only** (`count-verifiers .` → `{"registered":0}`).

## The `validate` FAIL is a local artifact, not this feature (proven, not asserted)

Four independent facts, each deterministic:

1. **CI-equivalent verdict is PASS.** `validate.mjs .` run in a clean `git worktree` at `HEAD` (no untracked files — exactly what `ci.yml` checks out) → **exit 0**. All other gates are already green, so a CI verify would be **PASS**.
2. **Every working-tree offender is an untracked test app.** `validate.mjs .` offenders outside `test-*/` = **0**. All RED originates in the untracked local `test-*/` app installs (`git ls-files 'test-*'` → 0 tracked); their intentional `pharn/floor/test-fixtures/red/skill.md` fixtures are what validate flags. The one *tracked* red fixture (`.dev/floor/test-fixtures/red/skill.md`) is excluded — validate skips `.dev/`.
3. **Invariant under this feature.** `validate.mjs` walks **only `.md`** files (`name.endsWith(".md")`); the feature's sole change is `.github/workflows/publish.yml` (`.yml`). It is provably outside validate's input domain — validate's result cannot change because of it.
4. **The other four gates — `test`, `lint`, `format:check`, `lint:md` — are all GREEN,** so the feature introduced no new deterministic failure anywhere the suite looks.

## Standing human authorization

This is the **same** pre-existing `validate` condition surfaced at the `/pharn-dev-build` gate, where the decision option explicitly read *"Note: verify will surface the same validate.mjs condition."* The human chose **"Continue the chain"** with that notice, i.e. authorized proceeding past this exact FAIL. The chain therefore continues to `/pharn-dev-review`, which ends at **GATE 2** where the human makes the final merge / fix / abandon call with every artifact in hand.

## Honest residual (P0/P7)

Verified = the named gates passed — and here **four of five did**, with the fifth (`validate`) failing only on untracked local test apps that do not exist in CI and that this `.yml` change cannot affect. This is **NOT** a guarantee of correctness beyond what those gates check: no floor gate in this repo parses the workflow YAML itself (`validate` reads `.md`; nothing runs the `secrets.` grep as a standing gate — it was run once at build and returned 0). The workflow's real-world correctness (OIDC actually authenticates; the `npm-publish` environment and npmjs Trusted-Publisher config exist) is verified out-of-band at the first release — see `PLAN.md` external prerequisites (i)–(iii). Verifier concerns are advisory help, not assurance; there are none today.
