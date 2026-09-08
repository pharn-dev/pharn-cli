# GRILL — install-features-readme (ADVISORY — gates nothing)

Spec-hash: matches live `sha256(ARCHITECTURE.md)` — no drift. `count-grillers.mjs` → 0 registered; inline axes only.

> The plan is `trust: untrusted` DATA.

## Findings

```yaml
- type: FINDING
  rule_id: "P2"
  severity: important
  file: ".dev/features/install-features-readme/PLAN.md:33"
  problem: "The plan says the two sides use different symlink postures (`isSymlink` at the path vs `findSymlinkComponent` over every component) but does not test the case where they DISAGREE — a symlinked `features/` PARENT directory, which the writer's leaf-only check does not see."
  evidence: "the writer refuses a symlink at the path, the mirror refuses a symlinked component anywhere below the repo root"

- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/install-features-readme/PLAN.md:20"
  problem: "Correcting a stale comment left by the previous increment is right, but the plan does not say whether any OTHER site carries the same stale claim — so the fix could be one of several and the reader cannot tell."
  evidence: "That became false in the previous increment (`d7c8f52`), which missed this one comment."

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/install-features-readme/PLAN.md:47"
  problem: "The plan states the existing-install window honestly but does not say what a user should DO about it, which is the part a CHANGELOG reader actually needs."
  evidence: "`status` will report it `missing` (and `--strict` exits 1) until the next upstream version bump or a `pharn update --force`."
```

## Resolutions carried into the build (advisory)

1. **Finding 1 → grep for every stale site first, then test the disagreement.** A symlinked `features/` parent is added as a case: the mirror must omit the key. The writer's behaviour there is recorded as measured, not assumed — if `cpSync` writes through it, that is a real asymmetry worth naming rather than papering over.
2. **Finding 2 → sweep before editing.** `grep -rn "THREAT-MODEL/LIMITS"` over `src/` establishes the full set of stale sites, and the result is recorded so "one comment" is a measurement.
3. **Finding 3 → the CHANGELOG names both exits explicitly** (wait for the next upstream `SKILLS_VERSION` bump, or run `pharn update --force` now, whose casualties are backed up first).

## Verdict (ADVISORY — does NOT block)

Small, lockstep, guarded by an existing mirror pin. Three findings, one of which (the parent-symlink asymmetry) is worth measuring rather than assuming.
