# GRILL — vendored-validator-refresh

Plan: `.dev/features/vendored-validator-refresh/PLAN.md` · spec-hash check: `sha256(ARCHITECTURE.md)` =
`bca940a5…3c4e`, equal to the plan's `spec_content_hash` (no drift). Registered grillers:
`count-grillers.mjs` → `{"registered":0}`, so this log is the inline interrogation only.

## Findings

### Determinism / fidelity (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/vendored-validator-refresh/PLAN.md:72"
  problem: "The plan says 'detect upstream's displaced lead' but not that upstream only calls a fence displaced when it also CLOSES; an unterminated block after a blank line is null (no fence) upstream, so the CLI's displaced reason must require the closing \\n--- too or it names the wrong cause."
  evidence: "detect upstream's displaced lead (`/^[\\s\\p{Cf}]+(?=---)/u`) and refuse it with upstream's reason"
```

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/vendored-validator-refresh/PLAN.md:72"
  problem: "Upstream REDs a displaced block only when it declares role:; a role-less displaced file is silently 'not a capability'. The CLI refuses both (verdict equal), but which reason a role-less one gets should be stated rather than left to the build."
  evidence: "validate REDs a role-bearing one (`P6/frontmatter-offset`, blocking)"
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/vendored-validator-refresh/PLAN.md:94"
  problem: "No eval names the order of BOM strip and displaced test: a BOM followed by a blank line before --- (strip one, then displaced) and an unterminated displaced block (missing-fence reason, not displaced) are the two edges where a re-implementation diverges."
  evidence: "new shapes: CRLF, BOM + CRLF → both accept; double BOM, U+200B lead, tab lead → both refuse."
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/vendored-validator-refresh/PLAN.md:107"
  problem: "The displaced rule is held to upstream by a source assertion (a regex over validate.mjs text) — that is a lexical pin, so a refactor upstream that keeps the rule but rewrites the finding call would fail the test without a behaviour change; acceptable, but it should be labelled a lexical pin, not a behavioural one."
  evidence: "held to upstream by the source assertion and the shape rows."
```

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/vendored-validator-refresh/PLAN.md:142"
  problem: "Listing v0.18.1 in KNOWN_TAGS before the tag exists contradicts the test's own comment ('a tag is added here once publish.yml has created it'); the stack decision is the maintainer's, but the PR should say the entry is conditional on #354 releasing 0.18.1 unchanged."
  evidence: "add `v0.18.1` to `KNOWN_TAGS` (see open question 2)"
```

No P2 or P3 findings: the trust audit names the enum gates still applied after the wider read, and
each planned file keeps one reason to change.

## Summary

The plan is a faithful port in scope. The concerns are about the displaced rule's edges — that the
CLI's "displaced" reason should fire exactly when upstream's `looseFrontmatter` returns
`displaced: true` (lead + a fence that closes), and that the edge shapes (BOM then blank line;
unterminated displaced block) get rows — plus two labelling points (lexical pin; conditional tag).

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to
weigh before /pharn-dev-build. This is not a judgment that the plan is sound.
