# REGRESSION — init-midinstall-failure

Baseline `4972abbfce3038e6a48eda1bc505fde0e8a9f607` (merge-base with `origin/main`), measured in a
**detached worktree** created for this run and removed after it, sharing the same `node_modules` as
head so both sides ran under one environment. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`** (`regressions: []`, `pre_existing: []`), with
`--base 4972abb` and `--inside tests/init.test.ts`.

Raw captures were written to feature-unique filenames for the run —
`base-initmidinstall.json` / `head-initmidinstall.json`, never a shared scratch name, because that
has collided between concurrent agents in this repo before — and are not committed, matching every
other feature dir here. Both were byte-identical:

```json
{"test":0,"lint":0,"typecheck":0,"format:check":0,"lint:md":0,"validate":0}
```

## What moved

Test count **1084 → 1087**, both measured on the full suite: three new cases, all in
`tests/init.test.ts`, which went 21 → 24. No existing case was deleted, renamed, or re-asserted. The
only edit to existing code in that file is the `informed()` helper moving up one describe level; the
two cases that already used it (`prints the PHARN_DEBUG hint, on stderr, when the fetch fails`,
`prints NO hint for the non-TTY refusal`) are otherwise byte-identical and still pass.

`inside` is a single file, and it is a **test** file — so `check-regress`'s outside/inside partition
is close to vacuous here: every gate is an "outside" gate by construction, because no `src/**` path
changed. That is the honest reading of a `no-regressions` verdict on a test-only increment: it says
nothing else broke, not that the new tests are good. Their value is evidenced in `VERIFY.md`, by
breaking the source and watching them fail.

## The baseline moved twice during this run — measured against the last one

This branch was cut at `7d96bbc`. Three PRs landed on `main` while it was in flight, and the first
of them **invalidated the brief's central mock**:

- `#151` (`9300b82`) retyped `confirmWriteTargets` from `Promise<boolean>` to
  `'proceed' | 'decline' | 'cancel'` — exactly the conditional the spec anticipated
  (`4.04-init-clone-leak-on-cancel.md`). The first CI run on this PR caught it: `Typecheck` failed
  with `tests/init.test.ts(224,45): error TS2345: Argument of type 'boolean' is not assignable to
  parameter of type 'string'`, and `Test` failed with the mid-copy case exiting 0 as a cancel,
  because GitHub builds the **merge** ref while the local branch was still at the old base.
- `#149` (`3bbbb5f`) added an exit/`SIGINT`/`SIGTERM` backstop to `src/lib/repo.ts`. It does not
  touch `init.ts` or `init.test.ts`, but it changes what a hoisted exit *costs* — see `VERIFY.md`
  and the note in `PLAN.md`.
- `#152` (`4972abb`) touched `tests/ci-workflow.test.ts` only.

The branch was rebased onto `4972abb`, the mock re-armed with `'proceed'`, and **every** RED
transcript in `VERIFY.md` was re-taken on that base. The table above is the re-measurement; base and
head share one commit history and one environment, which is the only way the comparison means
anything.
