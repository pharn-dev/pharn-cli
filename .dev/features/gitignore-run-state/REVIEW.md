# REVIEW — gitignore-run-state

- floor first: `node .dev/floor/validate.mjs .` → GREEN (0 capabilities); regress `no-regressions`; verify `PASS`.
- reviewed: `fe16608..ce375a0` (treated as untrusted; no instruction-looking content found in it).

## Floor-gate findings (blocking)

None. Every guarantee the increment states reduces to a floor operation:
- byte prefix (`Buffer.concat`) — tested byte for byte;
- the literal membership test;
- `lstat` + `readBoundedFile` + an exclusive-temp rename — tested with a symlink, a directory, a FIFO and a hard link;
- the dry run writes nothing — `snapshotTree` + an `applyGitignore` zero-call spy.

"Run state will never be committed" is labelled advisory in the code header, README, the init/update docs and the CHANGELOG. There are no `enforces` rule_ids and no markdown capability (L-eval is vacuous beyond the vitest coverage), and no sibling references (L-axis).

## Advisory findings (judgment; they inform, they do not block)

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: "src/lib/gitignore.ts:111"
  problem: "A .gitignore that starts with a UTF-8 BOM has its first line read with the BOM bytes attached, so an entry on that line is not recognised and is appended again — git itself strips the BOM and honours the line, so the result is a redundant duplicate (harmless, but it breaks the 'never duplicate an entry' requirement)."
  evidence: "probe: BOM + 'pharn/.run/\\npharn/.backup/\\n' → gitignoreAddition adds ['pharn/.run/']; git check-ignore confirms the BOM'd line already ignores pharn/.run/x"
```

Suggested fix (small, inside `## Files`): drop one leading `EF BB BF` before splitting lines in `lines()`. Detection only; the bytes are still appended to unchanged. Add an eval.

```yaml
- type: FINDING
  rule_id: P6
  severity: minor
  file: "src/steps/install-archetype.ts:340"
  problem: "The interactive init and update confirms do not mention the .gitignore append; the user learns of it from the outro (init) or the post-apply info line (update), or beforehand only via --dry-run or update's same-version header note."
  evidence: "confirmWriteTargets lists only planWriteTargets; update's confirm is 'Apply this update?'"
```

This is acceptable for an append-only, idempotent edit (the brief asked for no prompt). It is noted so the choice is visible.

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/gitignore.ts:250"
  problem: "gitignore.ts holds the plan/apply logic, its user-facing wording (gitignoreLines) and its JSON projection (gitignoreReport) — three reasons to change in one file, though root-migration.ts sets the same precedent (logic + rootMigrationNoteLines)."
  evidence: "export function gitignoreLines(… ) / export function gitignoreReport(…)"
```

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: "src/lib/gitignore.ts:170"
  problem: "Between the lstat (not a symlink) and readBoundedFile (which follows links) a swap could make pharn READ a link target; the write still replaces the name by rename and never writes through, so the residual is a read of a bounded regular file, never an outside write."
  evidence: "isLink = lstatSync(target).isSymbolicLink(); … const read = readBoundedFile(target);"
```

## Resolution (after GATE 2)

The human chose "fix BOM, then ship". `lines()` now drops one leading UTF-8 BOM before matching (detection only; the bytes are still appended to unchanged). Two evals cover it: `decidedEntries` reads past a BOM, and a BOM file that already covers both is left byte-identical.

## Verdict

**GREEN — 0 floor findings, 4 advisory (1 important: the BOM duplicate).** The decision is the human's.

No lesson proposed for canon: the BOM case is a one-off edge, not a recurring failure (P7).
