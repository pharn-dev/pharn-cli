# VERIFY — `security-md-tarball-path`

## FLOOR layer (owns the verdict)

| gate | exit |
| --- | --- |
| `test` | 0 |
| `validate` | 0 |
| `lint` | 0 |
| `format:check` | 0 |
| `lint:md` | 0 |
| `typecheck` | 0 |

No `structural:*` gate: this increment ships no committed eval pair, so none is in the map (the same
way `/pharn-dev-regress` handles an empty `outside_eval_pairs`).

**VERIFIED: floor gates PASS.** (`check-verify.mjs` → `"PASS"`, `failing_gates: []`, exit **0**.)

`lint:md` is the only gate in this set that opens either changed file, and it opens exactly one of
them: it lints `SECURITY.md` (0 issues over 23 files) and **skips `CHANGELOG.md`**, which
`.markdownlint-cli2.jsonc` lists in `ignores`. Worth stating because it bounds what this green covers.

## ADVISORY layer (verifiers)

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 was a no-op and nothing was appended after the
verdict; no verifier finding exists to quote, and none could have changed the number above in any case
(`check-verify.mjs`'s only input is the gate→exit-code map — it cannot receive a finding).

## The honest residual

**Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check** — verifier concerns would be advisory help, not assurance, and here there are none.

For this increment specifically, the gap between "PASS" and "correct" is unusually wide and should be
read plainly rather than inferred: **no gate in the set above reads the prose that this increment
exists to change.** `lint:md` checks markdown _syntax_, not whether a sentence about
`CLONE_TIMEOUT_MS` is true; `format:check` covers `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts` and
never opens a `.md`; no `vitest` test reads `SECURITY.md`. So the six green gates establish that
nothing in the repo broke — they establish **nothing** about whether the rewritten security claims
match `src/lib/repo.ts` and `src/lib/tar-extract.ts`.

That correctness rests on two non-floor things, both recorded rather than assumed: the line-by-line
re-derivation of every constant in `PLAN.md`'s Discovery (read from source this run, not from the
audit brief), and the review stage's reading. The grill stage raised the missing gate as finding **F1**
(`rule_id: P1`, `important`) and it was deliberately **deferred as scope growth**, not resolved — a
`tests/*.test.ts` asserting that `SECURITY.md` names each cap constant exported by `src/lib/repo.ts`
would move this from "checked by reading" to floor, and remains the top follow-up.
