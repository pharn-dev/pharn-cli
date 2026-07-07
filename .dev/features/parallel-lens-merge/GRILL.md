# GRILL — parallel-lens-merge (ADVISORY)

Plan interrogated: `.dev/features/parallel-lens-merge/PLAN.md` (treated as `trust: untrusted`).
Spec-hash check: **MATCH** — `sha256(ARCHITECTURE.md)` = `11cd9ad5…d969` == the plan's `spec_content_hash` (no drift; the binding `/pharn-dev-build` floor-gate remains where it always is).
Grillers registered (membership, floor): **13** via `count-grillers.mjs` (the command's "only testability" note is stale). Relevant axes applied inline below; app-facing grillers (a11y, i18n, migrations, privacy, observability, performance) are **not applicable** to a `.dev/floor/` Node-helper + command increment (stated, not silently skipped).

## Findings (finding-shape; enum-gated / free-text split honored)

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: ".dev/features/parallel-lens-merge/PLAN.md:35"
  problem: "The merged output is claimed to be the same finding-shape 'findings.json' shape, but the merged object (line 43) carries a sources[] ARRAY instead of the scalar problem/evidence fields the contract defines — so it is NOT a conformant finding-shape object."
  evidence: "line 35 'The merged array is the same `findings.json` shape (§Emission).' vs line 43 'merged finding = enum-gated key + max-severity + a sorted `sources[]` of every contributor's {problem, evidence}'."
- type: FINDING
  rule_id: P2
  severity: important
  file: ".dev/features/parallel-lens-merge/PLAN.md:41"
  problem: "The rule_id enum-validation ('a single-line token') is underspecified and risks correctness both ways: finding-shape permits the file-qualified form 'security.md SEC-1' which CONTAINS A SPACE, so a no-whitespace regex silently DROPS valid findings, while an over-loose one could admit a laundered needle."
  evidence: "line 41 'rule_id a single-line token' — but finding-shape.md defines rule_id as '<file.md ID | P0..P7>', e.g. 'security.md SEC-1'."
- type: FINDING
  rule_id: P6
  severity: important
  file: ".dev/features/parallel-lens-merge/PLAN.md:12"
  problem: "The orchestration never defines the REVIEW TARGET — what code the scanner-prefilter runs over and cuts slices from (a git diff? explicit file args? the increment's writes?). The advisory orchestration's INPUT provenance is unstated, so 'each lens's slice' has no defined domain."
  evidence: "line 12 'runs it over the target; hit-files = that lens's slice' and line 65 'the 4 scanner-less lenses fall back to whole-target' — 'the target' is never defined."
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/parallel-lens-merge/PLAN.md:5"
  problem: "The increment bundles a deterministic FLOOR axis (merge/count/map) with an ADVISORY orchestration axis (two command files), and the /pharn-dev-review mirror edit gives that command a second reason to change (P3). Human chose Bundle at GATE 1, but build + review now legitimately span two natures — larger than the 'smallest coherent increment' ideal."
  evidence: "line 5 'layer(s): build-apparatus (.dev/floor/) + commands (.claude/commands/)'; line 31 'pharn-dev-review.md — EDIT: add a thin parallel lens orchestration (mirror) section'."
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/parallel-lens-merge/PLAN.md:28"
  problem: "lens-scanner-map.json is a SECOND source of truth for the lens→scanner binding, which each lens already names in its prose. It is consistency-tested (good), but P4 prefers one source; the map and prose can drift (exactly the failure the test guards)."
  evidence: "line 28 'lens-scanner-map.json — explicit { <lens>: <scan-code-*.mjs | null> } table' — the same binding lives in each lens's Layer-1 prose."
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/parallel-lens-merge/PLAN.md:43"
  problem: "Each sources[] entry carries no TRUSTED source/lens id — only the untrusted {problem, evidence}. Adding the emitting lens name (an enum-gated, trusted value) would strengthen provenance AND give the sources[] sort a deterministic key that is not tainted free-text."
  evidence: "line 43 'a sorted `sources[]` of every contributor's {problem, evidence}' — no lens/source identifier retained."
```

## Prose summary (advisory)

The plan's **floor core is sound**: the merge keys strictly on enum-gated fields (P2), fails closed on bad input (P5), and the P1 obligation is correctly met by hermetic `.test.mjs` (the `check-ship.mjs` precedent), not laundered through a judge. The guarantee audit honestly labels parallelism/slicing as advisory. No constitution **violation** is present, so nothing here is blocking-severity.

The concerns cluster on **under-specification the build must resolve**, not on wrong direction:

- **F1 / F2 are the two that will bite in code.** The merged object needs a defined shape (conform to `finding-shape` with scalar fields + a documented provenance extension, or define the merged shape in `pharn-contracts` — do not claim "same shape" while emitting `sources[]`). The `rule_id` regex must admit the space-bearing `"file.md ID"` form while still rejecting newlines/needles — get this wrong and the merge either drops real findings or leaks a needle.
- **F3** — define the review target's provenance before the orchestration prose is written, or "each lens's slice" is meaningless.
- **F4** (architecture/coupling axes) — the two-nature bundle is a real cost the human already accepted; worth re-confirming at GATE 2 that the `/pharn-dev-review` mirror belongs here vs. being a follow-up, and whether it should _invoke_ `/pharn-review` rather than embed a mirror (cleaner P3).
- **F5 / F6** are cheap hardening (single-source binding; trusted provenance in `sources[]`).

Testability axis: coverage is strong for the floor helpers; note the advisory orchestration (spawn, target-slicing) is by nature untested — that is honest, not a gap to test.

## Verdict

**ADVISORY VERDICT: 6 concerns raised (0 blocking-severity; 4 important, 2 minor) — for the human to weigh before /pharn-dev-build.** This grill-log gates nothing; `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `validate.mjs` remain the only deterministic backstops. "Grill produced a log" does not mean "the plan is good" (P0).
