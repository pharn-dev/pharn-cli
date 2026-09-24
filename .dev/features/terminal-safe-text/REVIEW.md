# REVIEW — terminal-safe-text

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** (1) the extractor refuses any entry whose full path (prefix + name, UTF-8 decoded)
  holds a C0/C1/`\p{Cf}` character — judged before every other entry rule (grill #2), and the refusal
  renders the name sanitized on one line (grill #1); (2) `unknown-capabilities.ts` now uses the shared
  sanitizer, gaining `\p{Cf}`; (3) `logError` strips the same set (keeping `\n`/`\t`) for every fatal.
- **L-eval (P1):** 9 cases fail on the base source (extractor ×6, sink ×2, U+202E in the unknown
  list); `terminal-safe.test.ts` pins the sanitizer. An ordinary non-ASCII name still extracts.
- **L-trust (P2):** narrows accepted archive names; sanitizing is display-only.
- **L-axis (P3):** one sanitizer module; the extractor owns the refusal, the sink owns display.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/report-error.test.ts'
  problem: 'The sink test asserts the argument handed to the mocked clack `log.error` (the last hop inside pharn), not bytes on the real stderr stream (grill #3); clack adds only its own prefix.'
  evidence: "const sent = vi.mocked(log.error).mock.calls[0]![0];"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'THREAT-MODEL.md'
  problem: 'THREAT-MODEL.md §2 lists what the extractor rejects; the new control/format-character refusal should be added by a maintainer (write-protected, human-only).'
  evidence: 'see `THREAT-MODEL.md` §2 for what the extractor rejects'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/tar-extract.ts'
  problem: 'Non-fatal warnings (log.warn outside unknown-capabilities) are not routed through the sanitizer; none of them interpolates archive-derived text today.'
  evidence: 'logError sanitizes (the fatal sink only)'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 4 advisory findings. No lesson proposed for canon.
