# REVIEW — ci-matrix-required-checks

**Floor first (P0):** `node .dev/floor/validate.mjs .` exit **0** — GREEN. Everything below the floor
line is **advisory**.

**Independent structural check of the built artifact** (not a claim from the diff): parsing
`.github/workflows/ci.yml` as YAML yields 6 jobs, names `Format check` / `Lint` / `Markdown lint` /
`Typecheck` / `Test` / `Build`, each `runs-on: ubuntu-latest`, `node-version: 24`,
`persist-credentials: false`, 4 steps; workflow `permissions: {contents: read}`; triggers
`pull_request` + `push`. The file is valid Actions YAML, not merely well-formatted text.

---

## Floor-gate findings (blocking)

**None.** No guarantee in this increment lacks a floor reduction or an `advisory` label; no eval
binding is missing (0 Capabilities added, 0 eval pairs owed — the floor agrees); no sibling reference
exists; no guaranteed decision rests on a tainted field.

---

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'CLAUDE.md:28'
  problem: 'The docs assert as present-tense fact that the `main` ruleset requires these six names, but the ruleset has not been changed — it still requires the 30 matrix contexts, so the documented state does not exist yet.'
  evidence: 'are a **contract with the `main` branch ruleset**, which lists exactly those strings in `required_status_checks`'
```

The same claim appears a second time in the other doc:

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'docs/contributing.md:47'
  problem: 'States the job names are the exact contexts the ruleset requires — true only after the approved out-of-repo ruleset step is performed, which this run deliberately deferred and has not done.'
  evidence: 'The job names above are the exact contexts the `main` branch ruleset requires'
```

This is the sharpest thing in the increment. Verified live rather than inferred: ruleset 18605288
still carries the 33 contexts it had at 2026-08-12T11:58 (30 matrix names + `floor` + `gitleaks` +
`Analyze (javascript-typescript)`). Both docs were written for the post-change world. **P4 forbids
documenting behavior the code does not have**, and a doc asserting an external configuration that is
not so is the same defect pointed outward.

It resolves in one of two directions, and the direction is the human's at the post-review gate:
perform the approved ruleset update (after which both sentences become true, and this finding
evaporates), or soften both sentences to the intended-state framing. What must **not** happen is
merging the docs while the ruleset still says something else — that reinstates exactly the
workflow↔ruleset disagreement this increment exists to end, only now with the repo confidently
documenting the wrong side of it.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'tests/ci-workflow.test.ts:11'
  problem: 'The increment''s only floor reduction covers the repo half of a two-sided invariant, and the uncovered half is the half that actually failed in production.'
  evidence: 'Nothing here reads the live ruleset, so a ruleset edited on github.com still drifts silently — an advisory limit, stated rather than papered over (P0).'
```

Not the P0 disease — the limit is labeled `advisory` at all four places it appears (the test header,
`CLAUDE.md`, `PLAN.md`'s guarantee audit, `VERIFY.md`'s residual), which is exactly what P0 asks of a
claim that cannot reduce to a floor primitive. Raised so it is weighed rather than inherited: after
this increment the repo still cannot detect the recurrence of the incident that motivated it. A
non-blocking job that diffs the live ruleset against the workflow via `gh api` would close it, and is
correctly **not** bundled here (P7).

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/floor/check-run-pins.test.mjs:377'
  problem: 'The lockfile-install count is now a constant that must be hand-updated by anyone who adds or removes a CI job, and nothing points a future editor from the workflow to this file.'
  evidence: 'assert.equal(d.skipped, 7);'
```

Working as designed — the assertion's own comment says a changed count means an install was added or
removed on purpose, and this increment is precisely that case, confirmed through the human gate rather
than absorbed silently. The residual cost is a coupling with no signpost at the other end: `ci.yml`
does not mention that adding a seventh job breaks a floor test. Cheap mitigation if desired — one line
in `ci.yml`'s header comment. Not done here: `ci.yml` is in scope, but adding it now would be an
unreviewed edit after the verify verdict was computed, and the pipeline's ordering matters more than
the convenience.

Otherwise clean: `tests/ci-workflow.test.ts` ships with the behavior it specifies (P1) and was
**mutation-checked**, not merely observed green — renaming `Markdown lint` to `Markdown Lint` fails 2
of its 4 cases. That is the difference between a test that demonstrates a behavior and one that merely
asserts it exists (P1's actual wording).

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/floor/check-run-pins.test.mjs:371'
  problem: 'A comment in a reviewed file did shape a decision in this run — it told the agent how to respond to the failing assertion, and the agent responded that way.'
  evidence: 'If this number changes, a lockfile install was added or removed on purpose.'
```

Self-reported per L-trust's instruction to say so when reviewed content influences behavior. The
honest accounting: this file is repo-owned and `trust: trusted`, not fetched or untrusted input, so
following its guidance is not the attack pattern P2 targets — and the decision was **not** taken on
the comment's authority. It was routed through the human gate (the writes-scope hook denied the edit,
the plan amendment was approved explicitly), and the comment's factual claim was verified
independently: `d.violations` is `[]` and all six added lines are `npm ci`. Noted because the defense
is noticing, not because a boundary was crossed.

No untrusted artifact is ingested anywhere in this increment. All six jobs preserve
`permissions: contents: read` and `persist-credentials: false` — confirmed by parsing the YAML, not by
reading the diff — so a fork PR's untrusted content still cannot exfiltrate or mutate from these jobs.
Splitting one job into six multiplies the job count, not the token surface.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.github/workflows/ci.yml:31'
  problem: 'The six jobs are near-identical 12-line blocks, so any change to the runner, the node version, or the action pins is six coordinated edits with no structural guard that they stay identical.'
  evidence: 'name: Format check / runs-on: ubuntu-latest / uses: actions/checkout@3d3c42e5… (repeated six times)'
```

Accepted, and the alternatives are worse here. A reusable workflow would rename the contexts to
`caller / callee` and break the very ruleset coupling this increment exists to establish; YAML anchors
are not supported by Actions; a composite action would add a file and an indirection to save four
lines per job. The duplication is also **guarded**: `tests/ci-workflow.test.ts` asserts the runner and
node version across *every* job, so silent divergence fails, and `.dev/floor/check-run-pins.test.mjs`
independently pins the install count. Explicit-and-checked beats clever-and-unpinned for a file whose
job names are load-bearing.

No file carries two change-reasons; no leaf imports a sibling; nothing in `src/` is touched.

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'docs/contributing.md:47'
  problem: 'The required-context list now exists in four places — the test''s EXPECTED_GATES map, the ci.yml header comment, CLAUDE.md, and docs/contributing.md — none of which is the authority, which is the GitHub ruleset.'
  evidence: 'Three more workflows report required checks: `floor`, `gitleaks`, and `Analyze (javascript-typescript)`'
```

Only one copy is enforced (the test's map); the other three are prose that can rot independently.
Tolerable at this size and arguably useful — each copy serves a different reader — but it is four
things to update on the next CI change, and worth knowing before the fifth copy is added.

---

## Verdict

**GREEN — 0 floor-gate findings, 7 advisory** (2 important, 5 minor). The increment is not blocked.

The two important findings are the same defect stated in two files: **the docs describe a ruleset that
has not been changed yet.** They are true the moment the approved out-of-repo step runs, and false
until then. That is the decision waiting at the post-review gate, and it is the human's.

Every severity above is **LLM-assigned and advisory** (fix #3). The only floor-grade facts in this
review are `validate.mjs` exit 0 and the YAML parse; `REVIEW.md` has no `findings.json`, no
`check-review.mjs`, and gates nothing.

---

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` decides)

Proposed candidate for `.dev/memory-bank/lessons-learned.md`. Recorded here as a proposal only;
`/pharn-dev-review` writes no canon, and the model never self-promotes (P2).

- **Lesson:** A gate-capture harness must prove it *ran* before its exit code is treated as a result.
  In `/pharn-dev-regress` this run, `node --test $TESTS_ARR` was expanded unquoted under **zsh**, which
  — unlike bash — does **not** word-split an unquoted parameter expansion (it *does* split an unquoted
  command substitution). All 46 paths arrived as one argument, `node --test` exited 1 having run
  nothing, and because the identical breakage hit **both** the baseline and HEAD captures, the
  comparator saw `1 → 1` and reported `pre_existing` / `no-regressions`. A real regression sat behind
  a green verdict. The comparator was never wrong about the ints it was given — the orchestration fed
  it ints that meant nothing. Remedy applied: assert a TAP summary line exists on each side before
  writing the results map, so a run that executed zero tests can never be recorded as a result.
- **Why it is canon-worthy (P7 — real, not hypothetical):** it is a live failure from this increment,
  it produced a false green on the one stage whose entire purpose is catching regressions, and the
  failure mode is invisible precisely because it is symmetric — the two-sided comparison that makes
  `check-regress` trustworthy is also what hides a harness that broke identically on both sides.
- **Provenance:** increment `ci-matrix-required-checks`; base
  `4b8a0be0c4cbb1e84c93cf0ae47ffd3324c205b9`; see `REGRESSION.md` § "Run 1 (superseded)" for the
  captured evidence and `regression-report.json` for the corrected verdict.
