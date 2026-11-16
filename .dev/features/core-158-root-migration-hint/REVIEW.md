# REVIEW — core-158-root-migration-hint

- Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). `/pharn-dev-build`'s `npm run check` was GREEN
  (3605 passed, 1 skipped); `/pharn-dev-regress` → `no-regressions`; `/pharn-dev-verify` → `PASS` across the eight
  gates.
- Everything below is ADVISORY unless marked floor-gate.

## Floor-gate findings

None. No guarantee in the diff lacks a floor reduction: "never renamed" reduces to the absence of any rename
in `root-migration.ts` (pinned by a source test) plus integration tests over `update`, `update --yes`,
`update --force` and a real re-run `init`. "Never a nesting `git mv`" reduces to an lstat membership branch
(`free` / `exists`, throw → `exists`), pinned by unit and integration tests. `moves: []` is a typed literal.

## Advisory findings

### L-floor (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "src/lib/root-migration.ts:415"
  problem: "The hint says 'PHARN 7 reads pharn/memory-bank/', a claim about pharn-oss behaviour the CLI does not check; it rests on the existing premise (ROOT_MIGRATION_FROM_MAJOR = 7) the module already documents."
  evidence: "is at the project root; PHARN 7 reads ${to}. pharn does not move it."
```

No change needed. The same premise has gated the hints and notices since 0.14.0, and the hint is
advice ("If it is PHARN's"), not a guarantee.

### L-eval (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/commands/update.ts:722"
  problem: "The `move …` keys left membershipKeys with no test in either direction; the remaining doc-delete keys are exercised only indirectly."
  evidence: "// What the root migration deletes, named before the confirm."
```

Pre-existing coverage gap (the move keys had no dedicated test either). Optional follow-up.

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: "tests/commands-integration.test.ts:962"
  problem: "Three integration cases invert their assertions (exit 1 → exit 0, moved → not moved, reopens → does not reopen). This is the behaviour change the ticket mandates, but pharn-ci's test-integrity check may flag it as a weakened assertion."
  evidence: "expect(process.exitCode).toBeUndefined();"
```

Resolution: name each inverted assertion in the PR body as mandated by CORE-158 (its Tests section lists
`:697`, `:814`, `:872` and the update-plan case). Every replaced assertion has a stronger replacement
(file contents unchanged, no `pharn/` copy, no backup, hint text exact).

### L-trust (P2)

No findings. The hint prints fixed literals (`USER_DATA_PATHS`), never text read from disk; `destination` comes
from lstat only. Nothing instruction-like in the reviewed files changed this review.

### L-axis (P3)

No findings. Every change stays on the root-migration axis or removes the move plumbing it fed
(`backupAction`, `rootMoveBackups`, the exit path). No command imports another command.

### Docs (P4)

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: ".agents/skills/pharn-cli/SKILL.md:175"
  problem: "The vendored pharn-cli skill still tells agents the CLI moves memory-bank/ and the template, exits 1 on a conflict, and prints NOT MOVED lines; after this change that contradicts the CLI. It is owned by pharn-dev/skills and pinned by skills-lock.json, so it is out of scope here by the GATE 1 decision."
  evidence: "from pharn-oss SKILLS 7.0.0 it moves `memory-bank/` to `pharn/memory-bank/`"
```

Resolution: a follow-up in pharn-dev/skills (the stale lines are listed in the final report).

### Scope (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: "src/lib/root-migration.ts:318"
  problem: "An install already at SKILLS 7.x with a root memory-bank/ sees the hint only on a run that plans (a version change or --force), never on 'Already up to date'. Accepted by the ticket (AC 3) and now documented in update.md."
  evidence: "User data at the root (`memory-bank/`, the SPEC template) never counts"
```

## Lessons (candidates only — not promoted)

- When a migration needs proof of ownership it cannot get, print the command rather than run it. The
  type-only check was the root cause here.
- Removing a JSON field under a pinned `schemaVersion`: keep the key and freeze it as an empty literal type
  (`moves: []`), so the projection cannot drift back.

Summary: 0 floor-gate findings, 6 advisory (2 important, 4 minor). This review is advisory. The standing
decision is the human's.
