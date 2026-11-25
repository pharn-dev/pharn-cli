# SHIP — core-386-unpack-listed-paths-only

| Stage   | Verdict (structural)                                                |
| ------- | ------------------------------------------------------------------- |
| plan    | GATE 1 approved by lead (delegated by the user)                     |
| grill   | advisory: 5 concerns (0 blocking), folded into the build            |
| build   | floor GREEN (format:check, lint, lint:md, typecheck, vitest, build) |
| regress | `no-regressions` (regression-report.json; `tests` pre-existing red) |
| verify  | `PASS` (verify-report.json)                                         |
| review  | 0 floor-gate findings, 4 advisory (minor) — see REVIEW.md           |

GATE 2 delegated to the lead: open the PR, drive CI green, do not merge. The lead later set the version: 0.21.6
(epic-coordinated), so `package.json` is bumped and the CHANGELOG entry is the `[0.21.6]` section. pharn-ci's
TI02 on the first push (renamed tests in `tests/tar-extract.test.ts`) was answered by keeping the base test names. THREAT-MODEL.md was patched by the user with
the script this run wrote (`$SP/patches/CORE-386.py`, since deleted).

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is
the human's call at the post-review gate.
