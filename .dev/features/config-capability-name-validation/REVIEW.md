# REVIEW — config-capability-name-validation

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** both new guarantees reduce to floor primitives — `CAPABILITY_NAME_RE` +
  `CONTROL_CHARS_RE` + `ROLE_VALUES` membership at ingest (enum-regex), and `safeChildJoin`'s
  `dirname(target) === resolve(base)` containment at the delete. Symlinked components are explicitly
  not claimed (PHARN-02).
- **L-eval (P1):** every new behavior has a vitest test that fails on the base source (38 red before the
  fix, green after): 21 ingest cases, 9 `safeChildJoin` cases, 10 `remove` end-to-end cases (real loader
  - bypassed-ingest defense in depth + picker + valid-name/prefix-sibling).
- **L-trust (P2):** `pharn.config.json` is now treated as untrusted local input at ingest; the error
  message quotes the offending name via `JSON.stringify` and control characters are reported without
  echoing them (tested). No instruction-looking content was encountered in the diff.
- **L-axis (P3):** `validate.ts` gains one lexical primitive (its existing axis); `pharn-config.ts`
  gains one ingest validator (its axis); `remove.ts` only consumes them. No leaf→leaf import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "The user-visible behavior change (a hand-edited invalid capability name/role now exits 1 on every command) has no CHANGELOG `[Unreleased]` entry; CHANGELOG.md was not in the plan's `## Files`."
  evidence: '## [Unreleased]'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/remove.ts:94'
  problem: 'The defense-in-depth refusal throws an uncaught ManifestValidationError (stack trace, no curated message); unreachable while ingest validation holds, so a crash-loud failure is acceptable for a should-never-happen path.'
  evidence: 'const dir = safeChildJoin('
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/pharn-config.test.ts'
  problem: "`list --json`'s own error path is covered only through the shared `isConfigValidationError` union, not by a list-level test with an invalid name."
  evidence: 'joins isConfigValidationError, so every loader reports it and exits 1'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings (minor).

No lesson proposed for canon.
