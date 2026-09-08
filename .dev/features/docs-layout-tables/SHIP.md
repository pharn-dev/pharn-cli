# SHIP — docs-layout-tables

## Verdicts

| stage    | verdict          | grade    | source                      |
| -------- | ---------------- | -------- | --------------------------- |
| plan     | approved         | human    | `PLAN.md`                   |
| grill    | proceed          | advisory | `GRILL.md`                  |
| build    | green            | floor    | `npm run check` + `build`   |
| regress  | `no-regressions` | floor    | `regression-report.json`    |
| verify   | `PASS`           | floor    | `verify-report.json`        |
| review   | no floor finding | advisory | `REVIEW.md`                 |

Gates at head: `test` 0, `lint` 0, `typecheck` 0, `format:check` 0, `lint:md` 0,
`node .dev/floor/validate.mjs .` 0. Base (`7d96bbc`) identical on all six.

## What the grill changed

- **F1** — the trusted-doc row was going to name four `pharn/` docs from `PHARN_TRUSTED_DOCS`. Live
  upstream ships only two of them under `pharn/`, so the row names those two and the note carries the
  condition. This changed what ships.
- **F2** — the brief called this markdown-only with the markdown linter as its gate. That gate cannot
  see a stale path. `tests/docs-install-tables.test.ts` was added, and its negative half was run
  rather than assumed. This changed what ships.
- **F3** — the "no flat paths" rule was re-scoped to the Artifact column so the deliberate flat
  mentions in the note survive, with `license.to` excluded by construction rather than by a literal.
- **F4** — the flat note no longer claims a root `pharn-core/`; upstream has none.
- **F5** — both prose lines were re-read from disk, so PR 6's `features/README.md` and
  `test-fixtures/` additions survive the rewrite.

## What the docs claimed vs. what the installer does

Both tables led with `pharn-contracts/`, `.dev/floor/` and a root `CONSTITUTION.md`. A current
install writes `pharn/pharn-contracts/` and `pharn/floor/` — a renamed directory under a different
parent — and `pharn/CONSTITUTION.md`. `features/README.md` was installed by neither table's account
and by every install. `README.md` additionally omitted `ARCHITECTURE.md`, the trusted-doc set, and
`pharn.records.json`.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
