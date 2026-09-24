# PLAN — publish-split-oidc (PHARN-07: the dev toolchain must not run in the job that holds `id-token: write`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: split `publish.yml` into (1) `build` — NO `id-token` — which validates the tag strictly and
  checks the tagged commit is on `main` BEFORE `npm ci`, runs `npm run check` + `npm run test:coverage`,
  packs the tarball, smoke-installs it, and uploads it as an artifact; and (2) `publish` — the only job
  with `id-token: write` and the `npm-publish` environment — which asserts the npm floor, downloads the
  tarball and runs `npm publish <tgz> --provenance --access public --ignore-scripts`, with no checkout,
  no `npm ci`, and no lifecycle scripts.
- layer(s): CI tooling, floor test, docs
- constitution_refs: [P0, P2, P4, P7]

## Discovery — verified this run (P6)

`publish.yml` today: ONE job with top-level `id-token: write`, env `npm-publish`, `cache: npm`, runs
`npm ci` (install scripts of ~280 dev deps) and `npm publish`, whose `prepublishOnly` (`npm run check`:
prettier, eslint, markdownlint, tsc, vitest) and `prepack` (build) all run with the OIDC token
requestable. The tag guard is `${GITHUB_REF_NAME#v}` (accepts a tag without `v`) and runs after
`npm ci`; nothing checks the tag's commit is on `main`. Floor pins: `check-run-pins.test.mjs` requires
the `Assert npm floor` step + `11.5.1` in publish.yml and counts lockfile/path installs (9 on main
after PHARN-06); `check-action-pins.mjs` requires every `uses:` to be a 40-hex SHA.

## Files

- `.github/workflows/publish.yml` — the two-job split above; top-level `permissions: contents: read`,
  `id-token: write` only on `publish`; tag must match `^v[0-9]+\.[0-9]+\.[0-9]+$` and equal
  `package.json` `version`; `git merge-base --is-ancestor "$GITHUB_SHA" origin/main` (checkout with full
  history); `actions/upload-artifact` / `actions/download-artifact` pinned by SHA — layer CI
- `.dev/floor/check-run-pins.test.mjs` — live install count 9 → 10 (publish.yml's build job adds the
  path install of the packed tarball for the smoke), reason recorded; the `Assert npm floor` pins stay
- `docs/RELEASING.md` — step 5 rewritten for the two jobs; prerelease tags are refused (P4)
- `CLAUDE.md` — Releasing section (P4)

## Contracts satisfied

- CLAUDE.md "No npm tokens exist anywhere … auth is the short-lived OIDC id-token" — unchanged; the token
  is now requestable only in a job that runs no third-party dev code.

## Evals to write (P1)

- `check-run-pins` / `check-action-pins` over the live repo stay green (no floating install, every
  `uses:` SHA-pinned); the existing publish.yml pin tests keep passing against the new file.
- A workflow cannot be executed locally; its release-time behavior is ADVISORY until the next release.

## Guarantee audit (P0)

- "no dev dependency code runs where the OIDC token is requestable" → structural: `id-token: write` is
  granted only to the `publish` job, whose steps are setup-node, the stdlib floor assert,
  download-artifact and `npm publish --ignore-scripts` of a prebuilt tarball. Verified by reading the file
  (advisory — no floor script parses job-level permissions).
- "only a strict `vX.Y.Z` tag on a commit contained in `main` is published" → regex + `merge-base` in the
  unprivileged job, which `publish` `needs:`.
- The artifact action SHAs could not be verified from this environment (no GitHub access outside this
  repo) — NAMED residual: a wrong SHA fails the first release run, publishing nothing.

## Trust audit (P2)

- The tarball crosses from the unprivileged job to the privileged one as an artifact; a compromised dev
  dependency in `build` could still alter the tarball (content integrity), but can no longer mint a token
  or publish by itself. Stated, not hidden.

## Determinism audit (P5)

- Regex + exact string equality + ancestry exit code.

## Open questions (HALT)

- none (the user chose the full split and to assume the artifact SHAs work)
