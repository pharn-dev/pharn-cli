# VERIFY — atomic-stale-lock-break

## FLOOR layer — the gates (these own the verdict)

| gate                  | command                          | exit |
| --------------------- | -------------------------------- | ---- |
| `test`                | `npm test` (vitest 5.0.0)        | 0    |
| `validate`            | `node .dev/floor/validate.mjs .` | 0    |
| `lint`                | `npm run lint`                   | 0    |
| `format:check`        | `npm run format:check`           | 0    |
| `lint:md`             | `npm run lint:md`                | 0    |
| `typecheck`           | `npm run typecheck`              | 0    |

`npm test`: 57 files, 1205 tests passed — including the 10 this increment adds (4 real-filesystem
cases in `tests/project-lock.test.ts`, 6 seam-driven interleave cases in
`tests/project-lock-break.test.ts`). `validate`: `FLOOR: GREEN — 0 capabilities checked in .`
(vacuously green — this increment adds no markdown capability, so it gates nothing here).

`structural:*`: **no gate.** This feature ships no committed eval pair, so — exactly as
`/pharn-dev-regress` handles the same case — no `structural:<expected>` entry exists in the map.

**The `lint-gate` flake, chased down rather than waved at.** Two captures during this run came
back red, both times with `tests/lint-gate.test.ts` and only that file — its five tests taking
7 s, 13 s, 13 s, 30 s and 34 s against a 5000 ms cap. It was **reproduced at unmodified
`origin/main` (550f8cf) in a clean worktree**, which is what makes it pre-existing and not this
increment's: `npx vitest run tests/lint-gate.test.ts` there exited 1 on the same tests. The cause
was machine load — `uptime` read a load average of **31**, and vitest reported worker startup at
1.12 s each versus 106 ms at rest. Re-run at a load average of 4.2, the whole suite is green
(57 files, 1205 tests) and `lint-gate` passes. The map above is a fresh capture with every gate's
output retained (`.pharn/pharn-dev-verify/*.log`); no results map was edited to reach PASS.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates
alone. Nothing annotates this report, and nothing could have flipped it if it did.

## Verdict

**VERIFIED: floor gates PASS.**

Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check — verifier concerns are advisory help, not assurance.

Two specific things the gates do **not** establish, carried forward from the plan and the grill so
the human weighs them at the gate rather than discovering them later:

- **The interleave is driven by a seam, not by two OS processes.** `tests/project-lock-break.test.ts`
  wraps `renameSync` so the real syscall runs and the other process's write lands at the exact
  instruction the race needs. That pins this code's behaviour at each point; it does **not**
  demonstrate `rename(2)`'s single-winner atomicity, which the design rests on and which was probed
  separately (node v24.13.1: second rename → `ENOENT`; `link` over an existing destination →
  `EEXIST`). Six of the ten new tests fail against the pre-fix implementation, so they do
  discriminate.
- **`win32` is implied-supported and exercised by no gate here** (CI is ubuntu-only —
  `docs/contributing.md`). The rename/link behaviours the fix depends on differ there, and the
  differences are stated in `src/lib/project-lock.ts` and in the commit message rather than assumed
  away.
