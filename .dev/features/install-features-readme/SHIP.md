# SHIP — install-features-readme

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

Notable: the grill asked for the writer/mirror symlink postures to be tested where they DISAGREE.
Measuring that turned up a real hole (a symlinked `features/` parent copies bytes from outside the
clone) which the build closed and pinned. See `REVIEW.md`.

Raised upstream, not done here: confirm `pharn-dev/pharn-oss` intends `features/README.md` as
installed product surface (its text is user-addressed, so this is a confirmation).

## Post-GATE-2 rounds (PR #139)

Three review findings, all from Greptile, all verified by measurement before acting, and each the
follow-on of the previous one — a chain worth recording because it shows the increment's real shape:

1. **Destination symlink escape.** A project whose own `features/` is a symlink took the copy through
   it, writing OUTSIDE the project root, with no overwrite warning (the leaf inside the link does not
   exist, so it is not a conflict). Fixed by walking the destination components, the posture
   `apply-update.ts` already takes.
2. **Optional source triggered that walk.** The destination walk ran BEFORE the source-existence
   check, and `findSymlinkComponent` suppresses ENOENT only — so a project with a regular FILE named
   `features` turned "upstream does not ship this yet" into an init that could not complete. Fixed by
   short-circuiting on the source and turning ENOTDIR into a skip.
3. **The skip moved the crash one phase later.** The skipped path stayed in the source-derived
   manifest, which `buildRecords` then could not stat — crashing after every other file was written.
   Fixed in `buildRecords`, whose invariant is that a record describes bytes that are actually there.
   `src/lib/install-records.ts` was DECLARED in the plan's `## Files` and the writes-scope re-set
   from it, rather than written around the hook.

Every one of the three tests was verified to fail against the pre-fix code, and for #1 that required
reverting only the guard — stashing the whole file made the test pass vacuously by removing the copy
site too.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
