# REVIEW — dest-symlink-guard-init-remove

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** both claims reduce to the existing physical walk `findSymlinkComponent` (lstat per
  component) run before the first write/delete; the TOCTOU window is named as an advisory residual in
  the code comment, matching `update`.
- **L-eval (P1):** 15 new cases fail on the base source and pass after: 7 symlinked destination roots +
  the settings leaf + multi-component naming + pharn-layout root for `init`; 3 symlink positions + the
  whole-selection picker refusal for `remove`; a non-symlink control case. The pre-existing
  `features/` symlink test was updated from "silently skipped" to "whole install refused".
- **L-trust (P2):** only lstat metadata and a path string (DATA) reach the message; capability names in
  that string are validated at ingest (PHARN-01).
- **L-axis (P3):** `install-capabilities.ts` now imports `install-manifest.ts` (no cycle — the manifest
  imports only constants/layout/symlink-guard/validate); `remove.ts` imports the shared
  `symlink-guard.ts`. No leaf→leaf import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/install-capabilities.ts:156'
  problem: "The refusal fires after the overwrite-confirm prompt (confirmWriteTargets), so a user may answer 'yes' and then be refused; nothing is written either way."
  evidence: 'assertDestinationsInProject(repoDir, projectRoot, selection.selected, paths);'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/install-capabilities.ts'
  problem: 'Behavior change: a project whose features/ dir is a symlink used to install everything except features/README.md; it is now refused as a whole. Intentional (consistent posture), but user-visible.'
  evidence: 'does NOT write through a symlinked features/ in the PROJECT (no escape)'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry for the new refusals (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings (minor). No lesson proposed for canon.
