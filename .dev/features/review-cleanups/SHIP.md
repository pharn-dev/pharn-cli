# SHIP — review-cleanups

Stages run, in order:

1. `/pharn-dev-plan` → GATE 1 (human: plans A–F accepted with every recommended answer). The plan
   was parked while A–E and B shipped, then brought back on the current `main`. Four changes were
   made on the way, with the same intent:
   - its `## Files` was rewritten for the writes-scope parser: sub-bullets that began with a
     backtick would have been read as paths, and the subtree helper's callers were undeclared;
   - the discovery line numbers were refreshed;
   - three raw invisible characters, a `source-hygiene` test and a stale function name in
     comments were added, the same kind of cleanup found while shipping A–E and B;
   - the grill findings were folded in (below).
2. `/pharn-dev-grill`. Its findings were folded into the plan before the build:
   - the abort output keeps a stderr warning and a stderr pointer (an existing test pins both);
   - the fence is ported as upstream's slice, opening-line remainder included;
   - the CHANGELOG backfill merges about ten pairs into net-since-0.5.0 entries;
   - the case rule for ecosystem dirs is stated;
   - the order test uses a recording spinner mock;
   - the spinner stops with a phrase the notice does not repeat.
3. `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`.
4. `/pharn-dev-review` found one defect (REVIEW.md advisory finding 1). It was fixed within the
   plan's `## Files`, and build → regress → verify ran again. Everything below is from that second
   run.
5. GATE 2.

| stage                | structural verdict (verbatim)                          |
| -------------------- | ------------------------------------------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions` |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `PASS`               |

- Review: [`REVIEW.md`](REVIEW.md) · Grill (advisory): [`GRILL.md`](GRILL.md)
- The run ended at **GATE 2**. The human's standing instruction for this batch: after each
  increment, open a pull request and merge it once its checks are green. This is the last plan of
  the batch.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
