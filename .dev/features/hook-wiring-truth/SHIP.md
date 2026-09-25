# SHIP — hook-wiring-truth

Stages run, in order:

1. `/pharn-dev-plan` → GATE 1 (human: plans A–F accepted with every recommended answer).
2. `/pharn-dev-grill`.
3. The plan's `## Files` was rewritten for the writes-scope parser. Raw U+202E/U+200B characters had
   crept in where escape text was meant, and they were removed. The grill findings were folded in:
   - `src/commands/status.ts` declared, since the approved local-only behaviour needs the strict
     gate to read the diff status;
   - the unreadable-file rule;
   - U+2028/2029 escaping.

   Intent unchanged.

4. `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → GATE 2.

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
