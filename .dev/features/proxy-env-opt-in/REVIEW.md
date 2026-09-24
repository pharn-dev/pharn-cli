# REVIEW — proxy-env-opt-in

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** the three states reduce to membership of `--use-env-proxy` in
  `process.allowedNodeEnvironmentFlags` and exact token/string checks on `NODE_USE_ENV_PROXY`,
  `execArgv` and `NODE_OPTIONS` (whole tokens — grill #1). Whether a given proxy works is not claimed.
- **L-eval (P1):** 10 new cases (detection matrix incl. the substring trap; three messages) fail on the
  base source; the pre-existing tests were updated deliberately — the "any platform" assertion became
  "by default", which is what is now true. Measured on this host: Node 22.22.2 honours the opt-in;
  Node 20.20.2 does not and rejects the flag.
- **L-trust (P2):** the proxy value is still rendered only through `redactProxyUrl`.
- **L-axis (P3):** detection in `proxy-env.ts`, wording in `proxy-env-format.ts` — the existing split.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'LIMITS.md'
  problem: 'LIMITS.md §3a and THREAT-MODEL.md still state pharn cannot use a proxy at all; they are human-only (write-protected at the floor), so a maintainer must align them with the opt-in.'
  evidence: 'The download connects DIRECTLY, and fails if direct egress is blocked (LIMITS.md §3a).'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 2 advisory findings. No lesson proposed for canon.
