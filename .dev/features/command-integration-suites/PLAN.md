# PLAN — command-integration-suites (CORE-190, C7.1: command suites run on the real integration harness)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: replace the command tests that `vi.mock` the CLI's own `src/` modules with per-command
  behaviour suites on the real harness (real temp project, only the global `fetch` stubbed serving a real
  codeload tarball, `@clack/prompts` stubbed at the prompt boundary), then delete the mock-heavy files;
  re-set the coverage floor. Tests and test config only — no `src/` behaviour change.
- layer(s): tests (the CLI's spec, P1); `vitest.config.ts`
- constitution_refs: [P1, P5, P6]

## Discovery — verified this run (P6)

- 113 test files, `tests/**/*.ts` = **53,172 lines** (54,781 with `.mjs`).
- Files that `vi.mock` a `src/` module (excluding `index.test.ts`, left to C5.5), lines / cases:
  `update` 4,508/213, `init-archetype` 2,318/62, `add` 1,797/72, `status` 1,418/70, `init` 1,404/52,
  `remove` 1,304/53, `update-dry-run-json` 1,046/49, `update-dry-run` 932/44, `update-plan` 887/44,
  `init-dry-run` 707/22, `status-json` 509/26, `init-dry-run-json` 498/21, `project-lock-commands`
  498/16, `orphans` 426/23, `init-yes` 347/12, `archetypes-config-commands` 118/1 — 18,717 lines,
  ~780 cases. Plus `commands-integration.test.ts` (1,927 lines, 45 cases, no src mock — the harness).
- `list.test.ts` (231) and `uninstall.test.ts` (853) already mock no `src/` module and run against a
  real project (uninstall injects faults via `vi.mock('node:fs')`, allowed).
- `update-plan`, `orphans`, `remove` mock a src module only as an input shortcut or pass-through spy
  (`parseCapabilityIndex`/`resolveCapabilities` stubs; a `readDiskState` call counter;
  `pharn-config` stubs) — fixable in place with real inputs.
- **Baseline wall time** (`heavy.sh npx vitest run --maxWorkers=2`, this machine): 26.05 s vitest
  Duration on a lightly loaded run (load avg 16), 45.90 s under heavy sibling load. Per-file:
  `commands-integration` 45 cases in 3.14 s (~0.07 s/case, not 0.44), `update` 4.60 s,
  `init-archetype` 2.92 s. Because sibling agents load the machine, the AC is checked by running
  main and this branch **back to back** with the same flags at the end, and both numbers reported.
- Coverage floors today 97/92/97/97 (`vitest.config.ts`).

## Files

Harness (shared):

- `tests/support/harness.ts` — the extracted harness: `upstreamTree(version, {layout})`, the fetch stub
  (release/tag/tip/SKILLS_VERSION/tarball, call log for "no network before X" assertions, failure
  modes), `run()`, project helpers (`at/read/config/records/projectFiles/seedInstall`), note/log/
  stdout/stderr capture — layer tests
- `tests/support/clack-stub.ts` — the `@clack/prompts` stand-in each suite installs with a one-line
  `vi.mock` (prompts throw unless an answer is queued with `mockResolvedValueOnce`) — layer tests
- `tests/support/tar-fixture.ts` — `codeloadArchive` memoized per (sha, tree) — layer tests

Per-command behaviour suites (each: success, every documented refusal with its exit code, cancel,
`--yes`, `--dry-run`/`--json` where the command has them, files written/deleted, JSON output):

- `tests/commands/init.test.ts` — channel, Node floor, git prereq (+ancestor), TTY gate, `--yes`
  (fresh, refusals before/after fetch, under the lock, dangling link), summary/overwrite cancel and
  Ctrl-C, overwrite prompt marks + backups, carry-over (manual, frozen, dropped → deleted, unreadable
  config), user-owned keys, models block, settings.json + HOOKS, absent surfaces, MIN_CLI,
  unknown capabilities, pre-flight refusals, `--archetype`, proxy notice — layer tests
- `tests/commands/init-dry-run.test.ts` — text and `--json` dry runs, writes nothing (`snapshotTree`),
  parity with a real run, refusals (stdout empty under `--json`) — layer tests
- `tests/commands/add.test.ts` — named/role:name/ambiguous/unknown/invalid, picker (TTY gate, cancel,
  empty, all-installed, multi-pick, failed pick → exit 1), version + layout + MIN_CLI gates and their
  order, pending version, records merge, drift backup, symlink refusal, already-installed — layer tests
- `tests/commands/remove.test.ts` — the current `remove.test.ts` cases without the `pharn-config` mock
  (real config on disk), trimmed of duplicates, plus a seeded-by-`init` case — layer tests
- `tests/commands/update.test.ts` — real run: TTY gate, `--yes`, confirm/decline/cancel, early
  returns (same version, ahead, re-opens), per-file decisions, withheld bump/pending, `--force` +
  backup, executable-unit hold, membership changes + removals, orphans, models, HOOKS, root
  migration, gitignore/prettierignore, channel switch, MIN_CLI, lock/re-plan refusals, fault
  injection via `node:fs` — layer tests
- `tests/commands/update-dry-run.test.ts` — text and `--json` (`--compact`) dry runs: every status,
  plan keys, writes nothing, failures with empty stdout — layer tests
- `tests/commands/status.test.ts` — text and `--json`: channel/version, `--no-drift`, drift sections,
  `--strict` exit codes, NODE/MODELS/HOOKS/ORPHANED/PRETTIER/LAYOUT/NOT SHIPPED notes, frozen,
  failures — layer tests
- `tests/commands/list.test.ts` — moved from `tests/list.test.ts` (no src mock already) + an
  init-seeded case — layer tests
- `tests/commands/uninstall.test.ts` — moved from `tests/uninstall.test.ts` + the init-seeded cases
  from `commands-integration` — layer tests
- `tests/commands/lock.test.ts` — cross-command lock behaviour (`project-lock-commands` cases,
  observed through the fetch call log instead of spy order) — layer tests

Unit suites fixed in place (keep; no src mock):

- `tests/update-plan.test.ts` — a real capability tree in the fake clone instead of index/resolve stubs
- `tests/orphans.test.ts` — the `readDiskState` call counter becomes a `vi.mock('node:fs')`
  pass-through read log

Config:

- `vitest.config.ts` — floors 90/85/90/90 (statements/branches/functions/lines) with the reason

Docs (build-time amendment: the test map names the files this PR deletes):

- `docs/contributing.md` — the "Test map" rows for the deleted/moved files point at `tests/commands/`

Deleted (cases ported above or covered by existing unit suites): `tests/add.test.ts`,
`tests/archetypes-config-commands.test.ts`, `tests/init-archetype.test.ts`,
`tests/init-dry-run-json.test.ts`, `tests/init-dry-run.test.ts`, `tests/init-yes.test.ts`,
`tests/init.test.ts`, `tests/project-lock-commands.test.ts`, `tests/status-json.test.ts`,
`tests/status.test.ts`, `tests/update-dry-run-json.test.ts`, `tests/update-dry-run.test.ts`,
`tests/update.test.ts`, `tests/commands-integration.test.ts` (split into the suites above),
`tests/remove.test.ts`, `tests/list.test.ts`, `tests/uninstall.test.ts` (moved).

Dev-loop artifacts: `.dev/features/command-integration-suites/{PLAN,GRILL,REGRESSION,VERIFY,REVIEW,SHIP}.md`,
`regression-report.json`, `verify-report.json`.

## Porting rules (what happens to each deleted case)

1. A behaviour observable from outside the process (exit code, stdout/stderr, a clack note/prompt,
   files on disk, config/records bytes, the fetch call log) → ported as an integration assertion;
   several small cases on one scenario are merged into one test.
2. A wiring-only assertion (a spy counting `collectExpectedInstallPaths` calls, "holds the lock once",
   "lock before fetch" by spy order) → re-expressed observably where it is a user-visible property
   (e.g. a held lock refuses with ZERO fetches), else dropped and listed in the PR body.
3. Pure-logic variants already pinned by a unit suite (`update-decision`, `merge-capabilities`,
   `update-render`, `update-report`, `init-report`, `status-report`, `write-targets`, `diff`,
   `hook-wiring`, `root-migration`, `gitignore`, `prettierignore`, …) → one representative
   integration case, the variants stay in the unit suite.
4. Source-text / prose pinning cases (e.g. `init.test.ts`'s "reads isTTY through one predicate",
   "imports no module manifest", "no child_process") → not ported (CORE-191 turns them into lint rules).
5. Fault injection only via `vi.mock('node:fs')` pass-through hooks or real permissions/symlinks.

## Evals to write (P1)

- Every `tests/commands/*.test.ts` case runs the real `run<Command>()` against a real temp project and
  asserts on bytes/exit/output; a temporary revert of a guarded `src/` branch (spot-checked during
  build: e.g. drop `add`'s layout gate, `update`'s withheld bump) must turn a case RED.
- AC2 check: `grep -lE "vi\.(do)?[mM]ock\(['\"]\.\./(\.\./)?src/" tests -r` returns only
  `tests/index.test.ts`.

## Guarantee audit (P0)

- "no test file mocks a src module except index.test.ts" → floor: the grep above (run in verify); not
  added as a lint rule here (CORE-191 owns `eslint.config.mjs`) — advisory beyond this PR.
- "coverage floor 90/85/90/90" → floor: vitest thresholds in CI `Test` job.
- "wall time ≤ 1.25× baseline" → advisory (measured, machine-dependent; reported back to back).
- "each documented refusal is covered" → advisory (a human-reviewed mapping, listed in the PR body).

## Trust audit (P2)

No untrusted input is ingested by this change (test code + fixtures only).

## Risks

- Size: ~9–10k added test lines and ~19k deleted in one PR. Committed per command so it reviews
  per commit; can split (harness+init / add+remove+lock / update / status+list+uninstall) if asked.
- Total test lines land near **~43k**, not the epic's 30k: this ticket deletes ~19k and adds ~9.5k;
  the rest of the gap is outside its file set (pinning tests → CORE-191, `index.test.ts` → C5.5,
  large pure-module suites kept by the ticket's own rule).
- Coverage may drop on defensive branches only the mocks reached (e.g. a thrown `undefined`); the
  new floor (85 branches) absorbs that by design; each lost branch I notice is named in the PR body.
- Sibling conflicts: CORE-191 may edit files this PR deletes (modify/delete conflict → keep deleted).

## Open questions (HALT)

- One PR (per-command commits) vs a split? Plan assumes one PR.
- Accept ~43k test lines as this ticket's honest share of the 30k epic target?
