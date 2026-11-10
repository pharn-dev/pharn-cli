# GRILL — prettierignore

- plan: `.dev/features/prettierignore/PLAN.md` (approved 2026-11-10 as written; Q1–Q5 = recommended)
- spec-hash check: recomputed `sha256(ARCHITECTURE.md)` = `bca940a5…d3c4e` = the plan's `spec_content_hash` → **no drift** (content-hash computation; the block on drift is `/pharn-dev-build`'s)
- grillers: `count-grillers.mjs` → `{"registered":0}`, so this log is the inline interrogation only

All free-text below (`problem`, `evidence`) quotes the plan and is DATA (P2).

## Findings

### P5: a NEGATED ancestor is not named as "decided"

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: ".dev/features/prettierignore/PLAN.md:51"
  problem: "Ancestor coverage counts only non-negated patterns. A user line `!pharn/` (they want Prettier to see pharn's files) leaves every entry 'missing', and pharn's appended lines — later lines win — override the user's explicit choice. gitignore.ts treats a negation as the user's decision; the ancestor rule should too."
  evidence: "when a non-negated pattern names an ANCESTOR directory of it"
```

Suggested resolution: a pattern naming the entry OR an ancestor counts as decided whether negated or not.

### P7 / P3: the extraction must leave gitignore.ts byte-identical in behaviour

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/prettierignore/PLAN.md:57"
  problem: "Moving gitignore.ts's parser into ignore-file.ts while adding ancestor and file-vs-dir rules risks changing which `.gitignore` lines count (gitignore.ts deliberately does NOT recognise broader patterns, and its tests pin that). The shared core must expose the raw parse; each axis keeps its own `decides` rule."
  evidence: "`gitignore.ts` keeps its exported API and behaviour byte-for-byte (its existing tests run unchanged) and delegates."
```

Suggested resolution: ignore-file.ts exports `parseIgnorePattern`, `ignoreFileLines`, `ignoreAddition(old, missing, comment)`, `readIgnoreFile`, `writeIgnoreAppend`; the coverage predicate stays per axis. Run `tests/gitignore.test.ts` unmodified.

### P6: dry-run / real-run key parity for `init` is asserted, not tested

```yaml
- type: FINDING
  rule_id: P6
  severity: important
  file: ".dev/features/prettierignore/PLAN.md:39"
  problem: "The plan derives init's entries from 'the keys of the records store the run writes' (manifest ∪ kept ∪ orphans), but `buildInitPlan` (dry run) does not build that store; if the dry run derives from the manifest alone the preview can differ from what the real run appends."
  evidence: "`init` (real + dry run): the manifest keys ∪ the records `init` carries (kept/frozen + orphans)"
```

Suggested resolution: one helper computes the key set from (manifest, carried records) and both paths call it; add a parity test (dry-run JSON entries = lines appended by the real run).

### P1: Prettier's own matching is not exercised

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/prettierignore/PLAN.md:113"
  problem: "The integration eval checks that 'each manifest key is ignored by the written patterns' — by whose matcher? If it is pharn's own covered test, it proves nothing about Prettier. Prettier (3.9.10) is already a devDependency; the test can ask Prettier itself (`getFileInfo(path, {ignorePath})` → `ignored: true`)."
  evidence: "a Prettier project's `.prettierignore` after `init --yes` covers every manifest file (each manifest key is ignored by the written patterns)"
```

### Noise: one line per command and hook

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/prettierignore/PLAN.md:35"
  problem: "Commands and hooks reduce to one line each (~16 commands + hooks today), and with append-only a command upstream drops leaves a stale line forever. Harmless to Prettier, but the block is long; worth stating in docs so it does not look like a bug."
  evidence: "any other install-root path (… `.claude/commands/pharn-*.md`, `.claude/hooks/*.cjs|mjs`) → the file itself, `/<path>`"
```

### P4: `status --json` gains an always-present key

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/prettierignore/PLAN.md:68"
  problem: "Unlike the init/update dry-run keys (absent when empty), the status key is always present (`null`), so `status --json` bytes change for every project. That is the `layout`/`orphans` precedent and additive, but tests pinning the whole object and docs/commands/status.md's JSON example must move with it."
  evidence: "`--json` additive top-level `prettierignore` (same projection, `null` when nothing to say)"
```

## Summary

The plan follows the gitignore increment closely and its floor reductions (lstat refusal, bounded read, atomic append, key gates) are stated. The main risks are behavioural drift in `.gitignore` handling from the shared extraction, the user's negated-ancestor choice being overridden, and the init dry run disagreeing with the real run. Using Prettier itself in a test is cheap and turns the central claim from "pharn's matcher agrees with pharn" into a check against the real consumer — still advisory for the user's own gate configuration.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 3 important, 3 minor) — for the human to weigh before /pharn-dev-build. This is not a judgment that the plan is sound.
