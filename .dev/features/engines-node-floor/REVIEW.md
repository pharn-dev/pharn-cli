# REVIEW — engines-node-floor

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None at the final state. The FIRST `/pharn-dev-regress` run returned `regressions` (`tests` 0 → 1) and
`/pharn-dev-verify` returned `FAIL` (`lint:md`), and both were acted on rather than waved through:

- `check-run-pins.mjs` flagged `npx --no-install pharn` as an unpinned package exec → the workflow now
  runs `./node_modules/.bin/pharn` directly (no package resolution at all).
- `check-run-pins.test.mjs` pins the exact count of lockfile/path installs in workflows (7); the new
  workflow's `npm ci` + local-tarball install are deliberate, so the count is now 9 with the reason
  recorded, and the file was added to the plan's `## Files`.
- Two doc tables were realigned for MD060.

## Lenses

- **L-floor (P0):** "declared floor ≥ every runtime dependency's declared floor" reduces to a numeric
  version compare in `tests/engines.test.ts` (fails on the base: `@clack/prompts needs node >= 20.12.0,
package.json says >=20`). "The CLI starts on 20.12.0" rests on a non-required CI job — advisory,
  stated in `docs/contributing.md`.
- **L-eval (P1):** 3 cases in `tests/engines.test.ts`; manual smoke of the packed CLI on local Node
  20.20.2 printed `0.5.0` (no 20.12.0 binary offline — the CI job covers the exact floor).
- **L-trust (P2):** no runtime input changes; the new workflow has `contents: read` only and no secrets.
- **L-axis (P3):** one new workflow with one job; `ci.yml`'s six contexts untouched (comment only).

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.github/workflows/node-floor.yml'
  problem: "`Smoke (node 20.12.0)` is not in the ruleset's required checks, so a red smoke does not block a merge unless a maintainer adds it; the unit test is the only blocking guard."
  evidence: 'name: Smoke (node 20.12.0)'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'package-lock.json:35'
  problem: "The lockfile root `engines` line was edited to match package.json because the only local npm (10) rewrites unrelated `libc` fields; CI's npm 11 would produce the same single-line change."
  evidence: '"node": ">=20.12.0"'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: 'No CHANGELOG `[Unreleased]` entry for the raised engines floor.'
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings at the final state, 3 advisory findings. Proposed lesson (not
promoted — `/pharn-dev-memory-promote` is human-gated): a new workflow must be run through
`check-run-pins.mjs` and its live-count test, which are outside the vitest suite.
