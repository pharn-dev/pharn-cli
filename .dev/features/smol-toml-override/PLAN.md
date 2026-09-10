# PLAN — smol-toml-override

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Force the transitive dev dependency `smol-toml` off the vulnerable `<= 1.7.0` range
  (GHSA-7w5x-hrqm-74c2 / CVE-2026-85730) with an npm `overrides` entry, and pin that invariant with
  a test, since nothing in CI enforces it today.
- layer(s): **none of `ARCHITECTURE.md §4`** — this is the pharn-cli repo's own build toolchain
  (`THREAT-MODEL.md §1`, Surface B′ adjacent), not a PHARN product layer. Stated rather than
  force-fit (P7).
- constitution_refs: [P0, P1, P5, P6, P7]

## Files

- `package.json` — add an `overrides` block forcing `smol-toml` to `~1.7.1` — layer: repo toolchain
- `package-lock.json` — regenerated so the resolved tree carries the patched version + its
  `integrity` hash — layer: repo toolchain
- `tests/dependency-overrides.test.ts` — NEW. Pins the invariant in two layers (spelling +
  demonstration), mirroring `tests/lint-gate.test.ts` — layer: repo test suite
- `CHANGELOG.md` — a `### Security` entry under the existing `## [Unreleased]` — layer: docs

## Grounding (P6 — every claim below was read live this run, not from memory)

- `npm ls smol-toml --all` → `@pharn-dev/pharn@0.4.0 → markdownlint-cli2@0.23.2 → smol-toml@1.7.0`.
  Scope `development`, relationship `transitive` (confirmed against the alert JSON).
- `markdownlint-cli2@0.23.2` is the **latest** published release, and its `dependencies` pin
  `smol-toml` to **exactly `"1.7.0"`** — no range. There is therefore **no upstream upgrade path**.
- `npm audit fix --force` proposes `markdownlint-cli2@0.21.0` — a **downgrade** across two minors of
  the tool behind the `lint:md` gate and the required CI check `Markdown lint`. Rejected.
- Feasibility probe (scratch copy of `package.json` + `package-lock.json`, `npm install
  --package-lock-only`): `~1.7.1` resolves to **`smol-toml@1.7.2`**, `markdownlint-cli2` **stays at
  `0.23.2`** (no downgrade), and `npm audit` in that tree reports **`found 0 vulnerabilities`**.
- This repo's markdownlint config is **`.markdownlint-cli2.jsonc`** — there is no `.toml` config, so
  `smol-toml`'s `parse()` is **never invoked** by `npm run lint:md`.
- `markdownlint-cli2.mjs:21` imports `./parsers/toml-parse.mjs` **eagerly** at module top level, and
  that file does `import { parse } from "smol-toml"` at top level. So the module **is loaded** on
  every `lint:md` run even though `parse()` is not called.
- `src/lib/semver.ts` already exports `compareVersionCore(a, b): -1 | 0 | 1 | null` (pure, total,
  prerelease-safe). The new test **reuses** it rather than re-deriving a comparator (P3).
- No `npm audit` step exists in `.github/workflows/`. Nothing in CI enforces this pin.
- `CHANGELOG.md` has a live `## [Unreleased]` section, and `lint:md`'s `"*.md"` glob covers it.

## Contracts satisfied

- **None.** This repo ships no `pharn-contracts` tree, and a dependency override satisfies no PHARN
  contract. Recorded as "none" rather than invented (P4, P7).

## Evals to write (P1)

`tests/dependency-overrides.test.ts` — two layers, because the spelling alone can go hollow:

- **spelling** → `package.json` has `overrides['smol-toml'] === '~1.7.1'` → exact string match.
  Changing the policy forces a conscious edit to this test.
- **demonstration** → **every** `smol-toml` entry in `package-lock.json` (all keys matching
  `/(^|\/)node_modules\/smol-toml$/`) has `compareVersionCore(version, '1.7.1') >= 0` → pass. This
  reads the artifact CI actually installs from, so it stays true even if the override entry is
  edited or the lock is regenerated.
- **at least one entry exists** → the lock contains ≥1 `smol-toml` entry → guards against the
  demonstration passing vacuously if the package disappears from the tree.
- **unparseable version is a hard fail** → `compareVersionCore` returning `null` fails the test
  loudly rather than being treated as "not less than 1.7.1" (P5 — the terminal fallback is a
  failure, never a silent pass).

## Guarantee audit (P0)

- **"`smol-toml <= 1.7.0` is no longer resolvable in this repo's tree"** → **floor**: primitive #3
  (deterministic version compare) over `package-lock.json`, executed by the new test on every `npm
  test` / CI `Test` job. The lock's `integrity` sha512 pins the bytes fetched.
- **"the override entry is present with the intended specifier"** → **floor**: exact string match on
  `package.json`.
- **"`npm run lint:md` still passes"** → **floor**: exit-code gate, already a required CI check
  (`Markdown lint`). Because `toml-parse.mjs` is imported eagerly, a GREEN run **does**
  deterministically demonstrate `smol-toml@1.7.2` **loads** (import resolves, `parse` export exists,
  engines satisfied).
- **"`smol-toml@1.7.2` is behaviorally compatible with `markdownlint-cli2@0.23.2`"** → **advisory**.
  `parse()` is never invoked under this repo's `.jsonc` config, so no gate here exercises it. Not
  claimed as a guarantee.
- **STRUCK — "this remediates a vulnerability for users of `@pharn-dev/pharn`."** `smol-toml` is a
  **transitive devDependency**; npm never installs a published package's devDependencies for its
  consumers, and `files: ["dist"]` ships only the bundle. **True statement:** this clears the
  Dependabot alert and the `npm audit` finding for **contributors' installs and CI**, and closes the
  path for any future `.toml` config. It is a dev/CI-surface fix, not a shipped-artifact fix.
- **STRUCK — "this repo was exploitable."** The advisory's DoS requires calling `parse()` on
  attacker-shaped TOML. This repo has no `.toml` config and parses no TOML at all, from any source.
  **True statement:** the practical exposure here was already nil; the fix removes a known-vulnerable
  version from the toolchain and the alert from the queue.

## Trust audit (P2)

The increment ingests no untrusted artifact at pharn **runtime** — no `src/` behavior changes and
no fetch boundary moves. It does change **which third-party bytes enter the dev/CI environment**
(`THREAT-MODEL.md §1`, Surface B′): `smol-toml@1.7.2` is new upstream code in the build toolchain.
Trust in it is **provenance** (npm registry + the lockfile's `integrity` sha512), **not** a
signature over a release — the same shape `LIMITS.md §1b` names for pharn's own upstream. Bounded,
not zeroed: the lock's `integrity` guarantees the bytes match what was resolved, never that they are
benign. No taint reaches any pharn output, because no pharn code path reads this dependency.

## Determinism audit (P5)

- The test's only branch is an **ordering compare** on a parsed three-part version core — a
  deterministic membership/ordering test, not a classification.
- `compareVersionCore` is **total** and returns `null` for an unparseable input. The test treats
  `null` as a **hard failure**, so a malformed lock entry fails loudly instead of falling through as
  a pass. The terminal fallback is a failure, never a guess.
- The lock-key match is an anchored regex (`/(^|\/)node_modules\/smol-toml$/`), so a nested copy
  under another package is caught and a lookalike name (`smol-toml-x`) is not.

## Explicitly deferred (P7 — named, not silently dropped)

- **No `npm audit` CI gate.** It would be a new required status check that depends on the network
  and on a mutable advisory database, so it can flip red without any repo change — a flaky gate on
  `main`'s ruleset. Out of scope for this increment; a separate decision if wanted.
- **No `markdownlint-cli2` version change.** `0.23.2` is already the latest and is retained.
- **No trusted-doc edit.** `THREAT-MODEL.md`/`LIMITS.md` name pharn's *runtime* surfaces; the
  *build toolchain's own dependencies* are not an explicitly enumerated surface. That gap is
  **surfaced here for a human**, never agent-edited (those files are `editable_by: human only` and
  hook-protected).

## Open questions (HALT) — RESOLVED at GATE 1 (human, this run)

- ~~Which override specifier: `~1.7.1`, `^1.7.1`, or an exact pin `1.7.2`?~~ → **`~1.7.1`**.
- ~~Add the regression test `tests/dependency-overrides.test.ts`, or ship the override alone?~~ →
  **add the test**.

No open questions remain. Plan **approved as written** at the plan-acceptance gate.
