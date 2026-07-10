# GRILL — installer-layout-mirror

Plan under interrogation: `.dev/features/installer-layout-mirror/PLAN.md` (trust: untrusted to this griller).
Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5…d729d3c4e` — **matches** the plan's `spec_content_hash` (no drift).
Griller discovery (`count-grillers.mjs .`): 13 registered, all under `test-app/` (installed fixture, not dev-loop grillers) → none applicable; testability applied inline (the plan declares evals, presence recognized).

## Findings — advisory (grill gates nothing)

### P5 — the detection marker is under-specified (important)
```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/installer-layout-mirror/PLAN.md:10"
  problem: "detectLayout keys on 'a pharn/ marker dir exists' without naming the exact marker — a bare pharn/ dir could exist for unrelated reasons, so build must pin a SPECIFIC, unambiguous marker (e.g. pharn/pharn-contracts or pharn/CONSTITUTION.md) to avoid a false pharn detection."
  evidence: "detectLayout(rootDir): 'pharn' | 'flat' = a deterministic membership test (a `pharn/` marker dir exists in `rootDir` → `pharn`; else → `flat`…)"
```
The determinism is sound; the *robustness* of the marker is the open detail. Recommend: detect on a leaf the flat layout provably lacks — `pharn/pharn-contracts` (or require ≥2 of the pharn subtrees). A bare-`pharn/`-exists test is the weakest form.

### P1 — the cross-layout degradation is claimed but not in the eval list (minor)
```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/installer-layout-mirror/PLAN.md:14"
  problem: "The plan asserts diff degrades gracefully when the project layout differs from the @main clone layout ('source missing at @main → skip'), but the Evals section lists no case exercising that cross-layout path — a claimed behavior with no test."
  evidence: "Cross-layout clone (project layout ≠ @main layout) degrades via the existing 'source missing at @main → skip' path — a named, pre-existing bound."
```
Recommend either adding one eval (pharn-layout config vs a flat clone → expected: all skipped, no crash) or explicitly labeling it an untested, inherited bound in VERIFY. It leans on pre-existing behavior, so it is low-risk, but the claim should be pinned.

### P7/P6 — the pharn/ path set encodes an UNMERGED, movable layout (important, standing risk)
```yaml
- type: FINDING
  rule_id: "P7"
  severity: important
  file: ".dev/features/installer-layout-mirror/PLAN.md:59"
  problem: "The pharn/ constants hard-code PR #86's current subtree paths, but #86 is unmerged and can still change before it lands on main; if a subtree is renamed the pharn/ branch silently mis-mirrors until a follow-up."
  evidence: "mirror PR #86's current subtree paths (accepted caveat: if #86 renames a subtree before merge, the `pharn/` path set needs a small follow-up; the flat branch is unaffected)."
```
The human explicitly accepted this at GATE 1, and the flat branch (all live pins) is unaffected — so it is bounded. Recommend a concrete guard: a re-check step (or a note in SHIP) to re-confirm the pharn/ paths against #86 at merge time, so the follow-up is not forgotten.

### P7 — increment size is above the "smallest coherent" bar (minor)
```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/installer-layout-mirror/PLAN.md:4"
  problem: "All-at-once bundles the write side and the read side (10 src + 7 test files) in one increment, which is larger than P7's 'smallest coherent increment' default."
  evidence: "Scope: all-at-once (write + read side) per GATE-1 decision"
```
This is a deliberate, human-approved trade (avoiding a broken status/remove window before #86 merges), and it remains one coherent axis ("layout is resolved, not hardcoded"). Surfaced only so the size is an explicit, eyes-open choice — not a blocker.

## Summary
The plan is sound in its guarantee/trust/determinism audits and preserves P7 for legacy pins by construction (the flat branch is the current behavior). The concerns are: pin a **specific** detection marker (P5, the one I'd act on before build); add or explicitly-bound the cross-layout diff test (P1); and keep the unmerged-#86 dependency visible so the follow-up isn't lost (P7). Nothing here is a correctness defect in the described design; they are hardening + honesty refinements.

## Verdict
ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor) — for the human to weigh before `/pharn-dev-build`. Advisory end-to-end; gates nothing. Only the writes-scope hook and the spec-hash computation were floor-grade this run.
