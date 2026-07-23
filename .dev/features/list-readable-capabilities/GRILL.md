# GRILL — list-readable-capabilities

Plan: `.dev/features/list-readable-capabilities/PLAN.md`.
Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's `spec_content_hash` (no drift; `/pharn-dev-build` re-enforces this as a floor-gate).
Griller discovery (`count-grillers.mjs`): 81 registered, but every hit is a duplicated copy under the gitignored `test-*/` fixture installs (not a canonical source tree). The intended axis today is **testability**, applied inline below.

This grill-log is **ADVISORY end-to-end** (P0). Nothing here blocks `/pharn-dev-build`; the free-text `problem`/`evidence` fields quote the (untrusted) plan as DATA.

## Findings

### Axis: architecture / one-axis-of-change (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/list-readable-capabilities/PLAN.md:17"
  problem: "The new capability-groups.ts bundles two things that change for different reasons: the ROLE_GROUPS ordering constant SHARED by picker + list, and renderCapabilityLines, a list-only note-body renderer — a picker restyle and a list restyle would each touch this one file."
  evidence: "Owns the single source of truth for capability role-group display: the ordered ROLE_GROUPS ... plus renderCapabilityLines(inv) — a pure inventory -> string[] renderer for the note body"
```

Weigh at build: if the line-renderer is genuinely list-only, it could live in `commands/list.ts` (or `lib/format.ts`) with ONLY the shared `ROLE_GROUPS` extracted to a small shared module — keeping the shared file to one reason (ordering) and the list rendering with its verb. The plan's single-file choice is defensible (both are "capability role-group presentation") but the two-reasons risk is real; state which reading you're taking in `/pharn-dev-build`.

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/list-readable-capabilities/PLAN.md:18"
  problem: "The increment edits capability-picker.ts (a working, tested file) purely to re-source a constant — a refactor riding along with the list feature. Justified by the single-source-of-truth goal, but it widens the blast radius beyond the `list` verb, so a picker regression is now possible from a `list` change."
  evidence: "Import ROLE_GROUPS from capability-groups.js instead of its local const (behavior-identical refactor ...)"
```

Weigh at build: the refactor is the RIGHT call for de-duplicating the role order (discovery item 3 explicitly asked to share one), but keep the existing `capability-picker` vitest cases in the regress/verify pass so an accidental behavior change surfaces.

### Axis: eval coverage / structural-semantic split (P1, eval-format.md)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/list-readable-capabilities/PLAN.md:35"
  problem: "The plan heads its test section 'Evals to write (P1)' and the guarantee audit cites eval-format, but the artifacts are plain vitest unit tests, not capability evals — so eval-format.md's structural[]/semantic[] vocabulary does not apply here. No judge is involved; every assertion is deterministic. Clarify so a reader doesn't expect an eval-format eval file."
  evidence: "## Evals to write (P1) ... tests/capability-groups.test.ts — pure renderCapabilityLines"
```

This is a labeling nit, not a coverage gap: the CLI's P1 ("no behavior ships without a vitest test") is well satisfied — the renderer's every property (grouping, counts, one-per-line, dash prefix, empty-group omitted, stored order, none-state) has an assertion.

### Axis: testability (griller, applied inline)

No blocking finding. The one-per-line GUARANTEE is tested by a demonstrating assertion ("no line joins two capability names"), not merely asserted to exist. The narrow-terminal readability GOAL is correctly labeled **advisory** in the guarantee audit (clack's box wrap math is not modeled by the floor) — the honest split (tested proxy = items never joined; untested = pixel wrap) is exactly right, no overstatement to flag.

## Prose summary

The plan is tight and its guarantee audit is honest: the readability win is labeled advisory while the enforceable property (capabilities never comma-joined; grouped, counted, stored-order, dash-bulleted) is reduced to vitest assertions (P1). `--json` byte-identity is preserved and test-locked (P2/contract). No new untrusted ingestion; the P2 audit is sound. The only substantive concerns are architectural taste calls, both minor: (F1/P3) whether the shared module should hold the list line-renderer or only the ordering constant, and (F3/P7) that a picker file is refactored in a list-feature increment. Neither blocks; both are worth a sentence of intent in `/pharn-dev-build`. F2 is a labeling nit (vitest tests described as "evals").

## Verdict

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 minor/advisory) — for the human to weigh before `/pharn-dev-build`. This is NOT "grill passed" and NOT a guarantee the plan is sound; it is a surfaced set of concerns. The plan is buildable as written.
