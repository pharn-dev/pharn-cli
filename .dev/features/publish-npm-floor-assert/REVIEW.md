# REVIEW — publish-npm-floor-assert

Floor precondition (Step 1, P0): `node .dev/floor/validate.mjs .` → **`FLOOR: GREEN`**, exit 0. The
increment reached review with a green floor, as required. Everything below the floor line is
**advisory**.

Increment under review (`trust: untrusted`): `.github/workflows/publish.yml`, `docs/RELEASING.md`,
`.dev/floor/check-run-pins.mjs` (381 lines), `.dev/floor/check-run-pins.test.mjs` (413 lines).

---

## floor-gate findings (blocking)

**None.** No guarantee in this increment lacks either a floor reduction or an `advisory` label; no
eval binding is missing that the floor disagrees with; no guaranteed decision rests on a tainted
field; no sibling module is imported.

---

## advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".github/workflows/publish.yml:38"
  problem: "The new comment claims the floor gate keeps 'this' true, but the nearest antecedent is 'downloads no third-party tool at all' — which is wider than what check-run-pins actually enforces, since its own R1 residual excludes curl-and-execute and every non-package-manager pull."
  evidence: "the release job, which holds `id-token: write` and the `npm-publish` environment, now downloads no third-party tool at all. (…) The floor gate .dev/floor/check-run-pins.mjs keeps this true."
```

The overclaim is small and entirely inside a comment, but it is the disease's exact shape in
miniature: a true statement about the package-manager class rendered as a statement about the whole
supply chain. **Suggested one-word repair before merge:** *"keeps the package-manager half of this
true"* — or move the sentence to sit directly against the install claim it actually covers. The
checker's own header states the bound correctly (R1), so only the workflow comment drifts.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/floor/check-run-pins.mjs:52"
  problem: "R5 correctly records that the gate cannot enforce the assert step's PRESENCE, which means the increment's headline guarantee — npm >= 11.5.1 at publish time — is protected against reversion to a floating install but not against plain deletion."
  evidence: "R5 — the ASSERT's PRESENCE. This gate enforces that no floating install EXISTS; it cannot enforce that publish.yml's `Assert npm floor` step still exists. Deleting that step trips nothing here."
```

Labeled, so not blocking — P0 is satisfied by the naming. Recorded because it is the **most likely
future hole** in this increment: the natural next gate is not "more install shapes" but "publish.yml
still contains the assert." Candidate for the same follow-up ticket as the node-version policy.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/publish-npm-floor-assert/VERIFY.md:14"
  problem: "The verify stage's DEFAULT gate set would have returned PASS without executing a single one of this increment's 40 assertions, because its `test` gate is `npm test` (vitest over tests/**/*.ts) and the feature's only tests are .mjs."
  evidence: "The default set's `test` gate is `npm test`, which is vitest over `tests/**/*.ts` and does not collect `.mjs`."
```

Caught and repaired **during** this run by widening the gate set (`floor-tests`), and the widening is
declared in `VERIFY.md` rather than hidden. It is filed as `important` anyway because the repair was
**orchestration, not floor** — the next `.mjs`-only increment gets no such protection unless its
operator notices the same thing. This is the lesson candidate below.

Positive note, recorded because the floor and the lens must be confirmed to agree: `validate.mjs`
reports `0 capabilities checked` — vacuously green, correctly, since this increment adds no markdown
Capability and therefore has no `enforces`/eval binding to check. Floor and lens agree.

### L-trust → P2

No instruction-looking content in the reviewed increment altered this review's behavior; nothing in
the workflow, the docs, or the checker attempted to direct the reviewer. Reported as required by the
lens, not as a finding.

Taint handling is correct and matches the sibling gate: `check-run-pins.mjs` copies the offending
package spec verbatim into `violations[].ref`, so that string inherits the scanned file's trust — but
the verdict is `violations.length > 0`, an integer test, so **no guaranteed decision reads a tainted
field** (`check-run-pins.mjs:60-62`, mirroring `check-action-pins.mjs:42-44`).

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/floor/check-run-pins.test.mjs:383"
  problem: "The positive-control test reads the live publish.yml, mutates it in memory and writes it into a scratch repo — a pattern that would carry hostile workflow content into a temp tree if publish.yml were ever attacker-controlled."
  evidence: "const live = readFileSync(join(REPO, \".github\", \"workflows\", \"publish.yml\"), \"utf8\");"
```

Assessed and judged safe, but worth stating rather than assuming: the content is only **written and
scanned**, never executed, the scratch dir is under `os.tmpdir()`, and `publish.yml` is a trusted
in-repo file protected by review. The pattern would need reconsideration if the control were ever
pointed at a fork-supplied file.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/floor/check-run-pins.test.mjs:38"
  problem: "The test file spawns check-action-pins.mjs for the R2 drift cross-check and the R6 symlink-agreement pin, giving it a second reason to change — it now fails when the SIBLING gate changes, not only when its own subject does."
  evidence: "const SIBLING = join(here, \"check-action-pins.mjs\");"
```

**Deliberate, and defended:** it is a path spawned as a subprocess, not a module import, so no
internals are coupled and `check-run-pins.mjs` itself remains stdlib-only (verified: its sole imports
are `node:fs` and `node:path`). The coupling exists precisely to backstop two named residuals that
would otherwise be prose-only. The cost — the second change-reason — is real and is recorded here so
the trade is visible rather than discovered later.

The **two-axis PR** (fix the instance + build the class gate) is noted, not re-litigated: it was
raised at GATE 1 and is a recorded human decision, and `PLAN.md` states it plainly.

---

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` only)

```yaml
candidate:
  id: L-gate-set-blindspot
  lesson: >
    A stage's DEFAULT gate set can be structurally blind to the increment under test. `/pharn-dev-verify`'s
    `test` gate is `npm test` = vitest over `tests/**/*.ts`; an increment whose only tests are `.mjs`
    floor tests therefore gets a PASS in which none of its assertions ran. Before trusting a stage
    verdict, check that the gate set can SEE the increment's file types — a green verdict over a gate
    that never opened the feature is the "verified means the gates passed, and the gates checked
    nothing" hole.
  provenance:
    increment: publish-npm-floor-assert
    observed: "verify Step 1 default set; repaired by adding a `floor-tests` gate (VERIFY.md)"
    real: true # observed this run, not hypothetical
```

Recorded as a **candidate only**. Promotion requires a separate human-gated `/pharn-dev-memory-promote`
run under its own scope, behind `check-provenance.mjs`.

---

## Disposition after the human's "fix everything" (recorded post-review)

| finding | disposition |
| ------- | ----------- |
| P0 minor — `publish.yml` comment overclaims | **FIXED.** The gate sentence was split out and now says it keeps the **package-manager half** true, naming R1's exclusion of curl-and-execute inline. |
| P0 minor — R5, the assert's PRESENCE unguarded | **FIXED, next door.** `check-run-pins.test.mjs` now asserts that `- name: Assert npm floor` and its `"$(npm --version)" 11.5.1` comparison are present in the committed `publish.yml`. Collected by the same `floor.yml` `node --test` run, so reversion-to-floating **and** plain deletion are both caught. Verified to fail when the step is removed. R5's text in the checker header was rewritten to say the coverage exists but is **not this program's doing**. |
| P1 important — verify gate-set blindspot | **REPAIRED IN-RUN** (the `floor-tests` gate) and retained as the canon candidate below. |
| P2 minor — the positive control reads the live `publish.yml` | **NO CHANGE.** Assessed safe: content is written and scanned, never executed; the file is trusted and review-protected. Kept as a stated note. |
| P3 minor — the test file spawns the sibling gate | **NO CHANGE.** Deliberate; it is the backstop for residuals R2 and R6, and it couples by subprocess path, not by import. |

One finding was raised in `GRILL.md` and is **not** fixed here, on the constitution's own instruction:
`.dev/floor/README.md` opens *"The floor is three files"* over a three-row table while the directory
holds 40+ checkers. That is a P4 doc-contradicts-code condition, and `CONSTITUTION.md` states the
agent **MUST NOT auto-fix a constitution violation** — it is flagged for human review, not repaired
in passing. It is also pre-existing (last touched in #15; #79 added a checker without updating it)
and outside this increment's approved `## Files`.

## Verdict

```text
GREEN — 0 floor-gate (blocking) findings; 5 advisory findings (1 important, 4 minor)
```

Three of the five are now fixed (see the disposition table); two were assessed and deliberately kept.
The one important finding was already repaired within this run.

**This verdict is advisory.** `/pharn-dev-review` computes no floor gate of its own — its only
floor-grade content is `validate.mjs` GREEN, which `/pharn-dev-build` and `/pharn-dev-verify` already gated. Severity
assignments above are LLM judgment. Whether this increment merges is the human's call.
