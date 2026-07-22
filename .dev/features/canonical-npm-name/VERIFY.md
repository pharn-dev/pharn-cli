# VERIFY — canonical-npm-name

**VERIFY FAILS: gate `validate` red — stage FAILS** (`check-verify.mjs` exit 1). **But the sole failing
gate is the pre-existing whole-repo `validate` contamination, not the rename** — see below.

## Floor gates (the verdict owner)

| Gate | exit | |
| --- | --- | --- |
| `test` (`npm test`, vitest — 378 tests incl. the feature's `src/`) | 0 | ✅ |
| `lint` (`npm run lint`, eslint) | 0 | ✅ |
| `format:check` (prettier) | 0 | ✅ |
| `lint:md` (markdownlint) | 0 | ✅ |
| `validate` (`node .dev/floor/validate.mjs .`, whole-repo) | **1** | ❌ pre-existing |

`failing_gates: ["validate"]`.

## Why `validate` is red (pre-existing, not this increment)

`validate.mjs .` walks the **whole repo**, including the **gitignored `test-*/` install dirs**, and flags
15 deliberately-red fixtures under `test-*/pharn/floor/test-fixtures/red/skill.md`. These are committed-
into-the-install test fixtures that exist regardless of this rename:

- `/pharn-dev-regress` proved it deterministically: `validate` is **RED at the baseline** (the 10 files
  reverted to HEAD) **and** at HEAD → classified **pre-existing**, not a regression (`regression-report.json`).
- This increment added **no** PHARN markdown capability and touched **no** `test-*/` dir, so `validate`'s
  verdict on those fixtures is byte-identical before/after the rename.

Every gate that actually exercises the rename — `test` (vitest over `src/`), `lint`, `format:check`,
`lint:md` — is **GREEN**. The rename is clean; the FAIL is a whole-repo `validate` granularity artifact of
the gitignored `test-*/` install tree (the same root cause as `count-grillers.mjs` over-reporting 81 from
`test-*/`).

## Verifiers (advisory layer)

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — **no verifiers registered —
floor gates only.** No advisory annotations.

## Residual (P0/P7)

Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check —
verifier concerns are advisory help, not assurance. Here the verdict is FAIL, owned solely by the whole-
repo `validate` gate's pre-existing `test-*/` contamination; the increment-relevant gates all pass. The
floor cannot, by itself, scope `validate` to exclude the gitignored install fixtures — that is a
repo-tooling limitation surfaced honestly for the human, not a defect in the rename.
