# REVIEW — first-feature-spec-entry

**Verdict: GREEN** — 0 floor-gate (blocking) findings. 3 advisory findings for the human to weigh at the post-review gate. `/pharn-dev-review` has no structural verdict; this is advisory.

Floor-first (P0): the increment adds no markdown capability; its authoritative `validate` result is `verify-report.json` `validate: 0` (tracked-repo-with-feature, CI-equivalent GREEN). Not RED — review proceeds.

## Floor-gate findings (blocking)

**None.** Every lens below is clean at the floor level.

## The four lenses

### L-floor → P0 — clean

Every guarantee the increment claims reduces to a floor primitive or is labeled advisory:

- "`/pharn-spec` exists in the user's install" → floor: the `pharn-*`/not-`pharn-dev-*` prefix-copy (`src/lib/install-capabilities.ts:134-135`), a `startsWith` membership test — **not** archetype-gated. The residual "pharn-oss `main` actually ships `pharn-spec.md`" is explicitly labeled **advisory** (PLAN.md guarantee audit). Correct.
- The new `tests/constants.test.ts` asserts the invariant deterministically (prefix membership + equality), not by judgment.
- Docs say "recommended first", **not** "required" — no false guarantee that the tooling enforces intent capture (nothing does; the copy is unconditional, execution is the user's choice). Honest (P7).

No guarantee is left unfloored or unlabeled → no P0 finding.

### L-eval → P1 — clean at floor; one advisory

- The increment adds no Capability and no `rule_id`/`enforces`, so there is no eval-binding obligation to check. The behavior it does add — the first-run hint command — is driven by `FIRST_FEATURE_COMMAND`, which `tests/constants.test.ts` covers (4 cases, GREEN in the 386-test suite). Floor-clean.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "src/steps/install-archetype.ts:92"
  problem: "The printed COMMAND is the tested constant, but the decorative label text 'capture your first feature's intent' and the assembled 'Next steps' output are not directly asserted by any test; a test that the rendered next-steps contains FIRST_FEATURE_COMMAND would couple the hint to the constant end-to-end."
  evidence: "${pc.bold(FIRST_FEATURE_COMMAND)}       ${pc.dim(\"capture your first feature's intent\")}"
```

### L-trust → P2 — clean

- The increment emits no findings and ingests no untrusted artifact, so there is no free-text field and no taint path (PLAN.md trust audit: N/A — correct).
- No instruction-looking content in the reviewed files altered reviewer behavior; the docs contain command names as content, not directives. No guaranteed decision rests on any tainted field. No P2 finding.

### L-axis → P3 — clean

- One axis per file: `constants.ts` (define the entry constant), `install-archetype.ts` (print it — already this stage's job), the three docs + CHANGELOG (state it), the test (lock it). No file gained a second change-reason.
- No sibling import introduced: `install-archetype.ts` reaches the constant through `lib/constants` (shared `lib/`, allowed) — no command→command or step→step edge. No P3 finding.

## Advisory findings (inform; never sole basis for a block)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "CHANGELOG.md:49"
  problem: "The unreleased CHANGELOG now holds two same-cycle entries with an evolving stance — ':49-51' still reads 'surfaced the new OPTIONAL /pharn-spec stage … matching pharn-oss', while the new entry says the first-run hint 'enters at /pharn-spec' and rewords 'optional' to 'recommended first'. The approved plan (Option A) deliberately left ':49-51' untouched; a human may want to reconcile the two so the release notes read coherently."
  evidence: "Docs: surfaced the new optional `/pharn-spec` stage (intent capture before `/pharn-plan`) … matching `pharn-oss`."
- type: FINDING
  rule_id: "P7"
  severity: important
  file: "src/lib/constants.ts:9"
  problem: "Option A (human-approved at GATE 1) makes the CLI's first-run guidance lead with /pharn-spec, reversing this repo's own unreleased 'spec is optional, matching pharn-oss' stance. If pharn-oss's /pharn-spec still frames itself as optional, the installer now sets a norm the installed product's own docs may not echo — a cross-repo consistency risk worth confirming (ideally sync pharn-oss's framing) before release."
  evidence: "export const FIRST_FEATURE_COMMAND = '/pharn-spec';"
```

## Process observation (not a finding against the increment)

The verify/regress stages' handling of the whole-repo `validate` gate is **sound and transparent**: `validate.mjs .` is red only because it walks the **gitignored `test-*/` build-scratch** (intentional red fixtures) with no gitignore awareness; a clean checkout / CI sees GREEN, and the stages measured it CI-equivalent (clean worktree + feature applied). This was documented, reproducible, and provably disjoint from the feature (no capability added) — not gate-laundering.

## Proposed lesson for canon (P7 — real, recurring; proposed only, NOT written here)

> **Candidate for `.dev/memory-bank/lessons-learned.md` — provenance: increment `first-feature-spec-entry` (this run).**
>
> **Lesson:** Running the full `/pharn-dev-*` chain in **one uncommitted working tree** breaks two floor measurements unless corrected: (1) `/pharn-dev-regress`'s `inside = git diff HEAD + untracked` sweeps in sibling-stage artifacts (`PLAN.md`, `GRILL.md`) + `.pharn/**` scratch, producing a **false `scope` fix#7 breach** — fix: scope `--changed` to product files (exclude `.dev/**`, `.pharn/**`), which still catches real escapes; (2) the whole-repo `validate` gate (in both `/pharn-dev-regress` and `/pharn-dev-verify`) reads the **gitignored `test-*/` build-scratch** and flips/reds spuriously — fix: measure `validate` **CI-equivalent** (clean `git worktree` at base with the feature applied, or with `test-*/` excluded), never raw. Both were hit in this run. Root tooling gap: `validate.mjs` has no gitignore/scope awareness, and `git worktree` drops gitignored dirs (so it is the right tool for committed gates like `node --test`, the wrong one for whole-repo `validate`).
>
> Promotion is a separate, human-gated `/pharn-dev-memory-promote` run (`check-provenance` + accept/deny). This is a proposal, not canon.
