# PLAN — engines-styletext-floor (the Node floor is what the prompt library's code needs, not what it declares)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: raise `engines.node` from `>=20.12.0` to `>=20.13.0`. `@clack/prompts` 1.8.1 passes
  an ARRAY of formats to `util.styleText`, and Node accepts that only from 20.13.0. Make
  `tests/engines.test.ts` check the dependencies' CODE (a known-API table scanned over their shipped
  files), not only their declared `engines`. Pin the smoke workflow's `FLOOR` to `package.json`.
  Correct every doc that repeats 20.12.0.
- layer(s): package metadata, CI (`node-floor.yml`), tests, docs
- constitution_refs: [P0, P1, P6, P7]

## Discovery — verified this run (P6)

- Measured here with official binaries: `styleText(['strikethrough','dim'], 'x')` throws
  `ERR_INVALID_ARG_VALUE` on Node **20.12.0** and returns the styled string on **20.13.0**.
- `node_modules/@clack/prompts/dist/index.mjs` (1.8.1) has 21 array-form `styleText([...])` calls (and `@clack/core` 1.5.1 has 2 more),
  most of them in the `cancelled` render state (`['strikethrough','dim']`). So every prompt the CLI
  shows crashes on 20.12.x when cancelled: init's select/confirm, update's confirm, and the
  add/remove `groupMultiselect` pickers. The review reproduced this in a pty: exit 1 with a stack
  trace instead of "Cancelled" and exit 0. The pickers use `required: false`, so the one array call
  in the empty-submit validation message is not reached.
- `@clack/prompts` and `@clack/core` both declare `"node": ">= 20.12.0"`. That declaration is wrong,
  and `tests/engines.test.ts` trusts it: it only compares declared ranges.
- The CLI's own `src/**` uses no Node API newer than 20.13. A grep for `Promise.withResolvers`,
  `Object.groupBy`, Set methods, `fromAsync`, `getBuiltinModule`, `globSync`, `styleText`,
  `import.meta.dirname` and similar found nothing. esbuild targets `node20` (`scripts/build.mjs:14`).
- `node-floor.yml` has `FLOOR: 20.12.0` and job name `Smoke (node 20.12.0)`. It is NOT a required
  check (CLAUDE.md; ci.yml:17-21). Only a comment asks to keep `FLOOR` equal to `package.json`'s
  bound, and no test pins that. No test pins the job name.
- 20.12.0 is also stated in: `package.json:30`, `README.md:20` (badge, pinned by
  engines.test.ts) and `README.md:315-317`, `SECURITY.md:7`, `CLAUDE.md:28`, `ci.yml:19-21`
  (comment), `node-floor.yml:3-14,30,33`, `docs/contributing.md:56`, `docs/getting-started.md:11`,
  `docs/troubleshooting.md:107`, and `tests/engines.test.ts:7,13` (comments). The mentions under
  `.dev/features/*` are history and stay as they are.

## Files

- `package.json` — `engines.node: ">=20.13.0"` — layer metadata
- `package-lock.json` — the root package's mirrored `engines` field, regenerated with
  `npm install --package-lock-only` (never hand-edited) — layer metadata
- `tests/engines.test.ts` — layer tests. Three additions:
  - A known-API table (the array form of `styleText` → 20.13.0, with the reason), scanned over
    every runtime dependency's shipped `.js`/`.mjs`/`.cjs` files, found by the same transitive
    walk. Ours must be ≥ every floor whose pattern matches. The scanner is also proven on planted
    fixture files (grill finding 2).
  - A non-vacuity check: the scan read at least one file from `@clack/prompts`.
  - The smoke workflow's `FLOOR` equals `package.json`'s lower bound.
- `.github/workflows/node-floor.yml` — `FLOOR: 20.13.0`; job name per open question 1; comments
  updated with the styleText-array reason — layer CI
- `.github/workflows/ci.yml` — header comment only (the floor version and the smoke job's name) —
  layer CI
- `README.md` — badge and "Current scope" bullet — layer docs
- `SECURITY.md` — `engines.node >= 20.13.0` — layer docs
- `CLAUDE.md` — the CI paragraph (floor, smoke name, and that engines.test.ts also scans dependency
  code) — layer docs
- `docs/contributing.md` — the engines row — layer docs
- `docs/getting-started.md` — the Node row — layer docs
- `docs/troubleshooting.md` — the prerequisites paragraph, plus the new symptom: on 20.12.x,
  cancelling a prompt fails with `ERR_INVALID_ARG_VALUE` — layer docs
- `CHANGELOG.md` — `[Unreleased]` → `### Changed` (Node ≥ 20.13.0, and why) — layer docs

## Contracts satisfied

- PHARN-06's own contract ("the declared floor is never below what the runtime dependencies need").
  It now holds for what they NEED, not only what they declare (cited, P4).

## Evals to write (P1)

- `engines.test.ts` "not below what runtime dependency code needs" → FAILS on the base (@clack/prompts
  uses the array form, and `>=20.12.0` < 20.13.0). Passes after.
- `engines.test.ts` "smoke FLOOR equals package.json" → passes on the base (both are 20.12.0). It
  guards the pair against drifting apart later.
- The existing README-badge test → FAILS if the badge is not updated.

## Guarantee audit (P0)

- "`engines` is ≥ every KNOWN code-level floor of the installed runtime dependencies" → floor: a
  regex scan plus a version compare (a blocking vitest). Its reach is exactly the table, and the
  plan says so. A newer API the table does not name is not caught. That residual stays with the
  (advisory, non-required) smoke job.
- "the packed CLI starts on exactly the floor" → advisory. It is a non-required CI job.
- "the smoke job runs the floor `package.json` declares" → floor: the new equality test.

## Trust audit (P2)

- No untrusted input. The test reads installed dependency files as text and never executes them.

## Determinism audit (P5)

- Regex membership and integer compares only.

## Open questions (HALT)

None open. Resolved at GATE 1 (human, 2026-09-25): every question below → **(a)**, the
recommended answer. Kept for the record:

1. The smoke job's name. (a) `Smoke (node floor)`: stable across future bumps, with the version
   only in `FLOOR` — recommended. (b) `Smoke (node 20.13.0)`: renamed again on every bump. The job
   is not required today, so either rename is safe. Only (a) stays safe if a maintainer later
   makes it required.
2. Should the smoke job also drive a real cancelled prompt? (a) No. The unit scan covers the failure
   that actually happened, and driving a prompt in CI needs a pty, which is flaky — recommended.
   (b) Yes: add a `script(1)`-driven Ctrl-C on a prompt.
