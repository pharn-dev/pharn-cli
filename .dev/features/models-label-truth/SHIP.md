# SHIP — models-label-truth (--loop, 1 iteration)

Stages run, in order: grill → build → regress → verify → review → check-ship. GATE 1 was passed before the loop (2026-10-10). The run ended at GATE 2.

Floor verdicts, verbatim:

- /pharn-dev-build: `node .dev/floor/validate.mjs .` exit 0; `npm run check` exit 0
- /pharn-dev-regress (base 1c96bf8f41107d972159a4545ceaca8a0cfb1581): `regression-report.json` `.verdict` = `no-regressions`
- /pharn-dev-verify: `verify-report.json` `.verdict` = `PASS`
- check-ship (iter 1, cap 3): exit 0, `STOP_GREEN`

See `.dev/features/models-label-truth/REVIEW.md` (advisory) and `GRILL.md` (advisory).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
