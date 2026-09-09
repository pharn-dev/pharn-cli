# VERIFY — lock-before-fetch

**VERDICT: `PASS`** — `.dev/floor/check-verify.mjs`, exit 0. Every gate in the map exited 0;
`failing_gates` is empty. The verdict is an exit-code threshold, not a judgment.

## FLOOR layer — owns the verdict

| gate | exit |
| --- | --- |
| `test` (`npm test` — 1132 assertions across 56 files) | 0 |
| `validate` (`.dev/floor/validate.mjs .`) | 0 |
| `lint` (`eslint --max-warnings 0`) | 0 |
| `format:check` (prettier) | 0 |
| `lint:md` (markdownlint-cli2) | 0 |
| `typecheck` (`tsc --noEmit`, src **and** tests) | 0 |

No `structural:*` gate: this increment ships no committed eval pair (it is TypeScript modules and
vitest tests, not a markdown capability), so none is in the map — the same way `/pharn-dev-regress`
handles an empty pair set.

Two checks were run beyond the gate map and are recorded here as evidence, not as verdict inputs:
`npm run build` exited 0, and `npm run test:coverage` measured **97.22 / 92.83 / 97.55 / 98.09**
against the ratchet's **97 / 92 / 97 / 97** — every axis above its floor, so the ratchet CI enforces
is not reddened. That mattered: the increment deletes two previously-covered `process.exit(1)` catch
bodies, and `statements` had only 0.06 points of slack before the change.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; nothing annotated the report, and
nothing could have flipped the verdict if it had (fix #3).

## What this PASS means, and what it does not

It means: **the named deterministic gates passed.** That is the entire content of "verified."

It does not mean the increment is correct in any sense the suite does not encode. The specific
correctness this feature claims is encoded, and it is worth naming what carries it:

- "a refused `add`/`update` downloads nothing" → three cases in
  `tests/project-lock-commands.test.ts` asserting `fetchRepo` was **not called**, against real
  directories with a real lock file.
- "a failed download strands no lock" → three cases asserting `.pharn.lock` is absent afterwards
  **and** that the user still sees the real `offline` message rather than a `TypeError` from a
  cleanup dereferencing a clone that never existed.
- "the confirm is not held under the lock" (`update`) → a declined run creates no lock file.
- "`init` is deliberately unchanged" → a case asserting `init` **does** call `fetchRepo` under a held
  lock, so a later consistency refactor has to argue with a test.

The honest residual: nothing here measures the *duration* of the hold or the width of the refusal
window. Those are argued from `repo.ts`'s timeout constants, not measured — a bound by construction,
which is why the CHANGELOG states it as a ceiling rather than a benchmark.
