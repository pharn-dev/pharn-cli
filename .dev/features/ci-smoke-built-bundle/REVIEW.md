# REVIEW — ci-smoke-built-bundle

Floor first (P0): `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`, exit
**0**. The increment reached review with a green floor, so the four lenses below run as intended.
Everything under "Advisory" rests on judgment and blocks nothing.

---

## Floor-gate findings (blocking)

**None.** No guarantee in this increment lacks a floor reduction or an `advisory` label; no eval
binding is missing (no Capability is added, and `validate` agrees at 0); no sibling reference exists
(the increment touches no `src/` file at all).

---

## Advisory findings

### L-floor → P0

**No finding.** Every claim the increment makes is either reduced or explicitly struck, and the two
most over-readable ones are struck *in the artifact itself* rather than only in the plan:

- `.github/workflows/ci.yml:141` — "a green Build never means 'the CLI works'", with the reason
  (both flags return from `main()` before dispatch).
- `.github/workflows/ci.yml:137` and `tests/ci-workflow.test.ts:60` — the `external`-list claim is
  narrowed to the one direction that is actually newly covered, naming where the other direction is
  already caught. This closes the one **important** concern `GRILL.md` raised.
- `tests/ci-workflow.test.ts:246` — "An assertion that cannot independently fail is decoration, not
  coverage (P0)". Notably this is not a slogan: the assertion it refers to was **removed** on that
  reasoning, not merely annotated.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/ci-workflow.test.ts:224'
  problem: 'The new guarantee is enforced only when GitHub actually runs the Build job; no local gate builds the bundle and executes it, so `npm run check` stays green against a bundle that would not load.'
  evidence: "expect(captureAll(block!, /^\\s+run: (.+)$/gm)).toEqual(['npm ci', script, ...(EXTRA_RUNS.get(gate) ?? [])])"
```

The test pins the **file**; the runner enforces the **behavior**. That split is inherent to a CI-step
fix and is the same standing every other gate in `ci.yml` has — but it is worth stating that a
contributor can still ship bundle-breaking drift and see a green local `npm run check`, because
`check` deliberately excludes `build`.

Considered and **deliberately not done** in this increment: a vitest test that builds and spawns the
bundle. It would need `dist/` to exist, which `npm test` does not produce — so it would either add a
full esbuild build to every test run, or skip when `dist/` is absent, which is the weaker gate
pretending to be the stronger one. CI, where the build has just run, is the correct home. Recorded
so the omission reads as a decision.

Otherwise clean: the one new behavior ships with its test in the same increment (P1), and that test
was **mutation-verified** rather than assumed — deleting the step from the live workflow turned it
RED, and the workflow was restored byte-for-byte afterward.

### L-trust → P2

**No finding, and one disclosure.**

The increment ingests no untrusted remote artifact and emits no `findings.json`, so there is no
free-text field for a guaranteed decision to rest on.

*Disclosure, because this lens asks directly whether instruction-looking content changed my
behavior:* `GRILL.md` contains a recommendation ("narrow the sentence to the first direction"), and
the built artifact **does** narrow that sentence. That is not the attack working — `GRILL.md` is a
stage of this same chain, not reviewed content, and the claim was re-derived against esbuild's actual
treatment of `external` before acting. Recorded rather than omitted, since a silent "no finding"
would hide that a recommendation in a read artifact did influence the output.

*Reviewed and bounded, not a finding:* the step means a **fork** PR's code is now executed by the
`Build` job, where before it was only compiled. `ci.yml` runs `on: pull_request` (not
`pull_request_target`), declares `permissions: contents: read`, sets `persist-credentials: false`,
and holds no secrets — and the job already executes fork-controlled code through `npm ci` lifecycle
scripts and `scripts/build.mjs`. The marginal capability is nil; the step adds no token, no secret,
and no egress (both flags return before any command dispatch).

### L-axis → P3

**No finding on the changed files.** `ci.yml` keeps one axis (CI gate definitions).
`tests/ci-workflow.test.ts` was checked against the concern `GRILL.md` raised — it already asserted
"what each gate job runs" (`runs each gate through its own npm script`, plus the runner/node pins),
so the smoke pin sits inside its existing subject rather than adding a second one. Splitting it out
would have duplicated the `jobBlocks` extractor for no gain.

**Two docs are left stale by the increment**, and both are outside the plan's `## Files`, so fix #7
correctly prevented `/pharn-dev-build` from touching them:

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'docs/contributing.md:47'
  problem: 'The contributor-facing gate table describes the Build job as "typecheck + esbuild bundle"; that job now also executes the bundle, which is the entire coverage this increment adds.'
  evidence: 'npm run build          # job "Build" — typecheck + esbuild bundle'
```

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CLAUDE.md:28'
  problem: 'The CI paragraph enumerates what tests/ci-workflow.test.ts pins — "the names, their npm scripts, and the runner/node pair" — and that list is now incomplete: it also pins the smoke step and cross-checks it against package.json bin.pharn.'
  evidence: '`tests/ci-workflow.test.ts` pins the names, their npm scripts, and the runner/node pair; it cannot see the ruleset, so the other half of that invariant stays advisory.'
```

Neither is a contradiction — `npm run build` still is exactly typecheck + esbuild bundle, and the
CLAUDE.md list is a true subset — so neither trips P4's STOP condition. They are **incomplete**, and
the incompleteness is precisely about the thing the increment exists to add, which is why the first
is `important`. **Recommendation for the human at the post-review gate:** a two-line doc follow-up,
or an explicit plan amendment if these should land in this PR. They were not fixed here because the
approved scope was the audit's minimal fix, and growing past it is a decision reserved to the human.

---

## Proposed lesson candidate (NOT promoted — `/pharn-dev-memory-promote` + human gate required)

Offered as a candidate only. `/pharn-dev-review`'s scope is this file; nothing is written to canon here,
and the model never self-promotes (P2).

- **Candidate:** when a test is extended to pin a new fact, mutate the thing it pins and observe
  **which** assertions fire — an assertion whose failure is already implied by a stricter neighbour is
  decoration, and only mutation distinguishes the two.
- **Provenance:** this increment (`ci-smoke-built-bundle`); deleting the `Smoke the built bundle` step
  from `.github/workflows/ci.yml` showed the index-compare could never fail independently of the
  exact-array equality above it, and it was removed.
- **Honest caveat against promotion (P7):** this is **one** observation, not an established recurring
  failure. It may not meet the recurrence bar, and it should not be promoted on the strength of a
  single instance.

---

## Verdict

**GREEN — 0 floor-gate findings.** Three advisory findings (one `important`, two `minor`), of which
the `important` one and one `minor` are doc staleness **outside** the increment's declared scope.

Stated plainly: this verdict means the four lenses found no blocking floor-reducible defect. It is
not a judgment that shipping the increment is the right call — that is the human's decision at the
post-review gate.
