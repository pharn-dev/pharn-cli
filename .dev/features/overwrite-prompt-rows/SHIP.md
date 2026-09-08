# SHIP — overwrite-prompt-rows

## Verdict table

| Stage    | Source                    | Verdict                                                        |
| -------- | ------------------------- | -------------------------------------------------------------- |
| build    | `npm run check`           | **GREEN** — 51 files, 1061 tests; format, lint, typecheck all 0 |
|          | `npm run lint:md`         | **GREEN** — 0 issues, 23 files                                  |
|          | `npm run build`           | **GREEN** — tsc `--noEmit` + esbuild bundle                     |
|          | `.dev/floor/validate.mjs` | **GREEN** — 0 capabilities checked                              |
| regress  | `regression-report.json`  | **`no-regressions`** (exit 0) — 6 gates, base `977aa38` vs head |
| verify   | `verify-report.json`      | **`PASS`** (exit 0) — `failing_gates: []`                       |
| review   | `REVIEW.md`               | advisory — **no floor-gate findings**; 4 non-blocking           |

`check-regress.mjs scope`: `escaped: []` — every changed file is declared in `PLAN.md`'s `## Files`.

## What the grill changed

`GRILL.md` produced five findings against the plan. Three of them changed the increment; two changed
only what it claims.

- **F1 (the corrupt-config proof never runs `init`)** rewrote the central test. It was going to be
  "write a broken config, see that we survive"; it is now **two-sided** — it first asserts
  `readPharnConfig` genuinely throws `ModelRoutingError` on that exact fixture, and only then that
  `confirmWriteTargets` renders. Without that, a fixture that quietly stopped being rejected upstream
  would have turned the test into a tautology. F1 also **declined** an end-to-end `init` test and said
  why, rather than buying a weaker guarantee out of the same mocks.
- **F2 (`VERSION_RE` can drop a legitimate version)** did not change the code but moved the argument
  into it: the filter is now justified in the source comment as a deliberate cosmetic-failure choice,
  with the reason it is not a P5 silent-skip violation stated where the next editor stands.
- **F3 (the stage gains a second responsibility)** is why the reader is **unexported** and why the
  comment says so. The alternative — putting it next to `readPharnConfig` — was considered and
  rejected on containment grounds, not convenience.
- **F4 (an unstated layout assumption)** was the one finding that could have been a real hole:
  `conflicts.includes('pharn.config.json')` assumed the config does not move under the `pharn/`
  layout. Verified rather than assumed (`configPath` is `resolve(cwd, CONFIG_FILENAME)`, no layout
  involvement), and the constant used is the one that *populates* the conflict list.
- **F5 (the doc claims a set it does not enumerate)** is why the reference doc **points at**
  `docs/commands/init.md` instead of duplicating the install itemisation into a second file.

The mutation check in `VERIFY.md` is downstream of F1: both mutations redden exactly the test that
owns them, and the second — swapping the raw read for `readPharnConfig` — is the exact shape a future
editor would reach for.

## What this increment does not establish

The floor claim here is small and worth stating in one sentence: **a doc no longer names a prompt
that does not exist**, checked by string membership. The optional code half is a bounded convenience
whose worst failure is printing one fewer word. Neither is a claim that `pharn init` is safe against
a broken config — no test enters `runInitArchetype`, and the other init stages are unchanged and
unaudited by this work.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
