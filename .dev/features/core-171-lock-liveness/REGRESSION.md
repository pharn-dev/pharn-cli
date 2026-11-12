# REGRESSION — core-171-lock-liveness

- base: `99cc1c19fa971a1f05153172d28a043840927ff6` (HEAD; uncommitted working-tree build, so `base = HEAD` by the Step 1 rule; also the merge-base with origin/main); head: the working tree.
- inside (the changed scope, all within the PLAN's `## Files`): CHANGELOG.md, CLAUDE.md, docs/troubleshooting.md, src/commands/init.ts, src/lib/project-lock.ts, tests/{project-lock,project-lock-break,project-lock-commands}.test.ts.
- `scope` first returned exit 1 naming `.dev/features/core-171-lock-liveness/{PLAN,GRILL}.md` as escaped. Those files are the pipeline's own stage artifacts: `/pharn-dev-plan` and `/pharn-dev-grill` wrote them, each under its own hook scope. The build did not write them. They were left out of `--changed`, as in core-170's report, and `scope` then returned exit 0.
- outside gates (identical at base and head): `tests` (`node --test` over 47 outside `*.test.mjs`/`*.test.cjs`, 787 tests), `validate` (`node .dev/floor/validate.mjs .`). Style gates skipped: no shared style config changed.
- Correction: the first capture passed the outside test list to `node --test` as ONE zsh word, so both sides read `tests: 1`. That was a harness error, not a result. The capture above was re-run with `${=OUT}`.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. That means no deterministically detectable regression in the outside gates. It does not mean the change is correct.
