# SHIP — local-file-reads

Stages run, in order:

1. `/pharn-dev-plan` → GATE 1 (human: "fix all 3", then "Approve both (Recommended)": all three
   pharn-owned files through one reader, a 16 MiB cap).
2. `/pharn-dev-grill`. Its three minor findings were folded into the build:
   - the lock case is pinned to its existing grace rule, with a young and an old case;
   - the reason strings are fixed;
   - every FIFO case runs in a child process.
3. `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`. During the
   build, `docs/troubleshooting.md` was added to the plan's `## Files`: it is where the config's
   unreadable cases are listed.
4. `/pharn-dev-review` found one platform inconsistency (REVIEW.md advisory finding 1). It was fixed
   within the plan's `## Files`, and build → regress → verify ran again. Everything below is from
   that second run.
5. GATE 2.

| stage                | structural verdict (verbatim)                          |
| -------------------- | ------------------------------------------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions` |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `PASS`               |

- Review: [`REVIEW.md`](REVIEW.md) · Grill (advisory): [`GRILL.md`](GRILL.md)
- The run ended at **GATE 2**. The human's standing instruction: open a pull request and merge it
  once its checks are green, then start the next plan (init-preflight-first).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
