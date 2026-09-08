# VERIFY — overwrite-prompt-rows

## FLOOR layer — the deterministic gates (owns the verdict)

| Gate           | Command                          | Exit |
| -------------- | -------------------------------- | ---- |
| `test`         | `npm test` (vitest, whole repo)  | 0    |
| `lint`         | `npm run lint` (eslint)          | 0    |
| `typecheck`    | `npm run typecheck` (two tsc)    | 0    |
| `format:check` | `npm run format:check`           | 0    |
| `lint:md`      | `npm run lint:md`                | 0    |
| `floor`        | `node .dev/floor/validate.mjs .` | 0    |

`verify-report.json` → **`"verdict": "PASS"`, `failing_gates: []`**, exit 0.

`format:check` + `lint` + `typecheck` + `test` is exactly the repo's `npm run check` aggregate;
`lint:md` and the floor validator are the two CI gates `check` deliberately excludes, so all six of
CI's gates are represented. `validate.mjs` reports `FLOOR: GREEN — 0 capabilities checked in .` —
whole-repo granularity, and this increment adds no markdown capability, so it is vacuously green and
gates nothing specific to the feature. Said plainly rather than counted as coverage.

**No `structural:*` gate.** This repo ships no committed eval pair, so there is no
`<expected>.json` ↔ `findings.json` to check. Non-existent, not skipped.

## Feature-specific correctness signal

With no eval pair, the feature-specific content of this verdict rests on the five tests added to
`tests/overwrite-check.test.ts` (7 → 12; whole suite 1056 → 1061). Two facts about them, both
measured this run rather than asserted:

**RED-first.** Against the unmodified `src/steps/overwrite-check.ts`, `npx vitest run
tests/overwrite-check.test.ts` gave **2 failed | 10 passed**, both failures reading
`AssertionError: expected 'PHARN installs into your existing pro…' to contain 'skills v2.3.4'`.
The other three new cases passed at baseline and are labelled in `PLAN.md` as **regression pins**,
not new-behavior proofs — they hold the pre-existing copy and the no-config path still, which is
their whole job.

**Mutation-checked.** Two mutations were applied to the finished code and reverted; each reddened
exactly the test that claims to own it, so neither passes vacuously:

| Mutation                                                        | Reddened                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| drop the `VERSION_RE.test(version)` filter                       | `drops a skillsVersion that is not a plain version string`   |
| route the read through `readPharnConfig` instead of reading raw  | `survives a config readPharnConfig would REJECT`             |

The second is the load-bearing one: it is the exact shape a future editor would reach for
("we already have a config reader"), and the test refuses it. This is **build evidence, advisory** —
it is not part of the verdict above.

## Honest scope

The PASS covers what the six gates cover. It does **not** establish that `pharn init` as a whole
survives a broken `pharn.config.json`: every new test calls `confirmWriteTargets` directly with
`@clack/prompts` mocked, and `runInitArchetype` is never entered. `GRILL.md` F1 states why an
end-to-end case was declined rather than bought — the mocks it would need are the same mocks that
would have to be wrong for the claim to be false. Nor does any gate compare the two rewritten docs
to the code; that link is prose, reduced only by both files now quoting literals the tests pin.
