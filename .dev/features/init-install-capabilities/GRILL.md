# GRILL — init-install-capabilities

Plan interrogated: `.dev/features/init-install-capabilities/PLAN.md`. Spec-hash check: **MATCH**
(`sha256(ARCHITECTURE.md)` = `bca940a5…` == plan `spec_content_hash`; no drift). Registered grillers:
`count-grillers.mjs .` → **0** (pharn is the CLI repo, not a methodology-capability repo) → inline
interrogation only. **This whole log is ADVISORY — it gates nothing** (`/pharn-dev-build` is not blocked by any
finding here). Free-text `problem`/`evidence` quote the (untrusted) plan as DATA.

## Findings — by axis

### P2 / P7 — untrusted copy over a user-owned file

```yaml
- type: FINDING
  rule_id: P2
  severity: important
  file: ".dev/features/init-install-capabilities/PLAN.md:28"
  problem: "The copy force-overwrites the user's existing .claude/settings.json with no merge or guard, silently clobbering their Claude Code permissions/hooks/config."
  evidence: "Copies ... the fixed product surfaces (... `settings.json` ...) to mirrored project-root paths"
```

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/init-install-capabilities/PLAN.md:29"
  problem: "Installing settings.json + the three hooks activates PreToolUse write-gating (protect-trusted-paths + enforce-writes-scope) across the user's whole repo, but the confirm/summary step is not planned to disclose this behavior change."
  evidence: "clack UI: show detected archetypes + selected/skipped capabilities ... return 'install' | 'cancel'"
```

### P6 — cross-command state; unverified format assumption

```yaml
- type: FINDING
  rule_id: P6
  severity: important
  file: ".dev/features/init-install-capabilities/PLAN.md:65"
  problem: "The archetype config (modules:[], capabilities:[...], no constitution) is a new shape that the sibling commands add/update/remove/list/status were built to read as module/manifest installs; the plan never states how they behave when handed it (upstream has no manifest, so update/status/list could crash or emit confusing errors)."
  evidence: "an **archetype** config (`archetypes` + `capabilities` + `modules:[]`, no `constitution`) reads + round-trips"
```

```yaml
- type: FINDING
  rule_id: P6
  severity: important
  file: ".dev/features/init-install-capabilities/PLAN.md:88"
  problem: "SKILLS_VERSION is validated with VERSION_RE (/^\\d+\\.\\d+\\.\\d+.../), but the live file's actual format was never read this run — if upstream ships e.g. \"0.80\" (two-part), a valid install hard-fails on the version check."
  evidence: "`SKILLS_VERSION` → read + validated (`VERSION_RE`) before persisting."
```

### P1 — eval coverage gap

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/init-install-capabilities/PLAN.md:29"
  problem: "steps/archetype-summary.ts adds behavior (selected/skipped rendering + confirm→install/cancel mapping) but no tests/archetype-summary.test.ts is planned; every other step (summary.ts) has a test."
  evidence: "`src/steps/archetype-summary.ts` — **NEW** — clack UI ... return 'install' | 'cancel'"
```

### P7 — scope bundling (surfaced; human already authorized)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/init-install-capabilities/PLAN.md:10"
  problem: "The increment bundles ~5 independently-shippable units (frontmatter parse boundary, copy routine, summary UI, config schema, flag wiring); the plan flags this and the human authorized it, but the broad surface raises regression risk and each unit's tests must green independently, not in aggregate."
  evidence: "This increment is **deliberately larger than P7's default \"smallest coherent increment\"** — the human authorized that at the plan gate."
```

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/init-install-capabilities/PLAN.md:28"
  problem: "Re-install behavior is unspecified: the copy only adds/overwrites SELECTED capabilities and never prunes ones now inapplicable, so a project whose archetypes changed between runs accumulates orphan grillers/lenses (the config-overwrite guard covers the JSON, not the copied dirs)."
  evidence: "Copies each **selected** griller/lens dir ... to **mirrored** project-root paths."
```

### P3 / P5 — axis + determinism edges

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/init-install-capabilities/PLAN.md:27"
  problem: "capability-index.ts carries two plausibly-distinct axes — directory enumeration strategy AND the strict frontmatter field-reader; the plan defers the split, which is a judgment call review should watch if the field-reader grows or gets reused."
  evidence: "enumerate ... read each `<dir>/<dir>.md`, extract **only** `name`/`role`/`applies` via a **strict field reader**"
```

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/init-install-capabilities/PLAN.md:27"
  problem: "The parser's handling of an empty `applies: []` is unspecified — it would pass the per-token enum check and become an always-skipped capability rather than a hard-fail; decide explicitly (reject as malformed vs accept-as-never) so the branch stays a deliberate membership test."
  evidence: "each `applies` token ∈ `{universal,ssr,backend,spa,lib}` ... `universal` mixed with archetypes → hard-fail"
```

## Prose summary

The plan is well-grounded and its guarantee/trust/determinism audits are unusually honest (it labels
the advisory "the methodology is safe" claim, inherits the fetch guards rather than re-claiming them,
and flags its own over-P7 scope). The interrogation surfaced **nine** concerns, none blocking the
floor:

- The two **important** operational risks are **(a)** force-overwriting the user's `.claude/settings.json`
  (a user-owned file) with no merge/guard, and **(b)** the archetype config being a new shape the
  sibling commands (`update`/`status`/`list`/`add`/`remove`) were not built to read — both are
  cross-cutting effects the plan's "only `init --archetype`" framing understates.
- One **important** correctness assumption is unverified live: `SKILLS_VERSION`'s format vs `VERSION_RE`
  (a mismatch hard-fails a valid install) — cheap to confirm at build.
- One **important** P1 gap: the new summary step has no planned test.
- The remaining are **minor**: the honest-but-large bundle (regression risk), unspecified re-install
  pruning, the capability-index two-axis deferral, the `applies: []` edge, and the undisclosed
  write-gating-hook activation.

Recommended (advisory) for `/pharn-dev-build`: guard/merge or at minimum warn before overwriting
`settings.json`; add the `archetype-summary` test; read the live `SKILLS_VERSION` and pick a validation
regex that matches it; and state (even if "out of scope, undefined") how the sibling commands treat an
archetype config so they fail gracefully rather than crash.

ADVISORY VERDICT: 9 concerns raised (4 important-severity, 5 minor) — for the human to weigh before
/pharn-dev-build. Nothing here blocks the floor; `/pharn-dev-build`'s own gates (spec-hash, open-questions,
validate) are unaffected.
