# PLAN — `pharn update --dry-run`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn update --dry-run` prints the exact per-file plan, membership changes, models outcome, hooks note and withheld-version verdict of the real run and writes nothing, built on a planning function extracted from `applyUpdate` and shared by both paths.
- layer(s): single package, no `pharn-contracts` change. `src/index.ts` dispatches (flag table, USAGE); `src/commands/update.ts` owns the verb (control flow, report); new `src/lib/update-plan.ts` is shared logic reached from the command (ARCHITECTURE.md §4 / P3).
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

## Discovery (live state, read this run)

- `src/commands/update.ts` (1120 lines): `runUpdate` → `runArchetypeUpdate` (proxy notice, `resolveSource`, ahead-of-release return :252-261, same-version return :289-292, note, confirm :330-338, `withProjectLock` :394 → `assertConfigUnchanged` :397 → `fetchRepo` :406 → `minCliGate` :414 → `applyUpdate` :421 → `diffHookWiring` :452) and `applyUpdate` :510-784. In `applyUpdate`, :519-601 is planning (`parseCapabilityIndex`, `unknownCapabilitiesWarning`, `resolveCapabilities`, `mergeCapabilities`, `collectExpectedInstallPaths`, hashes, `readDiskState`, `recordsBaseline`, `planUpdate`, `decideModelsUpdate`). Planning also covers the derivations at :562, :568-569, :626-644, :689-698, :721-742 and the `outcome` fields at :775-782. Everything else is a write: `createBackup` :615, `applyWrites` :648, `writeRecords` :665/:700, `writePharnConfig` :749.
- Write-dependent derivation to watch: `abandonedLayout` uses `written.length > 0` (:775). `applyWrites` returns exactly `plan.writes` on success (apply-update.ts:99-143), so planning can use `plan.writes.length > 0` with identical results (a failure throws before an outcome exists).
- `diffHookWiring` (hook-wiring.ts:195) is read-only and does not throw. Moving it before the writes is safe: `update` never writes `.claude/settings.json` / `settings.local.json`, the only project files it reads.
- `src/index.ts`: `ALLOWED_FLAGS` row `['update', ['force','yes','ref']]` :85; `DECLARED_BOOLEANS` is derived from the table, so adding `dry-run` there declares it; the `update` case passes `{force, yes, ref}` :295; `USAGE` options block :28-38. `tests/index.test.ts` pins `runUpdate` args at :90, :96, :105, :111, :117, :564, :567, :586-589 (exact key list `force, ref, yes`) and :639.
- Existing helpers: `tests/helpers.ts` (`stubProcessExit`, `useTmpDir`); `tests/update.test.ts` (2979 lines; `describe` blocks listed at :170-2859) is the guard for "no behaviour change to the real run". No whole-tree snapshot helper exists, so the plan adds one in `tests/helpers.ts`.
- Docs: `docs/commands/update.md` (options paragraph, Behavior list), `README.md:269` (command table), `docs/troubleshooting.md` exit-code table (:7-21) and the `update` rows, `CHANGELOG.md` `## [Unreleased]` (empty), `CLAUDE.md` (dispatch paragraph naming `update: force, yes, ref`, and the `pharn update` paragraph). `grep -i "dry-run"` finds nothing in `src/` or `docs/`, so there is nothing to reconcile.
- Trusted docs: none need a change (see Open questions, Q8).

## Design

### 1. Planning function, `src/lib/update-plan.ts`

```ts
buildUpdatePlan(input: {
  repoDir: string; sha: string | null; config: PharnConfig; cwd: string;
  force: boolean; channel: RefChoice;
}): PlannedUpdate
```

It is pure with respect to the project: it reads the clone and the project and writes nothing. It never logs, and it never imports `@clack/prompts`. The block at :519-601 and the write-independent derivations move into it unchanged and in the same order, so a throw lands in the same catch with the same message.

`PlannedUpdate` has two halves. The split is what keeps the report serializable later (the `--json` increment must not require reshaping):

- `report: UpdatePlanReport` is **JSON-safe** (plain objects, arrays and strings only, no `Map`/`Set`/functions/`Date`), and the only thing the dry run prints from:
  `installedVersion`, `currentVersion`, `recordedVersion`, `versionWithheld`, `pendingSkillsVersion`, `frozenCapabilities`, `capCount`, `capabilityChanges`, `files: PlannedFile[]` (rel/action/label/backup/forced), `writes`, `backups` (including `pharn.config.json` when `models.backup`), `skipped`, `counts`, `models: ModelsUpdate`, `modelsFloor`, `abandonedLayout`, `layout`, `featuresReadmeRelocation`, `hookWiring: HookWiringDiff`, `recordsNote`, and `unknownWarning: string | null` (the string today logged inside `applyUpdate`).
- `apply: ApplyInputs` is for the real run only: `expected` (Map), `records`, `frozen` (Set), `configCapabilities`, `nextSkillsVersion`, `nextCommit`, `layout`, and the `UpdatePlan`/`ModelsUpdate` objects that `writeRecords`/`writePharnConfig` consume.

`USER_EDIT_SKIPS` moves with it (it is planning logic).

### 2. Real run, `src/commands/update.ts`

`applyUpdate` becomes the write half, `applyPlannedUpdate(planned, …, onBackup)`. It keeps `createBackup`, `applyWrites`, the partial-failure `writeRecords`, `writeRecords`, `writePharnConfig` and the `UpdateOutcome` assembly, in the same order. The caller (still inside the lock and the `try`) does `buildUpdatePlan` → `log.warn(report.unknownWarning)` → `applyPlannedUpdate`. The unknown-capabilities warning therefore still prints before the backup, as now. `reportOutcome` reads the same fields. `hookWiring` comes from `report.hookWiring` instead of a post-write call (no behaviour change, see Discovery).

### 3. Dry-run control flow, `runArchetypeUpdate`

`runUpdate(opts)` gains `dryRun?: boolean`.

| Step | Real run | `--dry-run` |
| --- | --- | --- |
| `intro` / `runNodePrereq` / `loadArchetypeConfigOrExit` | yes | yes (unchanged, first) |
| TTY gate (`interactiveAllowed`) | yes unless `--yes` | **skipped** (never prompts) |
| proxy notice, `resolveSource`, `SKILLS_VERSION` read | yes | yes |
| ahead-of-release return | yes | yes, reported, exit 0 |
| same-version / frozen / models-migration / channel-switch gate | yes | yes, `Already up to date`, exit 0 |
| summary note | yes | yes, titled as a preview |
| confirm | unless `--yes` | **skipped** |
| `withProjectLock` + `assertConfigUnchanged` | yes | **skipped** |
| `fetchRepo`, `minCliGate` (refusal → exit 1) | yes | yes |
| `buildUpdatePlan` | yes | yes |
| `createBackup` / `applyWrites` / `writeRecords` / `writePharnConfig` | yes | **never called** |
| report | `reportOutcome` | `reportDryRun`, exit 0 |

A single `if (dryRun)` branch sits after the confirm/lock region. It fetches inside its own `try/finally` (clone cleanup, then exit after, the file's existing discipline), reuses `minCliGate`, `buildUpdatePlan` and the existing `reportCapabilityChanges`/`reportModels`/hooks/SKIPPED renderers, and adds a `PLAN` note. The flow is not duplicated: the clone-and-gate part is factored into one small helper both paths call, so the MIN_CLI refusal text and exit code cannot diverge.

### 4. What the dry run prints (clack, stdout, same chrome as the real run)

1. `intro('pharn update --dry-run')` and the usual summary note, ending with `Preview only — nothing will be written.`
2. `PLAN`: `WOULD WRITE`, grouped by label (`restored`, `updated`, and `forced` under `--force`) with rels; `UNCHANGED n`; `WOULD BACK UP` (under `--force`, including `pharn.config.json` when the models block is forced) with the `.pharn-backup/` destination named but not created.
3. `SKIPPED` (modified/unrecorded/unverifiable/unreadable), the same renderer as the real run, with the `--force` advice phrased as a preview.
4. `CAPABILITIES` (membership changes), `MODELS`, `HOOKS`, the records-store warning, the layout-migration and features-README relocation warnings (as "would move"), and the withheld-version verdict (`would stay recorded as vX (upstream vY)` / `would record vY`, plus whether `pendingSkillsVersion` / `frozenCapabilities` would be set).
5. `outro`: `Dry run — would write N · back up M · unchanged K · skipped S. Nothing was changed. Run \`pharn update\` to apply.` Exit 0 in every case (skips are decisions, not failures).

The wording is shared with the real run by parameterizing the renderers (tense/prefix), not by copy.

### 5. Flag plumbing

`ALLOWED_FLAGS.update = ['force','yes','ref','dry-run']`; `argv['dry-run']` → `dryRun: Boolean(argv['dry-run'])`; USAGE line `--dry-run   update: show what would change and write nothing`. `--yes` with `--dry-run` is accepted and is a no-op (it composes; see Q3).

## Files

- `src/lib/update-plan.ts` — NEW: `buildUpdatePlan`, `PlannedUpdate` / `UpdatePlanReport` types, `USER_EDIT_SKIPS` — layer: shared lib (P3 shared logic)
- `src/commands/update.ts` — extract planning, add the `--dry-run` branch and `reportDryRun`, shared clone+gate helper — layer: command
- `src/index.ts` — `ALLOWED_FLAGS` row, `dryRun` threading, USAGE line — layer: dispatcher
- `tests/update-plan.test.ts` — NEW: unit tests of `buildUpdatePlan` on fake repos — layer: tests
- `tests/update-dry-run.test.ts` — NEW: the `--dry-run` command suite (reuse the `tests/update.test.ts` harness; mocked clack and fetch) — layer: tests
- `tests/helpers.ts` — add `snapshotTree(dir)` (sorted rel path + type + mode + sha256 of every entry, dotfiles included) — layer: tests
- `tests/update.test.ts` — **unchanged expectations**; touched only if `runUpdate`'s call shape needs `dryRun: false` in a pin — layer: tests
- `tests/index.test.ts` — update the exact-args pins (`dryRun`) and the exact key list `['dryRun','force','ref','yes']` (:586); add dispatch cases — layer: tests
- `docs/commands/update.md` — new "Previewing an update" section; options paragraph; Behavior list — P4
- `README.md` — `pharn update` row — P4
- `docs/troubleshooting.md` — exit-code table row, per-command flag table, TTY paragraph (`--dry-run` needs no terminal) — P4
- `CLAUDE.md` — dispatch paragraph (`update: force, yes, ref, dry-run`), `pharn update` paragraph (planning/applying split, the dry-run contract) — P4
- `CHANGELOG.md` — `[Unreleased] / Added` entry. No `package.json` version bump.

Not touched: `CONSTITUTION.md`, `ARCHITECTURE.md`, `THREAT-MODEL.md`, `LIMITS.md`, `AGENTS.md`, `.codex/`, `src/lib/{update-decision,apply-update,backup,install-records,pharn-config}.ts`.

## Contracts satisfied

- `pharn-contracts` (capability-frontmatter, finding-shape, …): not applicable. This increment changes the installer CLI only and adds no schema. It adds **no** `pharn.config.json` key and no records change (P7: schema stays additive).
- Existing installer contracts cited, not restated: the update decision table (`src/lib/update-decision.ts`, table above `decideFileAction`) is reused as the dry run's only source of per-file verdicts; the exit-code table (`docs/troubleshooting.md`) gains one row; the per-command flag allowlist (CLAUDE.md, dispatch paragraph) gains `dry-run`.

## Evals to write (P1)

No `rule_id` or Capability is added, so there are no PHARN evals. P1 is met by vitest tests (names indicative):

`tests/update-dry-run.test.ts`
- **Writes nothing (the headline)** → `snapshotTree(cwd)` before == after across: a clean upgrade; `--force` with modified/unrecorded/unverifiable skips; a membership change; a models update; a layout migration; a withheld run. Expected: byte-identical tree, no `.pharn.lock`, no `.pharn-backup/`, config and records bytes equal.
- **Never calls the write path** → spies on `createBackup`, `applyWrites`, `writeRecords`, `writePharnConfig`, `withProjectLock`, `assertConfigUnchanged`: zero calls.
- **Skips TTY gate + confirm** → non-TTY stdin/stdout with no `--yes`: runs, exit 0, `confirm` never called. (Real-run counterpart still exits 1: already pinned in `update.test.ts`.)
- **Held lock is not consulted** → a live `.pharn.lock` present: dry run succeeds, the lock file is byte-identical afterwards.
- **Config changed between load and plan** → no `assertConfigUnchanged` refusal, exit 0 (documents the intentional skip).
- **Early returns** → same version, no `--force`: `Already up to date`, exit 0, no fetch of the tarball; ahead of the release (`--ref latest`): reported, exit 0, nothing fetched; `--ref latest` with an unresolvable release: exit 1.
- **MIN_CLI** → refusal exits 1 with the same message as the real run; a warning-only gate warns and continues; the clone is cleaned up before exit.
- **Fetch failure** → exit 1, clone state clean, nothing written.
- **Report content** → output (ANSI stripped with `stripVTControlCharacters`, since CI sets `CI=1`) lists restored/updated writes, each skip bucket with rels, `WOULD BACK UP` under `--force` (config included when the models block is forced), CAPABILITIES (each of `added`, `dropped-unselected`, `dropped-gone`, `kept-manual`, `kept-frozen`), MODELS, HOOKS, withheld verdict with `pendingSkillsVersion`/`frozenCapabilities`, abandoned-layout and features-README warnings, records note.
- **Composition** → `--dry-run --force`, `--dry-run --ref latest|main` (channel switch is shown as a would-record, not recorded), `--dry-run --yes` (no-op).
- **Parity with the real run (the core claim)** → for each scenario above, run `--dry-run` on a copy of the tree, then the real `update --yes` on the original; the dry run's `writes`, `backups`, `skipped` and `counts` equal what the real run wrote, backed up and reported (compare the files actually written and the backup dir listing).

`tests/update-plan.test.ts`
- `buildUpdatePlan` is read-only (`snapshotTree` of cwd and clone before == after) and logs nothing.
- `report` round-trips through `JSON.parse(JSON.stringify(x))` unchanged (guards the later `--json` increment: no `Map`/`Set`/`undefined`-only fields).
- Each derivation: `versionWithheld` true/false, `pendingSkillsVersion` only when every skip is `modified`/`unrecorded` and the version differs, `frozenCapabilities` (new and previously frozen with a skipped file), `abandonedLayout` both directions, `featuresReadmeRelocation`, `backups` gains `pharn.config.json` only with `models.backup`.
- A frozen capability is absent from `apply.expected` but present in `configCapabilities`.

`tests/update.test.ts` (regression guard, expectations unchanged)
- The whole existing suite passes unmodified, in particular the order assertions around the unknown-capabilities warning, the backup notice and spinner stops, and partial-failure records. Run with `CI=1` as well.

`tests/index.test.ts`
- `update --dry-run` → `runUpdate({force:false, yes:false, dryRun:true})`; `-y --dry-run --force --ref latest` threads all four; `--dry-run=false` and `--no-dry-run` give `dryRun:false`.
- `--dry-run` on `init|add|remove|list|status` → `Unsupported option for \`<cmd>\`: "--dry-run"`, exit 1 (the table-driven loop already exists; add the flag to its matrix); `pharn status --help --dry-run` still refuses.
- Exact key list for `update` is `['dryRun','force','ref','yes']`.
- USAGE text lists `--dry-run` and its owning command (existing USAGE-vs-table agreement test, if any, must stay green).

Gates: `npm run check`, `CI=1 npx vitest run`, `npm run test:coverage` (ratchet 97/92/97/97: every new branch has a test above), `npm run build`. `log.error(` stays only in `lib/report-error.ts`; no `isTTY` read outside `interactiveAllowed({...})`.

## Guarantee audit (P0)

- "`--dry-run` writes nothing to the project" → floor: **path-containment by construction (no write call is reachable) plus a whole-tree content-hash snapshot test** (before == after, dotfiles included) and spies asserting zero calls to every write function. It is a statement about pharn's own writes in the project root; the clone temp dir under `os.tmpdir()` is created and removed as in the real run (said so in the docs). Nothing else (a concurrent process, the user's editor) is covered.
- "The dry run's plan is what the real run would do" → floor: **same function**. Both call `buildUpdatePlan`, and the decision itself is `decideFileAction` (sha256 equality and presence tests). Pinned by the parity test. **Advisory**: it is a snapshot. The tree and upstream can change between the preview and the apply (the real run re-fetches, re-plans under the lock, and `assertConfigUnchanged` guards the config). The docs say so; this is not sold as a guarantee (P7).
- "Real-run behaviour is unchanged by the extraction" → floor: the unchanged `tests/update.test.ts` suite (2979 lines) plus the order-preservation points listed above. Test-enforced, not sold as proof of equivalence.
- "Skips the project lock and `assertConfigUnchanged`" → intentional, because a read-only run cannot corrupt or race a writer in the destructive sense. The only exposure is a stale or torn read while a writer is mid-run; the output is advisory in that case. Documented, not guaranteed.
- "Exits 0 whatever the plan" → exit code is a deterministic function of the pre-plan refusals (node floor, config, resolve, fetch, MIN_CLI), all unchanged real-run floors.

## Trust audit (P2)

The dry run ingests the same untrusted artifacts as the real run (the fetched clone: capability index and frontmatter, file names and bytes, the `models` block, upstream `settings.json` hooks, `MIN_CLI`) and adds one new sink: **it prints them**. Taint propagation: every upstream-derived string that reaches the new `PLAN`/report output goes through the existing sanitizers (`terminalSafe` for model names/reasons, the `hook-wiring.ts` `\u`-escaping and line cap for hooks), and rels come from `collectExpectedInstallPaths` after `safeJoin`/`COPY_FILENAME_RE`/`CAPABILITY_NAME_RE` validation, so they are control-character-free by validation. No upstream byte is executed or used to drive a write, because no write exists on this path. The plan carries no upstream free text that is not already printed by the real run. A plan consumed later by an LLM agent is data (the later `--json` increment inherits the same fencing). The residual (downstream LLM reading printed names) is the one already named in `THREAT-MODEL.md §5`; this increment adds no new instance.

## Determinism audit (P5)

- Every branch is a membership/equality test: `dryRun` boolean from argv; label sets (`USER_EDIT_SKIPS`, `FORCEABLE_SKIPS`); `plan.writes.length > 0`; `layout !== previousLayout` (a third `Layout` member prints nothing, as today).
- Output order is deterministic (`SKIP_ORDER`, `CHANGE_ORDER`, manifest order for writes).
- Fallbacks: no terminal fallback guesses. Refusals exit 1 (node floor, config, resolve, fetch, MIN_CLI); everything past planning exits 0.
- No new classification is introduced.

## Resolved decisions (GATE 1, 2026-10-10)

The human approved with "Approve with recommendations": every question is resolved as the recommended answer.

- Q1 — planner lives in new `src/lib/update-plan.ts` exporting `buildUpdatePlan`.
- Q2 — same clack notes/outro as the real run (no plain-text mode).
- Q3 — `--dry-run --yes` accepted; `--yes` is a no-op.
- Q4 — exit 0 whatever the plan; no distinct pending-changes code.
- Q5 — preview says `WOULD BACK UP n files to .pharn-backup/<timestamp>/` (no invented timestamp) and `Would record channel: latest|main` on a channel change.
- Q6 — mirror the real run's same-version/frozen/models-migration/channel-switch gate exactly (one shared expression); no always-fetch.
- Q7 — new "Previewing an update" section in `docs/commands/update.md` plus one exit-code row in `docs/troubleshooting.md`.
- Q8 — no trusted-doc change.
- Q9 — keep shared-file edits minimal (one token/row/line each); merge order is the coordinator's call.
