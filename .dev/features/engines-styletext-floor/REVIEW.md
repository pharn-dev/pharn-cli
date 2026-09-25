# REVIEW — engines-styletext-floor

Increment:

- `package.json` / `package-lock.json`: `engines.node` `>=20.12.0` → `>=20.13.0`. The lockfile was
  regenerated with npm 11.20.0, and the only change is the root `engines` line.
- `tests/engines.test.ts`: a code-level floor scan (`KNOWN_API_FLOORS`) over the runtime
  dependencies' shipped JS, a non-vacuity case, a smoke-`FLOOR` equality case, and three
  planted-text scanner cases.
- `node-floor.yml`: `FLOOR: 20.13.0`, job `Smoke (node floor)`.
- The version is corrected across the docs, plus a `### Changed` CHANGELOG entry.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed with exit 0 (1513 tests), `/pharn-dev-regress` returned `no-regressions`, and
`/pharn-dev-verify` returned `PASS`.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)**
  - "`engines` is ≥ every known code-level floor of the installed runtime dependencies" → a regex
    scan plus a version compare in a blocking vitest. Its reach is stated in the test comment:
    literal name only, and only the rows the table names.
  - "the smoke job runs the declared floor" → the equality case.
  - "the packed CLI starts on the floor" → still advisory (a non-required job), labeled as such in
    the workflow and the docs.
- **L-eval (P1)**
  - The code-floor case FAILED on the base `package.json`, run before the fix, with the message
    "…needs node >= 20.13.0), package.json says `>=20.12.0`".
  - The planted-text cases prove the scanner both fires and stays quiet (grill finding 2).
  - The non-vacuity case pins that `@clack/prompts` was actually read.
- **L-trust (P2)** — dependency files are read as text and never executed. No untrusted input is
  involved.
- **L-axis (P3)** — the test file keeps its one axis, the declared Node floor. The workflow and doc
  edits are version text only.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'tests/engines.test.ts:112'
  problem: 'shippedJs scans every .js/.mjs/.cjs file a dependency ships, including files that are not runtime code (minimist ships test/ and example/). A match there would raise the required floor over code pharn never runs. That errs toward a higher floor and would be visible in the failure message, so it is kept, not filtered.'
  evidence: 'function shippedJs(dir: string): string[] {'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'tests/engines.test.ts:94'
  problem: 'The table has one row, the failure actually measured. Future rows need the same measurement, on the boundary Node versions, before they are added, or the table turns into a guess list. Stated in the comment ("whose minimum version was measured").'
  evidence: 'const KNOWN_API_FLOORS: {'
```

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (minor).** The standing decision is the human's (GATE 2).
