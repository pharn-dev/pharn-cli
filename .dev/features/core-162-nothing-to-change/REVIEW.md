# REVIEW — core-162-nothing-to-change

- Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN).
- `/pharn-dev-build`'s `npm run check` was GREEN (3643 passed, 1 skipped, with `CI=1`). `/pharn-dev-regress` → `no-regressions`. `/pharn-dev-verify` → `PASS` across the eight gates.
- Diff coverage: every added `src/` line is covered (lcov over the diff against 991b229).
- Everything below is ADVISORY unless marked floor-gate.

## Floor-gate findings

None.

## Advisory findings

### L-floor (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "src/commands/update.ts:600"
  problem: "On a snapshot that changes nothing, the real run skips the lock. 'Writes nothing' is then argued (no writer, no lock needed) rather than enforced by the lock."
  evidence: "Skipping the lock is safe because nothing is written: the lock only serialises writers"
```

The claim is pinned by tests rather than by the lock. The integration case and the `update.test.ts` cases snapshot the whole tree before and after, and assert that no `pharn/.lock` exists. The opposite race, where the snapshot changes something and the locked plan changes nothing, has its own test. Acceptable as stated.

### L-eval (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/update.test.ts"
  problem: "The 'ref' and 'seam' coercion tests pass with or without loadResolved's ref step, because readPharnConfig already drops a non-'latest' ref and rebuilds seam. They pin the end-to-end outcome, not the resolution step itself."
  evidence: "a ref other than \"latest\" (dropped at load) is not rewritten on main"
```

The layout and commit tests were each mutation-checked: removing the resolution turns them red. The ref step in `loadResolved` stays as a guard in case a future reader stops dropping the value. The unit test in `update-next.test.ts` passes a raw `ref: 'bogus'` config and does exercise that step.

### L-trust (P2)

No new untrusted input. The `OVERWRITE` note prints manifest rels, the same values the dry run's `WOULD OVERWRITE` sections already printed through the same path.

### L-axis (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/install-records.ts:336"
  problem: "Reading an absent config commit as null in stampMismatches (and writing the stamp as nextCommit ?? null) overlaps CORE-160, which makes load itself read an absent commit as null."
  evidence: "const configCommit = config.commit ?? null;"
```

This was required by the gate-1 decision: the absent-commit test cannot settle without it. Once CORE-160 lands, both `?? null` become no-ops, and the merge is a trivial conflict at most. This will be named in the PR body.

### Scope notes for the human

- The docs say "Added in 0.20.0" for `plan.changesNothing` and "before 0.20.0" in the new section. That follows the CORE-172 precedent of naming the next version, but the release version is the maintainer's call; the ticket says v0.19.0, which has already shipped.
- Existing tests whose expectations changed by design:
  - `tests/update-dry-run.test.ts` "says nothing would be written when everything is current (under --force)" is renamed and now expects `Would rewrite only pharn.config.json and pharn.records.json.` Its fixture's records and commit really do change, so the old expectation was the lie the ticket describes.
  - Two new dry-run cases cover the real "nothing" plan.
  - No `tests/update.test.ts` case needed a change: every case that asserts a confirm already has a plan that writes.

## Verdict

GREEN: 0 floor-gate findings, 3 minor advisory findings.

No lesson is proposed for canon. Nothing here is a recurring failure beyond this ticket.
