# REVIEW — frozen-capability-recheck

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** the early return is skipped iff the ingest-validated `frozenCapabilities` is
  non-empty (membership); the written value is `config capabilities ∩ index.unknown`, sorted (grill #1).
- **L-eval (P1):** 11 new cases fail on the base source: 8 ingest drops (whole-field, grill #2), the
  KEPT-only write, the run-2 re-fetch (asserts `fetchRepo` was called — grill #3), and the refresh +
  clear once the capability parses. A fourth case pins that the early return still fires with no field.
- **L-trust (P2):** the field is local and hand-editable; a malformed value is dropped, which restores
  today's behavior (fail-safe). It only decides whether a fetch happens; it never names a path.
- **L-axis (P3):** ingest in `pharn-config.ts`, decision + write in `update.ts` — the existing split.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CLAUDE.md'
  problem: "CLAUDE.md's `pharn update` paragraph does not mention `frozenCapabilities` (not in the plan's `## Files`)."
  evidence: '**`pharn update` (`commands/update.ts`) is drift-safe by default.**'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/update.ts:203'
  problem: 'While upstream stays unparseable, every same-version run fetches and asks to re-apply. Intended (the doc says the message repeats), but it costs a clone per run until the capability parses or is removed.'
  evidence: 'const recheckFrozen = (config.frozenCapabilities ?? []).length > 0;'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings. No lesson proposed for canon.
