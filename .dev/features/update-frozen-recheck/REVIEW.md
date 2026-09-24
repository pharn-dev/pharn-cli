# REVIEW — update-frozen-recheck

Increment: `src/commands/update.ts` (the next `frozenCapabilities` also keeps a key from the previous
list whose capability parses again but had a file skipped this run; no `pendingSkillsVersion` equal to
the withheld version), `src/types.ts` (the field comment only), `tests/update.test.ts` (three cases),
`docs/commands/update.md`, `docs/reference/pharn-config.md`, `CHANGELOG.md`. Treated as
`trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check` exit 0
(1498 tests), `/pharn-dev-regress` `no-regressions`, `/pharn-dev-verify` `PASS`.

## Floor-gate findings (blocking)

None.

- L-floor (P0): "a formerly-frozen capability with a skipped file keeps the same-version gate open" →
  set membership of the previous list's keys + a string-prefix test of the skipped rels, drawn from the
  MERGED capabilities (grill finding 1). "No pending version equal to the recorded one" → a string
  equality. Nothing is claimed beyond those two.
- L-eval (P1): the three-run case (skip → re-fetch → revert → upgrade and clear) fails on the base
  `update.ts` (checked by stashing it); the two regression guards (a skip under another path; the
  merge dropping the entry) pass on both, as intended.
- L-trust (P2): `frozenCapabilities` is validated at ingest (`isFrozenKeyList`); only keys matching a
  merged config entry are re-emitted.
- L-axis (P3): no sibling reference; the change stays in the command that owns the config write.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/commands/update.ts:601'
  problem: 'This is the fifth copy of the role → subtree ternary (install-records, install-manifest twice, install-capabilities, and now update); a `capabilitySubtree(paths, role)` beside `layoutPaths` would single-source it. Kept inline here to match the existing pattern.'
  evidence: 'const subtree = cap.role === ''griller'' ? paths.grillers : paths.lenses;'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/commands/update.ts:612'
  problem: 'A user who deliberately keeps an edit in a formerly-frozen capability''s file now sees every `update` fetch again and never "Already up to date". That matches the non-frozen path (a user edit withholds the bump, so every run re-fetches) and is documented in update.md; noted, not a defect.'
  evidence: '(previouslyFrozen.has(key) && hasSkippedFile(cap))'
```

## Proposed lesson for canon (NOT written — for a human-gated `/pharn-dev-memory-promote`)

- **Candidate:** "Withholding a version bump only preserves pending work if the bump has not already
  happened. When an earlier run advanced the version and deferred some files, that deferral needs its
  own carrier into the next run (here `frozenCapabilities`), and the carrier may only be cleared once
  the deferred files actually land."
- **Provenance:** increment `update-frozen-recheck`; the defect entered with PHARN-13 (aec6d3e, #207);
  found by the 18-commit review on 2026-09-24; fixed by this diff (`src/commands/update.ts:596-617`).

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (minor).** The standing decision is the human's (GATE 2).
