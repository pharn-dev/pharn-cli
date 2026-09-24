# REVIEW — add-after-withheld-update

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** the gate passes on exact membership in `{skillsVersion, pendingSkillsVersion}`;
  `pendingSkillsVersion` is written only when every skip label ∈ `{modified, unrecorded}` (enum set) and
  is `VERSION_RE`-validated at ingest. Grill concern #1 was real and is fixed in build: at a pending
  version `add` keeps the config's `(skillsVersion, commit)` pair (`addStamp`), so it never stamps a
  version the kept edits did not receive and the records stamp stays consistent (tested).
- **L-eval (P1):** 8 new cases fail on the base source: 3 in `update` (set by user-edit skips, not set by
  `unverifiable`, cleared by a complete run), 2 in `add` (proceeds at pending without advancing the pair;
  third version refused with the new message), 3 ingest cases.
- **L-trust (P2):** no new remote input; the field is local and regex-validated.
- **L-axis (P3):** type in `types.ts`, ingest in `pharn-config.ts`, writer in `update.ts`, reader in
  `add.ts` — each file keeps its own axis.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'docs/reference/pharn-config.md:15'
  problem: 'The field table at the top of the reference does not list `pendingSkillsVersion`; it is described in the prose note below it.'
  evidence: "| `skillsVersion` | string | The repo's `SKILLS_VERSION` at the installed commit |"
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/status.ts'
  problem: '`status` still reports the install as outdated (skillsVersion is honest) without mentioning that a pending version exists; a user may not realize `add` works now.'
  evidence: 'printArchetypeVersion(config, latest)'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings (minor). No lesson proposed for canon.
