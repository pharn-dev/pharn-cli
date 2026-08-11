# GRILL — diff-unreadable-partition (ADVISORY)

Plan under interrogation: `.dev/features/diff-unreadable-partition/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Computation is floor-grade; here it only warns — the block on drift is
`/pharn-dev-build`'s gate, fix #4.)

**Registered grillers: 0** — `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
This repo ships no `role: griller` capability of its own (the stage command's own frontmatter lives
under the excluded `.claude/commands/` and correctly does not register). Membership is FLOOR; the
empty set means the built-in Step 2 axes below are the whole interrogation. Recorded honestly rather
than implying a griller fleet ran.

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/diff-unreadable-partition/PLAN.md:201"
  problem: "The plan calls the Inv-7 source-scan the increment's 'only new floor primitive' and then, in the same sentence, says it is not a checker — two incompatible labels for one thing, which is exactly the ambiguity P0 exists to remove."
  evidence: "This is the increment's only *new* floor primitive, and it is a test assertion in the existing suite, not a new checker."
```

> **Interrogation.** `ARCHITECTURE.md §2` enumerates the floor as regex/enum allowlists, path
> containment, schema exact-match, network guards. A vitest assertion that regex-scans `diff.ts` for
> two import specifiers **is** a regex membership test, and it runs inside `npm test`, which
> `/pharn-dev-verify` treats as a floor gate — so the reduction is real. What is **not** real is the
> word "primitive": no file lands in `.dev/floor/`, and nothing outside the vitest run enforces it.
> The honest label is *floor-reducible assertion carried by the existing suite*. Left as-is, a later
> reader could cite this plan as precedent for "a test I wrote is a floor primitive."

### Axis: eval coverage / structural-vs-semantic (P1, `eval-format.md`)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/diff-unreadable-partition/PLAN.md:115"
  problem: "The plan fixes the new subsection's position as third, after MISSING, but no listed eval asserts the ordering — Inv 8 pins only the absent case, so a build that renders UNREADABLE first would pass every planned test."
  evidence: "Rendered inside the **existing DRIFT note**, as the **third** subsection after MISSING (mirroring `SKIP_ORDER`'s placement), and **only when non-empty**"
```

> **Interrogation.** This is the classic shape of a plan claim with no eval behind it: a specific,
> checkable ordering asserted in prose and then never tested. P5 also bears on it — deterministic
> output order is a stated repo value (`SKIP_ORDER` exists precisely so skip groups never depend on map
> iteration order), so its status-side twin deserves the same pin. Cheap fix: one assertion on a
> DRIFT body containing all three subsections, comparing `indexOf` positions.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/diff-unreadable-partition/PLAN.md:145"
  problem: "The reason-string assertion policy asserts /symlink/ for symlinks but only non-emptiness for the directory and ENOTDIR cases, so a build that returned the symlink reason for a directory would satisfy every planned assertion."
  evidence: "The directory/ENOTDIR cases assert only that `reason` is a non-empty string (the `kind`-equivalent), leaving that copy free."
```

> **Interrogation.** The plan's justification for the asymmetry is sound (evidence 2 is *about* the
> reason; evidences 1 and 3 are about the partition). But the asymmetry buys a real hole: nothing
> distinguishes the three non-symlink reasons from each other. Weighing it: the partition is the
> contract and the partition **is** pinned, so this is genuinely minor — recorded so the human can
> decide whether display-copy coupling is worth closing it.

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/diff-unreadable-partition/PLAN.md:57"
  problem: "The build prompt scoped status.ts to 'inside-file: printDriftSection + the strict condition', but the plan's type-only InstallDiff import adds a top-level line outside both, widening the whitelist without naming that it did."
  evidence: "`src/commands/status.ts` — `printDriftSection` gains the third subsection + the clean-bill condition gains `unreadable`; the `--strict` condition at `:94-96` gains `|| result.unreadable.length`."
```

> **Interrogation.** The widening is trivial and defensible — an erased `import type` touches no
> runtime behavior and leaves the VERSION/MODELS notes, fetch/cleanup flow, and re-add hint
> byte-equivalent as required. The finding is not that the change is wrong; it is that the plan made a
> scope decision **silently**. P7 asks for limits to be labeled as limits, and a whitelist quietly
> widened by one line is still a whitelist quietly widened.

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/diff-unreadable-partition/PLAN.md:65"
  problem: "The plan names CHANGELOG.md as a file to edit but never says which section receives the entry, and the working tree's staged version bump to 0.4.0 makes 'Unreleased' versus a 0.4.0 heading a live ambiguity rather than a hypothetical one."
  evidence: "- `CHANGELOG.md` — the four user-facing changes. layer: docs"
```

> **Interrogation.** Resolved against live state this run rather than left as a guess (P6):
> `CHANGELOG.md:8` is `## [Unreleased]` with a `### Fixed` subsection already open, and no `0.4.0`
> heading exists despite `package.json` reading `0.4.0` in the staged index. So `[Unreleased] → Fixed`
> is the correct target. Recorded because the plan should have said so.

### Axis: trust propagation (P2)

**No findings.** The plan's trust audit is verifiable and was verified: the four `reason` strings are
literals in `src/lib/apply-update.ts:54,58,61,66`, never derived from fetched bytes, so rendering them
adds no untrusted text to the terminal. The `rel` paths already flowed through
`collectExpectedInstallPaths`. Taint does not widen.

### Axis: one axis of change / no sibling imports (P3)

**No findings.** `diff.ts` → `apply-update.ts` is lib→lib, not command→command or step→step, so the
P3 prohibition is not engaged. Both files keep one reason to change (`diff.ts`: how drift is computed;
`apply-update.ts`: untouched). The plan's refusal to relocate `readDiskState` on a two-consumer count
is correctly conservative.

### Axis: determinism (P5)

**No findings.** The four-way branch is membership over a closed union; the `<`/`>` sort choice over
`localeCompare` is the right call and the plan states the reason. Terminal fallback does not end in a
guess.

## Summary

The plan is unusually well-grounded — it re-verified its own build prompt and corrected three of its
premises rather than inheriting them, and its guarantee audit does the hard part (noticing that
deleting `diff.ts`'s `safeJoin` call leaves the containment claim needing a new home, then pointing at
the two callees that provide it). The concerns above are about **labeling and eval coverage, not
design**: one overstated floor label (P0), one prose claim with no eval behind it (the subsection
ordering — the only finding likely to survive into the built artifact as a real gap), one
display-copy hole the plan already reasoned about, and two unstated scope/target decisions.

The single concern most worth acting on before `/pharn-dev-build` is the **ordering eval**: it is one
assertion, it closes a claim the plan makes explicitly, and it matches an ordering discipline this repo
already enforces on the write side.

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to
weigh before `/pharn-dev-build`.**

This grill-log is **advisory end-to-end**. It gates nothing: `/pharn-dev-build` proceeds regardless, and
the deterministic backstops remain where they always were — the spec-hash gate, the unresolved-open-
questions gate, and `.dev/floor/validate.mjs`. Nothing here should be read as "the plan passed."
