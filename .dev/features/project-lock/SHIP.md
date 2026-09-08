# SHIP — project-lock

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

The grill's sharpest findings all concern branches a plausible implementation gets **backwards**:

- **F2** — pid liveness is meaningless across hosts, so a foreign-host lock is retired only by age.
- **F4** — `EPERM` from `kill(pid, 0)` means *alive under another user*, not dead.
- **F5** — a `finally { release() }` around the entry point would delete the **other** process's lock
  on the refusal path, leaving the real holder unprotected: strictly worse than no lock.
- **F3** — the payload is user-editable and its pid reaches `process.kill`, so shape validation must
  precede every use. The test plants a *string* `"1"` to prove ordering rather than assert it.
- **F7** — acquiring before `update`'s fetch would strand a lock on every offline run, the most
  common failure that command has.

F6 kept the reporting split `4.06` established: a held lock is a **policy refusal**, not a crash, so
all four commands route it away from the `PHARN_DEBUG` path.

Reported, not hidden: age can retire a genuinely live foreign-host lock after six hours — a deliberate
trade against wedging a project forever — and no test runs two real processes; the interleave is
reasoned from the code and only the refusal is tested.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
