# REVIEW — core-306-interrupted-update-heals

Floor first: `node .dev/floor/validate.mjs .` GREEN (verify gate `validate` exit 0). The increment is TypeScript,
tests and docs; no markdown capability, so no eval bindings are in play (L-eval over capabilities is vacuous).

## Floor-gate findings (blocking)

None.

## Advisory findings (warn; severity is the reviewer's judgment)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'CLAUDE.md:91'
  problem: "The 'Records are the proof' invariant in CLAUDE.md still says an overwrite requires the hash to equal its record; it now also accepts the hash an update announced in `incoming` before copying. The user docs state it; CLAUDE.md was outside the plan's ## Files."
  evidence: 'Overwriting or deleting a file requires that its `contentHash` ... equals its record in pharn.records.json.'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/commands/update-interrupted.test.ts:36'
  problem: "The interruption is simulated by failing the closing store's rename, not by a real SIGINT; equivalence rests on the copy loop being synchronous (argued in the file header). The real-signal path is pinned in tests/project-lock.test.ts."
  evidence: "The interruption is driven by failing the closing store's `rename`, which leaves the same disk state as Ctrl-C"
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/commands/update.ts:576'
  problem: 'Every update that writes at least one file now does one extra atomic write of pharn.records.json. Small cost; a failure of it aborts before any delete or copy, a strictly better failure state than before.'
  evidence: 'if (records !== null && plan.writes.length > 0) {'
```

## Lenses

- **L-floor (P0):** the new guarantee (a file whose bytes equal the hash announced before the copy is pharn's)
  reduces to content-hash equality (`settleIncoming` over the planner's `diskStates`), pinned by 9 command cases
  and 8 unit cases. Older-CLI compatibility rests on their reader ignoring unknown top-level keys (read from the
  v0.20.0 source) and is stated as such. Residuals are named in PLAN.md, the docs and the CHANGELOG.
- **L-eval (P1):** every acceptance criterion has a command-level test that failed at 8cdf996 before the fix
  (6 of 8 RED; the two GREEN-at-base cases pin behaviour that must not change). Kept-edit and `--force` paths:
  the existing update suites are unchanged and green, and a new case re-checks both after an interruption.
- **L-trust (P2):** `incoming` is user-editable: key and hash allowlists, ignored as a whole when malformed
  (fails closed, GATE 1 Q2), keys only looked up in the manifest-keyed disk map, never path-joined. No
  instruction-looking content in the diff.
- **L-axis (P3):** install-records owns the store format and the settle rule, update-plan applies it to the
  baseline, update.ts owns the write order. No command→command or step→step import.

## Proposed lesson (not written to canon)

None: no recurring failure surfaced.

VERDICT: GREEN — 0 floor-gate findings, 3 advisory (minor).
