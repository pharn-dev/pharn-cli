# GRILL — capability-source-provenance

Plan under interrogation: `.dev/features/capability-source-provenance/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, identical to the plan's
`spec_content_hash`. No spec drift. (Computation is floor-grade; here it only **surfaces** — the
actual block on drift is `/pharn-dev-build`'s floor-gate, fix #4.)

**Griller discovery (FLOOR — membership):** `node .dev/floor/count-grillers.mjs .` →
`{"registered":81}`, but **all 81 paths live under `test-backend/`, `test-edge/`, `test-edge2/`,
`test-full/`, `test-lib/`, `test-next/`, `test-spa/`** — the gitignored fixture apps (`.gitignore`
lists every one). **This repo's own registered griller count is 0.** The pluggable griller slot
therefore contributes nothing this run; the `testability` griller's procedure was applied **inline**
from `test-lib/pharn/pharn-pipeline/grillers/testability/testability.md`. That the floor counter
scores gitignored fixtures as first-class grillers is itself worth a human's attention (F7).

**Testability griller, Layer 1 (presence):** a verification approach **is** present — `## Evals to
write (P1)` (PLAN.md:184) carries a 10-row invariant→test map plus a new row-by-row
`tests/merge-capabilities.test.ts`. **No absence finding.** Its Layer-2 (adequacy) concerns are folded
into F1–F4 below.

---

## Findings

### Axis: guarantee-audit completeness (P0) / determinism (P5)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/capability-source-provenance/PLAN.md:204"
  problem: "The plan never asks whether the MERGED membership should also be withheld when `versionWithheld` is true, so a run that skipped files still advances `capabilities` — the config can gain an entry whose bytes were skipped, or lose one, on a deliberately incomplete run."
  evidence: "PLAN.md invariant-10 row: 'gone-upstream entry contributes zero manifest paths and is dropped with its report line'; and the verified code `update.ts:221` `const versionWithheld = plan.counts.skipped > 0` withholds ONLY skillsVersion/commit, while `capabilities` is written unconditionally at `update.ts:269-276`."
```

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/capability-source-provenance/PLAN.md:111"
  problem: "The identity key is declared but the merge's behavior on a DUPLICATE `role:name` is left undefined, and a Map/Set-based merge would silently de-duplicate entries that today are both written — a behavior change outside the declared axis."
  evidence: "PLAN.md:111 '**Identity key:** `${role}:${name}`'; `src/lib/resolve-capabilities.ts:33-35` explicitly guarantees the opposite: 'a duplicate `name` yields two results, order preserved (de-duplication belongs to the fetch-boundary validation, not here)'."
```

### Axis: eval coverage (P1) — testability griller, Layer 2

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/capability-source-provenance/PLAN.md:204"
  problem: "No eval covers the compound interaction between a DROPPED capability's pruned records and a later resurrection: the plan pins that files remain on disk, but not that their records are pruned, nor what the untouched `planUpdate` does when those recordless files come back."
  evidence: "`src/lib/update-decision.ts:182-185` — 'The record map to persist for a COMPLETE run: keyed by the manifest just applied, so entries for paths no longer installed are PRUNED'. A resurrected capability whose upstream bytes changed in the interval therefore hits `decideFileAction` row 5 → SKIP `unrecorded`, which in turn sets `versionWithheld`."
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/capability-source-provenance/PLAN.md:176"
  problem: "`## Contracts satisfied` cites `finding-shape.md` but never states why `eval-format.md`'s structural[]/semantic[] split does not govern this increment's evals, leaving the plan's vitest-only eval table unexplained against a contract the grill stage checks for."
  evidence: "PLAN.md:176-183 cites only `pharn-contracts/finding-shape.md` and the pharn.config.json schema; `pharn-contracts/eval-format.md` exists in this repo and is unmentioned."
```

### Axis: trust propagation (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/capability-source-provenance/PLAN.md:231"
  problem: "The trust audit leads with file OWNERSHIP as the reason `source` needs no taint handling, which is one step from 'our file, therefore safe' — the exact P0/P2 disease — even though the plan's actual protection (a fail-closed enum check at ingest) is sound and should be the stated reason."
  evidence: "PLAN.md:231 'This increment ingests no new untrusted field: `source` is read only from `pharn.config.json` (a **local, CLI-owned** file).'"
```

### Axis: honest scope (P7) / blast radius

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/capability-source-provenance/PLAN.md:204"
  problem: "The plan pins that a gone-upstream entry is invisible to the install manifest, but does not note that `pharn status` is blind in exactly the same way, so between an upstream removal and the next `update` the config lists a capability `status` will never mention."
  evidence: "PLAN.md invariant-10 row calls the silent `addDir` skip a 'trap' worth pinning; `src/lib/diff.ts` reaches the same `collectExpectedInstallPaths`, and `src/commands/status.ts` is correctly declared untouched — so it inherits the blindness unremarked."
```

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/capability-source-provenance/PLAN.md:1"
  problem: "The whitelist was amended mid-gate to add `src/lib/capability-groups.ts` for a human-view annotation that is presentation-only, widening the increment beyond the merge-semantics axis it is scoped to."
  evidence: "PLAN.md 'Open questions — RESOLVED at HALT 1' item 2: '**Whitelist amendment (renegotiated + approved at HALT 1):** … `src/lib/capability-groups.ts:75` … is now in scope.'"
```

---

## Summary (prose)

The plan is unusually well-grounded: every anchor was re-verified against live code this run, the spec
hash matches, and it **corrects two factual errors in its own source brief** (the second `add`
entry-construction site at `add.ts:278-286`, and `init`'s entries being built in
`install-capabilities.ts`) — both of which would have shipped silent bugs. The 9-row decision table is
genuinely exhaustive over its stated dimensions, the idempotence argument is sound, and the choice to
put the merge in a new module is justified by a concrete, verified fact about the existing test
harness rather than by taste.

The concerns are concentrated in **one place: the seam between the new merge and the deliberately
untouched `planUpdate`.** The plan's non-goal ("`update-decision.ts` untouched") is correct, but it
treats that boundary as if nothing crosses it, when three things do:

1. **Membership advances on an incomplete run (F1).** `versionWithheld` holds back the version and the
   commit, but not `capabilities`. The plan's own rationale for withholding — "the recorded version
   describes the last COMPLETE state" — applies verbatim to membership, and the plan never asks the
   question. This is the highest-value unasked question in the plan.
2. **Records are pruned for dropped entries (F3).** Verified in code, not inferred. Files survive
   (never-deletes holds), but their records do not, which converts them into `unrecorded` files. The
   plan's invariant 10 pins the file half and misses the record half.
3. **Duplicate keys (F2).** `resolve-capabilities.ts` explicitly promises duplicates survive; a
   set-keyed merge would silently break that promise. Cheap to resolve — but it must be *decided*,
   not discovered at build time.

F5–F7 are wording and scope hygiene, not correctness. F7 (the mid-gate whitelist amendment) is noted
because scope creep at a gate is worth a human's eye even when — as here — the human explicitly chose
it with the trade-off in front of them.

Nothing here suggests the increment is wrong or should not be built. F1–F3 are each answerable with a
sentence of decision plus a test, and all three are in the plan's already-declared files.

---

## ADVISORY VERDICT

**7 concerns raised (0 blocking-severity, 3 important, 4 minor) — for the human to weigh before
`/pharn-dev-build`.**

This grill-log is **advisory end-to-end and gates nothing** (P0, fix #3). Every finding above rests on
model judgment; the `severity` values are LLM-assigned and are **not** a floor verdict. The only
floor-grade facts in this run are the spec-hash match (a content-hash) and the griller-membership
count (an enum/regex read) — and the writes-scope hook that pinned this file as the one writable path.
Nothing in this log blocks `/pharn-dev-build`; the deterministic backstops remain `/pharn-dev-build`'s
own spec-hash gate and `.dev/floor/validate.mjs`. This is **not** a statement that the plan is sound —
that judgment is the human's.
