# PLAN — pin the reported context of every required workflow, not just `ci.yml`'s six

- spec_content_hash: 165e27619438c10663478c03c43a7d5c7333fd1adcb0bd0548c8b6ca4955a5ba # fix #4
- increment: `tests/ci-workflow.test.ts` pins ONE workflow. The `main` ruleset requires NINE contexts from FOUR workflows, so six of nine are pinned and three — `floor`, `gitleaks`, `Analyze (javascript-typescript)` — are not. Two of those three report under their bare JOB ID because the job carries no `name:` key, which means the single edit "add `name: Floor` for a nicer Checks-tab label" silently renames a required context and merge-blocks every PR with nothing red to fix. Generalize the parser to be per-file and pin all four workflows.
- layer(s): `tests`
- constitution_refs: [P0, P3, P4, P6, P7]

## Discovery (P6 — read live this run)

**`tests/ci-workflow.test.ts` (128 lines, read live).** The coupling is real and is exactly where the
spec says:

- `:16` — `const WORKFLOW = '.github/workflows/ci.yml';`
- `:31` — `const source = readFileSync(WORKFLOW, 'utf8');`
- `:80-83` — `const blocks = jobBlocks(source);` and `const jobNames = [...blocks.values()].flatMap(...)`
- `:48` — `jobBlocks` interpolates `WORKFLOW` into its own failure message, so it is coupled too, not
  just the three module-scope consts.

**Five workflow files on disk** (`ci.yml`, `codeql.yml`, `floor.yml`, `gitleaks.yml`, `publish.yml`).
Every shape claim in the spec verified line by line:

- `floor.yml:1` `name: floor` (workflow-level, column 0) · `:16` `  floor:` (job id, two spaces) ·
  **no four-space `name:` anywhere in the file** · step names at `:25`/`:29` are six-space
  `      - name: …`. Reported context = the bare id `floor`.
- `gitleaks.yml:1` `name: gitleaks` · `:21` `  gitleaks:` · same shape, no job-level `name:` · step
  names at `:33`/`:43`. Reported context = `gitleaks`.
- `codeql.yml:13` `  analyze:` · `:14` `    name: Analyze (${{ matrix.language }})` (four spaces) ·
  `:23` `        language: [javascript-typescript]` (eight spaces) · step-level `name:` decoys at
  `:25`, `:30`, `:36` (six spaces) plus a `languages:` key at `:33` (ten spaces, different key).
- `publish.yml:11-13` — `on: release: types: [published]`. Never runs on a PR, reports no required
  context. Correctly excluded.

**The ruleset side, read once by hand this run** (advisory — see the guarantee audit; this read is
NOT something the suite does): the repository ruleset API returns `required_status_checks` =
`Format check`, `Lint`, `Markdown lint`, `Typecheck`, `Test`, `Build`, `floor`, `gitleaks`,
`Analyze (javascript-typescript)` — nine, agreeing with `CLAUDE.md:28`, `docs/contributing.md:56`,
and the rollback record at `.dev/features/ci-matrix-required-checks/SHIP.md:57-58`.

**Spec drift found (stale line numbers, no substantive error).** The spec was written several PRs
ago; two of its citations have moved by a line:

- It cites `tests/ci-workflow.test.ts:80-82` for `blocks` + `jobNames`; live they are `:80` and
  `:81-83`.
- It cites "the existing two-directional set equality (`:85-89`)"; live, `:85` opens the `describe`
  and the two assertions are `:89-90`.

Everything else it cites — `:11-15` header, `:16`, `:31`, `:33-43`, `:45`, `:93-101`, `:103-116`,
and all three other workflows' line numbers — matches disk exactly.

**Three copies of a CI-gate list exist** (`tests/ci-workflow.test.ts:19-26` `EXPECTED_GATES`,
`tests/dev-script.test.ts:27-34` and `tests/check-composition.test.ts:28-35` `CI_GATE_SCRIPTS`), and
two prior REVIEWs deferred consolidating them to this increment. See **The decision this plan
makes**.

## The decision this plan makes

**Do not consolidate the three gate lists.** Both prior REVIEWs said the consolidation "belongs to
`5.6d` … if anywhere", and this is `5.6d`, so the question gets answered here rather than deferred
again — the answer is no, for three reasons:

1. **They are not the same list.** `EXPECTED_GATES` maps a status-check CONTEXT to a full command
   string (`'Format check' → 'npm run format:check'`) and is compared against `ci.yml`. The other two
   are bare npm SCRIPT names compared against `package.json`. Unifying them needs a
   `.replace(/^npm run /, '')` derivation that couples a workflow pin to two package.json pins.
2. **This increment adds a fourth list of a third shape.** `REQUIRED_CONTEXTS` is nine contexts
   spanning four workflows — a superset of `EXPECTED_GATES`' keys along a different axis, and
   emphatically not the six-script list. "Consolidate the gate list" now has three shapes to
   reconcile, which is a design increment, not a tidy-up.
3. **P7.** The spec's Fix and Acceptance criteria name exactly one file. Editing two test files it
   never mentions widens the diff past what was approved.

The drift risk the duplication carries is named honestly instead: see the residual in the guarantee
audit. The in-file half of it — `EXPECTED_GATES` vs `REQUIRED_CONTEXTS` — IS closed here, by set
equality inside the one file.

## Files

- `tests/ci-workflow.test.ts` — make the parse per-file (`parse(path)` returning
  `{ source, blocks, jobNames }`, `jobBlocks(path, yaml)` so its failure message names the file it
  read); add `REQUIRED_CONTEXTS` (the nine-string in-repo mirror of `required_status_checks`); add
  pins for `floor.yml`, `gitleaks.yml` and `codeql.yml`; extend the header comment to cover all four
  workflows and keep its one-sided limit — layer `tests`

**Not touched:** anything under `.github/workflows/` (the ruleset lives on github.com; this repo
mirrors it, never the reverse), `vitest.config.ts` (`5.6c`'s coverage ratchet),
`tests/dev-script.test.ts`, `tests/check-composition.test.ts`, `CHANGELOG.md`.

## Evals to write (P1)

Existing (must keep passing, substance unchanged): the four `ci.yml` cases — set equality both
directions, the workflow-name/step-name decoys, one npm script per gate, runner + node pin.

New:

- **`REQUIRED_CONTEXTS` equals the union of what the pinned workflows produce** — `EXPECTED_GATES`'
  six keys, the two bare-id contexts, and the derived CodeQL context. Set equality, not the subset
  the spec asks for: the subset direction stops the two lists in this file drifting apart, and the
  superset direction stops the constant growing a context no pinned workflow reports.
- **`floor.yml` / `gitleaks.yml` define exactly one job whose id is the required context** — the key
  array is compared whole, so a second job fails too.
- **`floor.yml` / `gitleaks.yml` have NO job-level `name:`** — the load-bearing negative. This is the
  assertion that turns "add a nicer label" from a silent merge-block into a red test, and it needs a
  comment saying so or it reads as an arbitrary thing to want.
- **`codeql.yml` defines exactly one job, `analyze`, named `Analyze (${{ matrix.language }})`.**
- **`codeql.yml`'s matrix has exactly ONE language, and substituting it into the template yields
  `Analyze (javascript-typescript)`.** Both halves are read from the file, so renaming the template
  OR adding a second language reddens it.
- **Decoy coverage for the new files:** the CodeQL step-level `name:` keys (`:25`, `:30`, `:36`) and
  the workflow-level `name:` at `:1` of each new file must not be read as job names — asserted as
  present-in-source and absent-from-`jobNames`, the shape the existing `ci.yml` decoy case uses.

RED evidence (this increment IS the test, so RED means the pin failing against a deliberately broken
input): mutate a scratch copy of each workflow — add `name: Floor` to `floor.yml`, rename the
secret-scan job id, rename CodeQL's template, add a second matrix language — run vitest, quote the
failures, restore. A pin never seen failing is not evidence.

## Guarantee audit (P0)

**The contract is two-sided and these pins cover ONE side. That is the whole audit; the rest is
detail.**

- **Side A — the workflow side. COVERED, and now for all nine contexts instead of six.** "Each
  workflow reports exactly the context string this repo believes it reports." A rename of a job
  `name:`, a rename of a job id, an added or deleted job, an added job-level `name:` where there was
  none, a renamed CodeQL template, or a second matrix language all turn red locally and in the `Test`
  gate.
- **Side B — the ruleset side. NOT COVERED, and not coverable from inside the repo.** "The `main`
  ruleset's `required_status_checks` is exactly these nine strings." That list lives in GitHub repo
  settings, not in version control — a revert cannot reach it, and reading it needs an authenticated
  API call. A test that made one would be non-hermetic (offline contributors, fork PRs with no token,
  rate limits) and would turn a unit suite into a network gate. `REQUIRED_CONTEXTS` is therefore a
  **declared belief**, hand-checked once this run and recorded in the Discovery section — never a
  verified fact.
- **The consequence, stated plainly: the ORIGINAL incident is still invisible.** The failure this
  file was written for was a ruleset listing 30 contexts against a workflow defining one job — extra
  required contexts that no workflow produces. Those contexts exist ONLY in the ruleset, so no
  in-repo test can see them, before or after this change. What the pins catch is the mirror-image
  direction: a **workflow drifting away from a context the repo has declared required**. Precisely
  half, and the newly-covered half is the one an ordinary PR can break.
- **A green suite does not mean the checks PASS.** These are shape pins over YAML text; nothing here
  runs a workflow.
- **Residual, unclosed (named, not fixed):** `tests/check-composition.test.ts:81` comments that "if a
  seventh gate is ever added to CI, this fails" — its `CI_GATE_SCRIPTS` is a local literal, not read
  from `ci.yml`, so adding a seventh CI gate reddens `ci-workflow.test.ts` and NOT that file. An
  over-claim in a comment, in a file this increment does not touch (P7). Reported, not fixed.

## Trust audit (P2)

Every input is a repo-owned file read with `readFileSync` and matched with regexes. No network, no
child process, no parsing of untrusted input. The one-off ruleset read above was a human-grade
discovery step, not part of the suite.

## Determinism audit (P5)

Regex + indentation matching over fixed file contents. No YAML parser is a direct devDependency and
none is added — the shape is small enough that a parser's supply-chain surface costs more than it
buys, which is the standing decision at `tests/ci-workflow.test.ts:33-43`.

## Out of scope (P7)

- Editing any workflow file — renaming a job, adding a `name:`, adding a gate, or "fixing"
  `floor.yml`'s `node-version: lts/*` to match ci.yml's `24`. The test mirrors the workflows; the
  workflows are never edited to satisfy the test.
- Pinning `publish.yml` — it reports no required context, so folding it into `REQUIRED_CONTEXTS`
  would make the constant claim something false.
- Reading the live ruleset from the suite — Side B stays advisory by design.
- `vitest.config.ts` coverage floors (`5.6c`), and the command-level test gaps (`5.6a`, `5.6b`).
- Consolidating the three CI-gate lists — decided against above, with reasons.
- `CHANGELOG.md` — nothing user-facing changes; the published package is byte-identical.

## Open questions (HALT)

- None.
