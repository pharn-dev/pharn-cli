# VERIFY — publish-npm-floor-assert

Machine report: `verify-report.json` (the `check-verify.mjs` verdict verbatim + the advisory
`verifiers` block merged in after the verdict was computed).

## FLOOR layer — the gates that own the verdict

| gate | exit |
| ---- | ---- |
| `test` (`npm test` — vitest, 625 assertions over `tests/**/*.ts`) | 0 |
| `floor-tests` (`node --test` over the floor/hook globs — 745 assertions, **incl. this feature's 41**) | 0 |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 |
| `lint` (`eslint src`) | 0 |
| `format:check` (prettier) | 0 |
| `lint:md` (markdownlint over `docs/**/*.md` + `*.md`) | 0 |
| `check-run-pins` (the gate this increment adds, over the live repo) | 0 |
| `check-action-pins` (the sibling gate — proves the edit did not disturb it) | 0 |

```text
VERIFIED: floor gates PASS
```

`node .dev/floor/check-verify.mjs …` → `"verdict": "PASS"`, **exit 0**, `failing_gates: []`.

### Gate-set composition — a deliberate widening, declared (P0, two clocks)

The gate **set** is this stage's **advisory** composition; only the verdict over it is floor. Three
gates were added beyond the command's default set, for one reason each:

- **`floor-tests`.** The default set's `test` gate is `npm test`, which is **vitest over
  `tests/**/*.ts` and does not collect `.mjs`**. This increment's only tests are
  `.dev/floor/check-run-pins.test.mjs` — so a PASS on the default set would have certified a run in
  which **not one of the feature's own 40 assertions executed**. That is precisely the "verified
  means the gates passed — and these gates checked nothing about the feature" hole. Added, and it is
  the same runner `floor.yml:28` uses in CI, so it is not a bespoke gate.
- **`check-run-pins` / `check-action-pins`.** The new gate over the live repo, and its sibling — the
  latter because this increment edits a workflow file the sibling scans, and "I did not break the
  neighbouring gate" should be an integer in the report, not a claim in prose.

Stated honestly: nothing floor-locks these gates into future runs (L9's residual). The widening is
orchestration, recorded here so it is auditable rather than invisible.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 was a no-op; the verdict is the floor gates
alone. Nothing was authored to fill the slot (P7).

## Evidence recorded outside the gate set (not verdict inputs)

These are proofs the gates structurally cannot run, listed so the report does not imply more coverage
than the integers above carry:

- **The assert program, extracted from the shipped `publish.yml` bytes** and run against six inputs:
  `11.5.0` → exit 1 · `11.5.1` → exit 0 (inclusive boundary) · `11.17.0` → exit 0 · `12.0.2` → exit 0 ·
  `""` → exit 1 (`unparseable version ""`) · `garbage` → exit 1. The last two exercise the fail-closed
  path that the grill's P5 finding corrected the reasoning for.
- **The whole step body executed verbatim** against the real local npm: `npm floor OK: npm 11.12.1 >= 11.5.1`, exit 0.
- **`publish.yml` parses as YAML** (via the transitive `js-yaml`, not a new dependency): 6 steps, the
  `Update npm` step gone, `permissions.id-token: write`, `environment: npm-publish`, `node-version: 24`,
  the tag guard, and `npm publish --provenance` all intact.
- **`grep -rn "npm@latest\|install -g npm" .github/workflows/`** → empty; the broader
  `"@latest\|install -g\|add -g\|global add"` → also empty.
- **The assert step's PRESENCE is now itself a gate assertion** (residual R5, closed after review):
  removing `- name: Assert npm floor` from `publish.yml` makes `check-run-pins.test.mjs` fail —
  demonstrated by running the same regex against a copy with the step deleted (`true` → `false`).

**Re-run note:** every gate above was re-executed after the post-review fixes; these are the final
numbers, not the pre-fix ones.

## Honest residual (P0/P7)

**Verified = the named gates passed. This is NOT a guarantee of correctness beyond what those gates
check** — verifier concerns would be advisory help, not assurance, and today there are none.

The specific, load-bearing limit for this increment: **`publish.yml` runs only on `release: published`,
so no gate in this repo can execute it.** The evidence above proves the assert's *logic* and its
*shell body*, and the PR's Actions run proves it *parses* — but the **execution proof of record is the
next release**. Anyone reading this as "the release path is verified" is reading more than the
integers support.
