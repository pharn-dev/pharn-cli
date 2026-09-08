# VERIFY — docs-layout-tables

- machine report: `verify-report.json` · `node .dev/floor/check-verify.mjs <head.json> --feature docs-layout-tables`

## FLOOR layer (owns the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `lint`         | 0    |
| `typecheck`    | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `validate`     | 0    |

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .` (this repo declares no
capabilities; the floor is structurally green, which is not evidence about the docs).

`npm run build` → clean (`tsc --noEmit` then the esbuild bundle); `node dist/index.js --version` →
`0.4.0`.

## What the feature's own evals prove

`tests/docs-install-tables.test.ts`, 5 assertions, all green:

- each of `README.md` / `docs/getting-started.md` names every path a `pharn`-layout install writes —
  the set derived from `layoutPaths('pharn')` + `CLAUDE_COMMANDS_DIR` + `CLAUDE_HOOKS_DIR` +
  `FEATURES_README` + `PHARN_CONFIG_FILE` + `RECORDS_FILE`, never a literal list;
- neither Artifact column leads a row with a `layoutPaths('flat')` directory;
- the two tables list the same artifacts in the same order.

Falsifiability was demonstrated, not asserted: with both doc files stashed to their pre-change state,
all five go RED and name the actual defects (`README.md never names pharn/pharn-pipeline/grillers`;
`the Artifact column names the flat path pharn-pipeline/grillers/<name>/`).

Independently, `collectExpectedInstallPaths` was executed against a live `pharn-dev/pharn-oss`
checkout (`origin/main` = `2e183e6`, 35 capabilities) and produced 456 paths across exactly the
surfaces the new tables list — with `test-fixtures` contributing 0 entries.

## ADVISORY layer

Zero `role: verifier` capabilities exist in this repo (P7), so nothing annotates the floor verdict.
The judgments a deterministic gate cannot make here — whether each row's DESCRIPTION is true, whether
the `pharn`-first ordering is the right editorial call, whether the trusted-doc caveat is legible to a
first-time user — are the human's at the post-review gate.

## Verdict (FLOOR): `PASS`

`failing_gates: []`.
