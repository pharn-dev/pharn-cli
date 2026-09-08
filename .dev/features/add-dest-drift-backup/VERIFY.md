# VERIFY — add-dest-drift-backup

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |

`test` = `vitest run`, 984 assertions across 49 files — including this increment's own new coverage:
`tests/dest-drift.test.ts` (16 cases), the `capabilityCloneFiles` block in
`tests/install-manifest.test.ts` (8 cases, including the real-`installCapabilityDirs` mirror pin), and the `destination-drift backup` block plus the four
reworked record-derivation cases in `tests/add.test.ts`. `validate` = `.dev/floor/validate.mjs .` →
`FLOOR: GREEN — 0 capabilities checked` (this repo ships no markdown capability, so it is vacuously
green and gates nothing here — stated, not counted as evidence).

**No `structural:*` gate.** This feature ships no committed eval-expected ↔ actual pair, and none
exists in the repo (`pharn-review/*/evals/expected/*.json` matches nothing), so no such gate is in the
map — absent rather than faked, exactly as `/pharn-dev-regress` handles the same case.

The `test` + `lint` + `format:check` + `lint:md` set is the repo's `npm run check` aggregate, so this
verdict tracks the full check (L9's style-gate coverage, applied at verify). **Which** gates are in the
map is this command's advisory composition — there is no floor lock keeping the two style gates in the
set. Do not read "verify runs the style gates" as floor-locked.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates
alone. No verifier free-text was produced, so no untrusted `problem` / `evidence` entered this report.

This run was taken AFTER the post-review fixes AND after the rebase onto `#131`/`#132` AND after the Greptile P1 fix (`/pharn-dev-review`'s two important advisories plus
two minor ones); both stage verdicts were recomputed on the fixed tree rather than carried over.

## Verdict (FLOOR — `check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.**

`check-verify.mjs`'s only input is the `{gate: exit}` map — it cannot receive a finding, so no
judgment could have flipped this number.

**Residual, named not hidden:** verified = **the named gates passed**. This is NOT a guarantee of
correctness beyond what those gates check. A defect no test, lint rule, or eval covers is invisible
here, and the verifier layer that might have noticed it is advisory and currently empty. Verifier
concerns, when they exist, are advisory help — not assurance.
