# REVIEW — init-dest-type-preflight

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** before the first write, every manifest path is walked with `lstat`; an existing
  non-directory ancestor or non-regular-file leaf refuses the whole install. The walk stops at the first
  offender (grill #1); `.claude/settings.json` and the optional features README stay out (grill #2).
- **L-eval (P1):** 6 cases fail on the base source (four collision shapes, the sorted multi-name
  message, and the features-README directory, which used to throw from `cpSync`); "nothing written" is a
  whole-tree snapshot (grill #3). A re-install over regular files still succeeds.
- **L-trust (P2):** `lstat` only, on `safeJoin`-contained project paths.
- **L-axis (P3):** the walk lives in `symlink-guard.ts` beside `findSymlinkComponent` — the repo pins
  every path-component walk to that module (`tests/symlink-guard.test.ts`); this was a plan amendment,
  approved before the move. The caller owns the failure shape, as for the symlink walk.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/install-capabilities.ts'
  problem: 'An entry created between the pre-flight and the copy (TOCTOU) is not covered — the same residual the symlink pre-flight names.'
  evidence: 'assertDestinationTypes('
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 2 advisory findings. No lesson proposed for canon.
