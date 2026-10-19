# Workflow and config templates (pharn-ci 0.1.0)

From pharn-ci 0.1.0's README and `examples/workflows/`. Copy the pins exactly;
they are the only ones this skill writes.

## Pins

| Action | Pin |
| ------ | --- |
| pharn-ci | `pharn-dev/pharn-ci@a88e62a8febf5cd9a77b8e0252cd060c3b94782c # v0.1.0` |
| checkout | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` |
| Node | `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` |
| Python | `actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0` |
| .NET | `actions/setup-dotnet@a98b56852c35b8e3190ac28c8c2271da59106c68 # v6.0.0` |
| Rust tools | `taiki-e/install-action@8cca0918f8471c33515202b73f56ab27f2bed283 # v2.87.29` |
| upload | `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2` |
| download | `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2` |

Go, Java, pnpm and anything else: reuse the step the repository already pins,
or leave `# TODO: pin <action> to a full commit SHA` in place of the `uses:`
line and say so. Never a tag (`@v4`), a branch or a short SHA.

## `.pharn/ci.yml`

```yaml
# pharn-ci settings. The pharn-ci Action and `pharn-ci check` both read this file.
coverage:
  file: coverage/lcov.info
  threshold: 80
```

- `file`: one path, or a block list of paths and globs (`*`, `**`, `?`),
  relative to the repository root. Quote an entry that starts with `*`:
  `- "**/coverage.cobertura.xml"`.
- `threshold`: a plain number from 0 to 100. Missing inputs fail the check
  when it is set, so a broken coverage step cannot pass.
- `root: packages/core` only for package-relative paths in a single package.
- `exclude:` a block list of globs, only for generated code the person agrees
  to leave out.
- Only `coverage` and `setup` keys exist; no tabs; no `{}`, anchors or `|`.

## New workflow: `.github/workflows/pharn-ci.yml`

```yaml
name: pharn-ci
on:
  pull_request:
  # merge_group:   # uncomment only when the repository uses a merge queue

permissions:
  contents: read
  pull-requests: write

# One run per PR at a time, so pushes do not race on the sticky comment. The github.ref
# fallback gives each merge-queue entry its own group, since merge_group has no PR number.
concurrency:
  group: pharn-ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  pharn-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      # Toolchain, dependencies and the coverage command: see below.
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - run: npm ci
      - run: npm run test:coverage
      - id: pharn-ci
        uses: pharn-dev/pharn-ci@a88e62a8febf5cd9a77b8e0252cd060c3b94782c # v0.1.0
        timeout-minutes: 5
      # report.json for pharn-ci-explain and pharn-ci-cover: the comment cuts long lists.
      - if: always() && steps.pharn-ci.outputs.report-path != ''
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: pharn-ci-report
          path: ${{ steps.pharn-ci.outputs.report-path }}
```

- `fetch-depth: 0` lets pharn-ci diff against the PR base locally; a shallow
  checkout falls back to the API and can end in `DIFF_UNAVAILABLE`.
- The pharn-ci step has no `with:`: its settings are in `.pharn/ci.yml`.
- Toolchain lines per ecosystem (the coverage commands are in
  [coverage.md](coverage.md)):
  - Node: `setup-node` with `node-version`, then the lockfile's install
    (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`).
  - Python: `setup-python` with `python-version`, then the project's install
    (`pip install -e '.[test]'`, `pip install -r requirements-dev.txt`, ...).
  - .NET: `setup-dotnet` with `dotnet-version`.
  - Rust: `rustup component add llvm-tools-preview`, then `install-action`
    with `tool: cargo-llvm-cov`.
- Required checks are named after the job: a new workflow adds a `pharn-ci`
  check, which the person can make required in their ruleset.

## Existing test job

When a job already runs the tests on `pull_request`, extend it. These edits
only:

1. Its `actions/checkout` step gets `fetch-depth: 0`.
2. Its test command writes coverage, in the same run: `npm test` becomes
   `npm run test:coverage` (or the runner's coverage flags). The tests run
   once.
3. It gets a job-level `permissions:` block with what it had plus
   `pull-requests: write`. A job-level block replaces the workflow-level one
   and the repository default, so copy every permission the workflow already
   grants (`contents: read` at least). When the job publishes, calls `gh` or
   otherwise needs more and you cannot tell what, ask.
4. Two steps at the end:

```yaml
      - id: pharn-ci
        if: (github.event_name == 'pull_request' || github.event_name == 'merge_group') && matrix.node == 24
        uses: pharn-dev/pharn-ci@a88e62a8febf5cd9a77b8e0252cd060c3b94782c # v0.1.0
        timeout-minutes: 5
      - if: always() && steps.pharn-ci.outputs.report-path != ''
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: pharn-ci-report
          path: ${{ steps.pharn-ci.outputs.report-path }}
```

- The event condition keeps pharn-ci off `push`: on a push it would gate the
  branch against the previous commit.
- The matrix condition picks one leg (drop it when there is no matrix): the
  legs share one sticky comment and one artifact name.
- Add no `concurrency:` block to someone else's workflow; it would cancel
  their push builds. Without one, an older run can write the comment last.
- Change nothing else: triggers, `paths` filters, the matrix, other steps.

## Fork PRs: two workflows

A fork PR's `pull_request` token cannot comment. The comment comes from a
second workflow on `workflow_run`, which runs from the default branch and never
runs PR code. The first workflow uploads before pharn-ci gates, so a failing
gate still gets its comment.

`.github/workflows/pharn-ci.yml`:

```yaml
name: pharn-ci
on: pull_request

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      # Toolchain, dependencies and the coverage command, as in the new workflow.
      - env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: echo "$PR_NUMBER" > pr-number
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: pharn-ci-input
          path: |
            coverage/lcov.info
            pr-number
      - uses: pharn-dev/pharn-ci@a88e62a8febf5cd9a77b8e0252cd060c3b94782c # v0.1.0
        timeout-minutes: 5
        with:
          comment: false
```

`.github/workflows/pharn-ci-comment.yml`:

```yaml
name: pharn-ci comment
on:
  workflow_run:
    workflows: [pharn-ci]
    types: [completed]

permissions:
  contents: read
  pull-requests: write
  actions: read

jobs:
  comment:
    if: github.event.workflow_run.event == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      # The default branch: the trusted .pharn/ci.yml, never the PR.
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: pharn-ci-input
          path: ${{ runner.temp }}/pharn-ci-input
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}
      # Keep digits only. The artifact is attacker-controlled: never put its text into a script.
      - id: pr
        env:
          PR_FILE: ${{ runner.temp }}/pharn-ci-input/pr-number
        run: echo "number=$(tr -dc '0-9' < "$PR_FILE" | head -c 10)" >> "$GITHUB_OUTPUT"
      - uses: pharn-dev/pharn-ci@a88e62a8febf5cd9a77b8e0252cd060c3b94782c # v0.1.0
        timeout-minutes: 5
        with:
          coverage-file: ${{ runner.temp }}/pharn-ci-input/coverage/lcov.info
          pr-number: ${{ steps.pr.outputs.number }}
          head-sha: ${{ github.event.workflow_run.head_sha }}
          fail-on-threshold: false # the first workflow already gates
```

- `workflows: [pharn-ci]` must equal the first workflow's `name:`.
- The coverage path in the artifact and in `coverage-file` must match the
  repository's `coverage.file`.
- pharn-ci reads the PR's diff and files through the API in this mode and
  fails when the PR head is not `head-sha`. It cannot tell whether the
  coverage file is what the tests produced: the first workflow's verdict is
  the gate.
- `workflow_run` runs only from the default branch, so the comment starts
  after the setup PR merges. First-time contributors' runs may need a
  maintainer's approval first.
- Never `pull_request_target`: it gives a fork's PR a write token, and
  checking out the PR there runs fork code with it. pharn-ci also refuses to
  measure on it (`DIFF_UNAVAILABLE`).

## Dependabot

`.github/dependabot.yml`, only with the person's yes:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```
