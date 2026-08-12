# VERIFY — ci-matrix-required-checks

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | command                       | exit |
| -------------- | ----------------------------- | ---- |
| `test`         | `npm test`                    | 0    |
| `validate`     | `node .dev/floor/validate.mjs .` | 0    |
| `lint`         | `npm run lint`                | 0    |
| `format:check` | `npm run format:check`        | 0    |
| `lint:md`      | `npm run lint:md`             | 0    |

**VERIFIED: floor gates PASS.** `.dev/floor/check-verify.mjs` exit **0**, `"verdict": "PASS"`,
`failing_gates: []`.

The gate set is exactly the repo's `npm run check` aggregate plus `lint:md`, so the verdict tracks the
full style surface at verify rather than deferring an increment's markdown style to CI (L9 — cited, not
restated, P4). **No `structural:*` gate ran:** this repo ships **0** committed eval pairs
(`git ls-files '*/evals/expected/*.json'` → 0), so there is none to run — an absence measured, not
skipped.

**Gates deliberately not in the map, named so their absence is not read as coverage.** `npm run build`
is not a `check-verify` gate here, so the `Build` job's green is asserted by CI rather than by this
verdict — it was run separately during `/pharn-dev-build` (exit 0). And nothing in this verdict
exercises the new workflow **as GitHub will execute it**: the six jobs' correctness as *Actions* is
established only when the branch is pushed and the six checks report.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}` — a deterministic `role:` frontmatter read (P5), never a prose grep.
Step 2 is therefore a no-op, no `claude -p` call was made, and `verifiers.findings[]` is empty. No
verifier free-text exists in this run, so the P2 taint boundary carries nothing today; it stands ready
for when the first verifier lands.

## What this increment's own tests cover

`npm test` collects `tests/ci-workflow.test.ts` (4 cases), the increment's own specification (P1). It
was mutation-checked rather than merely observed green: renaming the `Markdown lint` job to
`Markdown Lint` — a single character — fails 2 of its 4 cases (`expected [...] to deeply equal [...]`
and `no job named Markdown lint`). The tripwire demonstrably trips.

`.dev/floor/check-run-pins.test.mjs` (amended in scope) confirms the workflow adds **no floating
install**: `d.violations` is `[]` and all six added `run:` lines are `npm ci`, lockfile-pinned.

## Honest residual (P0/P7)

**Verified = the named gates passed.** This is **NOT** a guarantee of correctness beyond what those
gates check — verifier concerns would be advisory help, not assurance, and there are none registered.
Specifically unverified by this verdict, and worth carrying to the review gate:

- that the six job names match the **live GitHub ruleset** — `tests/ci-workflow.test.ts` pins only the
  repo side of that two-sided invariant and cannot read the ruleset;
- that the workflow **runs green on GitHub**, which no local gate can establish;
- that `engines.node: ">=20"` holds, since every gate here ran on one local Node and CI will now run
  only Node 24.

Running the gates and composing the gate set is **advisory orchestration**; only the exit-code
threshold is floor-grade.
