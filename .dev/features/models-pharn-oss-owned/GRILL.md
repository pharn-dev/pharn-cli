# GRILL — models-pharn-oss-owned

Plan: `.dev/features/models-pharn-oss-owned/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`;
nothing in it read as an instruction. The plan was written on `c40a40c` (= `origin/main`).

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:77'
  problem: 'The parity claim rests on a corpus. The plan labels the structural equivalence beyond the corpus advisory, but it does not say the corpus must reach every RED branch the checker has. Make that a checked property: the set of RED kinds the checker emits over the corpus must cover every kind its validate path can emit (shape, default, stage, entry, model, effort, and json for the file-level read), read from the checker''s own red("…") call sites, so a new upstream branch cannot slip past a corpus that never exercises it.'
  evidence: 'its verdicts and RED lines are compared with the copy''s over a corpus. A divergent copy cannot pass.'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:77'
  problem: 'The sha256 pin proves the vendored file was not edited; it cannot prove it equals live upstream. The plan names that residual, but nothing tells the next maintainer how to refresh the copy. Write the procedure down (docs/contributing.md): copy the file from pharn-oss, update the pin and its commit, run the parity test, and update model-config.ts until it passes.'
  evidence: 'That the vendored copy equals LIVE upstream is advisory (checked when it is refreshed)'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:128'
  problem: 'The same-version migration re-opens update''s early return. Pin both halves: the first run converts, and a second run at the same version returns "Already up to date" without fetching. A block whose only leftover is a top-level `default` that could not move (stages.default already set) must not keep the gate open forever.'
  evidence: 'The same-version early return is skipped while the block still holds something to convert (`needsModelsConversion`), so a current install is migrated; once converted it no longer re-opens the gate.'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:193'
  problem: 'The coverage ratchet (97/92/97/97) applies to src/. Four new modules and a rewritten update path need every branch exercised, including `models: null`, a `stages` that is not an object during conversion, and a `__proto__` stage key.'
  evidence: 'rows 1-6 and `--force` on a real tree'
```

### Trust propagation (P2)

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:229'
  problem: 'RED details quote untrusted keys and values through JSON.stringify, which escapes C0 controls but not C1 controls or Unicode format characters (U+202E). The plan routes them through terminalSafe; make sure the update MODELS note and the init warning do too, not only status.'
  evidence: 'RED details for invalid input go through `terminalSafe`.'
```

### One axis of change (P3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:162'
  problem: 'models-update.ts holds the record key and hash, but init writes that record too, so init would import update''s module. The key is a key of pharn.records.json: keep it, and the hash that fills it, in lib/install-records.ts (the store''s own vocabulary, which init already imports). models-update.ts then changes only for update''s treatment of the block.'
  evidence: '`src/lib/models-update.ts` — new, lib: the old format (ids, historical defaults), conversion, the record key + hash, and the update decision'
- type: FINDING
  rule_id: 'P3'
  severity: important
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:241'
  problem: 'CONSTITUTION.md P3 states "this CLI owns the pharn.config.json schema". The maintainer''s decision makes that false for `models`. P3''s enforceable clause (one change-reason per file, no sibling leaf imports) is still met — pharn-oss''s rules sit in their own file, as `testResults`/`ship` already sit outside CLI_OWNED_KEYS — but the sentence is now stale. It is human-only; the plan surfaces it, and SHIP.md, the PR body and the final report must too.'
  evidence: '`CONSTITUTION.md` P3: "this CLI owns the `pharn.config.json` schema" — now true for every key except `models`'
```

### Determinism (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:113'
  problem: '"Byte-equal" is defined as JSON.stringify equality, so a block with the old default''s values in a different key order reads as edited and is converted rather than replaced. That is the conservative direction (the values are kept) and matches the brief''s wording, but say it in the docs so nobody reads it as a bug.'
  evidence: '"Byte-equal" is `JSON.stringify` of the parsed block — the exact serialization pharn wrote, key order included'
```

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/models-pharn-oss-owned/PLAN.md:83'
  problem: 'A re-run `init` still replaces an edited models block with pharn-oss''s (the documented reset), while `update` now keeps it. That asymmetry is inherited, not introduced, and the brief does not ask to change it. Name it in the docs and leave it as a follow-up rather than extend this increment.'
  evidence: '`init` writes the block **verbatim** (a JSON deep copy) on `ok`'
```

## Summary

The plan is grounded: the failure is measured against the checker this run, the delegation choice is
argued from two trusted documents rather than preference, and the per-file rows are reused instead
of copied. The concerns are about pinning what the plan already claims — a branch-complete parity
corpus, a written refresh procedure, both halves of the same-version migration — plus moving the
record key to the store it belongs to, and carrying one human-only reconciliation (CONSTITUTION P3)
all the way to the PR.

ADVISORY VERDICT: 9 concerns raised (0 blocking-severity, 1 important, 8 minor) — for the human to
weigh before /pharn-dev-build. Folded into the build under the plan-approval delegation.
