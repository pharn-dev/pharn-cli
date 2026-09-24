# REVIEW — reinit-preserve-edits

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** "an edited file is copied before re-init overwrites it" reduces to sha256 inequality
  (`scanDest`) + `createBackup` before `installCapabilities` — the backup takes its OWN scan right before
  the copy (grill #2), not the prompt's. "A manual capability survives re-init" reduces to key membership
  over the previous config and the fetched index.
- **L-eval (P1):** 4 cases fail on the base source (edited-first prompt, backup + pointer, manual
  recorded, manual carried by the command); controls: no backup when nothing was edited, no "(edited)"
  when byte-identical, corrupt previous config does not block init. Coverage 97.14% (gate 97%).
- **L-trust (P2):** the previous config is read through `readPharnConfig` (validated); any failure
  degrades to "nothing carried over".
- **L-axis (P3):** the carry-over is one named helper in `init.ts`; the backup lives in the install step
  it protects; the prompt only reorders and annotates.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/steps/install-archetype.ts'
  problem: "pharn.config.json itself is not in the install manifest, so it is not backed up; its manual entries are carried over instead, but a hand-edited models/seam block is still reset to defaults by re-init (pre-existing, and named in ConfigParseError's message)."
  evidence: 'models: DEFAULT_MODEL_ROUTING,'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 2 advisory findings. No lesson proposed for canon.
