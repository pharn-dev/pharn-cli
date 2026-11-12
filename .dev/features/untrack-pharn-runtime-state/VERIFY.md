# VERIFY — untrack-pharn-runtime-state

The verdict is computed by `.dev/floor/check-verify.mjs` over the gate exit codes below, not by this
stage's judgment.

## Floor gates (run at HEAD with the feature in the working tree)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

No `structural:*` gate: the feature ships no eval pair. `check-verify.mjs` exited **0**:
`"verdict": "PASS"`, `failing_gates: []`. Machine copy: `verify-report.json`.

Also run (not part of the verdict): `node .dev/floor/check-build-complete.mjs` on this `PLAN.md` →
`complete`, `missing: []`. The eight `.pharn/` paths count as present only because `git rm --cached`
keeps the working copies; in a fresh clone after merge they are absent, so a later re-run of that
check on this plan would list them missing (GRILL.md, P6 finding).

## Advisory layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — no verifiers
registered; floor gates only.

PASS means every deterministic gate exited 0 with this change in the tree. It is not a judgment that
the change is correct or wise.
