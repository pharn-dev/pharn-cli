# VERIFY — ci-matrix-os-node (M7)

## FLOOR layer — the gates that own the verdict

| gate | exit | what actually ran (liveness-asserted, not inferred from the code) |
| --- | --- | --- |
| `test` | 0 | vitest — `Tests 643 passed (643)` |
| `floor-tests` | 0 | `node --test` over the `.mjs`/`.cjs` floor suite — `ℹ tests 765 · pass 765 · fail 0` |
| `validate` | 0 | `FLOOR: GREEN — 0 capabilities checked in .` |
| `lint` | 0 | eslint, `--max-warnings 0` |
| `format:check` | 0 | prettier |
| `lint:md` | 0 | markdownlint-cli2 |

Every exit code above was recorded only **after** its log was checked for a real completion signal. That is not ceremony: during `/pharn-dev-regress` two separate harness bugs produced a plausible-looking `1` from a gate that had **never executed** (zsh not word-splitting an unquoted list, then macOS `xargs` lacking `-a`). A capture that never ran is indistinguishable from one that ran and failed, by exit code alone.

### `floor-tests` was ADDED to the gate set, and why that matters

`vitest.config.ts:6` sets `include: ['tests/**/*.test.ts']`. So `npm test` collects **only** `tests/*.test.ts` — and this feature's own test, **`.dev/floor/check-soft-tier.test.mjs` (17 cases)**, is collected by **none** of the standard gates. A PASS assembled from the documented set would have implied coverage of the increment's own tests that it did not have.

The stage's own doc says the gate **set** is *advisory orchestration* — `check-verify.mjs` is generic over gate keys — so composing one more gate in is sanctioned, and `/pharn-dev-verify` still "invents none": `floor-tests` is verbatim the command `.github/workflows/floor.yml` already runs in CI.

Stated honestly, per the two-clocks rule: **the verdict now covers this feature's own tests because I composed that gate in, not because anything floor-locks it there.** A future run that omits `floor-tests` would still report PASS.

> **Reported, not fixed (outside this increment's whitelist):** the command doc asserts that `npm test` "auto-collects via its `**/*.test.mjs` glob." That is the generic pharn-oss framing and is **false in pharn-cli**, whose vitest include is `tests/**/*.test.ts`. Any increment whose tests live in `.mjs` is silently unverified by the documented gate set. The human's call — `.claude/commands/pharn-dev-verify.md` is not mine to edit here.

No `structural:*` gate appears: no `<cap>/evals/expected/*.json` exists in this repo (the single `evals/expected` path is a `.md` fixture under `.dev/floor/test-fixtures/`), so the feature ships no committed eval pair — the same absence `/pharn-dev-regress` recorded.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op, no `claude -p` call was made, and no untrusted verifier free-text exists in this run. None is authored speculatively (P7).

## Verdict

**VERIFIED: floor gates PASS.** (`check-verify.mjs` exit **0**, `"verdict": "PASS"`, `failing_gates: []` — see `verify-report.json`.)

**Honest residual:** verified = **the named gates passed**; this is **NOT** a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance, and there are none today.

Two specific things the gates above do **not** cover, named because this increment's whole subject is the difference between a check that runs and a check that only appears to:

1. **The matrix itself is not verified by any local gate.** No gate here executes on Windows, macOS, or Node 22/24. The execution proof is external and empirical: five green cells on PR #91 run `31521684401`.
2. **The R1 fix's blocking branch is unreachable on POSIX.** `readDiskState`'s `parentBlocks` true-branch cannot be reached on macOS/Linux, because `lstatSync` raises `ENOTDIR` and short-circuits first. So the 643 vitest tests passing locally say **nothing** about the fix. Its only regression test is the Windows CI cell — which is the point of the increment, and is now permanent.
