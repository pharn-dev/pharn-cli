# VERIFY — race-condition-lens

- **Verdict:** `PASS` — `.dev/floor/check-verify.mjs` exit **0** (deterministic exit-code threshold: PASS iff every gate exit 0).
- **Feature:** the race-condition lens (`pharn-review/race-condition/`) — membership-only floor, one hostile eval, `enforces: [P2]`.

## FLOOR layer — the deterministic gates (own the verdict)

| gate           | exit | notes                                                                                     |
| -------------- | ---- | ----------------------------------------------------------------------------------------- |
| `test`         | 0    | `npm test` — the hermetic suite (whole-repo) is GREEN with the feature present            |
| `validate`     | 0    | `.dev/floor/validate.mjs .` → GREEN — **32 capabilities** (31 → 32, the new lens counted) |
| `lint`         | 0    | `npm run lint` (eslint) clean                                                             |
| `format:check` | 0    | `npm run format:check` (prettier) clean — whole-repo (L9)                                 |
| `lint:md`      | 0    | `npm run lint:md` (markdownlint) clean — whole-repo (L9)                                  |

**No `structural:*` gate.** The feature ships an eval `expected` but **no committed actual `findings.json`**
(no live lens runner — deferred 3c), so by convention it has no `structural:<expected>` gate — exactly as the
sibling off-by-one lens verified (its `verify-report.json` is the precedent). The eval's structural trip-wire was
instead exercised at build time by a **hand-built `actual.json`** demonstration: `check-structural.mjs` returns
GREEN (exit 0) on a conforming finding (7 structural assertions, `file` at line 20) and RED (exit 1) on
suppressed / downgraded / needle-laundered variants. That is a build-time demonstration, **not** an automated
verify gate over the lens's emitted output (which awaits the 3c runner) — stated plainly, not hidden.

## Honest note: the style gates initially FAILED, then a mechanical formatter fix (L9 working as designed)

The first gate capture had `format:check = 1` and `lint:md = 1` — the increment's own hand-authored markdown
(the lens, the eval case + expected MD, and the plan/grill/regression trace) was not prettier-canonical and had
MD049 emphasis-consistency violations. This is precisely the L9 case: verify's fuller gate set catches an
increment's own markdown style that build's `validate`-only gate does not. The fix was **mechanical and
deterministic** (`prettier --write` + `markdownlint --fix` over the feature's own files — no logic, no intent
change). One consequence handled explicitly: prettier reformatted the fixture's embedded JS, moving the racy
write `configCache = fetched;` from line 19 → **line 20**, so the eval's `file_resolves` value and the
expected-MD line references were updated to line 20 and re-confirmed (`check-structural` GREEN). All five gates
were then re-run to the true **PASS** recorded above — a real pass over actually-clean files, not a bypass.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor
gates only.** Step 2 is a no-op; the verdict is the floor gates alone (zero verifiers is the honest P7 state — no
verifier is authored speculatively).

## Verdict (stated plainly)

**VERIFIED: floor gates PASS** (`test`, `validate`, `lint`, `format:check`, `lint:md` — all exit 0).

**Honest residual (P0/P7):** verified = **the named gates passed**; this is **NOT** a guarantee of correctness
beyond what those gates check. The lens's core value — the concurrency-race judgment — is **advisory** and has
**no** deterministic gate here (membership-only floor, by design); a race-detection defect no test/eval/lint
covers is invisible to this verdict. Verifier concerns would be advisory help, not assurance — and there are
none registered. This certifies **only the gates it ran**, never the feature as a whole (that is the human's call
at the post-review gate).
