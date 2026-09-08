# REVIEW — contributing-six-gates

## Lens 1 — P0 (do not restate the bug you are fixing)

**PASS, and this was the live risk.** The defect is a doc claiming four commands are "exactly what CI
runs". A fix that adds `lint:md` and then writes "now `npm run check` is exactly what CI runs" would
reintroduce it one line down, because `check` still skips `build` and still runs `test` instead of
`test:coverage`. Every touched surface — `CONTRIBUTING.md`, `CLAUDE.md:24`, `README.md:135`,
`docs/contributing.md:52`, the CHANGELOG — states the two divergences rather than rounding them off,
and two dedicated test cases pin them so they cannot silently become oversights.

## Lens 2 — P4 (cite, do not restate)

**PASS.** `CONTRIBUTING.md:9` reuses `docs/contributing.md:77`'s existing description of the
architecture verbatim instead of inventing a second one, and the gate step links to the gates table
rather than duplicating the job-name annotations. `CONTRIBUTING.md` stays the quick-start pointer it
claims to be.

## Lens 3 — P3 (one gate, one responsibility)

**PASS.** `ci.yml` is untouched: the six jobs still run `npm ci` plus exactly one script each, and
`check` remains a *local aggregate* rather than becoming a CI job. `tests/ci-workflow.test.ts` passes
unchanged.

**Advisory finding (low).** The CI gate-script list now lives in three test files
(`ci-workflow.test.ts`'s `EXPECTED_GATES`, `dev-script.test.ts`'s `CI_GATE_SCRIPTS`, and this one's).
Consolidation belongs to `5.6d`, which revisits the ruleset pins; doing it here would edit
`ci-workflow.test.ts`, which this increment deliberately excludes.

## Lens 4 — blast radius of a "docs" PR

**PASS, with one behavior change that must not be buried.** `prepublishOnly` is `npm run check`, so a
release now fails on a markdownlint error. That is a publish-path change riding inside a
documentation PR. It is defensible — a release with broken docs is a bad release — and it is named in
the CHANGELOG and the PR body rather than left for a maintainer to discover at publish time.

## Floor-gate vs advisory split

- **Floor:** six gates green + `build`; `validate.mjs` 0; the planted-error demonstration.
- **Advisory:** one low finding (triplicated gate list), deferred to `5.6d`.
