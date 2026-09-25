# SHIP — signal-lock-release

Stages run, in order:

1. `/pharn-dev-plan` → GATE 1 (human: plans A–F accepted with every recommended answer).
2. `/pharn-dev-grill`.
3. The plan's `## Files` was reworded so the writes-scope parser reads every path (formatting only).
4. `/pharn-dev-build`.
5. **Plan amended by the human mid-build.** Before review, a measurement showed that handling SIGHUP
   overrides `nohup`. Asked again, the human chose SIGINT/SIGTERM only (open question 1 → b). The
   build was changed to match.
6. `/pharn-dev-build` floor re-run → `/pharn-dev-regress` → `/pharn-dev-verify` →
   `/pharn-dev-review` → GATE 2.

| stage                | structural verdict (verbatim)                          |
| -------------------- | ------------------------------------------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions` |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `PASS`               |

- Review: [`REVIEW.md`](REVIEW.md) · Grill (advisory): [`GRILL.md`](GRILL.md)
- The run ended at **GATE 2**. The human's standing instruction for this batch: after each
  increment, open a pull request and merge it once its checks are green, then start the next plan.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
