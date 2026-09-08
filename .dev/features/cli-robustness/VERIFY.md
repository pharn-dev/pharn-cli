# VERIFY — cli-robustness

**Verdict (FLOOR): `PASS`** — `.dev/floor/check-verify.mjs`, exit **0**. The machine record is
`verify-report.json` beside this file; the verdict below is that file's `.verdict` field verbatim.

## Layer 1 — FLOOR gates (these OWN the verdict)

| Gate           | Command                                         | Exit |
| -------------- | ----------------------------------------------- | ---- |
| `format:check` | `npm run format:check`                          | 0    |
| `lint`         | `npm run lint` (`--max-warnings 0`)             | 0    |
| `lint:md`      | `npm run lint:md`                               | 0    |
| `typecheck`    | `npm run typecheck` (src **and** tests)         | 0    |
| `test`         | `npm run test:coverage` — 942 passed, 48 files  | 0    |
| `build`        | `npm run build`                                 | 0    |
| `validate`     | `node .dev/floor/validate.mjs .` — FLOOR: GREEN | 0    |

**Build completeness**: `node .dev/floor/check-build-complete.mjs PLAN.md .` reports `complete`,
exit 0 — all 21 concrete paths the plan's `## Files` declared exist; `skipped: []`, `missing: []`.

**Coverage** (thresholds 90 / 82 / 95 / 92): statements 97.1%, branches 92.73%, functions 98.34%,
lines 97.86%. `src/lib/report-error.ts` is at 100% on every metric.

## Layer 2 — ADVISORY verifiers

`node .dev/floor/count-verifiers.mjs .` returns `{"registered": 0}`. **Zero `role: verifier`
capabilities exist (P7)**, so this run is floor gates only. Nothing in this layer could have flipped
the verdict even if a verifier had run (fix #3).

## Live behavioral probe (advisory evidence, not a gate)

Run against the built `dist/index.js` in a scratch git repo, because a mocked dispatch cannot prove
what the real binary prints or on which stream.

| Invocation             | exit | stdout           | stderr                                |
| ---------------------- | ---- | ---------------- | ------------------------------------- |
| `status --sctrict`     | 1    | *(empty)*        | `Unknown option: "--sctrict"` + usage |
| `update --froce --yes` | 1    | *(empty)*        | `Unknown option: "--froce"` + usage   |
| `add a11y extra`       | 1    | *(empty)*        | `Unexpected argument: "extra"`        |
| `--hepl`               | 1    | *(empty)*        | `Unknown option: "--hepl"`            |
| `--help --bogus`       | 1    | *(empty)*        | `Unknown option: "--bogus"`           |
| `--version --bogus`    | 1    | *(empty)*        | `Unknown option: "--bogus"`           |
| `list --json --bogus`  | 1    | *(empty — pure)* | `Unknown option: "--bogus"`           |
| `bogus`                | 1    | *(empty)*        | `Unknown command: bogus`              |
| `--version`            | 0    | `0.4.0`          | *(empty)*                             |
| `status --`, `add -- x`| 1    | the clack intro  | the ordinary config error             |
| `update -yf`, `add -1` | 1    | *(empty)*        | the token as typed, refused           |

**P2 escaping, checked at the bytes** (`od -c`): an argument containing a tab and a bell is emitted
as the six literal characters `\t` and `\u0007`, never as the control characters themselves.

**The brief's own reproduction, re-run**: `pharn update --yes > update.log 2> errors.log` in an
uninitialised directory now leaves 61 bytes in `errors.log` (the cause) and 18 in `update.log` (the
intro). Before this change `errors.log` was **0 bytes**.

## Honest scope (P0)

`PASS` means exactly "every named gate exited 0 and every declared path exists". It is **not** a
claim that the increment is well-designed, complete in intent, or wise — that is the human's call at
the post-review gate.
