# REVIEW — tar-strict-framing

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** a `g`/`x` payload over 64 KiB is refused on its size field before `readPaxKeywords`
  runs; after the first zero block every byte must be zero (a linear byte loop, no allocation — grill
  #1); a walk that runs out without a zero block is refused; the header must start `ustar` (both POSIX
  and old-GNU variants — grill #2); `''`/`.` segments below the root are refused.
- **L-eval (P1):** 7 cases were accepted by the base source; the pax case asserts the refusal message,
  not a timing (grill #3). The codeload-shaped fixture still extracts.
- **L-trust (P2):** only narrows what the untrusted archive may contain.
- **L-axis (P3):** contained in `tar-extract.ts`.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'THREAT-MODEL.md'
  problem: 'THREAT-MODEL.md §2 (the extractor rejection list) should gain these framing rules and the pax payload cap; it is write-protected, so a maintainer adds them.'
  evidence: 'tar archive has a pax header of N bytes, over the 65536-byte limit'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/tar-extract.ts'
  problem: 'The decompressed archive itself is still held in memory up to the 128 MiB cap; that bound is unchanged (and documented) — only the pax PARSE cost is new here.'
  evidence: 'gunzipSync(archive, { maxOutputLength: limits.maxTotalBytes })'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings. No lesson proposed for canon.
