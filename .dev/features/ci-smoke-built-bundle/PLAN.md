# PLAN — ci-smoke-built-bundle

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Add ONE `run:` step to the **existing** `Build` job in `.github/workflows/ci.yml` that
  executes the artifact the job just produced — `node dist/index.js --version && node dist/index.js
--help` — and pin that step in `tests/ci-workflow.test.ts`, whose per-gate assertion currently
  requires every gate's run list to be exactly `['npm ci', <script>]`.
- layer(s): repo infrastructure (CI + its pinning test) — not an `ARCHITECTURE.md §4` product layer;
  **no `src/` change at all**.
- constitution_refs: [P0, P1, P4, P5, P7]

## Live state this run (P6)

Read from disk this run, not from memory:

- `.github/workflows/ci.yml` defines exactly six jobs. The `build` job (`name: Build`,
  `runs-on: ubuntu-latest`, `node-version: 24`) has four steps: `actions/checkout` (SHA-pinned),
  `actions/setup-node` (SHA-pinned), `- name: Install` → `run: npm ci`, `- name: Build` →
  `run: npm run build`. **The `npm ci` precedes the build**, so `node_modules` exists in that job.
- `package.json`: `"bin": {"pharn": "dist/index.js"}`, `"type": "module"`, and the three runtime
  `dependencies` are `@clack/prompts`, `minimist`, `picocolors` — the exact set
  `scripts/build.mjs:15` marks `external`. They are `dependencies`, so `npm ci` installs them.
- `scripts/build.mjs` bundles `src/index.ts` → `dist/index.js`, `format: 'esm'`, `platform: 'node'`,
  `external: ['@clack/prompts', 'minimist', 'picocolors']`.
- `src/version.ts` computes `PHARN_VERSION` at **module scope** via
  `createRequire(import.meta.url)` + `require('../package.json')`. Its comment states the depth
  assumption explicitly: `src/version.ts` and `dist/index.js` sit at the same depth below the package
  root, so the same `'../package.json'` resolves in both. Nothing tests the bundled half.
- `src/index.ts:122-130`: `--version` prints `PHARN_VERSION` and **`return`s**; `--help` prints
  `USAGE` and **`return`s**. Neither calls `process.exit`, and `main().catch` is the only other exit
  path — so **both flags exit 0**. Both also short-circuit *before* `argv._[0] ?? 'init'`, so neither
  dispatches a command, touches the filesystem, or opens a socket.
- `grep -rn "dist/index" tests/ src/ scripts/ .dev/floor/` returns **three** hits, all outside
  `tests/`: two source comments and `scripts/build.mjs`'s `outfile`. **No test executes the bundle.**
  `tests/init.test.ts:503` is a static `readFileSync` source scan; `tests/repo-signals.test.ts:163`
  spawns `node_modules/tsx/dist/cli.mjs` against `src/`. The audit finding is confirmed live.
- `tests/ci-workflow.test.ts:192` asserts, per gate,
  `expect(captureAll(block, /^\s+run: (.+)$/gm)).toEqual(['npm ci', script])`. Adding any step to
  `Build` turns this RED unless the test is updated in the same increment.
- `.dev/floor/check-run-pins.test.mjs:377` asserts `d.skipped === 7` over the live repo — `skipped`
  counts recognised **lockfile** command heads (`npm ci`). The new line's head is `node`, which is not
  in `HEADS` at all, so it is neither `checked` nor `skipped` and the count is unchanged. To be
  re-verified by running the checker at build time rather than asserted from reading (P6).

## The hard constraint this plan is built around

The six job `name:` values are a contract with the `main` branch ruleset's
`required_status_checks`. GitHub reports a job under its `name:`, so **adding a job or renaming one
makes a required context unreportable and blocks every PR on a check nothing produces** — the exact
incident `.dev/features/ci-matrix-required-checks/PLAN.md` records. Therefore: a **step** inside the
existing `build` job, never a new job and never a matrix.

There is a second, independent reason the step cannot be its own job: `dist/` is not persisted
between jobs. Only the job that ran `npm run build` has an artifact to execute.

## Files

- `.github/workflows/ci.yml` — add ONE step to the existing `build` job, after `- name: Build`:
  `- name: Smoke the built bundle` / `run: node dist/index.js --version && node dist/index.js --help`.
  Written as a **single-line** `run:` (not a `run: |` block) because the pinning test captures the
  run value on the same line; a block scalar would capture `|`. No job is added, renamed, or
  matrixed; the six `name:` values and the pinned action SHAs are untouched — layer: CI infra.
- `tests/ci-workflow.test.ts` — extend the per-gate run-list assertion so `Build` may carry exactly
  this one extra run and no other gate may carry any, and cross-check that the smoked path is
  `package.json`'s `bin.pharn` — layer: tests.
- `CHANGELOG.md` — one entry under the existing `## [Unreleased]` → `### Added`. No heading is added,
  renamed, or restructured (several PRs are landing in parallel and this file is the conflict point).

## Contracts satisfied

- None in `pharn-contracts` — this increment adds no Capability, finding, or install surface. Stated
  explicitly so the omission reads as scope, not oversight (P0/P7).

## Evals to write (P1)

`tests/ci-workflow.test.ts`, extending the existing dependency-free regex extractor (no YAML parser
is a direct devDependency; a line-anchored regex over the raw file is the floor primitive here,
`ARCHITECTURE.md §2` #3):

- a `SMOKE_RUN` constant holding the exact command, plus
  `EXTRA_RUNS: ReadonlyMap<string, readonly string[]>` = `[['Build', [SMOKE_RUN]]]`; the existing
  per-gate assertion becomes
  `toEqual(['npm ci', script, ...(EXTRA_RUNS.get(gate) ?? [])])`. **One assertion, both directions:**
  the smoke step missing from `Build` fails it, and a run step added to *any* gate — `Build`
  included — that is not in the table fails it too. The P3 property the original assertion bought
  ("a gate cannot quietly grow a second responsibility") is preserved, not loosened to a `toContain`.
- `Build` runs the smoke **after** the build → assert the index of `SMOKE_RUN` in the Build block's
  run list is greater than the index of `npm run build`. Ordering is load-bearing: `dist/` does not
  exist before the build step.
- the smoked path is the **published** artifact → assert `SMOKE_RUN` names `package.json`'s
  `bin.pharn`. Without this the test pins an arbitrary string; with it, renaming `build.mjs`'s
  `outfile` or `bin` without updating CI goes red. This is what makes the pin mean "the shipped
  bundle", which is the finding's whole subject.

## Guarantee audit (P0)

- **"`ci.yml`'s `Build` job executes the built bundle, after building it, at the published `bin`
  path"** → **floor: enum/regex** — `tests/ci-workflow.test.ts` array-equality over strings extracted
  from the committed file, plus the index compare and the `bin` cross-check.
- **"A drift in `src/version.ts`'s `'../package.json'` depth, or in `scripts/build.mjs`'s `external`
  list, is caught before release"** → **floor at CI-run time: an exit code.** Every static `import`
  in the bundle is resolved at load, and `PHARN_VERSION` is computed at module scope, so **either
  drift throws `ERR_MODULE_NOT_FOUND` during load** — before a flag is even parsed. `node` exits
  non-zero, `&&` stops, the step fails, the `Build` check goes red. An integer test, no
  classification.
- **"The step actually runs in CI"** → **advisory.** Nothing in this repo reads GitHub's execution;
  the test pins the *file*. This is the same trust the other five gates already rest on — named, not
  newly incurred.
- **"`node_modules` is present when the smoke runs"** → **floor: enum/regex**, weakly but really —
  the same per-gate assertion pins `npm ci` as the Build job's *first* run. The three `external`
  names are unbundled, so without that install the smoke would fail for a reason unrelated to the
  drift it guards; the pin is what keeps the Install step from being removed silently.
- **STRUCK CLAIM: "the Build check is green, therefore the CLI works."** It is **not**. This step
  proves the module graph **loads** and that two flags that deliberately short-circuit before any
  dispatch print and exit 0. It exercises **no** command — `init`, `add`, `remove`, `update`, `list`
  and `status` all need a git repo and/or the network and are **not** covered. A load-and-two-flags
  smoke is exactly what it says and must never be described as end-to-end (P0/P7).
- **Named residual:** the three `external` packages are proven *resolvable*, not *correct* — the
  smoke never calls into `@clack/prompts` or `picocolors`, since both flags return before any
  prompt. A dependency that resolves but has a broken API still ships.

## Trust audit (P2)

No untrusted remote artifact is ingested: the change touches repo-owned files only, and the smoked
bytes are the ones the same job just built from the same checkout.

The one honest delta worth naming: on a **fork** pull request this job now *executes* code built
from the fork's branch, where before it only compiled it. The marginal surface is effectively zero
and bounded by what is already true of this job — `on: pull_request` (not `pull_request_target`),
`permissions: contents: read`, `persist-credentials: false`, no secrets in scope, and the job
already runs fork-controlled code via `npm ci` lifecycle scripts and `npm run build` (which executes
`scripts/build.mjs`). The step adds no token, no secret, and no network egress: `--version` and
`--help` return before any command dispatch. Recorded because a surface change should be argued,
not assumed away.

## Determinism audit (P5)

- The test's decision is array equality plus two integer/string compares over extracted strings — a
  membership test, no classification, no fallback that ends in a guess.
- The CI step's decision is a process **exit code** joined by `&&`. There is no parsing of output and
  no threshold.
- A malformed `ci.yml` makes the extractor return an unexpected array and the test fails loudly,
  rather than degrading to a partial match — the existing extractor's behaviour, inherited.

## Open questions (HALT)

None. The three the increment could have carried were resolved against live state above rather than
guessed: `--version`/`--help` exit codes (both 0, `src/index.ts:122-130`), whether the `Build` job
installs dependencies before the smoke (it does, `npm ci` is its first run step), and whether the new
`run:` line perturbs `check-run-pins.test.mjs`'s exact `skipped: 7` tripwire (`node` is not a
recognised command head — to be confirmed by executing the checker at build time, not by reading).
