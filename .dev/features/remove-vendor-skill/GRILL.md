# GRILL — remove-vendor-skill

Plan: `.dev/features/remove-vendor-skill/PLAN.md` · spec-hash check: **MATCH**
(`bca940a5…d729d3c4e` == plan's `spec_content_hash`; no drift). Registered grillers:
**0** (`.dev/floor/count-grillers.mjs .` → `{"registered":0}`) — inline axes only.

> This grill-log is **ADVISORY end-to-end**. Every finding rests on model judgment and gates nothing;
> `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved HALT questions) + `validate.mjs` are the only
> deterministic backstops. The `problem`/`evidence` fields quote the plan (`trust: untrusted`) as DATA.

## Findings

### Axis: Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/remove-vendor-skill/PLAN.md:90"
  problem: "The 'preserves vendor consent across a summary loop-back' test is the ONLY test exercising the summary loop-back (runSummary → 'back'); deleting it per the test-edit list removes all loop-back coverage unless it is repurposed, not just dropped."
  evidence: "Plan L90: 'summary go back still preserves prior answers, asserted via a non-vendor signal … (Build directive: confirm this before deleting the old assertion.)' — grounded: tests/init-v2.test.ts:132–147 is the sole test using runSummary.mockResolvedValueOnce('back')."
```

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/remove-vendor-skill/PLAN.md:85"
  problem: "The plan claims manifest.ts 'silently ignores stray source/vendorSkill keys' (forward/backward compatible, a P7 old-pin concern), but the wizard fixture is being stripped of those keys — so after the edit no parse test feeds an option carrying them, leaving the compat claim asserted-but-unexercised."
  evidence: "Plan L85: 'parsing a wizard option ignores stray vendorSkill/source keys (no throw, not present)'. The fixture edit (tests/wizard-fixture.ts) and the manifest-v2 edit remove the only options that currently carry those keys."
```

### Axis: Guarantee-audit completeness / trust propagation (P0, P2)

```yaml
- type: FINDING
  rule_id: P2
  severity: important
  file: ".dev/features/remove-vendor-skill/PLAN.md:96"
  problem: "The reduction for dropping VENDOR_SOURCE_RE names 'check-verify/typecheck/test green' as the backstop, but a green test suite does not verify the ABSENCE of an untrusted→shell sink; the actual floor check is a grep proving no remaining degit() call receives manifest-derived input. 'verify-by-absence' should name that scan, not lean on test-green as a P2 proof."
  evidence: "Plan L96–99: 'floor (verify-by-absence): its guarded sink (source → degit …) is deleted … grep for fetchVendorSkills / a degit(...source...) call returns nothing … check-verify/typecheck/test green backstops it.' The grep IS the floor step; test-green is a separate, weaker signal."
```

## Prose summary

The plan is a well-scoped, discovery-grounded removal. Boundary (vendorSkills-only, `source`/
`VENDOR_SOURCE_RE` co-removed, `installedSkills`/capability-install kept) is correct and confirmed by
the human at GATE 1; the independence of the archetype capability install and the passthrough config
loader (P7) are verified in the plan, not assumed. Three concerns, all **important, none blocking**:

1. **Loop-back coverage (P1)** — the deleted vendor test is the sole exerciser of the summary
   `'back'` path. The plan already flags "confirm before deleting"; this finding sharpens it to a hard
   obligation: **repurpose** the test to assert loop-back via `installedSkills`/`stackAnswers`, don't
   just delete it.
2. **Untested forward-compat (P1/P7)** — the "manifest ignores stray keys" claim (which protects old
   v2 pins that shipped `source`/`vendorSkill`) needs a test that actually feeds those keys, since the
   fixture that carries them today is being stripped.
3. **P2 reduction wording (P0/P2)** — the `VENDOR_SOURCE_RE` removal is genuinely safe (the sink is
   deleted in the same increment), but the audit should point at the grep as the floor check rather
   than at test-green.

The trusted-doc reconciliation (`CONSTITUTION.md` P7, `ARCHITECTURE.md` L170) is handled correctly —
surfaced for a human, never agent-edited (hook-protected). No P3/P5 concerns: each file edit stays
single-axis and no branch is added.

## Verdict

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 important, 0 minor) — for the human to
weigh before /pharn-dev-build.** All three are coverage/wording refinements the build can absorb; none
blocks. This is NOT a statement that the plan is guaranteed sound — it is a surfaced set of concerns.
