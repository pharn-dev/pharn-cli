# REVIEW — retire-legacy-lock (CORE-187)

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`. `/pharn-dev-verify` PASS
(test, validate, lint, format:check, lint:md, typecheck all exit 0); `/pharn-dev-regress` no-regressions.
Everything below is advisory.

## Floor-gate findings (blocking)

None. No guarantee lost its floor reduction: the lock is still the O_EXCL create, the break still
rename → byte re-verify → O_EXCL, release still compares pid + host, and the only file the break deletes is
the corpse name it drew itself. The no-delete claim got stronger, not weaker: the corpse-name regex allowlist
(which accepted deleting a user file named like a corpse) is gone with the sweep.

## Advisory-gate findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: "THREAT-MODEL.md:267"
  problem: "§4d still says a run honours the root .pharn.lock via checkLegacyLock, which no longer exists; the file is human-owned, so the fix is the patch script handed to the human, and until it runs the threat model overstates the old-CLI exclusion."
  evidence: "for one release a run also honours the root `.pharn.lock` that 0.13.0 and older take"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "src/lib/project-lock.ts:41"
  problem: "The stranded-corpse residual is named; it is new user-visible debris (a file under pharn/ that never goes away by itself), documented in troubleshooting and the CHANGELOG, which is the honest trade for dropping the sweep."
  evidence: "Nothing deletes a name this call did not create, so it stays until the user removes it; it is never read."
```

### L-eval → P1

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "src/lib/project-lock.ts:291"
  problem: "The EEXIST branch of ensureLockDir (a concurrent creator between the check and mkdir) is uncovered, as it was before the rewrite; only the ENOENT retry has a seam test."
  evidence: "if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;"
```

The rewritten legacy tests assert the new behaviour with as many or more assertions than before (a root
`.pharn.lock` live, stale or old is ignored and left byte-identical; corpse-named neighbours survive; no
`.pharn-backup` notice from `update`; `backup.ts` no longer exports the notice), and a new test covers a
payload whose `startedAt` is not a date.

### L-trust → P2

No finding. The lock file stays user-editable local input: bounded non-blocking read, pid shape-checked
before `process.kill`. Nothing in the reviewed diff read as an instruction.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/lib/root-migration.ts:70"
  problem: "Trimming root-migration's .gitignore hint table is a second reason this increment touches a module scheduled for v0.22.0 retirement; it is the same axis (retiring the two legacy names) and keeps the acceptance 'no longer mentioned in src' true."
  evidence: "const GITIGNORE_REPLACEMENTS: readonly { old: string; hint: string }[] = [ { old: '.pharn', hint: 'pharn/.run/' }, ];"
```

`init.ts`, `update.ts` and `README.md` sit in sibling tickets' lanes; the edits are the minimum the removal
requires (deleting the notice calls and one README sentence). No command→command or step→step import.

## Verdict

GREEN — 0 floor findings; 4 advisory (1 important: the human-owned THREAT-MODEL §4d needs the patch script
run). No lesson proposed for canon.
