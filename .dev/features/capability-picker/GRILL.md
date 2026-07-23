# GRILL — capability-picker (bare `pharn add` / `remove` interactive picker)

Plan: `.dev/features/capability-picker/PLAN.md`. Spec-hash check: **MATCH** (`sha256(ARCHITECTURE.md)` = `bca940a5…d3c4e` == plan `spec_content_hash`) — no drift to surface. **This grill-log is ADVISORY: it gates nothing; `/pharn-dev-build`'s floor-gates are unchanged.** The PLAN was read as `trust: untrusted` DATA; no instruction-looking content or injection was found in it.

Griller discovery (`.dev/floor/count-grillers.mjs .`) reported `registered: 81`, but **every path is under a gitignored `test-*/` fixture install** (7 fixture apps × the pharn-oss griller set) — the pharn-CLI repo ships no root-level `pharn-pipeline/grillers/`, the grillers being pharn-oss's installed product. The canonical registered axis is **testability**; I applied its procedure inline (below) against one representative copy. Running the 81 fixture duplicates would be meaningless repetition, not 81 distinct axes.

## Axis: testability griller (P1) — applied inline

**Layer 1 (FLOOR-demonstrable — presence):** the plan has a non-empty `## Evals to write (P1)` section (`PLAN.md:35–43`) mapping 7 concrete cases to `tests/*.test.ts`. **Verification approach PRESENT → no absence finding.** Presence recognized.

**Layer 2 (ADVISORY — adequacy):** the declared tests cover the pure builders, the TTY guard truth-table, both non-TTY guards, and both TTY picker paths. One adequacy gap and one omission are raised below (F1, F5).

## Findings (finding-shape; all ADVISORY — a griller/grill never gates, fix #3)

```yaml
- type: FINDING
  rule_id: P1
  severity: important # advisory assignment (fix #3) — surfaced, not a gate
  file: ".dev/features/capability-picker/PLAN.md:40"
  problem: "The whole feature's correctness hinges on add's picker threading the growing config through resolveArchetypeAdd, which persists pharn.config.json EACH iteration off the config passed in; a threading bug silently clobbers every pick but the last. The named add test must assert the FINAL persisted capabilities equals ALL picks (order-independent), not merely that installCapabilityDirs/writePharnConfig were called."
  evidence: "PLAN.md:40 'installs each pick via the existing path & threads config so the final capabilities holds all picks'; PLAN.md:19 'loop the existing resolveArchetypeAdd per pick (config threaded in-memory)'."

- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/capability-picker/PLAN.md:18"
  problem: "src/lib/capability-picker.ts bundles the interactivity guard (interactiveAllowed) with the option-model builders (buildAddSelection/buildRemoveSelection) — plausibly two axes of change (how interactivity is detected vs. the picker's option shape). Decide consciously: keep co-located under one 'bare-picker support' axis, or split the guard into its own leaf."
  evidence: "PLAN.md:18 'Exports: interactiveAllowed(...) ; buildAddSelection(...) ; buildRemoveSelection(...)'."

- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/capability-picker/PLAN.md:18"
  problem: "PickerGroups carries an optional `hint` field described as display polish (applies-summary / role) that no eval in the plan asserts. Either cover it with a test or drop it — an untested convenience field is speculative surface (YAGNI)."
  evidence: "PLAN.md:18 'PickerGroups = Record<string, {value, label, hint?: string}[]>'; no `## Evals` line references a hint."

- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/capability-picker/PLAN.md:46"
  problem: "\"Non-TTY never opens a prompt\" is labeled purely floor, but the boolean interactiveAllowed is only half the guarantee — it also requires the guard be CALLED before any prompt in BOTH add and remove. That placement is test-backed (advisory), not floor. The label is nearly honest; make the split explicit so the guarantee isn't read as fully floor when the wiring is the test-backed part."
  evidence: "PLAN.md:46 '\"Non-TTY never opens a prompt\" → floor: deterministic boolean membership (interactiveAllowed = AND of two isTTY flags)'."

- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/capability-picker/PLAN.md:40"
  problem: "No named test pins add's partial-progress-on-error: because resolveArchetypeAdd writes per iteration, a pick failing mid-loop leaves earlier picks persisted. If that per-item-transaction semantics is intended (it mirrors sequential `pharn add`), assert it; if not, state it's out of scope so the behavior isn't accidental."
  evidence: "PLAN.md:40 (add loop) — per-item echo implies per-item transaction, but no failure-path case is listed."
```

## Prose summary

The plan is unusually well-grounded: discovery quotes the real clack 1.7 API, the shared installer (`installCapabilityDirs`), and the fact that `remove` already had a no-arg single-`select` picker (so this increment changes it, correctly gaining a non-TTY guard). Guarantee/trust/determinism audits are present and mostly honest, and the two GATE-1 resolutions (summary-line rendering; the `deleteCapabilityDir` extraction) removed the real ambiguities.

The one concern worth the human's attention before/at review is **F1**: the add picker's correctness rests entirely on threading the config forward across per-iteration `writePharnConfig` calls — the classic "loop that re-reads a stale base and clobbers" bug. It is easy to get right and easy to get subtly wrong, so the test must assert the *final persisted set*, not just that the installer was called. F2–F5 are minor: a P3 axis-bundling judgment call, an untested `hint` field (YAGNI), a label-precision nit on the TTY floor claim, and an unpinned error-path. None blocks.

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking, 1 important, 4 minor) — for the human to weigh before/at review; `/pharn-dev-grill` gates nothing.** This is not "grill passed" and not a judgment that the plan is sound — it surfaces what the plan omits or understates; the floor gates (`/pharn-dev-build` spec-hash + `validate.mjs`, `/pharn-dev-regress`, `/pharn-dev-verify`) remain the only proceed/stop authorities.
