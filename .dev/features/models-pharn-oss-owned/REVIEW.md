# REVIEW — models-pharn-oss-owned (iteration 1)

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN`. Everything below is **advisory**. The
increment was read as `trust: untrusted`; nothing in it read as an instruction.

Two sources: the four inline lenses, and an independent read-only bug hunt (a subagent that probed
the built modules with `tsx` scripts). Its findings are marked **[probe]** where it confirmed them by
running code, and each was re-checked against the source before being listed here.

## Floor-gate findings (blocking)

None. No guarantee is claimed without a floor reduction or an `advisory` label, no eval binding is
missing, and no sibling-leaf import was added.

## Advisory findings

### Correctness

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: 'src/lib/models-update.ts:207'
  problem: 'When pharn-oss ships no block, or one this pharn rejects, an unedited pre-0.7.0 default is converted but keeps the record it had — none, since no earlier pharn recorded the block. After conversion it no longer equals an old default and has no record, so every later update reads it as the user''s (`unrecorded`) and pharn-oss''s block is never applied without --force. [probe: run1 upstream-invalid, record null; run2 kept unrecorded]'
  evidence: 'nextRecord: recorded,'
- type: FINDING
  rule_id: 'P2'
  severity: important
  file: 'src/lib/upstream-models.ts:73'
  problem: 'The checker ignores keys it does not read, so a block with a very deeply nested value under a sibling key passes, and JSON.stringify then overflows the stack — in init after the files are copied and before the config is written, leaving a half-installed project. The fetched block is untrusted; the read must refuse what it cannot serialize. [probe: kind ok, then RangeError from modelsRecordHash]'
  evidence: 'return { kind: ''ok'', block };'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/update.ts:227'
  problem: 'The same-version gate re-opens while the block holds something convertible. If pharn-oss''s own block ever carried a top-level `default`, update would write it, find it convertible again, and re-open the gate on every run. Nothing bounds that loop. Close the gate for a block that is exactly the one pharn recorded writing. [probe: ok, needs-again true]'
  evidence: 'const convertModels = needsModelsConversion(config.models);'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/update.ts:640'
  problem: 'The models record is written with the records, before the config. If the config write then fails while the stamp still matches (a withheld bump, or a same-version run), the next run compares the old block with the new record and keeps it as `modified`. This fails safe — no edit is ever overwritten — and it mirrors the existing records-before-config order. Accepted, named.'
  evidence: '...(models.nextRecord !== null'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/commands/update.ts:548'
  problem: '`--force` over an edited block backs up pharn.config.json; createBackup refuses a symlinked path, so a symlinked config now makes such a run abort, before any write, with a named message. Before this change it succeeded. Accepted: the refusal is createBackup''s deliberate posture, and it writes nothing.'
  evidence: '? [...plan.backups, CONFIG_FILENAME]'
```

### Guarantee wording (L-floor → P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/model-config.ts:18'
  problem: '"Why it cannot drift unnoticed" overstates: the copy cannot drift from the VENDORED checker unnoticed, but the vendored checker can lag live upstream until someone refreshes it.'
  evidence: 'Why it cannot drift unnoticed: tests/model-config-parity.test.ts runs the real checker'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'docs/reference/pharn-config.md:185'
  problem: '"the copy never gains a rule of its own" is a discipline promise; the test catches an added rule only where the corpus exercises it. Say what the test does.'
  evidence: 'and the copy never gains a rule of its own'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'src/commands/update.ts:243'
  problem: 'The pre-confirm note says an edited models block will be OVERWRITTEN under --force, which is false when pharn-oss ships no block or one this pharn rejects — and the note is printed before the fetch that decides it. The MODELS note after the run is the accurate place; drop the claim here.'
  evidence: '--force: files you changed, and an edited models block, will be OVERWRITTEN'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'docs/troubleshooting.md:503'
  problem: 'The example cannot be produced: a block with `opus-4-8` takes status''s old-format branch, not the list of REDs. [probe]'
  evidence: 'stage "plan" model "opus-4-8" is not an alias'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'src/steps/install-archetype.ts:421'
  problem: 'Stale comment: readPharnConfig no longer throws on a bad `models` block.'
  evidence: 'throws on a bad `models`/`seam` hand-edit'
```

### Eval coverage (L-eval → P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/commands/update.ts:250'
  problem: 'The pre-confirm line announcing the conversion is not pinned by any test.'
  evidence: 'Your models block is in the format pharn wrote before 0.7.0 — this run converts it.'
```

### Trust (L-trust → P2)

Every untrusted string reaches the terminal through `terminalSafe` (stage names, values, upstream's
reasons); `resolvedStageLines` prints only enum/regex members. The vendored checker is executed only
by tests, never at run time, and is not in the published package (`files: ["dist"]`). The residual:
`terminalSafe` does not strip U+2028/2029 — pre-existing helper behavior, out of scope.

### Axis (L-axis → P3)

One reason to change per new file: pharn-oss's rules (`model-config.ts`), their presentation
(`model-config-format.ts`), update's treatment of the block (`models-update.ts`), the fetch-boundary
read (`upstream-models.ts`); the record key sits with the store it keys (`install-records.ts`). No
command→command or step→step import.

## Human-only reconciliations (not agent-editable; carried to SHIP.md and the PR)

- `CONSTITUTION.md` P3 — "this CLI owns the `pharn.config.json` schema" is now true for every key
  except `models` (the maintainer's decision). P3's enforceable clause still holds.
- `THREAT-MODEL.md` §3.1 — `models` is listed among the local-origin fields; it is now a fourth
  network-derived field, validated at ingest by `checkModelsBlock` (`readUpstreamModels`).

## Follow-ups (out of scope)

- `tests/seam-config.test.ts:61` names "model-routing's effort" in a test title — cosmetic, not in
  this increment's `## Files`.
- A re-run `init` still replaces an edited `models` block while `update` keeps it (inherited, named in
  the docs).

## Verdict

GREEN floor; **0 floor-gate findings**, 2 important + 9 minor advisory. Two advisory findings are real
defects (the lost authorship of a converted default; an unserializable upstream block) and three more
are cheap to fix — for the human at GATE 2.

---

## Iteration 2 (after the GATE 2 "fix" decision)

Floor first: `FLOOR: GREEN`. Re-read the fixes as `trust: untrusted`. Each fixed finding has a test that
fails with the fix reverted (checked by reverting it).

| iteration-1 finding                                     | resolution                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| converted old default loses its authorship (important)  | Fixed — `models-update.ts`: a block that was pharn's (an old default, or the recorded block) takes the hash of what it became as its record. Unit test + an end-to-end update test.         |
| unserializable upstream block half-installs (important) | Fixed — `upstream-models.ts` refuses a block `JSON.stringify` cannot serialize, before anything copies it. Unit test + an init test that finishes the install with no `models` key.         |
| same-version gate unbounded (minor)                     | Fixed — `modelsMigrationPending`: a block that is exactly the recorded one does not re-open the gate. Unit test + an update test with a convertible upstream block, closed on the next run. |
| records written before the config (minor)               | Accepted and named: fails safe (a block is kept, never overwritten); it follows the existing records-before-config order.                                                                   |
| `--force` over a symlinked config aborts (minor)        | Accepted and named: `createBackup`'s refusal, before any write.                                                                                                                             |
| "cannot drift unnoticed" (minor)                        | Fixed — the comment now names the vendored copy's lag.                                                                                                                                      |
| "never gains a rule of its own" (minor)                 | Fixed — the doc says what the test does.                                                                                                                                                    |
| pre-confirm `--force` line over-promises (minor)        | Fixed — the line no longer mentions the block; the MODELS note after the run is where it is decided and reported.                                                                           |
| impossible troubleshooting example (minor)              | Fixed — the example now shows a RED that `status` can print (`gpt-4`).                                                                                                                      |
| stale `readCarriedEntries` comment (minor)              | Fixed.                                                                                                                                                                                      |
| pre-confirm conversion line untested (minor)            | Fixed — pinned in the same-version migration test.                                                                                                                                          |

One residual of the gate fix, named: `status` still labels a block with a top-level `default` as "the
format pharn wrote before 0.7.0" even if pharn-oss itself shipped it — `status` does not read the
records file. pharn-oss's checker ignores a top-level `default`, so upstream has no reason to ship one.

### Verdict (iteration 2)

GREEN floor; **0 floor-gate findings**; the two important findings are fixed, the rest fixed or
accepted and named. Advisory — the decision is the human's (delegated; `SHIP.md`).
