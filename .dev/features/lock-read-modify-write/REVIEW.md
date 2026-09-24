# REVIEW — lock-read-modify-write

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** (a) reduces to an exact string compare of two `readPharnConfig` parses under the
  O_EXCL lock; (b) to an integer mtime-age compare against `MALFORMED_GRACE_MS`. Residuals named in code:
  a non-pharn writer editing after the re-check, and a holder stalled > 10 s inside `tryCreate`.
- **L-eval (P1):** 8 new cases fail on the base source: 2 fresh-unparseable-lock refusals, 3
  `assertConfigUnchanged` units, and the `remove` picker / `remove` named / `update` / `add`
  interleave cases in `project-lock-commands.test.ts` (plus a control). Nine existing lock tests now
  backdate their planted malformed lock past the grace window — that is their intent (a leftover), not a
  weakening.
- **Out-of-suite evidence (advisory):** the review's `repro/lock-race` harness (8 processes started in the
  same millisecond, 150 rounds) measured **26/150** rounds with >1 simultaneous holder on the base lock and
  **0/150** on this build. An in-suite version at CI-affordable size (6×12) did not reproduce the race on
  the base either, so it was dropped rather than shipped as a test that proves nothing.
- **L-trust (P2):** no new untrusted input; the lock/config are local files read defensively.
- **L-axis (P3):** `pharn-config.ts` imports `ProjectChangedError` from `project-lock.ts` (lib→lib, no
  cycle: `project-lock.ts` imports only `validate.ts`). The lock module stays config-agnostic.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/pharn-config.ts'
  problem: 'The comparison covers pharn.config.json only; a concurrent writer that changed pharn.records.json but not the config would not be detected. Every pharn writer that touches records also rewrites the config, so this is reachable only by a non-pharn edit.'
  evidence: 'assertConfigUnchanged(cwd, snapshot, command)'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/commands/update.ts'
  problem: "A user who hand-edits pharn.config.json while `update`'s confirm is open is now refused (exit 1) instead of having the edit silently overwritten — intended, but user-visible."
  evidence: "assertConfigUnchanged(cwd, config, 'update');"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings (minor). No lesson proposed for canon.
