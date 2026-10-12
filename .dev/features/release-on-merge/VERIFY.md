# VERIFY — release-on-merge

## Floor gates (exit codes, working tree with the increment)

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |
| floor-tests  | 0    |

`test` = `npm test` (vitest, 83 files, including the new `tests/publish-workflow.test.ts`, `tests/release-notes.test.ts`, `tests/release-consistency.test.ts`). `floor-tests` = the `floor.yml` `node --test` globs, added to the map because the increment edits `.dev/floor/check-run-pins.test.mjs` (an orchestration choice — advisory; `check-verify.mjs` is generic over gate keys). No committed eval pair ships with this increment, so there is no `structural:*` gate. `validate` ran in the working tree; no gitignored `test-*/` install trees are present, so it is not coloured by their fixtures.

VERIFIED: floor gates PASS (`check-verify.mjs` exit 0, `failing_gates: []`).

## Verifiers (advisory)

No verifiers registered — floor gates only (`count-verifiers.mjs` → `{"registered":0,"verifiers":[]}`).

Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance. In particular, no gate here runs `publish.yml` on GitHub: the `Decide` and `Registry check` steps are executed from the committed text, the rest is pinned structurally, and the npm Trusted Publisher's acceptance of a `push`-triggered run is first tested by the next real release.
