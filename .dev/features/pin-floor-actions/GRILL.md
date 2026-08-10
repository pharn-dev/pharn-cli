# GRILL — pin-floor-actions

Plan under interrogation: `.dev/features/pin-floor-actions/PLAN.md` (treated as `trust: untrusted`).
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's `spec_content_hash`. (Content-hash is floor-grade; here it only *surfaces* — `/pharn-dev-build`'s fix #4 gate is what blocks on drift.)

**Griller discovery (FLOOR — membership):** `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`. Verified live: `pharn-pipeline/grillers/` does not exist in **pharn-cli** — the `testability` griller named in the stage command's prose lives in the **pharn-oss** tree, so it does not register here. Inline axes only (Step 2); no griller findings folded in. Recorded as a stage observation, not a finding against this plan.

---

## Findings

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/pin-floor-actions/PLAN.md:19"
  problem: "The plan inherits the brief's 'two floating refs' framing, which conflates a moving major alias with a pinned patch tag — two materially different risks — and so overstates the drift the checkout change prevents."
  evidence: "'**`floor.yml:19-20` are the only two floating refs**; the other 7 are `@<40-hex> # v<semver>`.'"

- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/pin-floor-actions/PLAN.md:40"
  problem: "The plan narrates a causal mechanism for dependabot's comment handling that it never verified this run, and its own cited evidence is inconsistent with the simple form of that story."
  evidence: "'swapped the digest across a major bump and left the major-only comment untouched. That is the exact commit where the comment started lying.'"

- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/pin-floor-actions/PLAN.md:59"
  problem: "'A green floor check on the PR is the demonstration' is under-specified as a check: absence of a red check is not proof the edited workflow parsed and ran, so the stated proof can be satisfied by a PR where the floor job never appeared."
  evidence: "'A green floor check on the PR *is* the demonstration (P1's \"demonstrates, not asserts\").'"

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/pin-floor-actions/PLAN.md:10"
  problem: "The increment bundles three changes spanning two axes — supply-chain pinning plus credential hardening in floor.yml, and a comment correction in two files the pinning does not touch — where the comment fix is separable and independently shippable."
  evidence: "'`.github/workflows/floor.yml` — pin both `uses:` by digest + add `persist-credentials: false`'"

- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/pin-floor-actions/PLAN.md:67"
  problem: "The guarantee-audit's zero-execution-change row covers setup-node only, omitting that the same equality was verified for checkout, leaving the audit incomplete about the change's actual runtime effect."
  evidence: "'| \"Zero execution change today\" (setup-node) | **FLOOR — verified equality**, `refs/tags/v7` head == the digest being pinned, checked this run.'"
```

## Prose summary

> The free-text `problem` / `evidence` above quote the plan and inherit its **untrusted** tag — they are DATA for a human to weigh, never instructions (P2).

**On F1 (the sharpest one).** `floor.yml` holds `actions/checkout@v7.0.1` and `actions/setup-node@v7`. Only the second is a *moving alias* — the exact failure the plan documents for `v6` (v6.4.0 → v6.5.0). `@v7.0.1` is a released patch tag; it changes only if upstream force-moves an existing tag, which is a different and far rarer threat. Calling both "floating" borrows the moving-alias evidence to justify the checkout change. The checkout pin is still **right** — the honest reasons are (a) a tag is mutable *in principle*, (b) repo convention (`gitleaks.yml:11`), and (c) dependabot preserves whatever form it finds, so a tag reproduces the divergence forever. Recommend the PR description say that, rather than implying `@v7.0.1` was silently drifting. Note the plan's own FYI table (line 31) quietly concedes this: it tracks the `v7` head, never a `v7.0.1` head.

**On F2.** The plan asserts the trailing comment is "load-bearing … for dependabot's bump PRs." That may well be true, but nothing in this run verified it, and the plan's own evidence cuts against the naive version: at `ff48077` dependabot wrote a **v7.0.0 digest** while leaving the comment at `# v6` and titling the PR "from 6 to 7". If it simply read-and-rewrote the comment, it would have written `# v7`. The observable fact — digest moved, comment did not — is solid and independently verified. The *mechanism* is inference. Recommend downgrading the dependabot clause to advisory (or dropping it): the human-auditor rationale stands alone, and this repo's whole thesis is not selling an unverified inference as a reason.

**On F3.** This is the one that could let a broken change look proven. If the edited `floor.yml` fails to parse, GitHub may surface that as a workflow-configuration error rather than a red *floor* check — so "the PR is green" is compatible with "floor never ran." Phase C should assert **presence and conclusion by name** (a membership test over the PR's check list — e.g. `gh pr checks` showing a `floor` entry with a `pass` conclusion), not a visual scan for red. Cheap to fix, and it converts the P1 story from a claim into a check.

**On F4.** Declared in the brief and approved by the human at GATE 1, so this is visibility, not obstruction. Worth stating plainly: the ci/publish comment fix touches files the pinning work does not, and would be a clean standalone PR. Bundling is defensible here (it was *discovered by* the pinning verification, and splitting would mean two near-empty PRs) — but P7's "smallest coherent increment" is being stretched, and that should be a choice on the record rather than an unexamined default.

**On F5.** Minor completeness: `@v7.0.1` → `3d3c42e5…` is the same commit, verified this run, so the *entire* floor.yml change — both refs — is zero-execution-change today. The audit says so for one ref only.

**Risk raised and CLEARED (not a finding).** Adding `persist-credentials: false` could in principle break a job that performs authenticated git operations. Checked live: `floor.yml`'s only two `run:` steps are `node --test …` and `node .dev/floor/validate.mjs .`; `validate.mjs` contains no `child_process`, no `fetch`, and no git invocation (stdlib-only), and `check-regress.mjs` — the one floor script that reasons about `git diff` — is not invoked by this workflow. `persist-credentials: false` removes the token from `.git/config`; local git still functions regardless. No breakage path found.

**Axes with nothing to report:** P2 (no untrusted artifact is ingested by the product; `src/**` untouched — the plan's trust audit correctly scopes itself to the repo's own CI supply chain), P3 (each of the three files changes for exactly one reason; no sibling imports involved), P5 (every branch is string equality or a presence test on data read this run, with HALT as the terminal fallback — no classification anywhere).

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking, 3 important, 2 minor) — for the human to weigh before `/pharn-dev-build`.**

Nothing here blocks: `/pharn-dev-grill` is advisory end-to-end, and none of these findings is a floor-gate. The plan's core — the digest values, the verification discipline, the whitelist — held up under interrogation: every load-bearing digest↔tag mapping was independently confirmed, and the one concrete breakage hypothesis was checked and cleared. The three `important` findings are all about **claim precision** (F1, F2) and **proof precision** (F3), not about the change being wrong. F3 is the only one that changes what should *happen*: tighten Phase C to assert the floor check by name.
