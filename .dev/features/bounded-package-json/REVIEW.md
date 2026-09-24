# REVIEW — bounded-package-json

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** the open is non-blocking, the descriptor must be a regular file, and at most
  `MAX_PACKAGE_JSON_BYTES + 1` bytes are ever allocated or read; every failure is `null` → not found
  (grill #1), never a throw.
- **L-eval (P1):** BOM, over-cap and the six new skip members fail on the base source; the FIFO case
  HANGS the base source (verified with an external `timeout`), which is the defect. The FIFO and
  `/dev/zero` cases are skipped on win32 (grill #3). The uniform SKIP_DIRS pins iterate the shipped set
  and so cannot catch a missing member — hence the explicit list.
- **L-trust (P2):** content is still only JSON-parsed and reduced to dependency names.
- **L-axis (P3):** contained in `detect-archetype.ts`.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/detect-archetype.ts:70'
  problem: 'A project that keeps hand-authored source under `vendor/` or `target/` loses that file-tree signal (package.json still backstops it) — the documented LOST-signal tradeoff, now wider (grill #2).'
  evidence: "'vendor', // Go / PHP (Composer) / Ruby vendored dependencies"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 2 advisory findings. No lesson proposed for canon.
