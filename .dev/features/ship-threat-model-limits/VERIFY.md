# VERIFY — ship-threat-model-limits

- machine report: `.dev/features/ship-threat-model-limits/verify-report.json`
- verdict (FLOOR, `check-verify.mjs` exit 0): **PASS**

| gate           | exit |
| -------------- | ---- |
| `test` (1029)  | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

`count-verifiers.mjs` → 0 registered; floor gates only.

## What this does and does not guarantee

Guaranteed: the six gates passed, and the tests demonstrate that a pharn install now writes the two
docs when the clone has them, omits them when it does not, and refuses a symlinked one.

**Not** guaranteed, and not claimed: that the dangling citations in the installed product commands
are fixed. The doc CONTENT and the `protect-trusted-paths.cjs` root-anchoring are upstream
(`pharn-dev/pharn-oss`), which at `2e183e6` still has only ROOT `THREAT-MODEL.md` / `LIMITS.md`. This
change makes the CLI able to ship them; it does not make them exist. Every current install is
therefore unaffected — which the P7 test pins rather than asserts.
