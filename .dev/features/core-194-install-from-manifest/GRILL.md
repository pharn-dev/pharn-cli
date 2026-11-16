# GRILL — core-194-install-from-manifest

Plan: `.dev/features/core-194-install-from-manifest/PLAN.md` (spec hash `bca940a5…3c4e`, equal to `ARCHITECTURE.md`
this run). GATE 1 approved with four answers (folded into the plan).

## Findings

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: src/lib/install-manifest.ts
  problem: "collectExpectedInstallPaths takes a caller-chosen `layout`; diff.ts passes the PROJECT's recorded layout. A manifest describes the pharn layout only, so answering a `flat` request from it would mix layouts."
  evidence: "diffInstalledCapabilities … layout: the project's recorded layout"
```

Remedy taken into the build: the manifest branch answers only when the requested layout equals the manifest's
(`pharn`); any other request takes the derivation, exactly as today (status already refuses to diff across layouts).
Same rule in `capabilityCloneFiles` (`paths.layout`).

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: tests/commands/uninstall.test.ts
  problem: "A new-surface dir (`.claude/skills/pharn-x/`) left empty after uninstall is a user-visible residue; the plan does not say whether uninstall's empty-dir prune reaches it."
  evidence: "a new-surface file … is deleted by `uninstall`"
```

Remedy: the uninstall test asserts the file is gone and records what happens to its now-empty parents (uninstall
prunes empty parent dirs of deleted files up to the project root, non-recursively — the test pins the behaviour).

```yaml
- type: FINDING
  rule_id: P0
  severity: advisory
  file: src/lib/upstream-manifest.ts
  problem: "readUpstreamManifest reads SKILLS_VERSION for the cross-check; a manifest tree without SKILLS_VERSION throws readSkillsVersion's own error, not an UpstreamManifestError."
  evidence: "`skillsVersion` … equals the tree's `SKILLS_VERSION` (`readSkillsVersion`)"
```

Remedy: accepted — every pharn-oss tree carries SKILLS_VERSION, and `fetchRepo` already reads it for a release; the
error names the file either way.

```yaml
- type: FINDING
  rule_id: P7
  severity: advisory
  file: src/lib/upstream-manifest.ts
  problem: "Re-reading the manifest at each branch point (add calls capabilityCloneFiles per capability) costs a JSON parse + validation each time."
  evidence: "Decision 4: re-read at each branch point"
```

Accepted (orchestrator decision 4): a ~150 KB parse and ~600-entry validation is milliseconds; one parser keeps one
validation path.

## Inline axes with no finding

Trust (P2): every driving field allowlisted; `models.defaults` through the existing gate. Determinism (P5): membership
tests only. Scope (P7): one increment; deletions deferred to the named v0.22.0 ticket.

ADVISORY VERDICT: 4 concerns raised (0 blocking, 2 important folded into the build, 2 advisory accepted).
