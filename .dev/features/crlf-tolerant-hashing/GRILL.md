# GRILL — crlf-tolerant-hashing (ADVISORY)

Plan: `.dev/features/crlf-tolerant-hashing/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: '.dev/features/crlf-tolerant-hashing/PLAN.md:36'
  problem: "The claim 'every comparison uses contentHash, so no comparison can mix a folded and a raw hash' has no floor: a later change (the concurrent F-12 orphan detection also hashes record keys) can call sha256File again and silently reintroduce the CRLF defect for its path. Pin it with a static test — no file under src/ other than lib/hash.ts may call sha256File."
  evidence: 'Both sides of every comparison use the same function, so no comparison can mix a folded and a raw hash'
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/crlf-tolerant-hashing/PLAN.md:93'
  problem: "Every planned integration eval writes CRLF by hand, so nothing exercises the actual phenomenon (git's core.autocrlf checkout). git is present on the ubuntu runner and core.autocrlf=true converts LF→CRLF on checkout on Linux too; one test that commits LF files, re-checks them out with -c core.autocrlf=true and asserts zero drift would demonstrate the platform-independent half of the claim (still not Windows)."
  evidence: 'verified with CRLF bytes on ubuntu, NOT run on Windows nor under a real git autocrlf round-trip in CI'
- type: FINDING
  rule_id: P1
  severity: minor
  file: '.dev/features/crlf-tolerant-hashing/PLAN.md:76'
  problem: "A random corpus over {a,\\r,\\n,\\0} rarely reaches the 8000-byte boundary; add fixed cases for a NUL at index 7999 (binary) vs 8000 (text), and a \\r at index 7999 followed by \\n at 8000 (the fold must not care about the sniff boundary)."
  evidence: 'differential: for a generated corpus of byte strings over `{a, \r, \n, \0}`'
- type: FINDING
  rule_id: P4
  severity: minor
  file: '.dev/features/crlf-tolerant-hashing/PLAN.md:13'
  problem: 'THREAT-MODEL.md §4c cites apply-update.ts:44, :57-61 and diff.ts:79 by line (already drifted before this change). Keep the call-site edits line-count-neutral in those two files, and refresh the citations in the GATE-2 hand-over text since the agent cannot edit the file.'
  evidence: "`src/lib/apply-update.ts:87` `readDiskState` → `{kind:'file', hash}`"
- type: FINDING
  rule_id: P0
  severity: minor
  file: '.dev/features/crlf-tolerant-hashing/PLAN.md:32'
  problem: "'git never line-converts a buffer containing a NUL' is a statement about git's convert.c, not something this repo tests; label it advisory in the hash.ts comment and docs (it only explains why the rule is safe; no guarantee rests on it)."
  evidence: 'git never line-converts a buffer containing a NUL, so every file this rule calls binary is one `core.autocrlf` leaves byte-exact'
- type: FINDING
  rule_id: P7
  severity: minor
  file: '.dev/features/crlf-tolerant-hashing/PLAN.md:39'
  problem: 'The stated cost should also say that a CRLF-only file stays CRLF on disk after a no-op update (pharn does not rewrite it) — otherwise users may expect update to normalize their tree.'
  evidence: 'a change that ONLY swaps line endings in a text file is not a change to pharn'
```

## Summary

The plan is narrow and correctly targets the one primitive every comparison funnels through; the old-store compatibility argument rests on a measured upstream fact (0 CRLF / 0 NUL at 6.58.0) and degrades to a fail-safe skip, which is honest. The two concerns worth acting on before build: (1) the "one comparison hash" invariant is only true today — pin it with a static test so a concurrent or future hashing site cannot quietly use the raw function; (2) demonstrate the real git autocrlf round-trip on Linux rather than only hand-written CRLF fixtures. The rest are boundary-case evals and wording.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 2 important, 4 minor) — for the human to weigh before /pharn-dev-build. This grill-log gates nothing.
