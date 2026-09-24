# REVIEW — hook-wiring-drift

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** "a missing upstream hook is reported and fails `status --strict`" reduces to an
  exact-string set difference; "update never writes settings.json" is asserted byte-identical in a test.
  Textual equality is labeled in the user-facing note.
- **L-eval (P1):** 13 lib cases (6.0.0→6.17.1 wiring, exec-form `args`, extra user hooks, absent /
  invalid JSON / oversized / symlinked project file, no usable upstream, control-char sanitizing, note
  text) + 3 `status` cases + 2 `update` cases; the command cases fail on the base source.
- **L-trust (P2):** both files are size-capped (256 KB), symlink-refused, parsed as data; only command
  strings reach the terminal, with C0/C1 control characters replaced.
- **L-axis (P3):** one new lib module with one axis (hook-wiring comparison); `status`/`update` only
  consume it.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: 'src/commands/status.ts'
  problem: "`status --strict` now exits 1 for every install whose settings.json predates upstream's 6.1.0/6.12.0 re-wiring, until the user merges the hooks by hand — the intended fix, but CI pipelines using --strict will turn red on upgrade. Needs a CHANGELOG line."
  evidence: 'hookLines !== null'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/update.ts'
  problem: "`update`'s same-version early return never clones, so the HOOKS note only appears on runs that actually fetch; `status` is the continuous check."
  evidence: 'return { ...applied, hookWiring: diffHookWiring(repo.dir, cwd) };'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings. No lesson proposed for canon.
