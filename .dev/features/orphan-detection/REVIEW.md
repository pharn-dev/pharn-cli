# REVIEW — orphan-detection

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .` (exit 0). Everything below is advisory unless marked floor-gate.

## Floor-gate findings (blocking)

None.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: 'tests/orphans.test.ts:147'
  problem: 'The "never reads a key outside the install roots" case proves such a key is never REPORTED or carried (the file exists, so a read would have listed it), but it does not spy on readDiskState; the no-read claim rests on control flow (isInstallRootPath is tested before readDiskState) plus that observable consequence.'
  evidence: "it('never reads a key outside the install roots, even when the file exists', () => {"
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'src/lib/status-report.ts:230'
  problem: 'Orphan paths come from the hand-editable pharn.records.json and are serialized uncapped in both --json reports (reasons are capped). They are escaped (serializeJsonReport) so a terminal cannot be steered, but a hand-made multi-kilobyte key would be printed whole; record keys are already bounded by the 16 MiB store cap and the install-root membership.'
  evidence: 'path: o.path,'
- type: FINDING
  rule_id: P3
  severity: minor
  file: 'src/lib/orphans.ts:209'
  problem: 'orphans.ts holds both the detection (findOrphans/isInstallRootPath) and the ORPHANED note renderer (orphanNoteLines, picocolors). The same pairing already exists in lib/hook-wiring.ts (diffHookWiring + hookWiringLines), so it follows house style, but a later split into orphans-format.ts would make it one axis per file.'
  evidence: 'export function orphanNoteLines(orphans: readonly Orphan[]): string[] | null {'
- type: FINDING
  rule_id: P4
  severity: important
  file: 'LIMITS.md:81'
  problem: 'LIMITS.md §1d still says an upstream-renamed file is left behind and "reports nothing"; after this increment update and status report it as an orphan (while a usable records store records it). LIMITS.md is human-only, so the agent did not edit it; replacement text is handed over at GATE 2.'
  evidence: '`update` restores the new path, leaves the old one, and reports'
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'docs/commands/update.md:371'
  problem: 'The note and docs say pharn "keeps listing each one until it is gone". That holds for update runs that plan and for status with a usable store at a matching layout; a same-version early return, --no-drift, an unusable store or a layout mismatch list nothing. The docs name each of these cases, so this is labeled, not overstated, but the note line itself is unconditional.'
  evidence: 'pharn never deletes them, and keeps listing each one until it is gone.'
```

## Lens notes

- **L-floor (P0):** "listed while it exists" reduces to set membership (`expected.has`, `isInstallRootPath`) + `readDiskState` presence, over a stamp-matched store (exact equality). "unchanged" is sha256 equality against the record. "never deletes" holds structurally (no write or delete call is reachable from `findOrphans`; the dry-run whole-tree snapshot test covers the preview). "never a --strict input" holds because `strictFails` is unchanged and a test pins it.
- **L-eval (P1):** every new branch has a vitest case: unit (`tests/orphans.test.ts`, 61 cases incl. symlinked parent, directory, chmod 000, dropped/frozen exclusion, both layouts), planner, integration (update real run across three runs, dry run, dry-run JSON), status text/JSON, report projections, and init carry. No markdown capability was added.
- **L-trust (P2):** the one new key-to-path use is read-only and gated by ingest validation, install-root membership, `safeJoin`, the symlink-component walk and a regular-file check; paths are `terminalSafe`d in notes and escaped in JSON. No instruction-looking content was found in the reviewed diff.
- **L-axis (P3):** no command→command or step→step import; `orphans.ts` is reached from `update-plan.ts`, `commands/update.ts`, `commands/status.ts` and `steps/install-archetype.ts` through `lib/`.

## Rebase notes (advisory)

- F-16 (CRLF-tolerant `contentHash`): the orphan comparison is `readDiskState(...).hash === record`. It stays consistent as long as F-16 switches `readDiskState` and `buildRecords` together; `orphans.ts` calls no hash function directly.
- F-04 (update deletes DROPPED capability dirs): orphans already exclude keys under a capability outside the next membership, so the two changes are disjoint; the edits in `update-plan.ts` / `update.ts` are single localized blocks.

Verdict: GREEN — 0 floor-gate findings, 5 advisory findings (1 important: the human-only LIMITS.md text).
