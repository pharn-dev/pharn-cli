# GRILL — ci-matrix-required-checks

Plan under interrogation: `.dev/features/ci-matrix-required-checks/PLAN.md` (approved at GATE 1).
**Spec-hash check (content-hash floor primitive, surfaced not blocking):** recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` —
**matches** the plan's `spec_content_hash`. No drift. (`/pharn-dev-build`'s fix #4 gate is where drift
would actually block; this line only reports.)

**Griller discovery (FLOOR — enum/regex membership, `.dev/floor/count-grillers.mjs .`):**
`{"registered":0,"grillers":[]}` — zero `role: griller` capabilities are registered in this repo, so
the axes below are the inline Step-2 set only. No griller findings exist to fold in. Stated so the
absence reads as measured, not skipped.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/ci-matrix-required-checks/PLAN.md:88'
  problem: 'The plan''s only floor reduction rests on a regex extractor whose parsing rule is left unspecified, and `name:` appears at three different levels of a GitHub workflow file — so the extractor can silently over- or under-match and still report green.'
  evidence: 'extract every `name:` under `jobs:` in `.github/workflows/ci.yml` -> assert **set equality** with the six expected contexts'
```

`ci.yml` will contain `name: ci` at column 0 (the workflow name), six job-level `name:` keys, and one
`- name:` per step (`Install`, the gate step, …). "Every `name:` under `jobs:`" is not a rule a regex
can apply without an indentation convention that nothing in this repo enforces — prettier does not
format YAML here and `markdownlint` does not see it. If the extractor matches step names it fails
loudly (harmless); if it matches too few — e.g. someone reformats to 2-space job indentation — the
set-equality still passes on a subset only if the expected list is also edited, but a **rename plus a
test edit in the same commit** is exactly the drift this test claims to catch. The reduction is
weaker than "floor: enum/regex" suggests unless the extractor anchors on the job-level indentation
**and** asserts an exact count of six **and** explicitly excludes the workflow-level `name: ci`.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/ci-matrix-required-checks/PLAN.md:96'
  problem: 'The floor claim guards the workflow side of a two-sided invariant, while the failure it exists to prevent lives entirely on the side the test cannot read — a gap the plan labels advisory but does not weigh.'
  evidence: '"Those six names equal what the GitHub ruleset requires" -> **advisory.** The expected list is a checked-in copy; nothing in this repo reads the live ruleset.'
```

The plan is honest here (it labels the gap advisory and even names it as the mechanism of the current
breakage), so this is not the P0 disease. It is raised so the human weighs it consciously: after this
increment the repo still has **no** check that would catch this exact incident recurring. A follow-up
that reads the live ruleset via `gh api` in a non-blocking job would close it — deliberately **not**
proposed as part of this increment (P7).

### Axis: eval coverage and the structural/semantic split (P1, `pharn-contracts/eval-format.md`)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/ci-matrix-required-checks/PLAN.md:81'
  problem: 'The section is titled "Evals to write (P1)" but contains a vitest test, not an eval — there is no `case`/`expected` pair and no `structural[]`/`semantic[]` split, because this increment has no Capability under test.'
  evidence: '## Evals to write (P1)'
```

Cite, don't restate (P4): `pharn-contracts/eval-format.md` defines an eval as a `{case, expected}`
pair whose `expected.assertions` splits into `structural[]` and `semantic[]`. Nothing in this
increment is a Capability, so no eval in that sense is owed. The vitest test is the right artifact —
it is entirely `structural[]`-class (string set equality, no judge), so it does **not** launder a
floor-checkable assertion through an LLM. The finding is terminological: relabel the heading so a
later reader does not go looking for `evals/cases/*.md` that were never owed.

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: '.dev/features/ci-matrix-required-checks/PLAN.md:74'
  problem: 'The rollback path for the one irreversible, un-revertable part of the increment — the GitHub ruleset mutation — is a session-scoped scratchpad file that will not exist tomorrow.'
  evidence: 'The current ruleset JSON is captured to the session scratchpad first so it can be restored verbatim.'
```

Ruleset 18605288 is repo **settings**, not a file: `git revert` cannot undo it, no writes-scope hook
gates it, and no test covers it. Its pre-change JSON is the only record of what 33 contexts were
required. A scratchpad under `/private/tmp/claude-501/...` is deleted with the session. Either the
backup belongs somewhere durable, or `SHIP.md` must record the exact restore command with the
verbatim prior context list inline.

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: '.dev/features/ci-matrix-required-checks/PLAN.md:71'
  problem: 'The plan does not account for the two open dependabot PRs, which were opened against the old workflow and will not report the six newly-required contexts until they are rebased onto the merged change.'
  evidence: '**Out of repo, done as a separate deliberate step, not a file write:** update ruleset 18605288''s `required_status_checks` to the 9 contexts above'
```

Verified live this run: PR #88 is `mergeable_state: "behind"`, and the ruleset sets
`strict_required_status_checks_policy: true` — so both dependabot PRs already require an update-to-
`main` before merging, which will pick up the new `ci.yml` and produce the six contexts. The exposure
is therefore **bounded and self-healing**, not a trap — but it should be stated, because between the
ruleset edit and their rebase both PRs display six permanently-pending required checks, which looks
identical to the failure being fixed. Naming it now prevents diagnosing it twice.

### Axis: docs cite code (P4)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: '.dev/features/ci-matrix-required-checks/PLAN.md:47'
  problem: 'The plan accepts that node 20 and 22 lose all CI coverage but plans no corresponding change to the `engines.node` range or to any doc that advertises it, leaving a published support claim that nothing exercises.'
  evidence: '`package.json` declares `engines.node: ">=20"`, and after this change **no CI gate exercises node 20 or 22 at all**'
```

This is the sharpest concern in the plan and the plan itself raises it — credit where due — but it
stops at recording the limit. `@pharn-dev/pharn` ships `engines.node: ">=20"` to npm; after this
change that range is asserted, published, and untested at both its lower bound and its midpoint. Two
coherent resolutions exist, and the choice is the human's (P5/P6 terminal fallback = ask): narrow
`engines.node` to what CI actually gates, or keep the range and add back a node-20 `Test` job only.
Doing neither is defensible for one increment; doing neither **silently** is what P4 objects to.

### Axis: one axis of change (P3), determinism (P5), trust (P2)

No findings.

- **P3** — each planned file changes for one reason: `ci.yml` for job topology, the test for the
  name invariant, the two docs for describing it. No sibling-leaf import is introduced; nothing in
  `src/` is touched.
- **P5** — the test's decision is set equality over extracted strings; there is no classifier, no
  matrix product, no exclusion list, and no fallback that ends in a guess.
- **P2** — no untrusted artifact is ingested. The plan preserves `permissions: contents: read` and
  `persist-credentials: false` on `pull_request`, so splitting one job into six does not widen the
  token surface a fork PR can reach.

---

## Summary

The plan is internally honest — it labels its own advisory gaps rather than dressing them as
guarantees, and it records the node-24 coverage decision as a named limit instead of quietly
narrowing what CI proves. Its guarantee audit does not contain the P0 disease.

Four concerns are worth the human's attention before `/pharn-dev-build`. Two are about the increment's
**edges rather than its core**: the ruleset mutation has no durable rollback record, and the two open
dependabot PRs will show six pending required checks until they rebase (bounded — `strict` policy
already forces that rebase). One is about the **strength of the only floor reduction**: the regex
extractor's parsing rule is unspecified, and `name:` occurs at three levels of a workflow file, so
the test must anchor on indentation, assert an exact count, and exclude the workflow-level `name: ci`
or it guards less than it advertises. The fourth is the **published-but-untested `engines.node`
range**, which the plan surfaces and then leaves unresolved.

None of these argues against building. Three are satisfied by tightening the test and recording the
rollback verbatim; the fourth is a decision the human should make explicitly rather than inherit.

**ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 4 important, 2 minor) — for the human to
weigh before `/pharn-dev-build`.** This grill-log gates nothing: every finding above rests on model
judgment, the severities are LLM-assigned and advisory (fix #3), and the only floor-grade facts in
this run are the spec-hash match, the `count-grillers.mjs` membership result, and the writes-scope
hook that pinned this file. `/pharn-dev-build`'s own floor-gates remain the deterministic backstop.
