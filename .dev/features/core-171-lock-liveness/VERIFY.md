# VERIFY — core-171-lock-liveness

Floor gates, run once at HEAD (the working tree with the feature in it):

| gate          | exit |
| ------------- | ---- |
| test          | 0    |
| validate      | 0    |
| lint          | 0    |
| format:check  | 0    |
| lint:md       | 0    |
| typecheck     | 0    |
| test:coverage | 0    |
| build         | 0    |

`test:coverage` and `build` are additions to the usual gate set, because the brief's "done when" names them. No `structural:*` gate: the increment ships no eval-actual pair.

Coverage note: in `src/lib/project-lock.ts`, every line and branch of the changed code (`bootMs`, `isStale`, `release`) is covered. The file's remaining uncovered lines predate this increment.

Verifiers: `count-verifiers.mjs` → `{"registered":0}`, so floor gates only.

Verdict (`check-verify.mjs`, verbatim): **PASS**. Every gate exited 0. That is a statement about the deterministic suite, not a judgment that the change is correct.
