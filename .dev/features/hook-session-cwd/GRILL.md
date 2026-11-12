# GRILL — hook-session-cwd

Plan: `.dev/features/hook-session-cwd/PLAN.md`. Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash` (no drift). Registered grillers: 0 (`count-grillers.mjs` → `{"registered":0}`), so
only the inline axes ran.

## Findings

### Eval coverage / test hermeticity (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/hook-session-cwd/PLAN.md:44'
  problem: "The fixture spawns real git; inherited GIT_* variables (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE — set when the suite runs from a git hook or a rebase exec) would point git at the developer's repo instead of the temp one."
  evidence: 'a real `git init` repo + `git worktree add` under `.claude/worktrees/<n>` in a temp dir'
```

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/hook-session-cwd/PLAN.md:77'
  problem: "No eval pins the relative-path form of the `.git` link (git's worktree.useRelativePaths), which the design claims to resolve against `top` / G."
  evidence: 'realpath(G resolved against `top`) … `<G>/gitdir` (≤ 4096 bytes, trimmed, resolved against G)'
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/hook-session-cwd/PLAN.md:101'
  problem: "Residual (2) should say the root may move only among the SAME repository's work trees, each judged by its own scope — the plan says so, but the deny message's `Scope file:` line still names a bare relative path, which in a worktree session means the worktree's file; a human reading it may look in the main checkout."
  evidence: "a session that `cd`s into another verified worktree of the same repo is judged against THAT worktree's scope"
```

### Honest scope (P7) / regress interplay

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/hook-session-cwd/PLAN.md:57'
  problem: "On this base `.pharn/writes-scope.json` is still TRACKED (#358 is unmerged), and every stage's setter rewrites it, so it will show as a changed file outside `## Files` at /pharn-dev-regress's scope check and must be restored before commit."
  evidence: '`.pharn/writes-scope.json` — runtime state (pharn-dev/pharn-cli#358 untracks it); never committed by this increment'
```

## Summary

The design is narrow and every accept branch is an equality test against git's own two-way link, with
the anchor root as the single fallback, so no new allow appears without a verified link. The concerns
are about the tests' hermeticity (scrub `GIT_*` in the fixture; add a relative-link case) and about
making the deny message name the absolute scope file so a worktree session's reader looks in the right
tree. The tracked scope file is a known artefact of the unmerged #358.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to weigh
before /pharn-dev-build. This log gates nothing.
