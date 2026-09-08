# PLAN — rewrite the "What you get" install tables around the `pharn` layout

- spec_content_hash: 6747075bdd3ed1bce8faec47514f25bf88b63fd2294aa570dc28fe9043074882 # fix #4
- increment: Make the two user-facing "what an install writes" tables (`README.md`, `docs/getting-started.md`) describe the layout a current install actually produces, and add the first deterministic gate that ties those tables to the installer's own path constants.
- layer(s): `docs`, `tests`
- constitution_refs: [P0, P3, P4, P5, P6, P7]

## Discovery (P6 — read live this run)

Read from disk this run; the spec's line numbers and snippets are all stale (it predates PRs #138-#148).

- `src/lib/constants.ts` (live): `PHARN_GRILLERS_DIR='pharn/pharn-pipeline/grillers'`, `PHARN_LENSES_DIR='pharn/pharn-review'`, `PHARN_CONTRACTS_DIR='pharn/pharn-contracts'`, `PHARN_CORE_DIR='pharn/pharn-core'`, `PHARN_FLOOR_DIR='pharn/floor'`, `PHARN_LICENSE_DEST='pharn/LICENSE'`, `FLAT_LICENSE_DEST='PHARN-LICENSE'`, `FEATURES_README='features/README.md'`, `FLOOR_TEST_FIXTURES_DIR='test-fixtures'`.
- `PHARN_TRUSTED_DOCS` is now FOUR entries (`pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`, `pharn/THREAT-MODEL.md`, `pharn/LIMITS.md`) — PR #138 landed, so the spec's "the `pharn` set drops THREAT-MODEL/LIMITS" sentence is dead.
- `src/lib/layout.ts:77` — `detectLayout` still keys on `existsSync(pharn/pharn-contracts)`; `configLayout` still defaults anything non-`'pharn'` to `flat`. Both layouts remain real.
- **Rows the code actually produces.** Ran `collectExpectedInstallPaths` (`src/lib/install-manifest.ts`) against a live `pharn-dev/pharn-oss` checkout (`origin/main` = `2e183e6`) with all 35 indexed capabilities. `detectLayout` → `pharn`; 456 files, grouped by surface:

  ```text
  .claude/commands/            (10)   pharn/floor/                    (52)
  .claude/hooks/                (3)   pharn/pharn-contracts/           (6)
  features/README.md            (1)   pharn/pharn-core/               (13)
  pharn/ARCHITECTURE.md         (1)   pharn/pharn-pipeline/grillers/ (121)
  pharn/CONSTITUTION.md         (1)   pharn/pharn-review/            (247)
  pharn/LICENSE                 (1)   test-fixtures entries:           (0)
  ```

  Plus `pharn.config.json` and `pharn.records.json`, both written by `src/steps/install-archetype.ts`, and `.claude/settings.json` only when the project has none.
- **`pharn/THREAT-MODEL.md` and `pharn/LIMITS.md` do not exist upstream.** `git ls-tree origin/main pharn/` on the live checkout returns only `ARCHITECTURE.md`, `CONSTITUTION.md`, `floor`, `pharn-contracts`, `pharn-core`, `pharn-pipeline`, `pharn-review`; both files sit at the repo ROOT. Every doc copy is existence-guarded on both readers, so today a `pharn` install lands two of the four trusted docs and a flat install lands all four.
- **The five recently-merged additions the brief predates are all present and were preserved**: `features/README.md` in the install set (#139), `test-fixtures/` excluded (#140), `pharn/LICENSE` mapped away from the user's own (#141), `pharn/pharn-core/` (#136), `THREAT-MODEL.md`/`LIMITS.md` in `PHARN_TRUSTED_DOCS` (#138).
- **degit is gone** (#146): `fetchRepo` does one GitHub REST resolve then a `codeload.github.com` tarball extracted by `src/lib/tar-extract.ts`. No prose this increment touches names degit or a clone.
- `docs/getting-started.md` (pre-change) and `README.md` (pre-change) both led with `pharn-contracts/`, `.dev/floor/` and a root `CONSTITUTION.md`; `features/README.md` was in NEITHER table; `README.md` also omitted `ARCHITECTURE.md`, `THREAT-MODEL.md`, `LIMITS.md` and `pharn.records.json`.
- `docs/commands/init.md:130` and `docs/commands/status.md:69-70` already carried what PR 6 added (`features/README.md`, "minus test files and `test-fixtures/`") — both preserved verbatim.
- `npm run check` already includes `lint:md` (#144); `format:check` covers `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts` only — the spec's "prettier covers markdown here" is FALSE.

## Files

- `docs/getting-started.md` — "What you get" table rewritten `pharn`-first (9 rows), a layout note under it, and the pre-install overwrite paragraph made layout-neutral — layer `docs`
- `README.md` — "What it installs" table rewritten to the SAME 9 rows in the same order, with a condensed layout note — layer `docs`
- `docs/commands/init.md` — the `Copy product surfaces` row made layout-neutral; the concrete per-layout paths moved into the `Mirror the layout` row where they belong; the overwrite-check paragraph made layout-neutral — layer `docs`
- `docs/commands/status.md` — the compared-set sentence made layout-explicit (both layouts named) and completed with pharn's `LICENSE` copy — layer `docs`
- `tests/docs-install-tables.test.ts` — NEW: derives the required path set from `layoutPaths('pharn')` + the layout-invariant constants and pins both tables to it — layer `tests`
- `CHANGELOG.md` — the user-visible entry: what the tables claimed, what an install writes, and the conditional trusted-doc set — layer `docs`

## Evals to write (P1)

- Every path a `pharn`-layout install writes (`layoutPaths('pharn')` grillers/lenses/contracts/core/floor/license.to/docs + `CLAUDE_COMMANDS_DIR` + `CLAUDE_HOOKS_DIR` + `FEATURES_README` + `PHARN_CONFIG_FILE` + `RECORDS_FILE`) is named in each doc's install section.
- No row's Artifact column leads with a flat-layout directory (`layoutPaths('flat')` grillers/lenses/contracts/core/floor). `PHARN-LICENSE` is deliberately exempt — it is parenthesized beside `pharn/LICENSE` on purpose.
- The two tables list the same artifacts in the same order.
- **Negative half (run, not assumed):** stashing the two doc files and re-running turns all 5 assertions RED with the exact pre-change defects named (`README.md never names pharn/pharn-pipeline/grillers`, `the Artifact column names the flat path pharn-pipeline/grillers/<name>/`).

## Guarantee audit (P0)

- "the tables match the installer" → **only the PATH SET is floored**, and only now that `tests/docs-install-tables.test.ts` exists. Before this increment NO gate could see the tables at all: `lint:md` checks syntax, `format:check` does not read markdown, and nothing else opened those files. **A test was added**, because the honest alternative was to ship a doc fix with zero protection against the same drift recurring — which is exactly how these tables got three releases behind.
- What the new test does NOT prove, stated plainly: the DESCRIPTIONS are unverified free text; an EXTRA row for something never installed is not caught (the forbidden half only refuses flat paths); the prose in `docs/commands/init.md` / `status.md` is not covered at all; and it asserts what the code CAN write, never what a given upstream clone actually ships.
- "a `pharn` install lands four trusted docs" → **NOT CLAIMED.** The constant names four; upstream ships two under `pharn/`. Both docs say the copy is conditional and name which two land today.
- "flat is still supported" → preserved, not floored: both docs describe flat as the legacy variant, and `configLayout`'s fail-closed default is unchanged (no source touched).
- "the docs no longer describe a fetch that does not happen" → **checked by reading, not by a gate**: no line this increment writes mentions degit or cloning.

## Out of scope (P7)

- **No source changes.** `src/lib/constants.ts`, `layout.ts`, `install-capabilities.ts` and `install-manifest.ts` are untouched — the code is the source of truth here, not the thing being fixed.
- Getting upstream to relocate `THREAT-MODEL.md`/`LIMITS.md` under `pharn/`, or making the CLI warn when a trusted doc is absent from the clone. Today's silence is the documented P7 behavior.
- `docs/reference/pharn-records.md`'s example store still keys a root `CONSTITUTION.md` — a flat-layout illustration, reported but not rewritten (it is a schema example, not an install claim).
- The other FABLE 5.5 docs findings (`npm run dev`, `CONTRIBUTING.md`, the stale overwrite prompt) — separate items, and #143/#147 already closed two of them.
- Extending the new test to `docs/commands/*.md`, or to "no extra rows". Both are real gaps; both need a different shape of assertion than this increment's.
