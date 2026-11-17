# REVIEW — core-179-trim-docs (C4.6, CORE-179)

Floor first: `node .dev/floor/validate.mjs .` is GREEN, and the verify gates are PASS after the last edit (verify-report.json). Everything below is advisory.

One content-loss audit ran as a separate subagent with no anchoring on the author's view: it compared each old file (`git show HEAD:`) with the whole new doc set. It reported about 30 facts missing after the first draft and 4 possible factual changes. All of them were restored or corrected before this review, except the ones listed under "Moved upstream" below.

## Floor-gate findings

None.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: "docs/commands/update.md:1"
  problem: "The three files sit just under their caps (update.md 349/350, troubleshooting.md 448/450, README.md 247/250). The next docs change to any of them can break the acceptance line, and nothing in CI enforces the caps."
  evidence: "wc -l → 349, 448, 247"
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "README.md:118"
  problem: "The write-guard postures (installed vs unsignalled tree, active.json markers) and the Stop guard's details (bounded, fails open, no matcher, wired upstream since 6.12.0) now live only upstream (pharn-oss README 'What gets installed' and LIMITS.md), as the ticket asks. This doc set keeps the three bullets and the Bash-bypass caveat."
  evidence: "What the write guards allow and deny, and the full set of bounds, are in upstream's README and LIMITS.md"
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "src/commands/update.ts:441"
  problem: "Code comments in update.ts still mention 'the root migration' and 'every root doc it deletes', behaviour #412 removed. The docs now say what the code does. The stale comments are outside this docs-only ticket and are a follow-up candidate."
  evidence: "(the version bump, the executable-unit hold, the root migration)"
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "CHANGELOG.md:167"
  problem: "Released CHANGELOG entries had six link targets repointed (link text and entry text unchanged, verified by a diff with link targets stripped). The pre-existing broken support-policy anchor at CHANGELOG.md:82 is left as it is."
  evidence: "docs/reference/update-advanced.md#the-executable-unit-is-upgraded-all-or-none"
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/core-179-trim-docs/PLAN.md:58"
  problem: "The src-name check covers src paths, links into src/, basenames and exported functions/consts. A non-exported internal name that is also an English word cannot be told from prose. This residual is named, not closed."
  evidence: "srcnames-grep.sh"
```

L-trust (P2): no untrusted input, and no instruction-looking content in the reviewed docs or the subagent report changed behaviour. The report carried a harness 'settings-json' pattern flag, which turned out to be plain mentions of `.claude/settings.json`. L-axis (P3): docs only, so no sibling imports. L-eval (P1): no capability or rule_id was added.

Verdict: GREEN (0 floor findings, 5 advisory).

Proposed lesson (not written to canon): when a doc page is trimmed, run a separate old-vs-new fact audit before review. The first draft here silently dropped about 30 user-facing facts that line-count and lint gates cannot see.
