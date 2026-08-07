# VERIFY — capability-source-provenance

> **Re-run after the review fixes.** The first pass had to measure on a clean worktree because
> `validate` was RED locally; that cause has since been removed (see "Measurement" below), so this
> run measures the **working tree directly**, with no caveat.

## FLOOR layer — the deterministic gates (owns the verdict)

Gate set = the repo's full `npm run check` aggregate plus `validate` (L9's style-coverage remedy —
`format:check` and `lint:md` are in the map, so an increment's own markdown style is caught here).

| Gate           | Exit | Meaning                                       |
| -------------- | ---- | --------------------------------------------- |
| `test`         | 0    | vitest — 39 files, **595 tests**, 0 failures   |
| `validate`     | 0    | structural floor GREEN, in the working tree    |
| `lint`         | 0    | eslint clean                                   |
| `format:check` | 0    | prettier clean                                 |
| `lint:md`      | 0    | markdownlint clean (23 files, 0 issues)        |

`structural:*`: **no gate** — this feature ships no committed eval-actual pair, so none is in the map.

595 tests, up from 592 at the first pass: +1 net in `tests/update.test.ts` (one test became two — a
corrected drop test plus a new version-withholding test) and +2 in `tests/merge-capabilities.test.ts`.

### Measurement — the earlier caveat is now resolved

The first verify pass disclosed that `validate` exited **1** in the local working directory, with all
15 findings inside gitignored `test-*/` scratch, and measured on a clean worktree instead. Both causes
have since been removed:

1. The seven gitignored dogfood trees (1.5 GB, six of them a month stale) were deleted, after
   archiving their non-regenerable artifacts.
2. `.dev/floor/validate.mjs` was a **stale vendored copy** of pharn-oss's, missing the
   `${sep}pharn${sep}floor${sep}` exclusion upstream already added. It and the three counters were
   synced — a separate increment with its own plan, `.dev/features/floor-exclude-sync/PLAN.md`.

Consequently `validate` now exits 0 in the working tree, and the counters report the truth (0
grillers / 0 lenses / 0 verifiers, against 81 / 142 / 0 before — every one of those was scratch).
**No user was ever affected**: each installed project runs its own `pharn/floor/validate.mjs`, copied
from the clone, which already carried the exclusion — verified GREEN on all seven scratch installs
(28–35 capabilities each) before they were deleted. CI was never affected either: `floor.yml` runs on
a fresh checkout.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; no verifier free-text was produced,
so no untrusted `problem` / `evidence` entered this report.

## Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.**

`failing_gates[]`: empty. The verdict is an exit-code threshold (`every gate === 0`) computed by the
helper, whose only input is the gate→exit-code map — it cannot receive a finding, so no judgment of
mine or of any verifier could have moved it.

**Honest residual (P0/P7):** verified = **the named gates passed**; this is **NOT** a guarantee of
correctness beyond what those gates check. Which gates are in the map is this command's **advisory**
composition — no floor lock keeps `format:check` / `lint:md` in the set (L9 lives in the orchestration
layer by design).

That residual is not theoretical here. Every gate in this table was GREEN on the first pass too, while
the increment still shipped a **false** sentence — "the union can never re-add it" — in `CHANGELOG.md`
and `docs/commands/remove.md`. No lint, test, or floor check can read a claim and know it is untrue.
It was caught by review, and is now pinned by
`tests/merge-capabilities.test.ts` → _"re-adds a REMOVED manual entry as auto when the archetypes
still select it"_, which converts the prose claim into an executable one.

## Live-upstream reproduction: NOT performed

The plan's acceptance scenario allows an optional live run against `pharn-dev/pharn-oss` via a PTY
harness. **It was not run**, and with the dogfood trees now deleted there is no local install to run it
against. The verification of record is the fixture suite — `tests/update.test.ts`'s
`capability membership` block, which seeds a legacy `{name: "n-plus-one", role: "lens"}` entry with no
`source`, its files and its records, runs the real `update` flow against a fixture clone, and asserts
the entry survives as `manual`, its bytes upgrade, its records persist, and the report names it. No
live transcript is claimed.
