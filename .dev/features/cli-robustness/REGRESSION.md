# REGRESSION — cli-robustness

**Verdict (FLOOR): `no-regressions`** — `.dev/floor/check-regress.mjs verdict`, exit **0**. The
machine record is `regression-report.json` beside this file; the verdict below is that file's
`.verdict` field verbatim, not a re-derivation.

## Method

The repo's six CI gates (`.github/workflows/ci.yml`) were run twice and their **exit codes**
compared — a deterministic integer comparison, zero LLM judgment in the core:

- **BASELINE**: `0c3ee34` (`main`, the commit this increment branched from), in a detached
  `git worktree` with `node_modules` shared, so the baseline ran against the same installed
  dependency tree.
- **HEAD**: the working tree at `8673925`.

| Gate           | npm script      | base | head |
| -------------- | --------------- | ---- | ---- |
| `format:check` | `format:check`  | 0    | 0    |
| `lint`         | `lint`          | 0    | 0    |
| `lint:md`      | `lint:md`       | 0    | 0    |
| `typecheck`    | `typecheck`     | 0    | 0    |
| `test`         | `test:coverage` | 0    | 0    |
| `build`        | `build`         | 0    | 0    |

`regressions: []`, `pre_existing: []`.

## Honest scope (P0)

A gate-level exit-code comparison detects a **pass to fail flip of a whole gate**. It does not detect
a behavior change no existing gate covers — that is what the new cases in `tests/index.test.ts`,
`tests/report-error.test.ts` and `tests/skills-version.test.ts` are for, and those were confirmed
**red against the baseline source** (18 failures) before this change, so they are not
self-confirming.

`lint:md` is run here even though it sits outside `npm run check`, because `docs/troubleshooting.md`
changed.
