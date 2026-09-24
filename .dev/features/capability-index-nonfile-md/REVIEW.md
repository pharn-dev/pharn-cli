# REVIEW — capability-index-nonfile-md

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None. The first `/pharn-dev-verify` run was `FAIL` (`test`): the new symlink test wrote its "outside"
file to the tmp dir's PARENT (`/tmp`), where a root-owned leftover from the root run blocked the
non-root run. Fixed in build — the fixture now lives entirely inside the test's own tmp dir — and
verify re-ran `PASS`.

- **L-floor (P0):** `lstat().isFile()` membership before any read; the refusal is a
  `ManifestValidationError`, so the existing per-capability tolerance reports it. Genuine I/O errors
  still propagate (unchanged).
- **L-eval (P1):** directory and symlink cases fail on the base source (`EISDIR`); the FIFO case runs on
  POSIX (`mkfifo`), skipped on win32 — and was deliberately NOT run against the base source, where the
  read would block forever.
- **L-trust (P2):** a symlinked markdown is refused without being read, so it can no longer read a file
  outside the clone.
- **L-axis (P3):** one-file change within the fetch-boundary module.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 1 advisory finding. No lesson proposed for canon.
