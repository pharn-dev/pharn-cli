# VERIFY — ruleset-contract-pins

Two cleanly separated layers. The FLOOR layer owns the verdict (deterministic gate exit codes,
computed by `.dev/floor/check-verify.mjs`). The ADVISORY layer annotates and can never flip it.

## Floor gates

| Gate           | Exit | Notes                                                    |
| -------------- | ---- | -------------------------------------------------------- |
| `format:check` |    0 | prettier over `src`, `tests`, `*.config.ts`               |
| `lint`         |    0 | eslint `--max-warnings 0`                                 |
| `lint:md`      |    0 | 23 markdown files, 0 issues                               |
| `typecheck`    |    0 | both `tsconfig.json` and `tsconfig.test.json`             |
| `test`         |    0 | 52 files, 1068 tests — 11 in `ci-workflow.test.ts` (was 4) |
| `validate`     |    0 | `FLOOR: GREEN — 0 capabilities checked`                    |

**Verdict: PASS** (`check-verify.mjs` exit 0, `failing_gates: []`).

`npm run build` was also run separately and exits 0. It is not a `check` gate but it is a required
status check, so it was measured.

## RED evidence (the pins were seen failing)

A pin never observed failing is not evidence. Each new assertion was run against a deliberately
broken scratch copy of its input, then the input was restored. No workflow file is modified in the
committed diff.

| Mutation                                        | Base test | New test                                      |
| ----------------------------------------------- | --------- | --------------------------------------------- |
| `floor.yml`: add `name: Floor` to the job        | **4 passed — the gap** | RED: `expected [ 'Floor' ] to deeply equal []` |
| `gitleaks.yml`: job id → `secret-scan`           | n/a       | RED: `[ 'secret-scan' ]` vs `[ 'gitleaks' ]`   |
| `codeql.yml`: template → `CodeQL (…)`            | n/a       | RED: 2 cases (name pin + substitution)         |
| `codeql.yml`: matrix → `[js-ts, python]`         | n/a       | RED: `expected … to have a length of 1 but got 2` |
| `ci.yml`: `Markdown lint` → `Markdown Lint`      | n/a       | RED: 2 cases (set equality + per-gate script)  |
| test source: drop `'Markdown lint'` from mirror  | n/a       | RED: `expected [ …(8) ] to deeply equal [ …(9) ]` |

Row 1 is the load-bearing one. At the base commit, adding a job-level `name:` to `floor.yml` —
which renames a required status check and merge-blocks every PR — left the entire file GREEN at
4/4. That is the hole, demonstrated rather than argued. Row 5 exists because the refactor, not the
new pins, was the real risk (GRILL finding 3): it proves the rewritten `ci.blocks` / `ci.jobNames`
still address `ci.yml` and still fail on a rename.

## Advisory layer

Zero `role: verifier` capabilities exist in this repo (P7), so there is no advisory annotation to
record. Floor gates only.

## What PASS means here

"The named gates passed." It does NOT mean the required-check contract holds end to end — nothing in
this suite reads the `main` ruleset, so the ruleset half stays unverified by construction. See the
PLAN's guarantee audit, Side B.
