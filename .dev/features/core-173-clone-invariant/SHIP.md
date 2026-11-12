# SHIP — core-173-clone-invariant (Linear CORE-173, C3.5)

Worktree `.claude/worktrees/core-173`, branch `pharndev/core-173-c35-tar-names-refuse-and-clone-side-guards`, off origin/main `8fe3d5a`. Nothing committed.

## Stages run, in order

1. `/pharn-dev-plan` → [PLAN.md](PLAN.md). GATE 1: approved as written. Open question resolved: keep escaping archive names in extractor messages, with `escapeUnsafe`.
2. `/pharn-dev-grill` → [GRILL.md](GRILL.md), advisory: 5 concerns (0 blocking, 3 important, 2 minor). All were applied in the build: the FIFO test deleted along with `O_NONBLOCK`, the docs sweep, a stronger property test, and a static producer test.
3. `/pharn-dev-build`. Build note: the tar extractor refuses `\` and `:` in names, refuses pax `x` on its typeflag, and skips `g` without reading it. The base-256 branch and the redundant total-bytes check are gone, and numeric fields trim only ASCII space. `fetchRepo` states the clone invariant. The clone-side symlink/FIFO guards in `install-capabilities`, `install-manifest`, `dest-drift`, `capability-index` and `hook-wiring` are removed, and every destination guard is kept. The F-19 hard-link safety is kept through the always-true `unlinkFirst` filter. During the build, `dest-drift`'s clone-side type check was found to need an ENOTDIR skip (a file where a directory belongs); it was restored as `isRegularFile`. Net src −169 lines.
4. `/pharn-dev-regress` → [regression-report.json](regression-report.json), [REGRESSION.md](REGRESSION.md).
5. `/pharn-dev-verify` → [verify-report.json](verify-report.json), [VERIFY.md](VERIFY.md).
6. `/pharn-dev-review` → [REVIEW.md](REVIEW.md), advisory: 1 floor finding (the THREAT-MODEL.md patch is not yet applied), 2 minor advisory findings, and 1 proposed lesson.

Ended at: GATE 2 (the human decision).

## Structural verdicts, verbatim

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**; `npm run check` exit **0**.
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **`no-regressions`**.
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **`PASS`** (`failing_gates: []`).

## Human decisions

- THREAT-MODEL.md patch: run by the human (10 replacements), `npm run lint:md` clean. This clears REVIEW's one floor finding.
- GATE 2: "Patched — open PR" (release batch 0.19.0, no version bump in this change).

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
