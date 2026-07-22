# GRILL — npm publish metadata (PLAN.md interrogation)

- Plan under interrogation: `.dev/features/npm-publish-metadata/PLAN.md`
- Spec-hash check: **GREEN** — `sha256(ARCHITECTURE.md)` = `bca940a5…d3c4e` matches the plan's carried `spec_content_hash` (no drift).
- Griller discovery (`count-grillers .`): 81 registered, **all inside gitignored `test-*/` scratch installs** — none are the repo's own dev-loop grillers. Not run (irrelevant app-review grillers over a packaging plan; see summary). Interrogation is the inline Step 2 axes + a testability lens.
- **This grill-log is ADVISORY — it gates nothing** (P0). It surfaces concerns for the human/builder to weigh; it is not a pass/fail on `/pharn-dev-build`.

## Findings (finding-shape objects; enum-gated fields = my assertions, free-text = quoted plan DATA)

### Axis: Discovery / build-gate readability (P6)

```yaml
- type: FINDING
  rule_id: P6
  severity: important
  file: ".dev/features/npm-publish-metadata/PLAN.md:58"
  problem: "The `## Open questions (HALT)` section still lists 5 questions; resolution lives only in a separate `## Decisions` section (line 66). /pharn-dev-build Step 1.1 HALTs on an *unresolved* `## Open questions (HALT)` — a reader (or the build agent) could read the section as still-open."
  evidence: "## Open questions (HALT) ... 1. **`engines`** — keep `>=20` ... (5 questions listed)"
```

_Not strictly blocking_ (the `## Decisions` block does resolve all five, human-approved), but the gate is an agent-read judgment — tighten the section so it is unambiguously resolved **before** build. Recommended fix applied at build: annotate the section as RESOLVED and point to `## Decisions`.

### Axis: Guarantee-audit precision (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/npm-publish-metadata/PLAN.md:47"
  problem: "The load-bearing 'no behavior change to CLI commands' claim is labeled deterministic but names no concrete check that asserts it — `npm run check` GREEN does not by itself prove `src/` is untouched."
  evidence: "\"no behavior change to CLI commands\" -> **floor-ish: deterministic** — the diff touches **no** `src/` file, and `npm run check` ... stays GREEN."
```

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/npm-publish-metadata/PLAN.md:44"
  problem: "'zero dev/test junk' is stated as 'asserted at build, not judged', but the `npm pack --dry-run` *listing* is the floor primitive; concluding 'no junk' from that list is an advisory read of it — a small floor-vs-advisory imprecision."
  evidence: "\"`files: [\"dist\"]` ships exactly the runtime, zero dev/test junk\" -> **floor: deterministic** — the `npm pack --dry-run` tarball listing (asserted at build, not judged)."
```

### Axis: Discovery of live state (P6) — provenance precondition

```yaml
- type: FINDING
  rule_id: P6
  severity: minor
  file: ".dev/features/npm-publish-metadata/PLAN.md:24"
  problem: "`repository.url` is asserted 'EXACT' but no check verifies it matches the building repo's actual git remote. A drift here does not fail locally — it fails provenance attestation late, in the PR2 publish CI."
  evidence: "`repository`: `{ \"type\": \"git\", \"url\": \"git+https://github.com/pharn-dev/pharn-cli.git\" }` (EXACT — provenance attestation validates this against the building repo)"
```

## Prose summary (concerns for the human/builder to weigh)

The plan is well-scoped and its guarantee audit is honest (the provenance claim is correctly labeled *advisory-from-this-repo*, the trust audit N/A is correct — no untrusted input is ingested). Concerns are precision + verification, not soundness:

1. **Build-gate readability (important).** The one actionable pre-build item: make the `## Open questions (HALT)` section read as resolved so `/pharn-dev-build`'s HALT check is trivially satisfied. Fixable in one edit.
2. **Name the deterministic checks (minor).** Two load-bearing claims — "no `src/` changed" and "zero junk in the tarball" — should each cite the concrete command that verifies them (`git diff --name-only` shows no `src/**`; the `npm pack --dry-run` file list is inspected). Building will run exactly these, so this is a wording tightening, not new work.
3. **Provenance precondition (minor).** Add a build-time confirmation that the declared `repository.url` matches `git remote get-url origin`, so a wrong URL fails now, not in the PR2 publish.

**Out of scope for this increment (dev-tooling observation, not a plan defect):** `count-grillers .` (and by extension the verify-stage counters) register 81 capabilities from gitignored `test-*/` scratch installs — the pharn-cli repo's own dev-loop has none. The discovery scan should probably exclude gitignored/scratch trees. Flagged for the human; unrelated to publishing the package.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (1 important-severity, 3 minor) — for the human/builder to weigh before `/pharn-dev-build`.** None is blocking; the important one is a one-edit readability fix I will apply at the top of the build stage. This is not "grill passed" and not a guarantee the plan is sound — it is the surfaced set of concerns.
