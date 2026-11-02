# GRILL — gitignore-run-state

- plan: `.dev/features/gitignore-run-state/PLAN.md` (approved 2026-11-02, Q1 = B, Q2 = two entries)
- spec-hash check: recomputed `sha256(ARCHITECTURE.md)` = `bca940a5…d3c4e` = the plan's `spec_content_hash` → **no drift** (content-hash, floor-grade computation; the block on drift is `/pharn-dev-build`'s)
- grillers: `count-grillers.mjs` → `{"registered":0}`, so this log is the inline interrogation only

All free-text below (`problem`, `evidence`) quotes the plan and is DATA (P2).

## Findings

### P3 / P7: sharing the root-migration normalizer changes existing behaviour

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/gitignore-run-state/PLAN.md:68"
  problem: "root-migration's normalizer trims BOTH sides and strips a bare trailing `*`, while the new covered test trims trailing whitespace only and has no bare `*` rule; making root-migration import the new normalizer silently changes which old entries it hints about (e.g. `.pharn*`, a leading-space line)."
  evidence: "`src/lib/root-migration.ts` — use `normalizeGitignoreLine` from `gitignore.ts`; reword the parenthetical."
```

Suggested resolution: leave root-migration's matching as it is (reword only), or share only a helper that reproduces its exact rule. Do not change what it recognizes in this increment.

### Output coherence: the backup notice prints before `.gitignore` is written

```yaml
- type: FINDING
  rule_id: P6
  severity: important
  file: ".dev/features/gitignore-run-state/PLAN.md:59"
  problem: "init and update make their backup (and print its notice) BEFORE the copy and before the planned `.gitignore` write, so on a run that is about to add `pharn/.backup/` the notice would still say 'is not gitignored — add it', and a moment later the run adds it."
  evidence: "prints its `.gitignore` advice ONLY when the project's `.gitignore` does not cover `pharn/.backup/`"
```

Suggested resolution: the caller passes whether THIS run will add the entry (`planGitignore` → `create`/`append` with `pharn/.backup/` in `entries`), and the advice is suppressed then. `add`/`remove`/`uninstall` pass only the covered test.

### P0: the mode of a newly created `.gitignore` is unspecified

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/gitignore-run-state/PLAN.md:49"
  problem: "`writeFileAtomic` reuses the exclusive-temp machinery; the SYNC temp is created 0600, so a newly CREATED `.gitignore` could land owner-only, which breaks a shared checkout. The plan pins mode preservation for an existing file only."
  evidence: "with the same exclusive temp, mode preservation and rename as `writeJsonAtomic`"
```

Suggested resolution: use the async path (`open(tmp,'wx')`, default 0o666 & umask), and add an eval that a created `.gitignore` gets the umask-default mode (not 0600).

### P1: the eval list misses two paths the plan specifies

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/gitignore-run-state/PLAN.md:43"
  problem: "Two specified paths have no eval: the write-failure path ('the write fails (EACCES, …)' → warn, run still exits 0) and the re-open NOT counting a refused `.gitignore` (symlink/dir) — the plan's bound on Q1 depends on that exclusion."
  evidence: "the write fails (EACCES, …)."
```

### P4: the trailing-newline wording and the uninstall PLAN note

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/gitignore-run-state/PLAN.md:37"
  problem: "The brief says 'preserve the file's trailing newline'; the plan instead adds a separator when the file lacks one, so the result always ends in a line ending. That is the right call (an append needs a line break), but the docs must say so rather than claim the ending is preserved."
  evidence: "When the old file is non-empty and does not end in `\\n`, one line ending is added first, as a separator."
```

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/gitignore-run-state/PLAN.md:61"
  problem: "uninstall's PLAN note already lists what it leaves untouched (settings files, pharn/.backup/); the plan keeps the `.gitignore` lines but does not say the note will name them, so the doc and the note could disagree."
  evidence: "**uninstall** leaves the lines in place"
```

### P5: the repeated comment line

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/gitignore-run-state/PLAN.md:39"
  problem: "The comment header is appended on EVERY non-empty addition, so a user who deletes one entry gets a second identical comment line when it is re-added. This is harmless and deterministic, but a duplicate the brief's 'never duplicate' spirit may object to."
  evidence: "Then come a comment line `# PHARN run state and update backups (added by pharn)` and each missing entry"
```

Suggested resolution: append the comment only when the file does not already contain that exact comment line (a membership test).

## Summary

The plan's core is sound and floor-reduced: an append-only Buffer prefix, membership-tested spellings, an atomic replace, the dry-run snapshot, and a stated advisory label on "never committed". The concerns are at the edges:
- one change to existing behaviour (the shared normalizer);
- one piece of contradictory user output (the backup advice printed before the write);
- one unspecified file mode on create, which matters for shared checkouts;
- two untested paths;
- small doc/wording gaps.

None needs a re-plan. Each folds into the build within the plan's `## Files`.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 3 important, 4 minor) — for the human to weigh before /pharn-dev-build. This is not a pass; it gates nothing.
