# REVIEW — core-191-pinning-tests-to-lint

Floor first: `node .dev/floor/validate.mjs .` GREEN (0 capabilities; vacuous for a TypeScript increment), `npm run check` GREEN (build), `/pharn-dev-regress` no-regressions (tests, validate, lint, format:check, lint:md identical at base and head), `/pharn-dev-verify` PASS (`CI=1` test, typecheck, lint, format:check, lint:md, validate), coverage thresholds met. Everything below is advisory unless marked floor-gate.

Reviewed: `git diff a4bbcb9..` (eslint.config.mjs, tests/, docs/contributing.md, docs/RELEASING.md). Tests: +654 / −2171 lines (23 files). The increment is `trust: untrusted`; nothing in it read as an instruction.

## Floor-gate findings (blocking)

None.

- L-floor (P0): each converted invariant now reduces to an eslint rule at `error` under `--max-warnings 0` in the required `Lint` job, and `tests/lint-rules.test.ts` proves each fires (and each exemption stays silent) against the REAL config — mutation-checked by removing the `color.ts` exemption and re-scoping the `diff.ts` ban (the test went red, then green on restore). The required check names, the one `contents: write`, the `Decide` outcome and every override floor were each mutation-checked too (renamed `Lint` job, `rc=0` Decide, `minimatch` 11.0.4 in the lock: all three went red). The two invariants that went without a rule are justified by a floor elsewhere (`typecheck` fails on an import of the deleted `lib/manifest.ts`; `index.test.ts` refuses `remove --yes`).
- L-eval (P1): no capability or `rule_id` is added, so no eval binding applies. The new behaviour (the rules) ships with its test in the same commit.
- L-trust (P2): no untrusted input is ingested. The config reads only `src/lib/` names at load (the old test's own filter).
- L-axis (P3): no `src/` file changed; the only shared surface is `eslint.config.mjs`.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'eslint.config.mjs'
  problem: "Two converted invariants are narrower or differently shaped than their text scans: update's prompt rule bans the IMPORT of prompt APIs but no longer counts `await confirm(` calls (two confirms would pass); the symlink-walk rule still matches one spelling. Accepted at GATE 1; must be named in the PR."
  evidence: "only: ['src/commands/update.ts'] / AssignmentExpression[left.name='current'][right.type='ConditionalExpression']"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'src/lib/color.ts:7'
  problem: 'Four src/ comments (color.ts, hash.ts, terminal-safe.ts, repo.ts) and ~10 CLAUDE.md sentences still cite the deleted test pins. CORE-192 owns both; the exact list with replacements is in the hand-off file, not edited here.'
  evidence: '// tests/color.test.ts).'
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'eslint.config.mjs'
  problem: 'The config now carries two reasons to change: style rules and the invariant table (~200 lines). Splitting the table into its own module is a later option if it grows; today one file keeps the rules where `npm run lint` and contributors look first.'
  evidence: 'const INVARIANTS = ['
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'tests/publish-workflow.test.ts'
  problem: "The Decide refusal cases (non-main ref, non-X.Y.Z version, other ls-remote exits) and the Registry check execution are dropped, per the ticket. A regression there now first shows in a real release run; the build job's own version and main-ancestry re-checks still stand in front of npm."
  evidence: "it('Decide: a tagged version releases nothing, an untagged one releases'"
```

## Lessons (candidates, not promoted)

- Flat config replaces, not merges, a rule's options across matching objects: a per-file restriction must carry the src-wide entries too. Declaring invariants as data and generating one object per file is what made that safe here.

This review is advisory. The merge / fix / abandon decision is the human's.
