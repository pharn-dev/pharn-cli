# SHIP — core-162-nothing-to-change (Linear CORE-162, C1.5)

Worktree `.claude/worktrees/agent-ae5f7dd832abcfbbc`, off origin/main `991b229`. Delivery branch: `przemek/core-162-c15-an-update-with-nothing-to-change-asks`.

## Stages run, in order

1. `/pharn-dev-plan` → [PLAN.md](PLAN.md). GATE 1 was approved with one change: load-time coercions (layout, ref, seam, commit absent ≡ null) must never force a write. The comparison applies ONE resolution to both sides, with a test per coercion. Open questions (a)–(c) were accepted.
2. `/pharn-dev-grill` → [GRILL.md](GRILL.md), advisory: 6 concerns (0 blocking, 3 important, 3 minor). All were applied in the build:
   - the lock-skip rationale written in the code;
   - the symmetric `loadResolved`;
   - re-open regressions covered by existing cases plus unit cases;
   - the models config line tested;
   - one shared verdict string;
   - the CORE-160 overlap named.
3. `/pharn-dev-build`. Build note:
   - New `lib/update-next.ts` holds `nextRecordStore`/`nextConfig`, which the writer now uses, plus `planStateChanges` and `changesNothing`/`changesNoFiles`.
   - The planner carries `changesNothing` and an internal `stateChanges`.
   - The real run, on a plan that changes nothing, skips the confirm, the lock and every write, prints its notes and ends with `Nothing to change.` / `Up to date.`. A locked re-plan that changes nothing also writes nothing.
   - `--force` prints an `OVERWRITE` note before the confirm, from the shared `forcedOverwriteSections`.
   - The dry run's line and outro follow the predicate.
   - `--json` adds `plan.changesNothing: true`.
   - `stampMismatches` reads an absent config commit as `null`, and stores are stamped `?? null`.
4. `/pharn-dev-regress` → [regression-report.json](regression-report.json), [REGRESSION.md](REGRESSION.md).
5. `/pharn-dev-verify` → [verify-report.json](verify-report.json), [VERIFY.md](VERIFY.md).
6. `/pharn-dev-review` → [REVIEW.md](REVIEW.md), advisory: 0 floor findings, 3 minor advisory findings.

Ended at: GATE 2 (the human decision).

## Structural verdicts, verbatim

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**; `npm run check` exit **0**.
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **`no-regressions`**.
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **`PASS`** (`failing_gates: []`).

## Human decisions

- GATE 2: DELIVER. Keep "0.20.0" in the docs (0.19.0 already shipped, CORE-172 precedent); commit these artifacts in their own commit after the code commit; name in the PR body the CORE-160 (#369) / CORE-161 (#370) overlap of the `commit ?? null` / `stampMismatches` change, the dry-run test rename and the no-lock P0 note. No version bump; do not merge.

## After CORE-160 merged (#369, f86dbf4)

Rebased onto the new main. CORE-160 made `readPharnConfig` load an absent archetype `commit` as `null`, and made `readRecords` read an absent store commit as `null`. That makes this PR's `stampMismatches` `?? null` and its two `commit ?? null` record stamps redundant, so they were dropped in favour of main's form, along with their two unit tests: the `install-records` absent-commit stamp case and the `nextRecordStore` null-stamp case. `loadResolved`'s `commit ?? null` stays, so the config comparison never depends on the loader. The end-to-end absent-commit test in `tests/update.test.ts` is kept and passes through the real reader. PLAN, GRILL and REVIEW above describe the pre-rebase form.

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
