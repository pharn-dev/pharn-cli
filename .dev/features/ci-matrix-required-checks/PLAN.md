# PLAN — ci-matrix-required-checks

> **Revised after GATE 1 feedback.** The first draft proposed building the 30-context OS/node matrix
> the ruleset demands. The human rejected that direction: _"leave one check per each — we don't need
> to have one for node 20 one for node 22 etc., like we have before these changes."_ This plan now
> does the opposite: **one required check per gate, no matrix**, and the **ruleset** is what gets
> corrected. The slug is kept so the folder stays stable.

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Split `ci.yml`'s single `check` job into six independently-reporting gate jobs
  (`Format check`, `Lint`, `Markdown lint`, `Typecheck`, `Test`, `Build`) on one platform/node
  version, and reduce the ruleset's required contexts from the 30 never-reported matrix names to
  those six plus the three already-passing external contexts.
- layer(s): repo infrastructure (CI + repo config) — not a `ARCHITECTURE.md §4` product layer; no
  `src/` behavior changes.
- constitution_refs: [P0, P1, P4, P5, P6, P7]

## Live state this run (P6)

Read/verified in this run, not from memory:

- Ruleset `main protection` (id 18605288, `enforcement: active`, updated 2026-08-12T11:58) requires
  **33** contexts: 30 of the shape `<Gate> (<os> / node <ver>)` over
  `{Format check, Lint, Markdown lint, Typecheck, Test, Build}` ×
  `{ubuntu-latest 20, ubuntu-latest 22, ubuntu-latest 24, windows-latest 24, macos-latest 24}`,
  plus `floor`, `Analyze (javascript-typescript)`, `gitleaks`.
- `.github/workflows/ci.yml` defines **one** job, `check` (ubuntu-latest, node 20), running the six
  gates as `if: always()` steps. It reports the context `check` — which the ruleset does not list.
- Consequence on PR #92: `gh pr checks 92` → all 8 reported contexts pass; the 30 matrix contexts sit
  at "Expected — waiting for status to be reported" and never arrive. Merge is blocked.
- `floor`, `gitleaks`, `Analyze (javascript-typescript)` are produced by `floor.yml`, `gitleaks.yml`,
  `codeql.yml` and already pass. Their contexts are **bare job names** (`codeql.yml` job `analyze` is
  `name: Analyze (${{ matrix.language }})`) — confirming a required context is the check-run name,
  not `workflow / job`. No other workflow defines a job named `Build`, `Test`, `Lint`, `Typecheck`,
  `Format check`, or `Markdown lint`, so the six new names cannot collide.
- `package.json` `engines.node` is `>=20`; the six gate scripts are `format:check`, `lint`,
  `lint:md`, `typecheck`, `test:coverage`, `build`.
- `.prettierrc` sets `"endOfLine": "lf"` and the repo has no `.gitattributes` — this mattered only
  for the rejected Windows cell and is therefore **out of scope now** (P7: no speculative addition).

## Decision (records the human's answers at GATE 1)

Six required contexts, one per gate, on **ubuntu-latest / node 24** — one job per gate, no matrix.
Multi-OS coverage is explicitly **not** part of this increment.

Node 24 was chosen over today's node 20 (human's answer). Recorded consequence, so it is a decision
and not an accident: `package.json` declares `engines.node: ">=20"`, and after this change **no CI
gate exercises node 20 or 22 at all**. A node-24-only pipeline can go green on code that breaks the
declared minimum. That is an accepted, named limit of this increment (P7) — not a claim that node 20
is supported-and-verified.

Resulting required-status-check list (9 contexts, all of which actually report):

`Format check`, `Lint`, `Markdown lint`, `Typecheck`, `Test`, `Build`, `floor`,
`Analyze (javascript-typescript)`, `gitleaks`.

## Files

- `.github/workflows/ci.yml` — rewrite: six jobs (`format-check`, `lint`, `markdown-lint`,
  `typecheck`, `test`, `build`), each `runs-on: ubuntu-latest` with node 24, each with an explicit
  `name:` equal to its required context; keep the existing pinned action SHAs and
  `persist-credentials: false`; the aggregate `check` job and its `if: always()` step guards are
  removed — job-level independence supersedes them — layer: CI infra.
- `tests/ci-workflow.test.ts` — new vitest test pinning the six job names and their gate commands
  (see Evals) — layer: tests.
- `.dev/floor/check-run-pins.test.mjs` — **added by human-approved amendment after the first
  `/pharn-dev-regress` STOP**, not present in the originally-approved `## Files`. Its live-repo
  assertion `assert.equal(d.skipped, 2)` counts lockfile (`npm ci`) installs across every workflow;
  six gate jobs raise that count to 7, so the exact-count tripwire fires by design — its own comment
  says a changed count means "a lockfile install was added or removed on purpose", which is precisely
  the case here. The edit is the one number plus a comment naming the new arithmetic. `d.violations`
  stays `[]` — every added line is `npm ci`, so **no floating install is introduced** and the rule the
  checker actually enforces is untouched — layer: floor tests.
- `CLAUDE.md` — update the CI paragraph: the six gates now run as six **jobs**, each reporting its
  own required status check, rather than six steps in one `check` job (P4).
- `docs/contributing.md` — update "Quality gates": name the six jobs and add the missing
  `npm run build` gate (P4).

**Out of repo, done as a separate deliberate step, not a file write:** update ruleset 18605288's
`required_status_checks` to the 9 contexts above via `gh api`. This is a GitHub settings mutation,
not a plan file — it is called out here so the increment is not mistaken for complete without it.
The current ruleset JSON is captured to the session scratchpad first so it can be restored verbatim.

## Contracts satisfied

- None in `pharn-contracts` — this increment adds no Capability, finding, or install surface. It is
  repo infrastructure. Named explicitly so the omission is not read as an oversight (P0/P7).

## Evals to write (P1)

`tests/ci-workflow.test.ts` — deterministic, dependency-free (no YAML parser is a direct
devDependency; a regex extractor over the raw file is the floor primitive here, `ARCHITECTURE.md §2`
#3). It encodes exactly the defect this increment fixes — a workflow job name drifting away from the
required context that names it:

- extract every `name:` under `jobs:` in `.github/workflows/ci.yml` → assert **set equality** with
  the six expected contexts (both directions: a rename, an addition, or a deletion fails);
- assert each job's `run:` line is its expected npm script — `Format check` → `npm run format:check`,
  `Lint` → `npm run lint`, `Markdown lint` → `npm run lint:md`, `Typecheck` → `npm run typecheck`,
  `Test` → `npm run test:coverage`, `Build` → `npm run build`;
- assert every job declares `runs-on: ubuntu-latest` and `node-version: 24`, so a silent
  platform/version change cannot slip in unreviewed.

## Guarantee audit (P0)

- "`ci.yml` defines exactly the six named gate jobs, each running its own gate" → **floor:
  enum/regex** — `tests/ci-workflow.test.ts` set-equality + per-job command assertions.
- "Those six names equal what the GitHub ruleset requires" → **advisory.** The expected list is a
  checked-in copy; nothing in this repo reads the live ruleset. If the ruleset is edited on
  github.com again, the test still passes and PRs block again. This is precisely how the current
  breakage happened; it is a stated limit, not a solved problem.
- "The six gates are independent — one failure can't mask another" → **advisory**, but structurally
  stronger than before: previously six `if: always()` steps in one job (one context, first failure
  reported); now six jobs, each with its own context and its own pass/fail.
- "Merging PR #92 becomes possible" → **advisory, and false on its own.** The ruleset's
  `required_signatures` rule independently blocks: commit `4b8a0be` is `"verified": false,
  "reason": "unsigned"`, and local git has no `commit.gpgsign` / `gpg.format` / `user.signingkey`.
  Per the human's answer this increment **reports that blocker and changes no signing config** —
  the rule stays enforced and the branch stays unmergeable until the human signs it.
- **Honest scope note (P7):** this increment deliberately *reduces* CI coverage relative to the
  ruleset's stated ambition — no Windows, macOS, node 20, or node 22 job. That is the human's
  explicit decision, recorded above. It should not later be described as "cross-platform CI", and
  node 20 must not be described as CI-verified while `engines.node` still claims `>=20`.

## Trust audit (P2)

No untrusted artifact is ingested: the change touches only repo-owned files. `ci.yml` keeps
`permissions: contents: read` and `persist-credentials: false` on `pull_request`, so a fork PR's
untrusted content still cannot exfiltrate or mutate anything from these jobs — the property
`floor.yml` documents is preserved, not extended. Splitting one job into six does not widen the
token or permission surface.

## Determinism audit (P5)

- The test's decision is set equality over extracted strings — a membership test, no classification.
- Each job is an explicit literal; there is no matrix, no computed product, and no exclusion list, so
  the emitted context set is a readable enumeration.
- No fallback branch is introduced; a malformed `ci.yml` fails extraction and the test fails loudly
  rather than degrading to a partial match.

## Open questions (HALT)

None outstanding — all three were resolved at GATE 1:

1. Shape → **six contexts, one per gate** (not the single `check` job).
2. Node version → **node 24** (limit recorded under Decision and Guarantee audit).
3. Signing → **report only**; no git signing config is touched by this increment.
