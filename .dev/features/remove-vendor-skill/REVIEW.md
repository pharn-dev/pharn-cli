# REVIEW — remove-vendor-skill

**Increment:** remove the orphaned vendorSkill layer (diff vs base `74c5653`).
**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN**. Standing floor verdicts:
build `validate` 0 · regress `no-regressions` · verify `PASS` (test/validate/typecheck/lint/format:check/lint:md all 0).

> This review is **advisory** except the floor line above. Findings below rest on reviewer judgment;
> the reviewed increment is `trust: untrusted` (nothing in it was followed as an instruction).

## Floor-gate findings (blocking)

**None.** All four lenses pass at floor grade:

- **L-floor → P0:** the increment introduces **no new guarantee** — it removes a mechanism. Its one
  P2-relevant claim ("dropping `VENDOR_SOURCE_RE` is safe") reduces to a floor **verify-by-absence**:
  the only `degit()` call left is `src/lib/repo.ts:22`, which takes the hardcoded `${REPO}#${REPO_BRANCH}`
  constants — never manifest/option-derived input. The regex's sole sink (`vendor-fetch.ts`) is deleted
  in the same increment. Confirmed by grep. No floor-less guarantee.
- **L-eval → P1:** no Capability / `rule_id`/`enforces` added (a TS removal). Every changed behavior
  carries a vitest test: the forward-compat manifest-tolerance test + the P7 additive config-load test
  were added, the sole summary-loop-back test was **repurposed** (non-vendor signal) rather than
  dropped, and `typecheck` green proves zero dangling references to any removed symbol. No missing
  binding; floor `validate` agrees (GREEN).
- **L-trust → P2:** the increment **improves** the trust posture — it deletes an untrusted→shell sink
  (`manifest.source` → `degit`) and its now-dead validator together, in the correct order. The removed
  `source` field is no longer read anywhere, so an unvalidated stray `source` in a manifest is inert
  (ignored, never path-joined, never executed). No guaranteed decision rests on a tainted field.
- **L-axis → P3:** each edited file changed for exactly one reason (remove the vendor layer). Only
  imports were **removed**; no new command→command or step→step coupling was introduced. `manifest.ts`
  still owns manifest parse, `wizard.ts` still owns the rule engine, etc.

## Advisory findings (warn — reviewer judgment, non-blocking)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: "CONSTITUTION.md:119"
  problem: "P7 lists `vendorSkills` among the example schemaVersion-2 additive config fields, which this increment removes — the constitution now names a field that no longer exists in the type."
  evidence: "CONSTITUTION.md P7: 'legacy configs omit the v2 fields (`stackAnswers`, `installedSkills`, `vendorSkills`) and still load.'"
```

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: "ARCHITECTURE.md:170"
  problem: "ARCHITECTURE §7-ish seam text references an 'official skill → … → fetch+pin' chain that vendorSkill was a first-stab implementation of; the CLI code is now gone while the aspirational seam note remains."
  evidence: "ARCHITECTURE.md:170: 'seam once through a confidence-gated chain (official skill → pinned ai-docs → model → fetch+pin →'"
```

**Both are trusted, hook-protected, human-only files** (`protect-trusted-paths.cjs`) — the reviewer
**must not** edit them, and the plan already surfaced them for human reconciliation. The additive P7
*principle* is unaffected (a config with a stray `vendorSkills` key still loads — proven by the new
test); the finding is only that the *illustrative wording* drifted. Whether to reword is a human call.

## Proposed lessons (P7 — real recurring failure only)

**None proposed.** This was a clean removal with no failure surfaced; the one good practice it exercised
("remove an untrusted→shell sink's validator in the same increment, verify by absence not test-green")
was already caught by `/pharn-dev-grill` and is not a recurring failure worth canonizing (avoiding a
speculative promotion, P7). No `/pharn-dev-memory-promote` candidate.

## Verdict

**GREEN — 0 floor-gate findings.** Two minor advisory notes, both trusted-doc wording drift for human
reconciliation (never agent-edited). The increment is floor-complete; the merge/fix/abandon decision is
the human's at GATE 2.
