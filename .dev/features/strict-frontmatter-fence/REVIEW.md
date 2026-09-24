# REVIEW — strict-frontmatter-fence

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** a value is read only when its anchored key occurs exactly once inside a fence whose
  first line is exactly `---` and whose end is the next `---` line; otherwise `ManifestValidationError`.
- **L-eval (P1):** the empty-block and both duplicate cases fail on the base source; the empty-block body
  carries a VALID role/applies so it cannot pass for the wrong reason (grill #3). A positive case pins
  trailing blanks on the close and that look-alike keys (`roles:`, indented `applies:`) stay ignored (grill #2).
- **L-trust (P2):** only narrows what the untrusted clone may declare; every refusal lands in `unknown`,
  named, never installed (an installed one is KEPT and re-checked, PHARN-13).
- **L-axis (P3):** contained in `capability-index.ts`.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/capability-index.ts:233'
  problem: 'The close is now an exact `---` line (plus trailing blanks); the old regex also closed on `----` or `---x`. No upstream file uses those shapes today, but a future one would be reported unknown rather than parsed.'
  evidence: "const close = lines.findIndex((line, i) => i > 0 && /^---[ \\t]*$/.test(line));"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 2 advisory findings. No lesson proposed for canon.
