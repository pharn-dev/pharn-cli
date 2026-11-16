# REVIEW — core-168-init-add-small-fixes

Floor first: `node .dev/floor/validate.mjs .` GREEN (0 capabilities; vacuous for a TypeScript increment), `CI=1 npm run check` GREEN (build), `/pharn-dev-verify` PASS, `/pharn-dev-regress` no-regressions. Everything below is advisory unless marked floor-gate.

Reviewed: `git diff 688a838..fc898d2` (src, tests, docs, CLAUDE.md, CHANGELOG.md). The increment is `trust: untrusted`; nothing in it read as an instruction.

## Floor-gate findings (blocking)

None.

- L-floor (P0): every claim reduces to a floor operation. "Zero network on `init --yes` over a config" → a synchronous `existsSync` (`existingConfigRefusal`) placed in `runInit` before `runInitArchetype`, whose first network call is `resolveSource`/`fetchRepo`; pinned by `tests/init-yes.test.ts`, which asserts `fetchRepo` and global `fetch` untouched. "`--yes` never deletes" → a removal comes only from `carryOver` of a readable replaced config, and that config is a `conflictingWriteTargets` member, so `assertNoExistingTargets` refuses before the lock and under it (`assertConfigFingerprintUnchanged` refuses first under the lock). The `Omit<WriteTargetsParams, 'removals'>` type makes the removed branch unrepresentable. "Picker exits 1 iff a pick failed" → `failed.length` membership, tested both ways. `row()` gap → arithmetic, unit-tested. The ancestor-`.git` caveat is documented as a limit in `docs/troubleshooting.md`.
- L-eval (P1): every behaviour change has a test that failed before the code (22 red → green). No markdown capability and no `rule_id`, so no eval binding applies; the floor agrees (vacuous GREEN).
- L-trust (P2): new terminal output prints the cwd and the ancestor root through `escapeUnsafe` (the one display escaper for local paths), and the picker's failed names are `role:name` option values built from the validated index. No new untrusted input, no write driven by display text.
- L-axis (P3): `existingConfigRefusal` sits beside `assertNoExistingTargets` in `lib/write-targets.ts` (one axis: init's write-target refusals); `findAncestorGitRoot` sits in `steps/prereqs.ts` (the prerequisite stage). No command→command or step→step import was added (`prereqs.ts` imports only `lib/`).

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/commands/init.ts:157'
  problem: "A comment line edited in this increment runs past the file's usual wrap width; prettier does not rewrap comments, so it stays long."
  evidence: '// prerequisite, the TTY gate and the `--yes` config check: a refused init prints its one error and'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/steps/add-picker.ts:133'
  problem: 'A pick that THROWS (createBackup failing, a pre-flight throw) still aborts the loop through the command catch: exit 1 is right, but earlier successful picks are not summarised. Stated in the comment and out of the ticket scope.'
  evidence: "(A pick that THROWS still aborts the loop through the command's catch, also exit 1.)"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'docs/commands/init.md:410'
  problem: 'The doc says `pharn update` resolves through the same function as the skip reason; update does not print skip reasons today, so the sentence is accurate but only matters for the JSON of `init --dry-run`. Kept because the orchestrator asked for the shared-wording note.'
  evidence: '`pharn update` resolves the recorded archetypes through the same function.'
```

## Proposed lesson

None: no recurring failure surfaced.

VERDICT: GREEN — 0 floor-gate findings, 3 advisory (minor).
