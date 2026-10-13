# GRILL — detection-precision-archetype-override (ADVISORY)

Plan: `.dev/features/detection-precision-archetype-override/PLAN.md` (with its GATE 1 resolved decisions). Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: '.dev/features/detection-precision-archetype-override/PLAN.md:31'
  problem: 'jsProject = packageJsonFound is true for ANY parseable package.json object, including one a Python/Go/Rails repo keeps only for tooling (prettier, husky, commitlint). The residual is therefore wider than "Laravel/Rails with a Vite frontend"; the docs must state it as "a non-JS repo that has a root package.json of any kind", or the doc claim overstates the gate.'
  evidence: 'jsProject: boolean; // a usable package.json at the scan root (packageJsonFound)'
- type: FINDING
  rule_id: P5
  severity: important
  file: '.dev/features/detection-precision-archetype-override/PLAN.md:55'
  problem: "The all-signals short-circuit must be computed over the GATED, per-base-resolved signals; if it reads raw candidates it stops early on a signal that never counts. Separately, per-base nextBase must be known BEFORE the base's children are classified — the plan relies on siblingFiles being built before iteration, which holds today; pin it with a test where `app/` sorts before `next.config.js` (it always does) and one where the config is absent."
  evidence: "it computes that base's `nextBase` from the `siblingFiles` set it already builds (no extra I/O)"
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/detection-precision-archetype-override/PLAN.md:138'
  problem: 'minimist binds a string flag to "" when the next token starts with "-": `pharn init --archetype --ref main` must refuse as a bare --archetype (not swallow --ref). Add that row; also `--archetype=` (explicit empty).'
  evidence: 'refused (exit 1, stderr names the value, usage printed, `runInit` not called): bare `--archetype`, `--no-archetype`'
- type: FINDING
  rule_id: P2
  severity: important
  file: '.dev/features/detection-precision-archetype-override/PLAN.md:190'
  problem: 'The replaced config''s `archetypes` is hand-editable and (until F-05) unvalidated at load, so it may be a string, contain non-members, or carry ESC bytes. The "previously recorded" line must render only an array whose every element is a canonical member (membership, not sanitizing arbitrary text), and the comparison must be order-insensitive set equality so a reordered-but-equal list prints nothing.'
  evidence: 'The previous list is shown only when it is an array of canonical archetype members'
- type: FINDING
  rule_id: P1
  severity: minor
  file: '.dev/features/detection-precision-archetype-override/PLAN.md:57'
  problem: 'Evidence for a DIRECTORY signal (`api/`, `migrations/`) vs a FILE signal under it: in preorder the dir is classified before its children, so `migrations/` (dir) wins over `migrations/001.sql`. State that explicitly in a test so the "first trigger" rule is pinned rather than incidental.'
  evidence: 'Evidence: the first trigger of each signal kind, in the deterministic walk order'
- type: FINDING
  rule_id: P3
  severity: minor
  file: '.dev/features/detection-precision-archetype-override/PLAN.md:87'
  problem: 'archetype.ts gains workspace/router-root/Next-evidence knowledge; that is still "classification rules" (one axis), but the base computation (which dir is a base, nextBase from siblings) must stay in detect-archetype.ts as reading strategy with only the pure predicates (isBase(segments), hasNextConfig(names)) in archetype.ts, or the split blurs.'
  evidence: '`ClassifyContext`, base/router-root/Next-evidence membership sets, gated `classifyEntry`'
- type: FINDING
  rule_id: P7
  severity: minor
  file: '.dev/features/detection-precision-archetype-override/PLAN.md:92'
  problem: 'types.ts edits are conditional on F-05 ordering; keep them to comments only (no Archetype type change on this branch) so the rebase onto F-05 stays a one-hunk drop.'
  evidence: 'only the two stale "(pharn init --archetype)" comments (if F-05 has not landed first; see OQ1)'
```

## Summary

The plan is narrowly scoped and every new branch is a membership test. The main risks are documentation honesty about the `package.json` gate (it is a coarse JS-ecosystem proxy, not a language detector), getting the short-circuit and per-base Next evidence ordering right in the walk, and treating the replaced config's `archetypes` as untrusted display input. The `--archetype` parser should be pinned against minimist's string-flag edge cases exactly as `--ref` is.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 4 important, 3 minor) — for the human to weigh before /pharn-dev-build. This is not a judgment that the plan is sound.
