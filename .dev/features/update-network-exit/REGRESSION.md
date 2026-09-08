# REGRESSION — update-network-exit

Base: `47b1f98feb075bff48caa3b6c87d51205d5dc650` (`origin/main`,
_fix: `remove` has no `--yes` — delete the dead parameter, rescope the docs (#145)_).

`git merge-base HEAD origin/main` at capture time; measured in a **detached worktree** at that commit
(`git worktree add --detach`), with `node_modules` symlinked from the primary checkout so both ends
run the identical dependency tree.

## A note on the base that moved mid-run

The branch was first cut from `origin/main` at `5955351`. `origin/main` then advanced twice while
this increment was being read (`#146` — the codeload/tar-extract rewrite of `src/lib/repo.ts`; `#145`
— `remove`'s dead `--yes`). The branch was reset onto `47b1f98` **before** any file was written, so
base and head bracket the same tree and the comparison below is over one interval, not two. Recorded
because a base that moves after capture is exactly the fault that makes a regression report lie.

## Inside / outside partition

Inside (2 real paths, plus this stage's own artifacts):

- `tests/update.test.ts` — the plan's `## Files`, the only non-artifact change
- `.dev/features/update-network-exit/**` — the loop's own stage artifacts

`src/**` is **byte-identical to base**: the seven temporary breaks used for the RED transcripts were
each reverted with `git checkout -- src/commands/update.ts`, and `git status --porcelain` before the
head capture listed `tests/update.test.ts` and the feature directory only. That is the load-bearing
fact for a test-only increment — if a break had survived, the head `test` gate would have caught it,
but the report would still have been measuring the wrong tree.

Outside: everything else. Because the change is confined to one test file, the "outside" suite is the
other 51 test files plus every style and type gate over the whole repo.

## Gates — base → head (exit codes)

| gate           | base | head | result |
| -------------- | ---- | ---- | ------ |
| `test`         | 0    | 0    | stable |
| `lint`         | 0    | 0    | stable |
| `typecheck`    | 0    | 0    | stable |
| `format:check` | 0    | 0    | stable |
| `lint:md`      | 0    | 0    | stable |
| `validate`     | 0    | 0    | stable |

- `test` = `npm test` (vitest). Base: **52 files / 1067 tests**. Head: **52 files / 1069 tests** —
  `+2`, exactly the two this increment adds, and no file count change (no new test file).
- `validate` = `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked` at both
  ends (this repo ships no markdown capability, so that gate is vacuously green and gates nothing
  here — stated rather than left to look like a passed check).

The assertion-count delta is reported alongside the exit codes on purpose: `check-regress.mjs` cannot
distinguish "the suite ran and passed" from "the suite never ran", since both can produce exit `0`
patterns that look plausible. `1067 → 1069` is the evidence that both captures actually executed.

`regressions[]`: empty. `pre_existing[]`: empty.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` → `"no-regressions"`, exit 0.)

Honest residual (P0/P7): this catches **exactly what its suite catches, nothing more**. For a
test-only increment the residual is unusually small — no production code changed, so the only
regression this stage could plausibly find is a new test that breaks an existing one — but it is not
zero: a leftover source break, a `vi.fn()` left globally mutated across files, or a shared-fixture
mutation would all show up here, and none did.
