# VERIFY — smol-toml-override

- verdict source: `.dev/floor/check-verify.mjs` → exit **0**
- machine report: [`verify-report.json`](verify-report.json)

## FLOOR layer — the deterministic gates (these OWN the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

`failing_gates[]`: **none**.

`structural:*` gates: **none run** — this feature ships no committed eval pair
(`git ls-files '*/evals/expected/*.json'` is empty), so no such gate exists to run. Absent from the
map by construction, not skipped.

**VERIFIED: floor gates PASS.**

## What the green `validate` row is, and is not

`node .dev/floor/validate.mjs .` reports `FLOOR: GREEN — 0 capabilities checked in .`. This increment
adds **no PHARN markdown capability**, so the structural floor is **vacuously** green — it inspected
nothing. Recorded plainly because a green row that checked zero items is not evidence, and reading it
as though it were is precisely the "written in the command, therefore guaranteed" error (P0). The
gates that did real work on this increment are `test` (1236 vitest assertions, including the 18 new
ones) and `lint:md` (which exercises the changed dependency at load time).

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 was a no-op; nothing was appended to the
verdict, and nothing could have been: `check-verify.mjs`'s only input is the gate→exit-code map, so a
verifier finding cannot reach it even in principle (fix #3).

## The feature-specific signal inside the whole-repo gates

`test` / `lint` / `format:check` / `lint:md` / `typecheck` are **whole-repo** — PASS means the repo is
clean with the feature in it, not that the feature was inspected in isolation. This increment's own
correctness signal sits inside the `test` gate as `tests/dependency-overrides.test.ts` (18 cases — nine `it` blocks plus nine from two `it.each`
tables),
which is worth naming because six of them are **negative**: they plant a `1.7.0` lockfile entry (flat
and nested under another package), an unparseable version, a missing `version` field, and a lookalike
package name, and assert the check **rejects** each. That is what distinguishes "the gate is green"
from "the gate would notice" — without those cases a matcher that silently stopped matching would
leave this row green too.

## Residual

**Verified = the named gates passed.** This is **NOT** a guarantee of correctness beyond what those
gates check — a defect no test, eval, rule, or lint covers is invisible to this verdict, and the
verifier layer that might have noticed it is advisory and, today, empty. Specifically **not** verified
here: that `smol-toml@1.7.2`'s `parse()` is behaviorally compatible with `markdownlint-cli2@0.23.2`.
This repo's config is `.markdownlint-cli2.jsonc`, so `parse()` is never invoked and no gate exercises
it; the green `lint:md` demonstrates only that the module **loads**. Named, not implied.
