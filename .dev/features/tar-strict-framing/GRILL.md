# GRILL — tar-strict-framing

Plan: `.dev/features/tar-strict-framing/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/tar-strict-framing/PLAN.md:6'
  problem: 'The all-zero tail check must be linear and allocation-free (a byte loop or a single indexOf of a non-zero byte), or a 128 MiB zero tail becomes its own cost.'
  evidence: '`requires every remaining byte to be zero`'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/tar-strict-framing/PLAN.md:8'
  problem: 'Accept both `ustar\0` (POSIX, what git archive writes) and `ustar ` (old GNU) — the check is the 5-byte `ustar` prefix — so a GNU-written fixture or mirror is not refused over the variant.'
  evidence: '`refuses a header without the ustar magic`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/tar-strict-framing/PLAN.md:24'
  problem: 'The oversized-pax eval must fail on the base source by BEHAVIOUR it can observe cheaply (accepted vs refused with the new message), not by timing — a wall-clock assertion is flaky in CI.'
  evidence: '`an oversized g payload refused fast (bounded time, before parsing)`'
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — all folded into the build.
