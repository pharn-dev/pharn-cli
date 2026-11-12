# GRILL — core-171-lock-liveness

Plan: `.dev/features/core-171-lock-liveness/PLAN.md`. Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` (no drift). Registered grillers: `{"registered":0}` (`count-grillers.mjs`), so only the inline axes ran.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/core-171-lock-liveness/PLAN.md:44'
  problem: 'The boot rule assumes os.uptime() counts time spent suspended. If it did not, a laptop that slept after taking the lock would compute a boot time LATER than the real one and break a live lock. The plan names clock steps as a residual but not this assumption.'
  evidence: '"a lock from before the last boot is broken" → depends on `os.uptime()` and the wall clock'
```

Checked live: libuv's `uv_uptime` reads `/proc/uptime` (falling back to `CLOCK_BOOTTIME`) on Linux and `kern.boottime` on macOS. Both include suspend time. On this machine `Date.now() - os.uptime()*1000` equals `sysctl kern.boottime`. The assumption holds on the platforms CI and the maintainer use. The module header should state it, so a later port does not swap in a monotonic, suspend-excluding source.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/core-171-lock-liveness/PLAN.md:13'
  problem: "Containers with a namespaced /proc/uptime (LXCFS) report CONTAINER uptime, so 'boot' becomes 'container start'. That is the correct answer for a restarted container, where pids restart from 1. Two containers sharing a volume AND a hostname is already the documented pid-means-nothing residual. Worth one clause, not a change."
  evidence: '(c) same host: `bootMs()` → when finite, stale iff `Date.parse(startedAt) < bootMs - FUTURE_SKEW_MS`'
```

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/core-171-lock-liveness/PLAN.md:22'
  problem: "The recycled-pid residual's worst case is a committed or hand-edited lock naming pid 1 on this host with a startedAt after the last boot. It used to refuse for up to 6 h; now it refuses until a reboot or a manual delete. Name pid 1 explicitly in the residual so readers do not assume only crash-recycled pids are affected."
  evidence: 'the PID RECYCLING paragraph (residual now lasts until a reboot or a manual delete, not ≤ 6 h'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/core-171-lock-liveness/PLAN.md:20'
  problem: 'The legacy root lock inherits the new rule through checkLegacyLock → isStale. The only legacy test that changes is the re-point to a dead pid, so nothing pins that a LIVE same-host legacy lock older than 6 h now REFUSES. Consider one row.'
  evidence: "re-point 'a STALE root lock (a crashed old run) is broken…' → dead pid `2147483646`"
```

### Trust (P2)

No findings. The new branch reads only `host` (string compare) and `startedAt` (already `Date.parse`-validated). `pid` is still shape-checked before `process.kill`.

### Determinism (P5)

No findings. The `bootMs()` guard falls through to liveness, the refusing side, on any unusable value.

### Scope (P7)

No findings. The three extra comment edits were approved at GATE 1. Each one corrects text that would otherwise state the removed rule.

## Summary

The plan follows the owner's settled decision and the brief. The main concern is an unstated platform assumption behind the boot rule: `os.uptime()` must include suspend time. It holds on Linux and macOS as measured, but it should be written down as an assumption next to the clock-step residual. Smaller items: a container-uptime clause, naming pid 1 in the recycled-pid residual, and an optional test pinning that a live legacy lock older than 6 h now refuses.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor), for the human to weigh. This log gates nothing; `/pharn-dev-build` proceeds on its own floor checks.
