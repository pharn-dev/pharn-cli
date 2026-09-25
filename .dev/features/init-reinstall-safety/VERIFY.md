# VERIFY — init-reinstall-safety

## FLOOR layer (owns the verdict)

The gates ran over the whole repo with the feature present, on node 22, with the session proxy
variables unset. They ran as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` /
`CAP_FOWNER` (`setpriv`), the CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

- `test` is vitest (1605 tests). It collects this increment's own cases in five files. 34 of them
  failed on the base (`5b63e31`, the new test files copied into a base worktree), each for the
  reason the plan names:
  - an upstream bump alone → `.pharn-backup/` created;
  - one real edit → two files backed up instead of one;
  - an edited `PHARN-LICENSE` / `pharn/LICENSE` → nothing backed up;
  - an edit plus a type collision → a backup made before the refusal;
  - a directory at `pharn.records.json` → every file copied, then `EISDIR`;
  - a whole `runInit` → the manifest builder called 4 times where the spy can see it (the fifth
    ran inside `install-manifest.ts`, invisible to a module mock); 1 after the fix.

  The guard cases (no records, a foreign-stamped store, a symlinked `.claude/`) pass on both. A
  35th case, added in the second iteration, pins that a flat → `pharn/` layout change backs up only
  a file of the user's own at a new path; it also fails on the base (`expected [] to deeply equal
  [ 'pharn/LICENSE' ]` — the LICENSE-source defect).
- `test:floor` is floor.yml's `node --test` run (754 tests).
- `npm run test:coverage` passes its ratchet (97.61 / 92.93 / 98.32 / 98.45) and `npm run build`
  exits 0; neither is a verdict gate, both are CI gates.
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

Outside the verdict:

- **Two whole `runInit` runs through the real steps** (`tests/init-archetype.test.ts`, a fixture
  clone standing in for the network fetch): after an upstream bump alone, the prompt marks nothing
  and nothing is backed up; with one real edit, the prompt marks exactly that file `(edited)` and
  the backup holds exactly that file. The prompt and the backup agree.
- **The dangling-link rationale was re-measured, and the plan's claim did not hold.** On Node
  20.13.0, 22.22.2 and 24.21.0, `cpSync` onto a dangling `.claude/settings.json` link (absolute or
  relative, target directory present or not) **replaces the link with a regular file**; it never
  writes through. The approved decision (refuse a dangling link) stands on the true reason — the
  user's link would be lost silently — and the code comment, docs and tests say that, not
  "written through".
- **The CLI itself could not be driven end to end here:** the sandbox's egress proxy answers
  codeload with 403.

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

Named limits:

- The prompt's labels are advisory: they are computed before the lock, and the scan under the lock
  decides the backup.
- The pre-flight and the copy are a check, not a lock: a link created between them is not seen (the
  TOCTOU residual `update` also names).
- Without a usable `pharn.records.json`, "your edit" cannot be told from an upstream change, so
  every difference is backed up and labelled that way.
