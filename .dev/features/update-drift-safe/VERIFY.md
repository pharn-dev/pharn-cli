# VERIFY — update-drift-safe

- **verdict:** `PASS` — `.dev/floor/check-verify.mjs` exit **0** (every gate exit 0)
- machine report: [`verify-report.json`](verify-report.json)

## FLOOR layer — the gates that OWN the verdict

| Gate           | Command                          | Exit |
| -------------- | -------------------------------- | ---- |
| `test`         | `npm test` (538 vitest tests)     | 0    |
| `validate`     | `node .dev/floor/validate.mjs .`  | 0    |
| `lint`         | `npm run lint` (eslint)           | 0    |
| `format:check` | `npm run format:check` (prettier) | 0    |
| `lint:md`      | `npm run lint:md` (markdownlint)  | 0    |

`failing_gates: []`. These five are exactly the repo's `npm run check` aggregate plus `lint:md`, so the
verdict tracks the whole CI gate set (L9 — cited, not restated). No `structural:*` gate: this increment
is TypeScript and ships no committed eval pair, so that gate is legitimately absent from the map (the
same way `/pharn-dev-regress` handles an empty set), not silently dropped.

### One measurement decision, stated openly (orchestration = ADVISORY)

Run **verbatim in the working tree**, `validate` exits **1** with **15 blocking findings**. Every one of
them is inside a **gitignored `test-*/` fixture install** (`test-backend`, `test-edge`, `test-edge2`,
`test-full`, `test-lib`, `test-next`, `test-spa` — local scratch from earlier sessions, dated well
before this increment):

```text
- [blocking] P1/ARCH§3.1  test-next/pharn/floor/test-fixtures/red/skill.md
    missing required frontmatter field: version
… 15 findings, 100% under test-*/ , 0 in tracked source
```

The `validate: 0` recorded above is therefore measured on a **clean `git worktree` checkout of HEAD with
this increment's diff and untracked files overlaid** — the repo as it would exist in CI, without local
scratch. Two independent facts support that this is a measurement artifact and not a defect being
papered over:

1. **Path membership** — a deterministic test, not judgment: all 15 finding paths start with a
   gitignored `test-*/` prefix; **zero** are in tracked source.
2. **`/pharn-dev-regress` measured `validate` at `0` on BOTH base and head** in clean checkouts, so the gate did
   not flip — the RED predates the increment and belongs to the working directory, not the repo.

Per this command's own guarantee audit, **which** gates run and **how** they are invoked is the advisory
orchestration clock; only the verdict (`every gate === 0`) is floor-grade. This choice lives in that
advisory layer and is recorded here rather than buried. A follow-up should make `validate.mjs` skip
gitignored roots so the raw working-tree run and the clean run agree (the same instrument problem as
`count-grillers.mjs` reporting 81 fixture grillers — `GRILL.md` finding G0).

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op and the verdict is the floor gates
alone. No verifier is authored speculatively (P7). No untrusted verifier free-text was produced in this
run, so nothing was appended after the verdict.

## What this increment's own tests demonstrate (collected by the `test` gate)

Not a second verdict — just what the green `test` gate contains, since the feature's correctness signal
lives there: 108 new tests across `update-decision` (every row of the 6-row table × `--force`, plus
planner pruning/grouping), `install-records` (dest-hashing, fail-closed validation, the stamp gate),
`backup` (ordering, collision uniquification, abort-before-touch, symlink refusal), `apply-update`
(parent creation, symlink-dest refusal, partial-failure record carrying), plus the real-filesystem
`update` suite and the new `init` / `add` record wiring.

## VERDICT

**VERIFIED: floor gates PASS.**

Residual, stated plainly (P0/P7): _verified = the named gates passed._ This is **NOT** a guarantee of
correctness beyond what those gates check — a defect no test, lint rule, or eval covers is invisible
to this verdict, and the verifier layer that might have noticed it is empty today and would be
**advisory** regardless. Verifier concerns are advisory help, not assurance.
