# REVIEW — ruleset-contract-pins

PHARN reviewing PHARN. Four lenses, each citing a principle. Floor-gate findings block; advisory
findings do not.

## Lens 1 — P0 (do not claim more than is verified)

**PASS, and the claim is downgraded in three places rather than one.** The increment adds a
nine-string `REQUIRED_CONTEXTS` constant to a passing test file, which is precisely the shape a
reader mistakes for "the suite checks the ruleset". The file header now states which half is pinned,
states that the ORIGINAL incident (a ruleset requiring contexts no workflow produces) remains
invisible from in-repo, and the constant's own doc comment calls it a DECLARED BELIEF, hand-checked.
The constant is deliberately not named `RULESET_CONTEXTS`.

One thing this review verified rather than assumed: the live ruleset was read once by hand during
discovery and does list exactly those nine contexts today. That read is recorded in `PLAN.md` and is
explicitly NOT what the suite does — a dated observation, not a guarantee.

**Advisory finding (low).** `PLAN.md` records the ruleset read but not a re-check cadence. Nothing
makes anyone re-read it, so the declared belief ages silently. No fix proposed here — a cadence with
no enforcement is itself a P0 problem.

## Lens 2 — P3 (one responsibility)

**PASS.** Each new case asserts one thing: the job id IS the context; the job has NO name (with the
non-vacuity guard and its decoys); CodeQL's job and template; CodeQL's fan-out. The mirror test
covers in-file list consistency and nothing else. `parse(path)` does exactly what the three
module-scope consts used to do, for any file, and `jobBlocks` gained a `path` parameter only so its
own failure message names the file it read.

**Advisory finding (low).** `parse()` is called twice inside the two bare-id describes (once per
test) rather than hoisted. Deliberate: hoisting into the describe body would run `expect` at
collection time for four files instead of one, and re-reading a 30-line file twice costs nothing.

## Lens 3 — P4 (cite, do not restate)

**PASS.** The header cites `.dev/features/ci-matrix-required-checks/PLAN.md` for the full guarantee
audit instead of re-deriving it, exactly as before. The runner/node pins are NOT extended to
`floor.yml` or `gitleaks.yml`; the comment says why (different node setups) rather than the test
asserting a uniformity that does not exist. `CLAUDE.md` and `docs/contributing.md` already state the
nine-context contract and are left alone — the test now matches what they say, which is the right
direction of travel.

## Lens 4 — P7 (scope)

**PASS, with one deferral converted into a decision.** The committed diff is one file. No workflow
was modified — `git status` was checked after the mutation sweep and every scratch edit was
restored. `vitest.config.ts` is untouched. `publish.yml` is deliberately unpinned because it reports
no required context.

**Advisory finding (medium) — the one a maintainer should rule on.**
`tests/check-composition.test.ts:81` comments that "if a seventh gate is ever added to CI, this
fails and forces a decision about whether `check` should cover it." That is **false today**: its
`CI_GATE_SCRIPTS` is a local literal, not read from `ci.yml`, so adding a seventh CI gate reddens
`ci-workflow.test.ts` and leaves that file green. Two prior REVIEWs deferred consolidating the three
gate lists to this increment. This increment declines — the three lists have three different shapes,
and this change adds a fourth (contexts, not scripts) — and records the false comment as a named
residual instead. Consolidation WOULD make that comment true transitively, so declining is a
judgment call, not an obvious win, and it is surfaced in the PR body so it can be overruled at
review rather than after a merge.

## Floor-gate vs advisory split

- **Floor (blocking, all green):** `format:check`, `lint`, `lint:md`, `typecheck`, `test` (1068),
  `build`, `validate.mjs` exit 0; `check-regress` `no-regressions`; `check-verify` `PASS`; plus the
  six-mutation RED demonstration in `VERIFY.md`.
- **Advisory (non-blocking):** three findings above — no re-check cadence for the declared belief
  (low), `parse()` called per test (low, deliberate), and the false comment in
  `check-composition.test.ts` left unfixed (medium, needs a human call).

## Lesson candidate (not promoted)

A pin over an ABSENCE ("this job has no `name:`") is worth exactly as much as its non-vacuity guard.
The same empty result is produced by "the property is correctly absent" and by "the parser read
nothing", and only the second is a bug. Assert the parse found something, and assert the decoys are
present, in the same test as the absence. Surfaced here; not self-promoted to canon.
