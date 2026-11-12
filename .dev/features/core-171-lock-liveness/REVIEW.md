# REVIEW — core-171-lock-liveness

Floor first: `node .dev/floor/validate.mjs .` exit 0 (GREEN, 0 capabilities: the increment adds no markdown capability). Everything below is **advisory**.

Inputs read: the working-tree diff against `99cc1c1` (src/lib/project-lock.ts, src/commands/init.ts, three lock test files, docs/troubleshooting.md, CLAUDE.md, CHANGELOG.md). A `/code-review high` pass ran over the same diff. Its five findings and their outcomes are folded in below. No instruction-looking content in the reviewed files steered this review.

## L-floor (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'CHANGELOG.md:18'
  problem: "The bold claim said the lock 'never deletes another run's lock', while release() names a read→unlink residual. FIXED: now 'no longer deletes a lock file it cannot read'."
  evidence: "and never deletes another run's lock"
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/lib/project-lock.ts:355'
  problem: "'Same host' is os.hostname() equality. A hostname change mid-run makes a live lock look foreign (STALE_MS) and stops its own release. The new 'age never breaks a live holder' claims omitted this. FIXED: HOSTNAME CHANGE residual in the module header, troubleshooting, CLAUDE.md, CHANGELOG. The mechanism predates this increment."
  evidence: 'if (held.host !== hostname()) return Date.now() - started > STALE_MS;'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/project-lock.ts:352'
  problem: 'A same-host clock stepped BACK by more than FUTURE_SKEW_MS makes a live lock look future-dated, and it is broken after MALFORMED_GRACE_MS. FIXED: named in the CLOCK CORRECTION residual and troubleshooting. The rule predates this increment (F-39).'
  evidence: 'if (held === null || started - Date.now() > FUTURE_SKEW_MS)'
```

Every claim the increment makes now reduces either to a deterministic branch pinned by a test (`isStale` order, the `bootMs()` guard, `release()`'s parse+pid+host test) or to a named residual: recycled pid until reboot, forward/backward clock steps, hostname change, the release read→unlink gap.

## L-eval (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/project-lock.test.ts:842'
  problem: "With release() ignoring unparseable files, the empty-lock assertion no longer proved the signal cleanup was deregistered. FIXED: a sibling child test plants a lock naming the child's own pid. Mutation-checked: dropping offSignal() fails both tests."
  evidence: 'expect(existsSync(lockPath(dir))).toBe(true);'
```

Every acceptance-criterion row has a test, each run RED before the code change (9 failed, see the build). The three age-before-liveness tests now use another host / a dead pid and do not pass through the boot rule. F-39's far-future test is unchanged and passes. Time control: `os.uptime` is mocked (30 d default) in all three lock suites.

## L-trust (P2)

No findings. `pharn/.lock` stays untrusted local input. The new branch reads `host` (string compare) and `startedAt` (already `Date.parse`-validated). `pid` is still shape-checked before `process.kill`.

## L-axis (P3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/project-lock.ts:303'
  problem: "isDead's host check is now redundant with isStale's early return. SKIPPED (kept on purpose): a comment states it keeps isDead safe on its own, so a foreign pid is never probed."
  evidence: 'if (held.host !== hostname()) return false;'
```

One axis per file held. No sibling-module references.

## Summary

The change matches the owner's settled rule. Review found overstated prose more than code defects: claims that read as unconditional while depending on the hostname and the clock. All of it is now named. One test lost power through the behaviour change and was strengthened.

Blocking: 0. Important: 2 (fixed). Minor: 3 (2 fixed, 1 kept on purpose). Advisory. The decision is the human's.
