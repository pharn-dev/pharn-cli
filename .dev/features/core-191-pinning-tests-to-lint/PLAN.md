# PLAN — core-191-pinning-tests-to-lint (Linear CORE-191, C7.2)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the code invariants pinned today by tests that READ `src/` text become eslint rules in `eslint.config.mjs` (each message names the reason, proven by one in-process `ESLint.lintText` test); the YAML / npm-script / doc-prose pins are cut to the three the ticket keeps (required check names, the one `contents: write`, one `Decide` run) or deleted; `dependency-overrides` becomes a table test over every `overrides` key. No behaviour change, no release.
- base: origin/main @ a4bbcb9. Branch `przemek/core-191-c72-source-text-prose-and-yaml-pinning`.
- layer(s): dev tooling only — `eslint.config.mjs`, `tests/`, `docs/contributing.md`, `docs/RELEASING.md`. No `src/` change. No `CLAUDE.md` change (CORE-192 owns it; its stale sentences are handed over, see Open questions).
- constitution_refs: [P0, P1, P4, P5, P7]

## Why (discovery, live state this run)

- eslint 10.14.0, typescript-eslint non-type-checked. Every selector below was run against a planted snippet with `ESLint.lintText` this run: the `isTTY` `:not(CallExpression[callee.name='interactiveAllowed'] MemberExpression)` selector, `Literal[raw=/…/]` / `TemplateElement[value.raw=/…/]` for the control-range scan (with a `:not([raw='…'])` that spares `DISPLACED_LEAD_RE` exactly — so `capability-index.ts` needs no disable comment), `Identifier[name=/^rename(Sync)?$/]`, the `current = current ? …` walk idiom, `log.error(`, `process.env.PHARN_DEBUG` — all fire, and the exempt spellings do not.
- Flat config does NOT merge a rule's options across matching config objects (last one wins), so a file-specific restriction would silently drop the src-wide ones. The config therefore declares the invariants ONCE as data and builds, per rule, one `src/**/*.ts` object plus one object per file that is exempt from or specifically targeted by an entry, each carrying that file's FULL option list.
- Today's `src/` passes every rule (each pinning test is green on the base), so `npm run lint` stays green with no `src/` edit. `process.exit` appears in 20 `src/` files today; until C5.1 they are the allowlist.
- Base suite timing (heavy.sh, `--maxWorkers=2`, quiet machine): 109 files, 3779 tests, 18.12 s; `lint-gate.test.ts` 2.9 s (7 eslint spawns), `publish-workflow.test.ts` 1.2 s. Re-measured back-to-back with the result at verify time.

## Files

- `eslint.config.mjs` — add the invariant table + builder (see "Rules"); `src/**/*.ts` only (tests and scripts legitimately spawn processes, use `sha256File`, read files). — layer dev tooling
- `tests/lint-rules.test.ts` — NEW. One `it`: loads the REAL `eslint.config.mjs` (`new ESLint({ cwd: repoRoot })`, in-process, no spawn), lints one planted violation per rule at a `src/` path (and the exempt file for each exemption), and compares the table of `(case, fired?, message contains reason)` to the expected one. — layer test
- `tests/ci-workflow.test.ts` — REWRITTEN to names only (~40 lines, filename kept so the `docs/contributing.md` links stay valid): reads `ci.yml`, `floor.yml`, `gitleaks.yml`, `codeql.yml`; derives each job's reported context (its `name:`, else its id; `${{ matrix.language }}` expanded from `language: [...]`); asserts every one of the nine required contexts (`Format check`, `Lint`, `Markdown lint`, `Typecheck`, `Test`, `Build`, `floor`, `gitleaks`, `Analyze (javascript-typescript)`) is produced. Dropped: npm-script-per-gate, runner/node pair, smoke-step run lines, the pharn-ci comment job's shape/inputs, the fork-only comment workflow. — layer test
- `tests/publish-workflow.test.ts` — REWRITTEN (~70 lines): keeps `contents: write` appearing exactly once and inside the `release` job, and ONE test that executes the committed `Decide` step twice against a stub `git` (exit 0 → `release=false`; exit 2 → `release=true`). Dropped: triggers, job graph, concurrency, the release job's no-checkout/no-id-token check (`id-token` stays pinned by `.dev/floor/check-run-pins.test.mjs`), the `Registry check` HTTP-server execution, the tarball-argument pins, and the Decide refusal cases. — layer test
- `tests/dependency-overrides.test.ts` — REWRITTEN (~35 lines): a table over every `package.json` `overrides` key (lower bound = the `~`/`^`/`>=`/`=` version; an unmodelled specifier fails) plus the existing `markdown-it` lockfile floor (15.0.3, no override — kept as a named extra row so this file does not silently drop a guard); every lockfile `packages` key `(^|/)node_modules/<name>$` must be ≥ the bound, and each row must match at least one entry. Covers `re2js` and `minimatch`, which the old file missed. — layer test
- DELETED whole files: `tests/lint-gate.test.ts`, `tests/docs-models-claims.test.ts`, `tests/docs-install-tables.test.ts`, `tests/check-composition.test.ts`, `tests/dev-script.test.ts`.
- DELETED whole `it`/`describe` blocks (no partial edits, to merge cleanly with CORE-190/192): `tests/color.test.ts` (describe "no other src/ file imports picocolors"), `tests/hash.test.ts` (describe "the one comparison hash"), `tests/init.test.ts` (3 its: isTTY predicate; init imports no module manifest; no git/child_process), `tests/update.test.ts` (it "the confirm is update.ts ONLY prompt"), `tests/diff.test.ts` (it "owns no disk or hash primitives"), `tests/executable-unit.test.ts` (it "reads no file"), `tests/root-migration.test.ts` (it "no rename anywhere"), `tests/remove.test.ts` (it "runRemove declares exactly one parameter"), `tests/symlink-guard.test.ts` (describe "the symlink-component walk lives in exactly one module"), `tests/terminal-safe.test.ts` (describe "no second unsafe-character definition in src/", incl. its 9 detector cases), `tests/report-error.test.ts` (3 structural its + the `srcDir`/`walk` helpers they alone use), `tests/json-report.test.ts` (describe "the one serializer"), `tests/tar-extract.test.ts` (it "fetchRepo is the only producer of a clone tree"), `tests/engines.test.ts` (it "matches the README badge"). Unused imports those blocks leave behind are removed.
- Per-file write scope for the whole-block deletions above (one bullet each so the scope setter sees them; GATE 1 approved 2026-11-16, content unchanged):
- `tests/color.test.ts` — delete one describe — layer test
- `tests/hash.test.ts` — delete one describe — layer test
- `tests/init.test.ts` — delete three its — layer test
- `tests/update.test.ts` — delete one it — layer test
- `tests/diff.test.ts` — delete one it — layer test
- `tests/executable-unit.test.ts` — delete one it — layer test
- `tests/root-migration.test.ts` — delete one it — layer test
- `tests/remove.test.ts` — delete one it — layer test
- `tests/symlink-guard.test.ts` — delete one describe — layer test
- `tests/terminal-safe.test.ts` — delete one describe — layer test
- `tests/report-error.test.ts` — delete three its + their helpers — layer test
- `tests/json-report.test.ts` — delete one describe — layer test
- `tests/tar-extract.test.ts` — delete one it — layer test
- `tests/engines.test.ts` — delete one it — layer test
- `tests/lint-gate.test.ts` — delete file — layer test
- `tests/docs-models-claims.test.ts` — delete file — layer test
- `tests/docs-install-tables.test.ts` — delete file — layer test
- `tests/check-composition.test.ts` — delete file — layer test
- `tests/dev-script.test.ts` — delete file — layer test
- `docs/contributing.md` — the test-file table: drop the deleted files' rows, describe `ci-workflow.test.ts` as the required-check names, add `lint-rules.test.ts`; add a short "Code invariants are lint rules" paragraph naming the rules and that `npm run lint` is where they fail.
- `docs/RELEASING.md` — §Limits: `publish-workflow.test.ts` now pins only the one `contents: write` and runs `Decide` (tagged / untagged); everything else in the workflow is first exercised by a real release.

## Rules (eslint.config.mjs; all `error`, `src/**/*.ts`)

| # | invariant | rule | exempt | replaces |
|---|---|---|---|---|
| 1 | no process spawning | `no-restricted-imports` paths `child_process`, `node:child_process` | — | init.test "no git / child_process" |
| 2 | colour only via `color.ts` | `no-restricted-imports` path `picocolors` | `src/lib/color.ts` | color.test |
| 3 | `sha256File` only in `hash.ts` | `no-restricted-imports` pattern `**/hash.js` importNames `sha256File` | — (hash.ts defines it, never imports it) | hash.test |
| 4 | `isTTY` only inside `interactiveAllowed(...)` | `no-restricted-syntax` (ticket selector) | — (capability-picker.ts included: that is the old "predicate stays pure" half) | init.test isTTY |
| 5 | `process.exit` allowlist | `no-restricted-properties` `process.exit` | today's 20 files | (new — ticket) |
| 6 | update's confirm is its only prompt | `no-restricted-imports` `@clack/prompts` importNames = the 12 prompt APIs minus `confirm` in `commands/update.ts`, all 12 in `lib/update-render.ts` | — | update.test |
| 7 | `diff.ts` owns no disk/hash primitive | `no-restricted-imports` `node:fs`, `fs`, `node:crypto`, `crypto` in `lib/diff.ts` | — | diff.test |
| 8 | `executable-unit.ts` reads no file | `no-restricted-imports` `node:fs`, `fs`, `node:fs/promises`, `fs/promises` in `lib/executable-unit.ts` | — | executable-unit.test |
| 9 | root-migration never moves user data | `no-restricted-syntax` `Identifier[name=/^rename(Sync)?$/]` in `lib/root-migration.ts` | — | root-migration.test |
| 10 | one symlink-component walk | `no-restricted-syntax` `AssignmentExpression[left.name='current'][right.type='ConditionalExpression']` | `lib/symlink-guard.ts` | symlink-guard.test |
| 11 | one unsafe-character set | `no-restricted-syntax` on `Literal[raw]` / `TemplateElement[value.raw]` (the old CONTROL_RANGE + CATEGORY_CLASS regexes; `DISPLACED_LEAD_RE`'s exact literal spared by `:not`) | `lib/terminal-safe.ts` | terminal-safe.test |
| 12 | failures reported in one place | `no-restricted-syntax`: `log.error(` call; `process.env.PHARN_DEBUG`; a string/template containing `Re-run with PHARN_DEBUG` | `lib/report-error.ts` | report-error.test ×3 |
| 13 | one JSON serializer escape | `no-restricted-imports` pattern `**/terminal-safe.js` importNames `escapeUnsafe` in every `src/lib/*report*.ts` (listed at config load, as the old test did) | `lib/json-report.ts` | json-report.test |
| 14 | one clone producer | `no-restricted-syntax` call to `extractTarGz`/`extractTar`/`mkdtempSync`/`mkdtemp` (bare or member) | `lib/repo.ts`, `lib/tar-extract.ts` | tar-extract.test |
| — | `init.ts` imports no module manifest | GOES: `lib/manifest.ts` no longer exists, so an import of it fails `typecheck`; re-creating it is a deliberate act | | init.test |
| — | `runRemove` has no `yes` parameter | GOES: the behaviour is pinned by `index.test.ts` (`pharn remove --yes` refused, exit 1) and remove.test "the NAMED path never confirms" | | remove.test |

Each message names the reason in one sentence (e.g. #1: "src/ spawns no process: removing the only git caller removed the attacker-controlled .git/config RCE surface (THREAT-MODEL §1)."). Where an old test admitted a text-scan blind spot (aliased import, respelled walk), the AST rule is at least as strong (it sees an alias's import specifier; it ignores comments, so the old comment-stripping goes too) — #10 still matches one spelling, stated in its message comment.

## Kept, with the reason (justified in the PR)

- `source-hygiene.test.ts` (ticket: raw bidi/zero-width, no eslint rule does it); `release-consistency.test.ts` (ticket).
- `engines.test.ts` minus the README badge: it reads DEPENDENCY code in `node_modules` (a runtime-compat check eslint cannot express) and pins `node-floor.yml`'s `FLOOR` equal to `engines.node` — one value-consistency check, the `release-consistency` shape, guarding the only workflow that runs the floor.
- `node-floor.test.ts` `NODE_FLOOR === engines.node`: imports the constant, reads no source text.
- `capability-index.test.ts` / `model-config-parity.test.ts`: they read the VENDORED, sha-pinned pharn-oss files and differential-test behaviour against them — not our source text.
- The FIFO tests (`bounded-read`, `hook-wiring`, `install-records`, `pharn-config`, `project-lock`) and `dist-smoke` spawn `node` to IMPORT and run `src/` modules (behaviour under a hang/bundle), not to read their text. No test spawns eslint after this change.
- `add.test.ts` / `index.test.ts`: checked — they read no CLAUDE.md (comments only); nothing to delete.

## Evals to write (P1)

- `tests/lint-rules.test.ts`: for each of rules 1–14, a planted violation at a `src/` path → fires with the rule's reason text; for each exemption (color.ts/picocolors, symlink-guard.ts/walk, terminal-safe.ts/range, report-error.ts/log.error, repo.ts/mkdtempSync, json-report.ts/escapeUnsafe, an allowlisted process.exit file, update.ts/confirm, capability-index.ts's exact `DISPLACED_LEAD_RE`, `interactiveAllowed({ stdinIsTTY: process.stdin.isTTY })`) → silent. Written FIRST; fails today (no rule).
- Deliberate violation through the real gate, for the PR: plant `import pc from 'picocolors'` (or `process.stdin.isTTY`) in a scratch `src/` file → `npm run lint` exits 1 naming the reason; remove it → green.
- ci-workflow: renaming `name: Lint` in a copy of ci.yml makes the produced set miss `Lint` (shown in the PR, not committed as a fixture).

## Guarantee audit (P0)

- "a deliberate violation of each invariant fails `npm run lint`" → floor: eslint rule at `error` + `--max-warnings 0` in the required `Lint` job; proven per rule by `lint-rules.test.ts` against the real config.
- "the rules see what the old text scans saw" → advisory, bounded: AST matching over the shapes the old regexes matched (imports, calls, literals); a deliberately obfuscated bypass (dynamic `import(name)`, `globalThis['process']`, a regex built from `String.fromCharCode`) passes both the old scan and the rule — named, not claimed.
- "required check names are still produced" → floor: `ci-workflow.test.ts` (names only) in the required `Test` job; the ruleset side stays advisory, as before.
- "a broken `Decide` cannot end green with nothing published unnoticed" → floor: the executed tagged/untagged cases.
- "every override is honoured by the lockfile" → floor: deterministic version compare over the committed lock (not the installed tree — residual kept from the old file).
- "no test spawns eslint" → floor: `lint-gate.test.ts` deleted; `lint-rules.test.ts` uses the in-process API.

## Determinism audit (P5)

- Every rule is a syntax/membership match; the builder is a pure function of the invariant table (+ one `readdirSync` of `src/lib` for `*report*`, the old test's own filter).

## Open questions (resolved at GATE 1, 2026-11-16)

- (for the coordinator) `CLAUDE.md` names the deleted pins in five places (`tests/color.test.ts` "pins that no other src/ file imports picocolors"; `tests/ci-workflow.test.ts` "pins the names, their npm scripts, and the runner/node pair"; `tests/publish-workflow.test.ts` "pins the triggers, the job graph … EXECUTES … Registry check"; the hash.ts "tests/hash.test.ts fails if any other src/ file calls it"; the isTTY "a static test pins…"; terminal-safe "tests/terminal-safe.test.ts fails on a second control-range…"; executable-unit "pinned by a static test"; root-migration "a test pins it"; tar-extract "tests/tar-extract.test.ts pins that repo.ts is the only producer"). CORE-192 owns CLAUDE.md, so this PR leaves them; I will hand the exact list to CORE-192 (each → "an eslint rule in eslint.config.mjs"). OK?
- `process.exit` allowlist = today's 20 files (until C5.1). OK, or narrower?
- Keep `node-floor.yml` FLOOR pin in engines.test.ts (value consistency) — OK?
