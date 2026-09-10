# GRILL — `fold-changelog-unreleased`

Plan under interrogation: `.dev/features/fold-changelog-unreleased/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Computation is floor-grade; here it only *surfaces* — `/pharn-dev-build` is
where drift blocks, fix #4.)

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
This repo builds the **CLI**; the `role: griller` capabilities live in `pharn-oss`, so the pluggable
slot contributes nothing here and only the inline axes (Step 2) ran. Stated rather than passed over
in silence.

> **Trust (P2):** `PLAN.md` is `trust: untrusted` to this stage. Every `problem` / `evidence` below is
> **quoted DATA** from it, never an instruction followed.

---

## Findings

### Axis: eval coverage (P1) / honest scope (P7)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:113"
  problem: "The plan waives P1 on the grounds that nothing behavioral changed, but the `.markdownlint-cli2.jsonc` edit IS a change to a gate's behavior, and nothing in the repo pins it — a future PR can silently re-add `CHANGELOG.md` to `ignores` and restore the exact blind spot this increment exists to close."
  evidence: "This increment adds **no behavior** — no `src/**` change, no capability, no `rule_id` — so P1's \"every behavior gets a vitest test\" has nothing to attach to"
```

**Interrogation.** The waiver is *mostly* right — folding prose is not behavior. But the plan's own
finding statement says the defect survived because **`lint:md` lints 0 files for `CHANGELOG.md`**.
That blind spot was a one-line config value with no test behind it. After this PR the value flips,
and it still has no test behind it. `tests/ci-workflow.test.ts` is live precedent in this repo that
repo-meta config *can* be pinned by vitest when its drift is costly (it pins the six CI job `name:`
strings for exactly this reason). The counter-argument is P7 (no speculative additions) — but the
triggering need here is not hypothetical: it is the audit finding being fixed. **For the human to
weigh at GATE 2**; the griller does not decide it.

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:122"
  problem: "Phase B sorts before hashing, so it is order-blind by construction — it can prove no line was lost, added, or altered, but it CANNOT prove entries kept their relative order, and the plan presents it as the no-loss guarantee without naming that hole."
  evidence: "extract every **non-heading, non-blank** line ... `sort | shasum -a 256` both. **The two hashes must be identical.**"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:122"
  problem: "Phase B excludes heading lines from both sides, so a body attached to the WRONG kind (a `Security` block folded into `Fixed`) leaves the hash identical — conservation of prose is proved, correct kind-assignment is not, and only the separately-stated per-kind bullet count reaches that property."
  evidence: "Extract every **non-heading, non-blank** line from the old `[Unreleased]` + old `[0.4.0]` spans, and from the new `[0.4.0]` span"
```

**Interrogation.** These two are the sharpest concerns in the plan, and they are concerns about
**over-claim**, not about method. What Phase B actually establishes is: *the multiset of non-blank,
non-heading lines is conserved.* That is a genuine content-hash floor reduction (P0-compliant) and it
is strong — it catches loss, truncation, duplication, and any prose edit. What it does **not**
establish, and what the plan should say out loud:

1. **order within a kind** — `sort` discards it;
2. **kind assignment** — headings are excluded from both sides;
3. **blank lines inside an entry** — excluded from both sides.

(1) and (2) are partly reached by the plan's *other* stated check — per-kind `^- ` bullet counts
balancing pre/post — which does bind top-level bullets to their kind. (3) is not reached at all,
though a lost intra-entry blank line is a rendering nit, not lost content. **The reduction to make
before build:** state Phase B's scope precisely in the report and let the per-kind bullet census carry
the kind-assignment claim, rather than letting one hash appear to prove everything. This is the P0
disease in miniature — a real floor check quietly asked to cover more than it covers.

### Axis: docs cite code / discovery (P4, P6)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:147"
  problem: "The plan treats the not-yet-existing `v0.4.0` tag as the only forward-reference in the link block, but three link definitions ALREADY point at tags that exist nowhere — `v0.3.1`, `v0.2.0`, `v0.1.0` — so the file's compare links are broken beyond the one line P-6 names, and leaving that unstated reads as if the block is clean afterward."
  evidence: "**\"`v0.4.0` will exist\"** → **advisory / out of scope.** Cutting the tag is a human release step"
```

**Interrogation.** Verified live this run against **both** local and remote refs:
`git ls-remote --tags origin` returns exactly `0.3.1`, `v0.3.0`, `v0.3.2`. So
`[0.3.1]: …/compare/v0.3.0...v0.3.1` (the tag is `0.3.1`, unprefixed), `[0.2.0]: …/compare/v0.1.0...v0.2.0`,
and `[0.1.0]: …/releases/tag/v0.1.0` are all **already** dead links on `main` today. None of this is
caused by, or fixable within, P-6 — markdownlint does not resolve URLs, so no gate here would see it
either. The finding is that the PR should **name** the residual rather than let a reader infer the
link block is now sound. Cheap fix: one sentence in the PR body. A separate increment could
reconcile the tag names; this one deliberately does not.

### Axis: determinism (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:60"
  problem: "The claim that consolidation removes all 11 MD024 violations \"by construction\" is an argument, not a measurement — it silently depends on `siblings_only: true` still being the configured value, which this same PR is editing the config file that holds."
  evidence: "omitting any kind that ends up empty (`Deprecated` will be empty and is omitted)"
```

**Interrogation.** The argument is sound as far as it goes: with one `###` per kind under one `##`
parent, sibling duplicates are gone, and `[0.3.0]`'s identical `### Added` sits under a *different*
parent so `siblings_only` permits it. But the plan is editing `.markdownlint-cli2.jsonc` in the same
breath, and `MD024: { siblings_only: true }` lives in that file. **Backstop exists and the plan names
it** — `npm run lint:md` GREEN *with the file in scope* is the actual floor, and it would catch any
slip. So this is a labeling nit rather than a gap: prefer "measured by `lint:md`" over "by
construction". Recorded, not escalated.

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:120"
  problem: "Phase A's witness requires the MD049 character edit to be isolated in the diff, but the plan does not pin the operational sequence, and doing the fold first would make `git diff -U0` show ~1000 changed lines instead of 5 — destroying the witness rather than failing it loudly."
  evidence: "`git diff --word-diff=porcelain` must show **only** `*`↔`_`. Staged separately from the move so the witness is clean."
```

**Interrogation.** The plan says *what* the witness must show but not *when* to capture it. There is
exactly one order that works: **MD049 first, capture Phase A from the clean working tree, then run the
fold.** Once the fold has run, the 5-line witness is unrecoverable without `git stash` gymnastics.
Worth pinning explicitly before build, because the failure mode is a **silently useless** witness, not
a red one.

### Axis: honest scope (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/fold-changelog-unreleased/PLAN.md:38"
  problem: "Redating the existing `## [0.4.0] — 2026-08-07` heading to `2026-09-10` silently rewrites a date already committed to `main`, and the plan states the new date without ever justifying the overwrite of the old one."
  evidence: "redate it `2026-09-10`, consolidate to Keep a Changelog order, leave `[Unreleased]` an empty scaffold"
```

**Interrogation.** The redate is defensible — `0.4.0` was **never released** (no `v0.4.0` tag exists
locally or on the remote, verified this run), so `2026-08-07` records the day someone *drafted* the
heading, not a release. A version whose notes are being written today is honestly dated today.
But "defensible" is not "stated", and a changelog date is the kind of thing a reader trusts blindly.
One clause in the PR body settles it.

### Axis: one axis of change (P3), trust propagation (P2)

**No findings.** The increment touches two files that change for one shared reason (make the changelog
conform and put it under the lint gate); the config edit is not separable from the fold, since
un-ignoring without folding would land `lint:md` at 21 red. No untrusted artifact is ingested — no
fetch, no clone, no network — so P2 has no taint edge to trace, and the plan says exactly that rather
than manufacturing a trust audit.

---

## Summary

The plan is unusually well-grounded for a docs increment: every structural number in it (1312 lines,
the L8–L1067 span, the 21 violations split 11/10, the missing `[0.4.0]:` definition, `package.json`
already at `0.4.0`) was **re-derived live this run** and matched, and it correctly refuses the
`prettier --write` trap with a live check rather than a memory of one.

The concerns cluster in one place: **the no-loss proof is presented as covering more than it covers.**
Phase B is a real content-hash floor reduction, but sorting makes it order-blind and excluding
headings makes it kind-blind. Neither is a reason to change the method — it is the right method — but
the report must scope the claim precisely, and lean on the per-kind bullet census for the part the
hash cannot reach. That is a P0 correction of *labeling*, which is the failure mode this repo cares
about most.

Secondary: P1 is waived on a config change that nothing pins (the same shape of blind spot P-6 is
fixing); three compare links are *already* dead for unrelated reasons and should be named rather than
implied-clean; and two operational details — capture Phase A before the fold, justify the redate —
cost one sentence each and prevent a silently useless witness.

Nothing here contradicts the constitution, and nothing here blocks the build.

**ADVISORY VERDICT: 7 concerns raised (0 blocking, 3 important, 4 minor) — for the human to weigh
before `/pharn-dev-build`.** This grill-log is **advisory end-to-end**: it gates nothing, it is not a
statement that the plan is sound, and `/pharn-dev-build` proceeds regardless. The deterministic
backstops remain where they always were — the spec-hash gate, an unresolved `## Open questions
(HALT)`, `.dev/floor/validate.mjs`, and this increment's own `lint:md` + Phase A/B checks.
