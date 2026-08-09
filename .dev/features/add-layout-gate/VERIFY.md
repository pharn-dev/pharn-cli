# VERIFY — add-layout-gate

## FLOOR layer — the deterministic gates (owns the verdict)

| Gate           | Command                                | Exit |
| -------------- | -------------------------------------- | ---- |
| `test`         | `npm test` (vitest, whole repo)        | 0    |
| `validate`     | `node .dev/floor/validate.mjs .`       | 0    |
| `lint`         | `npm run lint` (eslint over `src`)     | 0    |
| `format:check` | `npm run format:check` (prettier)      | 0    |
| `lint:md`      | `npm run lint:md` (markdownlint-cli2)  | 0    |

The `test` + `lint` + `format:check` + `lint:md` set is exactly the repo's `npm run check` aggregate, so
this verdict tracks the full `check` — including the increment's own markdown style, which is L9's
coverage point (cited, not restated, P4). `validate` reports `FLOOR: GREEN — 0 capabilities checked`
(whole-repo granularity; the increment adds no markdown capability, so it is vacuously green and gates
nothing here).

**No `structural:*` gate.** This feature ships no committed eval pair — `pharn-review/trust-fence/evals/expected/`
does not exist in this repo, so there is no `<expected>.json` ↔ `findings.json` pair to check. Absent
from the map by convention, exactly as `/pharn-dev-regress` handles it — not a skipped gate, a
non-existent one.

**Feature-specific correctness signal.** With no eval pair, the feature-specific content of this verdict
is carried by the increment's own tests inside `npm test`: `tests/add.test.ts` now holds **34** tests,
10 of them new for this gate, and the whole suite is **605** (up from the 595 baseline). Those ten were
mutation-checked during `/pharn-dev-build` — neutering the gate to `if (true) return null` reddens 6 of
them, and forcing the record derivation to `layoutPaths('flat')` reddens the other 2 — so they fail for
the reason they claim to test rather than passing vacuously. That check is **build evidence, advisory**;
it is not part of this verdict.

## Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit 0)

```json
{ "verdict": "PASS", "failing_gates": [] }
```

**VERIFIED: floor gates PASS.**

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op: membership resolved to ∅ by a
deterministic frontmatter read (never a prose grep), so no advisory findings were produced and none
could have reached the verdict helper regardless — its only input is the gate→exit-code map.

## The honest residual (P0/P7)

**Verified = the named gates passed. This is NOT a guarantee of correctness beyond what those gates
check.** A defect no test, eval, rule, or lint covers is invisible to this verdict, and the verifier
layer that might otherwise notice it is advisory and, today, empty. Verifier concerns would be advisory
help, not assurance.

Two specific limits worth naming for this increment:

- The gates confirm the whole repo is green **with the gate in**; they do not and cannot confirm that
  refusing is the *right* product decision for a version-matched layout drift. That judgment is the
  human's at the post-review gate.
- `installCapabilityDirs` is mocked in every `add` test, so no gate here exercises the real copy
  landing at the pharn layout end-to-end — the coupling between the gate and the installer's internal
  `layoutPaths(detectLayout(repoDir))` default is pinned only by an argument-shape assertion. This was
  raised as a `/pharn-dev-grill` finding (P0, important) and is carried, not closed.

Which gates are in the map is this command's **advisory** composition — `check-verify.mjs` is generic
over gate keys and there is no floor lock keeping the style gates in the set (L9's remedy lives in this
orchestration layer, by design). Do not read "verify runs the style gates" as floor-locked.
