# VERIFY — ship-completion-retry (built correctly?)

**VERIFIED: floor gates PASS** (`check-verify.mjs`, exit 0). Verdict is `PASS` iff every gate exit 0 — it is.

## Gate → exit-code (whole-repo, ONCE at HEAD)

| gate           | exit | what it covers                                                      |
| -------------- | ---- | ------------------------------------------------------------------- |
| `test`         | 0    | `npm test` — full hermetic suite incl. the feature's own new suites |
| `validate`     | 0    | `validate.mjs .` — structural floor GREEN (35 capabilities)         |
| `lint`         | 0    | eslint clean                                                        |
| `format:check` | 0    | prettier clean (whole-repo)                                         |
| `lint:md`      | 0    | markdownlint clean (whole-repo)                                     |

- The feature ships **no** `<cap>/evals/expected/*.json` ↔ `findings.json` pair (it is floor infrastructure +
  command prose, not a `role:`-bearing Capability), so there is **no** `structural:*` gate — its correctness
  signal is the two new hermetic suites collected by `npm test`:
  - `check-build-complete.test.mjs` — 11 tests incl. the **★ parity** cross-check vs `set-writes-scope.cjs`'s
    `--from-plan` scope, the P2 shell-metacharacter-is-a-literal-operand test, and the read-error catch
    (post-review finding 2);
  - `check-verify.test.mjs` — the 6 new `--complete` cases (INCOMPLETE @ exit 3; FAIL-beats-incompleteness
    precedence; `--complete 2`/malformed → INCONCLUSIVE; and the **★ backward-compat** guard that an ABSENT
    `--complete` can never yield INCOMPLETE), plus the pre-existing spine tests unchanged.

## Advisory layer

**No verifiers registered — floor gates only** (`count-verifiers.mjs` → `{"registered":0}`). Step 2 was a
no-op; the verdict is the floor gates alone.

## Notable (dogfood)

This dev-verify runs the **same shared `check-verify.mjs`** the increment modified, and passed **no**
`--complete` — so it live-exercised the backward-compat path (absent flag ⇒ legacy 3-valued `PASS`),
confirming the shared checker is byte-behaviour-identical for its existing consumers (`/pharn-dev-verify`,
`check-ship.mjs`).

## Honest residual (P0/P7)

verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check —
there are zero verifiers, so no advisory concern was raised or is being relied on. Whether the retry
orchestration in `/pharn-ship` prose behaves as intended (the retry is command prose, not unit-tested — grill
finding 4) is checked by `/pharn-dev-review` + the human, not by this floor verdict.
