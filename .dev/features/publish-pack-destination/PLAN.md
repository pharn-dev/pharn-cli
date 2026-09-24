# PLAN — publish-pack-destination (the release Pack step writes into a directory nobody created)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `publish.yml`'s unprivileged `build` job creates `$RUNNER_TEMP/pkg` before
  `npm pack --pack-destination "$RUNNER_TEMP/pkg"` writes into it, and a live repo-consistency test
  pins that every `--pack-destination` directory in every workflow exists before `npm pack` runs.
- layer(s): release CI (`.github/workflows/publish.yml`) + its floor test (`.dev/floor/`)
- constitution_refs: [P0, P1, P6]

## Discovery — verified this run (P6)

- `publish.yml:67-68` (added by PHARN-07, a2fe83e): `npm pack --pack-destination "$RUNNER_TEMP/pkg"`.
  No earlier step in the `build` job creates `pkg/` (Verify tag → Install → Gates → Pack), and
  `$RUNNER_TEMP` itself is the only directory the runner provides.
- npm does NOT create the destination: `npm pack --pack-destination <missing>/pkg` exits 254 with
  `ENOENT … open '<missing>/pkg/<name>-<v>.tgz'` on npm 10.9.7 (local) and npm 11.20.0 (`npx npm@11`),
  reproduced this run on a throwaway package. So every Release run fails at Pack, the `publish` job
  (`needs: build`) never starts, and nothing can be released — fail-closed, but release-blocking.
- `node-floor.yml:44` packs into `"$RUNNER_TEMP"` itself (exists) — unaffected; the new test must
  accept it without a `mkdir`.
- The live-workflow tests for publish.yml already live in `.dev/floor/check-run-pins.test.mjs`
  (PHARN-07's ★ id-token test, the npm-floor test); floor.yml runs that file on every PR and push to
  main (`node --test ".dev/**/*.test.mjs"`), so a pin there fails CI without any workflow change.
- CI on main is green at 0ca29b7 — this defect is invisible to every gate because publish.yml only
  runs on a published Release.

## Files

- `.github/workflows/publish.yml` — the Pack step runs `mkdir -p "$RUNNER_TEMP/pkg"` before
  `npm pack --pack-destination "$RUNNER_TEMP/pkg"`; a one-line comment says why (npm does not create
  it) — layer release CI
- `.dev/floor/check-run-pins.test.mjs` — ★ live test: for every `npm pack --pack-destination <dir>`
  in every `.github/workflows/*.yml`, `<dir>` is either exactly `$RUNNER_TEMP` / `${{ runner.temp }}`
  or a `mkdir -p <dir>` precedes it in the same file; ★★ positive control: the live publish.yml with
  its `mkdir -p` line deleted IS flagged (proves the scan fires on this repo's own file shape) —
  layer floor test
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed`: the release workflow's Pack step — layer docs

## Contracts satisfied

- `docs/RELEASING.md` step 5 ("packs the tarball … installs that tarball into a scratch directory …
  and uploads it as an artifact") — becomes true; no wording change needed (P4: cite, don't restate).

## Evals to write (P1)

- ★ live pack-destination test → FAILS on 0ca29b7 (publish.yml packs into an uncreated `pkg/`),
  PASSES after the fix; `node-floor.yml`'s `$RUNNER_TEMP` destination passes without a `mkdir`.
- ★★ positive control → the live publish.yml text minus its `mkdir -p` line is flagged.

## Guarantee audit (P0)

- "every workflow's `npm pack --pack-destination` directory exists before npm writes into it" →
  floor: regex scan of the committed workflow text in a test floor.yml runs on every PR.
- "the first Release run now publishes" → advisory: the Pack failure is removed, but the
  upload/download-artifact SHAs PHARN-07 pinned remain unverified from this environment (named in
  publish.yml itself); the first real release run is still their test.

## Trust audit (P2)

- No untrusted input is ingested; the test reads the repo's own committed workflow files.

## Determinism audit (P5)

- Pure text match over committed files; no network, no npm invocation in the test.

## Open questions (HALT)

- none
