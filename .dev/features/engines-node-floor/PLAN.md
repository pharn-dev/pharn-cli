# PLAN — engines-node-floor (PHARN-06: the declared Node floor must be one the CLI actually starts on)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: raise `engines.node` from `>=20` to `>=20.12.0` (the floor `@clack/prompts` / `@clack/core`
  declare — they import `styleText` from `node:util`), pin that the CLI's floor is never below any
  runtime dependency's declared floor with a unit test, add a separately-named CI job that runs the
  PACKED CLI on exactly Node 20.12.0, and correct every doc that repeats `>=20`.
- layer(s): package metadata, tests, CI tooling, docs
- constitution_refs: [P0, P1, P4, P7]

## Discovery — verified this run (P6)

- Review evidence: on Node 20.0.0 and 20.11.1, `pharn --version` dies with `SyntaxError: The requested
module 'node:util' does not provide an export named 'styleText'`; 20.12.0 works.
- `node_modules/@clack/prompts/package.json` and `@clack/core` declare `"engines"`; `package.json:29-31`
  and the root `package-lock.json` entry say `>=20`; `scripts/build.mjs` keeps `@clack/prompts`,
  `minimist`, `picocolors` EXTERNAL, so a smoke test must install the packed tarball, not run the bundle alone.
- Claims repeating `>=20`: README badge + "Current scope", `docs/getting-started.md:11`,
  `docs/troubleshooting.md` (prerequisites), `docs/contributing.md:56`, `SECURITY.md:7`, `CLAUDE.md`.
- `ci.yml` has a six-job contract pinned by `tests/ci-workflow.test.ts`; a new, separately-named workflow
  leaves those contexts untouched (the shape `docs/contributing.md` prescribes).

## Files

- `package.json` — `engines.node: ">=20.12.0"` — layer metadata
- `package-lock.json` — root `engines` regenerated with `npm install --package-lock-only` — layer metadata
- `tests/engines.test.ts` — the declared lower bound is ≥ every runtime dependency's installed
  `engines.node` lower bound (parsed `>=x.y.z` comparator), and README's badge / docs state the same floor
- `.github/workflows/node-floor.yml` — job `Smoke (node 20.12.0)`: build on Node 24, `npm pack`, install
  the tarball into a temp dir on Node 20.12.0, run `pharn --version` and `pharn --help` — layer CI
- `.dev/floor/check-run-pins.test.mjs` — the live-repo count of skipped (lockfile / local-path) installs
  goes 7 → 9 for the new workflow's `npm ci` + local-tarball install, with the reason recorded
- `.github/workflows/ci.yml` — header comment only (it quotes `>=20`); jobs untouched (P4)
- `README.md` — badge + "Current scope" (P4)
- `docs/getting-started.md` — Node row (P4)
- `docs/troubleshooting.md` — prerequisites (P4)
- `docs/contributing.md` — the untested-claims table: floor now exercised by the smoke job (P4)
- `SECURITY.md` — `engines.node >= 20.12.0` (P4)
- `CLAUDE.md` — CI paragraph (P4)

## Contracts satisfied

- `docs/contributing.md` "a separate, additionally-named job is the only safe shape" — followed; the six
  required contexts are unchanged.

## Evals to write (P1)

- `tests/engines.test.ts` fails on the base (`>=20` < `>=20.12.0` declared by @clack) and passes after.

## Guarantee audit (P0)

- "the declared floor is not below any runtime dependency's declared floor" → floor: version comparison
  over installed package metadata (unit test).
- "the CLI starts on the declared floor" → CI smoke job on exactly 20.12.0 (not a required check —
  advisory signal unless a maintainer adds it to the ruleset; named in `docs/contributing.md`).

## Trust audit (P2)

- No runtime input change.

## Determinism audit (P5)

- Numeric semver compare of `major.minor.patch`.

## Open questions (HALT)

- none
