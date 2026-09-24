# REVIEW — publish-pack-destination

Increment: `.github/workflows/publish.yml` (Pack step creates `$RUNNER_TEMP/pkg` first),
`.dev/floor/check-run-pins.test.mjs` (pack-destination scanner + ★ live pin + ★★ positive control + three
scanner cases), `CHANGELOG.md` (`[Unreleased]` → Fixed). Treated as `trust: untrusted`; nothing in it read
as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check` exit 0,
`/pharn-dev-regress` `no-regressions`, `/pharn-dev-verify` `PASS` (7 gates incl. `test:floor`).

## Floor-gate findings (blocking)

None.

- L-floor (P0): the one new guarantee — "every workflow's pack destination is created earlier in the job
  that packs" — reduces to a regex scan over the committed workflow text in a `node --test` file that
  floor.yml runs on every PR and push to main. The CHANGELOG and the publish.yml comment claim nothing
  beyond it; the end-to-end claim ("the next Release publishes") stays advisory in PLAN.md and VERIFY.md.
- L-eval (P1): the behavior ships with its tests — the ★ live pin fails on the base publish.yml and passes
  after (checked this run), the ★★ control proves the scan fires on the live file's shape, and three
  hermetic cases pin the same-job rule, the spelling normalization and the comment exclusion.
- L-trust (P2): no untrusted input is ingested; the scan reads the repo's own committed workflows.
- L-axis (P3): no sibling reference; the test-file axis note is below as advisory.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/floor/check-run-pins.test.mjs:474'
  problem: 'The pack-destination scanner is a second reason for this file to change besides the run-line pin checker it tests; the comment names it and PHARN-07 set the precedent, but a third such concern should move the live publish.yml pins to their own test file.'
  evidence: 'A different axis from the run-line pin checker this file tests; it sits beside PHARN-07''s other live publish.yml pins by precedent.'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/floor/check-run-pins.test.mjs:503'
  problem: 'Comment stripping treats any whitespace-preceded `#` as a comment start, so a `#` inside a quoted shell string on a pack line would hide that pack from the scan (a false negative). No workflow line does this today; the scanner is a pin, not a shell parser.'
  evidence: 'const line = raw.replace(/(^|\s)#.*$/, ""); // a YAML comment is never executed'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/floor/check-run-pins.test.mjs:480'
  problem: 'A `${{ … }}` expression containing `}` (e.g. a `format(''{0}'', …)` call) would split the word early and could miss a match; acceptable for the pack/mkdir lines this repo writes, but it bounds what the pin can see.'
  evidence: 'const WORD = String.raw`("[^"]*"|''[^'']*''|(?:\$\{\{[^}]*\}\}|\S)+)`;'
```

## Proposed lesson for canon (NOT written — for a human-gated `/pharn-dev-memory-promote`)

- **Candidate:** "A workflow that only runs on a release/tag event gets no execution from PR CI, so a
  defect in its mechanics ships silently; pin those mechanics with live-text tests in a file floor.yml
  runs (or give the workflow a dry-run trigger)."
- **Provenance:** increment `publish-pack-destination`; the defect entered with PHARN-07 (a2fe83e, #201),
  whose plan → grill → build → regress → verify → review chain passed while `npm pack` wrote into an
  uncreated `$RUNNER_TEMP/pkg`; found by the 18-commit review on 2026-09-24; fixed by this diff.

## Verdict

**GREEN — 0 floor-gate findings, 3 advisory (minor).** The standing decision is the human's (GATE 2).
