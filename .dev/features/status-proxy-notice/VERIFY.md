# VERIFY — status-proxy-notice

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

All six measured in one coherent run (`npm test` → 56 files / **1126 tests** passed;
`node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`). This increment ships no
committed eval pair, so there is **no** `structural:*` gate — absent from the map rather than faked
green.

**VERIFIED: floor gates PASS** — `check-verify.mjs` exit 0, `failing_gates[]` empty.

## A flaky gate, recorded rather than hidden

The first two gate captures returned **`test: 1`**, and the honest account of why matters more than
the green that followed.

Every failure was in `tests/lint-gate.test.ts` and every one was `Error: Test timed out in 5000ms` —
never an assertion mismatch. That file shells out to `eslint` per case, so it is wall-clock sensitive.
The evidence that this is machine contention and not this increment:

| observation                                                              | result                 |
| ------------------------------------------------------------------------ | ---------------------- |
| full suite, first capture (contended)                                    | 4 failed / 1122 passed |
| that file alone, my worktree (contended)                                 | 1 failed / 6 passed, 26.9s |
| that file alone, **baseline `558b8dd` unmodified**                        | **7 passed**, 10.1s    |
| that file alone, my worktree, moments later                              | **7 passed**, 3.99s    |
| full suite, re-run                                                       | **1126 passed**, 18.5s |

Same file, same worktree, same bytes: 26.9s → 3.99s. `git worktree list` shows **~16 concurrent agent
worktrees** on this machine (the sibling PRs), which is the load. Two further facts rule this
increment out as a cause: the diff touches only `src/commands/status.ts`, `tests/status.test.ts` and
`CHANGELOG.md` — none of which `lint-gate.test.ts` exercises — and the `lint` gate itself is exit 0,
so nothing here is even lint-dirty.

**No results map was edited to reach PASS.** The recorded map is a single clean measurement of all six
gates; the red captures are reported above rather than discarded. The residual worth naming for the
human: `tests/lint-gate.test.ts` has a **pre-existing 5000ms-timeout flake under parallel load**. It is
not this PR's to fix (out of scope), but it will keep surfacing in CI and in other agents' runs, so it
should not be lost.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 was a no-op and the verdict is the floor gates
alone. No verifier free-text exists in this run, so no untrusted data reached the report (P2).

## Feature-specific correctness signal

The whole-repo gates say "the repo is green with this in it". The signal specific to *this* feature is
its own cases inside `npm test`, and one measurement is worth recording because a passing test proves
nothing on its own if it would pass either way:

**Mutation check.** Reverting ONLY `src/commands/status.ts` to the pre-fix version — leaving the new
tests untouched — turns exactly three cases RED:

- `warns before the SKILLS_VERSION fetch under --no-drift, which still fetches` → `expected false to be true`
- `warns before the fetch even when that fetch then fails` → `expected false to be true`
- `warns exactly once on --no-drift` → `expected [] to have a length of 1 but got +0`

…while the other 28 stay green (including `warns exactly once on the drift path`, which was never
broken). The fix was then restored and re-verified. So the inverted assertion is **load-bearing**: it
fails against the bug it was rewritten to catch, which is the property the previous version of that
test lacked — it passed *because* of the bug.

## Honest residual (P0/P7)

**Verified = the named gates passed.** This is **not** a guarantee of correctness beyond what those
gates check — a defect no test, eval, rule or lint covers is invisible to this verdict, and the
verifier layer that might notice it is advisory and currently empty. Verifier concerns are advisory
help, not assurance.
