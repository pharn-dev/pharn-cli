# GRILL — c83-remove-derivation-fallback

Plan: `.dev/features/c83-remove-derivation-fallback/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's `spec_content_hash` (no drift).
Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

### Trust (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: important
  file: ".dev/features/c83-remove-derivation-fallback/PLAN.md:22"
  problem: "The coordinator asked for the refusal to name the fetched version. That version (SKILLS_VERSION, or a release tag) is untrusted tree data, and the plan says the message quotes nothing from the tree."
  evidence: "the new absent-manifest message quotes nothing from the tree"
```

Resolution for build: put the tree's `SKILLS_VERSION` (read through `readSkillsVersion`, already `VERSION_RE`-checked) in the message, passed through `escapeUnsafe` anyway. Test the escape with a hostile value.

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/c83-remove-derivation-fallback/PLAN.md:63"
  problem: "The coordinator's case (a): the refusal on an explicit old ref. The evals list only 'release and --ref main' at fetchRepo, plus generic command-suite refusals. `--ref` accepts only `latest`/`main` (REF_CHOICES), so an 'old ref' can only arrive as a resolved release tag older than 7.21.0 or as a main tip without a manifest."
  evidence: "a tree without `pharn-install.json` (release and `--ref main`)"
```

Resolution for build: command-suite tests for `init` (default release resolving to `v7.20.0`, unsealed tree), `init --ref main` (unsealed tip), and `update --ref latest` / `update --ref main` against unsealed trees. Each must exit 1 with the refusal, write nothing and leave no clone.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/c83-remove-derivation-fallback/PLAN.md:66"
  problem: "The coordinator's case (b): a project installed from an old (flat or pre-7.0) pharn-oss must still update to the latest release. The plan rewrites those scenarios with `seedInstall`, but no eval states the end state: config layout `pharn`, records rewritten, root docs retired."
  evidence: "a seeded `flat` install updates to `pharn` (layout move); a seeded pre-7.0 install's root docs are retired"
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/c83-remove-derivation-fallback/PLAN.md:48"
  problem: "A seeded old install is only evidence if its records are the shape a real install wrote: CRLF-folded `contentHash` keys plus a stamp. A hand-rolled hash would test a store no install produces."
  evidence: "a `seedInstall` helper writes an old install's files + config + records directly"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/c83-remove-derivation-fallback/PLAN.md:48"
  problem: "Sealing at serve time must leave alone a tree that already carries `pharn-install.json`. The existing CORE-194 tests make the manifest disagree with the tree on purpose (to prove the manifest was the source, or to break it), and a reseal would silently turn those into passes."
  evidence: "the fetch stub serves every tree sealed with a manifest computed at serve time"
```

### Determinism / process (P5, P6)

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/c83-remove-derivation-fallback/PLAN.md:94"
  problem: "The `## Open questions (HALT)` section still lists Q1–Q4. The coordinator answered all four ('as designed'), but the plan does not record the answers, so a reader or a build gate sees open questions."
  evidence: "## Open questions (HALT)"
```

### Scope (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/c83-remove-derivation-fallback/PLAN.md:31"
  problem: "The features-readme relocation trigger changes source, from a clone file probe to install-set membership. The two agree on a sealed tree, but the relocation must still be reported for a seeded install that recorded the root `features/README.md`."
  evidence: "`update-plan`'s features-readme relocation = records hold root `features/README.md` AND the install set holds `pharn/features/README.md`"
```

## Summary

The plan's core move is sound on its own terms: one refusal point inside `fetchRepo`'s cleanup `try`, branch points reduced to projections, and dead parameters dropped. Its main gaps are evidence:

- the two cases the coordinator named (the old-ref refusal across commands, and old-install → latest update) need explicit command-suite tests with stated end states;
- the version in the message needs `escapeUnsafe`;
- the harness must not reseal a tree that already carries a manifest, and seeded records must be real-shaped.

The open questions are answered upstream but not recorded in the plan.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 4 important, 3 minor), for the human to weigh before /pharn-dev-build. This is not a judgment that the plan is good.
