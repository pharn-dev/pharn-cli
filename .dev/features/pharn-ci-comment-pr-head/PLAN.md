# PLAN — pharn-ci-comment-pr-head

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Post pharn-ci's sticky PR comment for a **same-repository** pull request from a new,
  non-required `pharn-ci comment` job in `ci.yml` that measures the PR exactly as the gating `Test`
  job does, and limit `pharn-ci-comment.yml` (`workflow_run`, PR-number mode) to **fork** PRs. Then
  the comment's verdict comes from the same inputs as the gating `pharn-ci-report`.
- layer(s): repo infrastructure (CI workflows + their pinning test). Not an `ARCHITECTURE.md §4`
  product layer; **no `src/` change**, nothing published.
- constitution_refs: [P0, P1, P5, P6, P7]

## Live state this run (P6)

Read from disk and from GitHub this run:

- `.github/workflows/pharn-ci-comment.yml` runs on `workflow_run` (`ci` completed). It checks out the
  **default branch**, downloads the `pharn-ci-input` artifact (coverage + `pr-number`) and runs
  `pharn-dev/pharn-ci@38aca1f…` (v0.10.0) with `pr-number`, `head-sha:
github.event.workflow_run.head_sha`, `test-integrity: block`, `fail-on-verdict: false`. Its `if:`
  is only `github.event.workflow_run.event == 'pull_request'`, so it runs for **every** PR,
  same-repo ones included.
- The `Test` job in `ci.yml` runs pharn-ci on `pull_request` with `comment: false`,
  `test-integrity: block`, a `fetch-depth: 0` checkout of the PR, and `.pharn/ci.yml`'s
  `coverage.file: coverage/lcov.info`. It holds `contents: read` + `pull-requests: read` and runs
  `npm ci` + the test suite (dependency code) in the same job.
- **Root cause (pharn-ci source, `~/Projects/pharn-ci` at v0.10.0, `packages/action/src/run.ts:687,
726, 766, 842, 885, 934`):** when `pr-number` is set (`from.target`), pharn-ci _unconditionally_
  returns "unavailable" for the test-file texts (`pr-number mode: the diff came from the GitHub
API`) and the agent-config / settings / instruction texts (`the checkout is not the pull request
head`). pharn-ci's README ("Fork PRs: comment from workflow_run") documents it:
  `TEST_INTEGRITY_INDEX_UNAVAILABLE` is an error under `test-integrity: block` there. So the three
  messages are by design in PR-number mode. No v0.10.0 input changes this, and `main` (4e968b2) adds
  none. The "headSha = main's commit" seen in `gh run list` is the `workflow_run` run's own context
  (always the default branch). The `head-sha` input still carried the PR head and passed pharn-ci's
  head check.
- PR #356: comment = ❌ Fail (`TEST_INTEGRITY_INDEX_UNAVAILABLE` error, `AGENT_CONFIG_SECRET_UNSCANNED`
  warning, `package.json`/`package-lock.json` "unavailable" to dependency safety). The gating
  `pharn-ci-report` from run 43217801531 = `verdict: pass`, its one message the info
  `NO_COVERABLE_CHANGES`.
- `tests/ci-workflow.test.ts` pins `ci.yml` to **exactly** the six gate jobs (`ci.blocks.size ===
EXPECTED_GATES.size`, name set equality) and pins `node-version: 24` on **every** block. Adding a
  job turns it RED unless the test declares the job in the same increment.
- `.dev/floor/check-run-pins.test.mjs` asserts `skipped === 10` (`npm ci` count). The new job runs no
  `npm`, so the count holds. `.dev/floor/check-action-pins.test.mjs` asserts every `uses:` is
  full-SHA-pinned with a semver comment and `skipped === 0`. The new `uses:` lines copy existing pins.

## Design

**New job `pharn-ci-comment` (`name: pharn-ci comment`) in `ci.yml`:**

- `needs: test`; `if: ${{ !cancelled() && github.event_name == 'pull_request' &&
github.event.pull_request.head.repo.full_name == github.repository }}`. It runs after `Test`
  whether `Test` passed or failed (like the `workflow_run` comment did), and never on push or on a
  fork PR.
- `permissions: contents: read, pull-requests: write`. It is the **only** job in `ci.yml` with a
  write grant. On a fork PR GitHub caps the token to read anyway, so the `if:` is not the only
  thing standing between a fork and a write token.
- Steps (no `run:` at all, no `setup-node`, no `npm`, so **no repository code executes in the job
  that holds the write token**):
  1. `actions/checkout@3d3c42e…` with `fetch-depth: 0`, `persist-credentials: false`, the same
     checkout as `Test` (the same `github.sha` merge commit).
  2. `actions/download-artifact@9000827…` with `name: pharn-ci-input` from the **same run** (no
     `run-id`, no token), into the workspace, which restores `coverage/lcov.info` at the path
     `.pharn/ci.yml` names. So pharn-ci reads the same coverage file at the same path as in `Test`.
  3. `pharn-dev/pharn-ci@38aca1f…` (v0.10.0), `timeout-minutes: 5`, `test-integrity: block`,
     `fail-on-verdict: false` (`Test` gates), and `comment` left at its default `true`.

  The inputs are the same as `Test`'s pharn-ci step except `comment`, so the comment's verdict is
  computed from the same diff, files, coverage and mode as the gating report.

- Not a required check: its name is not in the ruleset or in `REQUIRED_CONTEXTS`. The six gate names
  are unchanged.

**`pharn-ci-comment.yml`:** the `if:` gains `&& github.event.workflow_run.head_repository.full_name
!= github.repository`, so it comments only on fork PRs (where the `pull_request` token cannot). The
header comment says what that path cannot read (PR-number mode) and points to pharn-ci's README. Its
`test-integrity` mode is unchanged (see the open question).

**Trade-off stated:** a same-repo PR's sticky comment moves from scope `pharn-ci comment/comment` to
the `ci` workflow's job. Open PRs keep the old (stale) comment until they are closed. New PRs get
one comment.

## Files

- `.github/workflows/ci.yml` — add the `pharn-ci-comment` job and correct the `Test` step's comment
  text about where the comment is posted — repo infra
- `.github/workflows/pharn-ci-comment.yml` — fork-only `if:` + header comment — repo infra
- `tests/ci-workflow.test.ts` — declare and pin the one non-gate job; keep set equality
  two-directional — repo infra test
- `CHANGELOG.md` — `[Unreleased]` → `### Changed` "CI:" entry (no version bump, nothing published) —
  docs

## Contracts satisfied

- None in `pharn-contracts`. The contract this keeps is the `ci.yml` ↔ `main` ruleset one in
  `CLAUDE.md` ("Commands"): the six job `name:` values stay exactly as they are.

## Evals to write (P1) — `tests/ci-workflow.test.ts`

- `ci.yml` jobs = six gates ∪ exactly `{pharn-ci comment}` (set equality, both directions; block
  count = 7) → a stray eighth job or a renamed gate fails.
- `REQUIRED_CONTEXTS` does not contain `pharn-ci comment` → the comment job cannot silently become
  "required" in the in-repo mirror.
- The runner/node pins loop over gate jobs only. The comment job: `runs-on: ubuntu-latest`, **no**
  `run:` lines, no `setup-node`, no `npm` → "no repo code under the write token" is pinned.
- The comment job holds `needs: test` and the same-repo `if:` (exact string), and its pharn-ci step
  uses the same `pharn-dev/pharn-ci@<sha>` and `test-integrity:` value as `Test` → its verdict
  inputs cannot drift from the gate's.
- `pull-requests: write` occurs exactly once in `ci.yml`, inside the comment job → the `Test` job
  (which runs `npm ci`) never gets a write grant.
- `pharn-ci-comment.yml`'s job `if:` contains the fork-only condition (exact string) → a same-repo PR
  cannot get a second, PR-number-mode comment.
- Verify the test can fail: drop the `if:` fork clause, add `pull-requests: write` to `Test`, add a
  `run:` to the comment job. Each must turn a test RED (done during build, then reverted).

## Guarantee audit (P0)

- "Required check names unchanged" → floor: `tests/ci-workflow.test.ts` set equality (enum/string
  membership), in the required `Test` check.
- "The comment job runs no repository code" → floor: the test pins zero `run:` lines and no
  `setup-node`/`npm` in that block (string membership). **Advisory residual:** the third-party
  actions it runs (`checkout`, `download-artifact`, `pharn-ci`) are trusted by their SHA pins
  (`check-action-pins`), not by inspection. pharn-ci may invoke `python3` on `.py` test files, which
  this repo has none of.
- "Fork PRs never get a write token here" → floor: GitHub caps `pull_request` tokens from forks to
  read-only (platform behaviour, not ours), plus the pinned `if:`. The `if:` alone would be
  advisory.
- "The comment's verdict agrees with the gating report" → **advisory**. Same inputs by construction
  (pinned by the test: same action SHA, same mode, same checkout, same coverage path). Equality of
  the two verdicts is not checked by any floor; it is verified once on this PR by reading both.
- "Fork PRs' comment is still PR-number mode and can disagree" → stated limit (pharn-ci's documented
  PR-number-mode behaviour). Not a guarantee.

## Trust audit (P2)

- `pharn-ci-input` artifact in the comment job → produced by `Test` in the **same run** of a
  same-repo PR, so it is no less trusted than the checkout itself (an author with push access). It
  is only read by pharn-ci as a coverage file, never executed. A forged coverage file can flatter
  its own PR, the residual pharn-ci's README already names. `Test`'s report stays the gate.
- Fork path unchanged: `pr-number` stays digits-only via `tr -dc`, the default branch is checked
  out, nothing from the artifact is executed.

## Determinism audit (P5)

- Both `if:`s are exact string comparisons on event payload fields
  (`pull_request.head.repo.full_name`, `workflow_run.head_repository.full_name`) against
  `github.repository`. They are complementary, so each PR gets exactly one of the two paths.

## Open questions (HALT)

- RESOLVED 2026-11-12 (human, GATE 1): plan approved as written; fork path keeps `block`.
- (was) Fork path's `test-integrity`: keep `block` (today's parity with `ci.yml`, so a fork PR that
  touches tests still shows ❌ `TEST_INTEGRITY_INDEX_UNAVAILABLE` in its comment) or switch to `warn`
  (pharn-ci README's recommendation for this flow)? The plan keeps `block`, which is out of scope
  unless you choose otherwise.
