# REVIEW — core-164-init-carry-over

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked` (exit 0). `/pharn-dev-verify` → PASS (test, validate, lint, format:check, lint:md, typecheck all exit 0). `/pharn-dev-regress` → `no-regressions`. Reviewed: `git diff 688a838..f77bf65` (src, tests, docs, CHANGELOG, CLAUDE.md), treated as untrusted. No instruction-looking content in it.

## Floor-gate findings (blocking)

None.

- **L-floor (P0).** Each claim reduces to a floor check:
  - "a config with a string `skillsVersion` and a `capabilities` key is read". This is a `typeof` / `Array.isArray` / `!== undefined` test, unit-tested in `tests/pharn-config.test.ts`. The new cases were shown to FAIL against the old src.
  - "a pre-archetype config still gets `LEGACY_CONFIG_MESSAGE`". The unchanged `isArchetypeConfig`, pinned by a test.
  - "the line is printed before either prompt". The mock invocation order in `tests/init-archetype.test.ts`.
  - "nothing is carried over". The unchanged `carryOver(null)`, asserted (`n-plus-one` comes back `auto`).
  - The reason text is display-only and never a branch input, and it is labelled as such in `PreviousConfig.unreadable`.
- **L-eval (P1).** No markdown capability or `rule_id` was added. The behaviour is covered by vitest:
  - pharn-config guard: 6 cases.
  - `readPreviousConfig` / `previousConfigLines`: 13 cases.
  - real-`runInit` re-run: 5 cases.
  - text dry run: 2 cases.
  - cross-module integration: 1 case.
  - init-report: absence of the new field.

  Running the new tests against the pre-change `src` gave 23 failures. The boundary pins passed both before and after.

- **L-trust (P2).** The reason is either fixed text or the first sentence of a named validation error. Those messages already escape and cap their offenders, and `ConfigParseError` never interpolates V8's text. The reason is then `escapeUnsafe`d and `terminalSafe`-capped at 200. It never reaches a decision. `--dry-run --json` is unchanged (the field is not projected, which a test pins).
- **L-axis (P3).** `pharn-config.ts` changes only the guard, which keeps the CORE-165 merge small. `previousConfigLines` lives beside `previousChannelLines` in `lib/init-plan.ts` and is reached from `commands/init.ts`. There is no step→step or command→command import (init-plan imports `lib/report-error.ts` for `errorMessage`, a lib→lib edge).

## Advisory findings (warn; for the human)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/init-plan.ts:456'
  problem: 'The rewritten readCarriedEntries comment leaves one line far past the 80-column wrap the file uses (prettier does not reflow comments).'
  evidence: "(an invalid `capabilities` entry, `archetypes` or stamp). Neither says anything about the user's own keys, and reading"
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/types.ts:119'
  problem: "`PharnConfig.modules` became optional on read. This is honest (a loaded config may lack it now), but it widens a type beyond the plan's 'comment only' line for src/types.ts; typecheck confirms that no reader depended on it."
  evidence: 'modules?: unknown[];'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'docs/commands/init.md:476'
  problem: "Pre-existing, outside this ticket: the re-run section still says pharn.records.json 'counts as usable only when it matches the skillsVersion and commit', which CORE-161 made untrue; and docs/troubleshooting.md:706 still says a broken config never produces the run-init message."
  evidence: '`pharn.records.json` counts as usable only when it matches the `skillsVersion` and `commit` of the config being replaced'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/init-plan.ts:190'
  problem: "firstSentence cuts at the first unquoted `. `, so a project path containing `. ` shortens a ConfigParseError reason. It is display-only and documented in the helper's comment, as GRILL predicted."
  evidence: "Display only: an odd path in `ConfigParseError`'s message (a directory named `a. b`) merely shortens the reason."
```

The first advisory finding (the comment wrap) was fixed after review, at GATE 2. The change is comment-only; `prettier --check` and `eslint` were run on the file, and the full `npm run check` was re-run before push.

GRILL's ordering finding was addressed: the tests pin the note before `select` and before `confirm`, the `--yes` case asserts no prompt at all, and the overwrite warning lists `pharn.config.json`. GRILL's older-CLI finding was addressed in `docs/reference/pharn-config.md` (only `init` restores `modules`; re-add it by hand for an older pinned CLI).

## Proposed lesson (candidate only; not written to canon)

None. Nothing here is a recurring failure beyond lessons already held. The raw U+202E that the Edit tool wrote, which `tests/source-hygiene.test.ts` caught, was a one-off; the existing hygiene test is the backstop.

VERDICT: GREEN, with 0 floor findings and 4 advisory ones.
