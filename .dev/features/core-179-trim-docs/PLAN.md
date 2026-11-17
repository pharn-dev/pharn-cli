# PLAN — C4.6 (CORE-179): `update.md` to about 300 lines; troubleshooting leads with exit codes

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Docs-only. Cut `docs/commands/update.md` (901 lines) to ≤ 350, `docs/troubleshooting.md` (972) to ≤ 450 and `README.md` (508) to ≤ 250 by moving the rare `update` states to a new `docs/reference/update-advanced.md`, deleting version history and text whose behaviour no longer exists, single-sourcing the detection rules and the install-location table, and removing every src file / function name from the user docs.
- layer(s): user docs (`README.md`, `docs/**`), plus link targets in `CHANGELOG.md`. No `src/`, no `tests/`, no protected file.
- constitution_refs: [P4, P6, P7]

## Discovery (live state, origin/main a844f7a7)

- Sizes: update.md 901, troubleshooting.md 972, README.md 508, getting-started.md 141.
- **No test reads a user doc** (`grep` for `docs/`, `README`, `troubleshooting`, `update.md` in `tests/` hits only fixture paths and unrelated strings). So no assertion needs rewriting; no test file or `it`/`describe` is touched.
- Version history is already in `CHANGELOG.md` / `CHANGELOG-ARCHIVE.md` for every passage to be cut (checked: the stderr-through-0.3.2 fix, colour before 0.13.0, the executable unit before 0.18.0, the Node 20.13 floor before 0.8.0, the constitution overwrite before 0.4.0, degit proxy and cache, argv "used to" behaviour, the stamp-as-gate, `updatedAt` before 0.20.0, `.gitignore` 0.16.0 / `.prettierignore` 0.17.0). Nothing is added to the CHANGELOG.
- **Dead text** (behaviour no longer exists on main; deleted, not moved):
  1. update.md "The root-footprint migration" (removed by #412): the `ROOT MIGRATION` note, the deletion of root `THREAT-MODEL.md`/`LIMITS.md`, the move hints. What is still true (a root copy pharn recorded is an `ORPHANED` file; `plan.rootMigration` is always `null`, already in json-output.md) is kept as one sentence in the orphans section.
  2. update.md "First update after upgrading" and the `unverifiable` label's "every install created before 0.4.0 starts here" (also troubleshooting): a pre-0.4.0 config has no `layout` key, and `loadArchetypeConfig` refuses that with `FLAT_LAYOUT_MESSAGE` before any planning. The live case (no usable `pharn.records.json`: absent or unreadable) stays.
  3. update.md "pharn/CONSTITUTION.md … (Before 0.4.0 update silently overwrote …)" aside.
  4. update.md "Earlier releases made the stamp a gate …" aside; remove.md "Earlier releases accepted `pharn remove --yes` …" aside.
  5. troubleshooting "This changed in the codeload release" (degit proxy history).
  6. The `flat`-layout text is NOT dead: `FLAT_LAYOUT_MESSAGE` still refuses a flat config. It moves (shortened) to update-advanced.md.
- Src names in the user docs today (`srcnames-grep.sh`): troubleshooting.md:204 `lib/hash.ts`; init.md:412 `lib/install-manifest.ts`; pharn-config.md:4–5 `Source:` links to `pharn-config.ts` / `install-archetype.ts` and :31 `isArchetypeConfig`; pharn-records.md:5 `runInstallArchetype` / `collectExpectedInstallPaths` and :13 `Source:` link. Config / JSON key names (`skillsVersion`, `frozenCapabilities`, `dryRun`, …) are documented fields, not src names, and stay.
- "byte-identical to 0.10.0" no longer occurs (C4.5 removed it); the one remaining "byte-identical to an interactive run" (update.md `--yes`) is rephrased. Moot item, said so in the PR.
- Inbound anchors into update.md / troubleshooting.md from docs, README, support-policy and CHANGELOG were listed; `check-anchors.mjs` (scratchpad) resolves every relative link + `#anchor` across README, CHANGELOG, CONTRIBUTING, SECURITY and docs/**. Baseline: 2 pre-existing broken links, both in CHANGELOG (`support-policy.md#the-flat-layout-is-deprecated`, `update.md#compact-leave-out-the-unchanged-files`).

## Files

- `docs/commands/update.md` — rewrite to ≤ 350 (target ~320). Keeps: synopsis + options; Behavior in 6 steps (Node check, lock, config, resolve source, download + plan, nothing-to-change, confirm, apply — the lock/concurrency paragraph folded in); "Edits made while update waits for your answer" (short); "Previewing an update" + "JSON output" pointer; "What happens to your capability list" + its table; "Dropped capabilities are deleted" (tightened); "The decision table" + `unreadable` + "The skip labels"; "`--force` and `pharn/.backup/`"; "Release channel" + "An install ahead of its source"; "Non-interactive use"; "Before you confirm"; "When there is nothing to change"; "The recorded version stays true"; a "Less common situations" list linking each moved section; Related. Headings that inbound links use keep their exact text, so their anchors survive.
- `docs/reference/update-advanced.md` — NEW (~300 lines). Moved from update.md, history and dead text removed, headings kept verbatim (so `#orphaned-files`, `#the-executable-unit-is-upgraded-all-or-none`, `#the-models-block`, `#missing-files-at-the-same-skills-version`, `#a-records-store-from-an-interrupted-run`, `#when-pharn-cannot-read-a-capability-upstream`, `#a-surface-pharn-oss-does-not-ship`, `#gitignore`, `#prettierignore`, `#what-is-protected-by-default` resolve on the new page): the executable unit; orphaned files (+ root THREAT-MODEL/LIMITS sentence); when pharn cannot read a capability upstream (`frozenCapabilities`); the `models` block; missing files at the same skills version (merging "A surface added by a newer CLI" and "The review lens agent"); a records store from an interrupted run (+ the no-usable-store case); an install recorded at the flat layout; a surface pharn-oss does not ship; `.gitignore`; `.prettierignore`; what is protected by default (`.claude/settings.json`, `HOOKS` note, `CONSTITUTION.md`); writes by replacement (hard links). The `MIN_CLI` section is not duplicated: it lives in troubleshooting, and update.md / pharn-config.md link there.
- `docs/troubleshooting.md` — rewrite to ≤ 450 (target ~430). Order: **Exit codes** table first (adds `130` SIGINT / `143` SIGTERM on an interrupted run, per `fatal-signal.ts`), then a **Common problems** index of the top 8 symptoms → section, then the sections, each tightened with history removed: Node version; Streams and colour; `pharn update` skipped my files (held unit, `--force` backup error, backups from add/remove/init merged in); Prettier; Line endings (no `lib/hash.ts`); Prerequisites / Git not found; Detection (symptom + `--archetype` fix; the rules link to init.md's "3. Detect archetypes"); Overwrite warnings (targets link to getting-started's table); fetch failures; no verified release; upstream capability skipped; `MIN_CLI`; config from a newer pharn; Install failed / in the way / `PHARN_DEBUG`; Overwrite declined; Proxy (rules kept, as a compact list); leftover `degit` cache (paths table kept, story cut); Another pharn process / If the lock outlives its owner (every break rule kept); run init first / legacy config; invalid config / invalid JSON; `models` problems; unknown command / option / unsupported option (table kept, "used to" cut); Removing PHARN by hand (paths link to the table, exceptions kept); Local development; Related. Every heading an inbound link uses keeps its text. Contingency if tight writing lands above 450: move the stale-lock break rules to a reference page `docs/reference/project-lock.md` with the heading kept as a one-paragraph stub — reported at review, not silently.
- `README.md` — rewrite to ≤ 250 (target ~240). Keeps: header + badges; what/why; Quick start with the test-runner note; How it works (short table); "What gets installed" → 3 lines + link to getting-started's table, keeps "two version numbers"; **After install → three bullets** (hooks enforce only once wired in `.claude/settings.json`, `HOOKS` note + `status --strict`; `/pharn-loop`'s `Stop` guard needs registering too; `pharn update` never edits `settings.json`) + link to pharn-oss's README "What gets installed" for the write-guard postures; Day-to-day workflow (stage table + 3 lines, pharn-oss version history → link upstream); CLI commands table + the three scripting behaviours; Agent skills; Safety model bullets; Current scope (detection → link to init.md); Documentation (adds update-advanced); Development; Security; License.
- `docs/getting-started.md` — drop `npx shadcn@latest init`; drop the layout paragraph under "What you get" (its live facts — `.claude/settings.json` never overwritten, `pharn-install.json` 7.21.0+, flat removed — are already in init.md / support-policy and get a one-line link); the install-flow detection paragraph → two sentences + link to init.md's "3. Detect archetypes"; the prerequisites paragraph's target list → link to "What you get". "What you get" becomes the single install-location table.
- `docs/commands/init.md` — "3. Detect archetypes" becomes the single home of the detection rules: add the two rules only troubleshooting has today (no walk up to a workspace root / workspace packages' own `package.json` not read; split layouts unsupported, run from the dir holding `.git` and `package.json`). :412 drop `lib/install-manifest.ts`.
- `docs/commands/remove.md` — delete the "Earlier releases accepted `--yes`" aside.
- `docs/reference/pharn-config.md` — drop the `Source:` src links (:4–5) and name the rule, not `isArchetypeConfig` (:31); repoint `update.md#the-models-block` / `#pharn-is-too-old…` links.
- `docs/reference/pharn-records.md` — :5 and :13 drop `runInstallArchetype` / `collectExpectedInstallPaths` / `Source:`; repoint moved anchors.
- `docs/reference/deletes.md`, `docs/reference/json-output.md`, `docs/commands/{add,init,list,status}.md`, `docs/support-policy.md` — repoint links whose target section moved (link-only edits).
- `docs/README.md` — add `update-advanced.md` to the Reference list.
- `CHANGELOG.md` — repoint the released entries' links to moved/deleted update.md sections (and the pre-existing dead `#compact-…` one to json-output.md); no new entry (docs-only, no CLI output change).

## Line budgets (acceptance: ≤ 350 / ≤ 450 / ≤ 250)

| File                              | Now | Target | Cap |
| --------------------------------- | --- | ------ | --- |
| docs/commands/update.md           | 901 | ~320   | 350 |
| docs/troubleshooting.md           | 972 | ~430   | 450 |
| README.md                         | 508 | ~240   | 250 |
| docs/reference/update-advanced.md | 0   | ~300   | —   |
| docs/getting-started.md           | 141 | ~120   | —   |

## How no content is lost

- Every update.md section either stays, moves (substance kept) to update-advanced.md under the **same heading** (and update.md's "Less common situations" list links each one), or is in the dead list above (deleted, named in the PR with the code fact that makes it dead).
- Every troubleshooting section keeps its heading (so inbound anchors resolve); only history and repeated explanation are cut; the history is already in the CHANGELOG.
- README sections that leave point at their owner page (getting-started's table, init.md's detection, pharn-oss README for the hook postures, docs index).
- The PR carries a ledger: old section → new home / deleted (why).

## Evals / checks (P1) — docs-only, so the floor is the existing gates plus three deterministic scripts

- `wc -l` → the three caps hold.
- `srcnames-grep.sh <worktree>` (scratchpad) → no src file path / basename and no exported function or const name in README, getting-started, troubleshooting, docs/commands, docs/reference. Output pasted in the PR.
- `check-anchors.mjs <worktree>` (scratchpad) → 0 broken relative links / anchors (baseline 2 in CHANGELOG; the update.md one is fixed by this PR, the support-policy one is named).
- `npm run lint:md`, `npm run format:check`, and the full `npm run check` through heavy.sh (vitest `--maxWorkers=2`).
- No test changes (none pin doc text).

## Guarantee audit (P0)

- "The caps hold" → floor: `wc -l` (deterministic count).
- "No src name in the user docs" → floor-ish: the grep script over src basenames + exported identifiers; residual: a non-exported internal name that is also an English word cannot be told from prose — named, not hidden.
- "No broken link" → floor: `check-anchors.mjs` (GitHub slug rule + `id=` anchors).
- "No content lost" → advisory: the ledger + review lens; no tool can prove semantic coverage.
- "Each statement matches the code" → advisory (P4), backed by the discovery reads above; each dead item cites the code that makes it dead.

## Trust audit (P2)

- N/A — no untrusted input ingested; docs only.

## Determinism audit (P5)

- N/A — no code branch added.

## Open questions (HALT)

- RESOLVED 2026-11-17 (lead, GATE 1: approved as written). Was: approve the split (new `docs/reference/update-advanced.md`; detection rules owned by init.md "3. Detect archetypes"; install locations owned by getting-started "What you get"; CHANGELOG link targets repointed; contingency `docs/reference/project-lock.md` only if troubleshooting cannot reach 450 otherwise).
