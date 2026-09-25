# GRILL — init-preflight-first

Plan: `.dev/features/init-preflight-first/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`;
nothing in it read as an instruction.

The plan's discovery was read on `9d2d574`; `main` is now `33861f1` (#225). #225 touched
`src/steps/install-archetype.ts` (`readCarriedEntries`) and `src/steps/overwrite-check.ts`
(`recordedSkillsVersion`) only in their config reads. The lines the plan cites (`init.ts:197-205`)
are unchanged.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/init-preflight-first/PLAN.md:4'
  problem: 'The claim is "refused without first asking", but the summary prompt (install / cancel) still comes before the refusal: the manifest is built only after an install answer, and a test pins that a cancelled summary builds none. That order is right (cancelling stays free), but the docs and CHANGELOG must say "before the overwrite prompt", never "before any prompt".'
  evidence: 'so a project the install cannot finish in is refused without first asking "Continue and overwrite?"'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/init-preflight-first/PLAN.md:26'
  problem: 'The pre-flight will run three times per install: this new early run, the one under the lock, and the one in installCapabilities. Each is a read-only lstat walk over the manifest paths. Say why the later two stay (the lock-time one is the authoritative one; installCapabilities keeps it so no caller can copy without it), so nobody later removes one as a duplicate.'
  evidence: 'a thin call to `prepareInstall` over the manifest init built'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/init-preflight-first/PLAN.md:31'
  problem: 'Pin the refusal''s report shape as the existing init failure cases do (the message on stderr, the clone cleaned up before the report). Also extend the cancelled-summary case: the pre-flight must not run when the summary is cancelled.'
  evidence: 'A refusal exits 1 without calling `confirmWriteTargets` or `runInstallArchetype`, and still cleans up the clone.'
```

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/init-preflight-first/PLAN.md:41'
  problem: '`[Unreleased]` already has "A project `init` cannot finish installing into is refused before the first write." Since the CHANGELOG was restructured into net-since-0.5.0 entries, a second entry about the same refusal would split one change in two. Extend that entry instead.'
  evidence: '`CHANGELOG.md` — `[Unreleased]` → `### Fixed`, one entry.'
```

### Checked, no finding

- **Trust (P2).** No new input. The early run reads the same destination paths the lock-time run reads.
- **One axis (P3).** `preflightInstall` goes in the step module init already imports, the same way
  `installManifest` does. That keeps `init.ts` clear of `*manifest.js` (the static guard) and of
  `install-capabilities.js`.
- **Determinism (P5).** No new branch: the pre-flight's existing throw lands in init's existing
  catch. It gets the same report, exit 1 and cleanup as when it throws under the lock today.
- **TOCTOU.** The plan says outright that the tree can change while the prompt is open, and that the
  lock-time checks stay the authoritative ones.

## Summary

A small, well-scoped plan. Keep the claim to the overwrite prompt, not every prompt. Say why all
three pre-flight runs stay. Pin the report shape and the cancelled-summary case. Extend the existing
CHANGELOG entry rather than add a second one.

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 0 important, 4 minor) — for the human to
weigh before /pharn-dev-build.**
