# GRILL — trust-map-records-era

Plan under interrogation: `.dev/features/trust-map-records-era/PLAN.md` (`trust: untrusted` to this stage).
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, identical to the plan's
`spec_content_hash`. No drift finding.

**Griller membership (FLOOR — `node .dev/floor/count-grillers.mjs .`):** `{"registered":0,"grillers":[]}`.
**Zero grillers ran.** Note for the human: this stage command's own prose asserts *"Today the registered
set is the `testability` griller"* — that is **not true in this repository**; the deterministic count says
0. Only the inline Step-2 axes were applied. (Reported as an observation about the stage command, not a
finding against this plan.)

---

## Findings

### Axis: Trust propagation (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: blocking
  file: ".dev/features/trust-map-records-era/PLAN.md:171"
  problem: "The Trust audit asserts the two edited files are install payload whose bytes ship to users; live code shows the installed copies are read from the fetched pharn-oss clone, so editing pharn-cli's own copies changes zero user-facing bytes and the stated justification for the CHANGELOG line is false."
  evidence: "both target files are in `protect-trusted-paths.cjs` `DEFAULT_PROTECTED` (`:58`) and are **install payload** (`constants.ts:32-33`) — copied verbatim into user projects in the **flat** layout ... Editing them changes bytes that ship to users, which is precisely why the `CHANGELOG.md` line is in scope (P4/P7)."
```

**Interrogation.** `TRUSTED_DOCS` (`src/lib/constants.ts:29-34`) names the docs `installCapabilities`
copies **out of `repoDir`** — the degit clone of **pharn-oss** — into the user's project. pharn-cli's own
`LIMITS.md` / `THREAT-MODEL.md` are this repo's governance docs and are **never** the bytes installed.
`constants.ts:48-50` states it outright: *"THREAT-MODEL.md / LIMITS.md are NOT under `pharn/` (they stay
dev-only)"*. The tests the plan correctly classified as payload-pins (D6) write **fake** docs into a
**fake repo dir** — which is precisely the tell: the source is the clone, not this repo.

The CHANGELOG line may still be correct (these docs are read on GitHub/npm as the project's published
trust map), but **the plan's reason for it is wrong** and a plan that mis-states its own blast radius in
a P2 audit is the one thing this increment is supposed to be curing.

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/trust-map-records-era/PLAN.md:171"
  problem: "If pharn-oss ships its own LIMITS.md/THREAT-MODEL.md carrying the same three false claims, this increment corrects the dev-repo copy while leaving the copy users actually receive stale — and the plan never asks the question."
  evidence: "This increment ingests **no untrusted artifact**. It reads only repo-local trusted docs and `src/`."
```

**Interrogation.** Follows directly from the finding above. Not resolvable from inside this repo
(different repository) → the terminal fallback is **ask the human**, not assume (P5/P6).

### Axis: Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/trust-map-records-era/PLAN.md:236"
  problem: "The proposed §1d true-statement says remove deletes 'exactly what the recorded layout says that capability owns', but deleteCapabilityDir removes the whole directory recursively including user-added files pharn never installed, so 'exactly' rounds the honest direction the wrong way."
  evidence: "`remove` reconstructs from the **recorded config**, so it deletes exactly what the recorded `layout` says that capability owns — and nothing it never recorded."
```

**Interrogation.** `deleteCapabilityDir` (`src/commands/remove.ts:72-77`) resolves
`safeJoin(cwd, capabilityRelDir(paths, target))` and removes **that directory**. Anything a user dropped
inside a capability dir goes with it. The clause *"and nothing it never recorded"* is the false half:
`remove` does not consult records to decide **what to delete** — the records prune (L1) is a *separate*
key-prefix filter over the store, after the fact. In the repo's honesty document, "exactly" and "nothing
it never recorded" both need to go.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/trust-map-records-era/PLAN.md:255"
  problem: "The §4c phrase 'no longer crash or masquerade' is a claim about past behavior with no anchor in the current tree, which the anchor-table discipline forbids."
  evidence: "which classifies symlinks and directories as `unreadable` rather than crashing or masquerading as a match"
```

**Interrogation.** The *present-tense* claim is fully anchored and accurate — `readDiskState`
(`src/lib/apply-update.ts:44`) returns `unreadable` for a symlink (`:57-58`), a non-regular file
(`:60-61`), an uninspectable path (`:51-55`), and an unreadable file (`:65-66`), and its docstring says
*"Never throws"* (`:41-42`). What has no anchor is the **historical** contrast ("no longer", "#82").
Recommend stating the behavior, not the history.

### Axis: Determinism (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/trust-map-records-era/PLAN.md:203"
  problem: "The L1-pending clause asserts a capability's stale record entries survive only until the next update rewrites the store, but the plan anchors that to a remove.ts comment which itself uses the deleted 'manifest' vocabulary — the very staleness this increment exists to correct."
  evidence: "while its `pharn.records.json` entries remain until the next `update` rewrites the store."
```

**Interrogation.** The claim appears **true**, but the plan cites the wrong evidence.
`src/commands/remove.ts:99` reads *"they linger until the next `update` prunes them via its manifest"* —
a comment carrying the same dead vocabulary being excised elsewhere in this PR. The load-bearing
evidence is instead `src/commands/update.ts:325`:
`files: { ...plan.nextRecords, ...buildRecords(cwd, written) }` — a **fresh object** built from the next
expected set, not a spread over the previous store, so stale keys drop by construction. **Re-anchor to
`update.ts:325` before shipping**, and confirm `planUpdate`'s `nextRecords` is not itself merged from the
old store.

### Axis: Eval coverage (P1) — no finding

The plan's "no evals" is an **honest reduction, not an exemption**. P1 binds behavior; this increment
changes zero behavior, and the plan says so explicitly while refusing to invent a floor
(*"Claiming an eval here would be inventing a floor that does not exist (P0)"*). It also correctly
declines to sell the anchor table as anything but advisory. Nothing to raise.

### Axis: Header change (Q1) — no finding, concern retired

Interrogated as instructed: **no markdown anchor link to `#1d-…`, `#1b-…`, or `#4c` exists anywhere** in
the repo (`grep -rn "#1d\|#1b-\|#4c"` → zero hits outside `node_modules`). Combined with D4's zero live
inbound `§1d` citers, the header rewrite breaks no resolvable reference. The residual is the
unfalsifiable one the plan already owns: a human who remembers the old title. Retired.

### Axis: Honest scope (P7) — T3 omission

Shipping §4c while leaving §1c's sibling falsehood is **defensible, not a half-truth** — the two sections
make *independent* claims and §1c is not cited by the rewritten text, so no reader is led from a
corrected sentence into an uncorrected one. It is, however, the finding most likely to be raised at
review, and the plan pre-empts it by name (T3) with a stated rationale. Surfaced, not faulted.

---

## Summary

The plan's **research is unusually strong** — the three target claims are verified verbatim, the citation
inventory reproduces with two corrections the plan volunteered against its own source prompt, the S3
material was killed on live evidence rather than written on trust, and the decision-table row-2 nuance
was added beyond spec. Discovery is not where this plan is weak.

Where it is weak is **one layer up**: the P2 Trust audit mis-states the increment's blast radius
(F1) — it believes it is editing install payload when it is editing dev-only governance docs — and that
error hides a substantive question the plan never asks (F2): whether the *user-facing* copies of these
same documents, in pharn-oss, carry the identical false claims. If they do, this PR corrects the copy
almost nobody reads and leaves the copy everyone receives stale.

The three remaining findings are text-level: one overselling clause (F3, "exactly … nothing it never
recorded"), one unanchored historical aside (F4, "no longer crash"), and one correct claim resting on
stale evidence (F5, re-anchor to `update.ts:325`).

None of this is a reason not to build. F3–F5 are edits to text that has not been written yet; F1 is a
one-paragraph correction to the plan's own audit; F2 is a question for the human that can be answered in
parallel with the build.

**ADVISORY VERDICT: 5 concerns raised (1 blocking-severity, 3 important, 1 minor) — for the human to
weigh before `/pharn-dev-build`.** This grill gates nothing: every severity above is an LLM assignment
(fix #3), and no floor primitive was consulted except the spec-hash match and the griller count, both
reported verbatim. "Concerns raised" is not "the plan is sound," and a clean grill would not have made it
sound either.
</content>
