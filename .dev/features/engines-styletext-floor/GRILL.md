# GRILL — engines-styletext-floor

Plan: `.dev/features/engines-styletext-floor/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's
`spec_content_hash`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.
The plan is `trust: untrusted`; nothing in it read as an instruction.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/engines-styletext-floor/PLAN.md:42'
  problem: 'The scan matches the literal call name. Both clack packages import `styleText` by that name today (`import { styleText } from ''node:util''`, checked), but an aliased import (`import { styleText as s }`) would not match, and neither would whitespace between the name and `(`. Write the regex as `\bstyleText\s*\(\s*\[` and have the test comment state that aliases are outside its reach.'
  evidence: 'A `KNOWN_API_FLOORS` table (`/styleText\(\s*\[/` → 20.13.0, with the reason).'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/engines-styletext-floor/PLAN.md:44'
  problem: 'A hermetic case is missing for the scanner itself. Planting a dependency file that uses the array form, and one that does not, proves the scan can both fire and stay quiet. Otherwise a regex that never matches would pass once the live dependency stops using arrays.'
  evidence: 'Ours must be ≥ every floor whose pattern matches.'
```

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/engines-styletext-floor/PLAN.md:59'
  problem: 'Raising `engines` excludes Node 20.12.x, a range that was already broken on every prompt cancel. The CHANGELOG entry should say that, so it does not read as dropping a working Node. With default npm settings it produces an EBADENGINE warning, not an install failure.'
  evidence: '`CHANGELOG.md` — `[Unreleased]` → `### Changed` (Node ≥ 20.13.0, and why)'
```

### Checked, no finding

- `package-lock.json` regeneration: the registry is reachable from this environment (`npm view`
  works), so `npm install --package-lock-only` is feasible. Only the root `engines` mirror should
  change.
- Renaming the smoke job: no test or floor pin reads `node-floor.yml`'s job name (only comments
  in `check-run-pins.test.mjs` mention the file), and the job is not a required check.
- Trust (P2), axis (P3), determinism (P5): no concerns. The test reads dependency files as text.

## Summary

The plan is small and grounded in a measurement. The three concerns are sharpening only: make the
scan regex slightly wider and state its reach, prove the scanner with a planted fixture, and word
the CHANGELOG entry honestly.

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 minor) — for the human to weigh
before /pharn-dev-build.**
