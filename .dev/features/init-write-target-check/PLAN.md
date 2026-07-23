# PLAN — Replace fresh-check with a concrete write-target conflict check

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Delete the git-history "fresh project"/`/docs/migrate` heuristic and replace it with a deterministic pre-install check that lists the exact init write targets already present in the cwd and confirms (default No), silent when there are none.
- layer(s): pharn **installer CLI** — `src/lib` (shared derivation), `src/steps` (init stage), `src/commands/init`, `tests`, `docs`. (ARCHITECTURE.md §4 is the pharn-oss capability tree; it does not govern the CLI's internal `commands/steps/lib` split — that split is the CLI's own axis discipline, CLAUDE.md/`docs/contributing.md`. This increment adds **no** pharn-oss capability/contract/eval.)
- constitution_refs: [P0, P3, P4, P5, P6, P7]

## Context (live state, read this run)

- `src/steps/fresh-check.ts` — three git-heuristic warnings ("significant git history … see /docs/migrate (coming in v2)", "designed for fresh projects", "looks customized already"). `/docs/migrate` **does not exist** (grep: 0 hits under `docs/`). It is the **sole** consumer of `node:child_process`/git in `src/` (grep-verified) — so its `GIT_HARDENING` (`-c core.fsmonitor= -c core.hooksPath=/dev/null`) helper has **no other caller**. `runGitPrereq` (`steps/prereqs.ts`) uses `existsSync`, **not** git.
- Init flow (`src/commands/init.ts`): `runGitPrereq()` → `await runFreshCheck()` → `runInitArchetype()` = detect archetypes → **`fetchRepo()`** → `parseCapabilityIndex` + `resolveCapabilities` → `runArchetypeSummary` (install/cancel) → on install, **`confirmOverwriteIfExists(cwd)`** (guards `pharn.config.json` only) → `runInstallArchetype`.
- **The write-target set is only knowable AFTER the fetch.** Layout is `detectLayout(repoDir)` — a marker (`pharn/pharn-contracts`) in the **fetched clone**, not the cwd (`lib/layout.ts`). The selected capability dirs come from the fetched index + archetypes (`selection.selected`). So the set of paths init writes cannot be derived at the current pre-fetch `runFreshCheck` slot.
- `lib/diff.ts` (`diffInstalledCapabilities`) already derives the **exact** expected file set by mirroring `installCapabilities` (capability dirs + product `pharn-*.md` commands + `*.cjs` hooks + trusted docs + `pharn-contracts/` + `.dev/floor/`), at the recorded layout, `safeJoin`-guarded. It **excludes** `.claude/settings.json` (preserved at install). This is the reusable "what init writes" derivation.

## Files

- `src/lib/install-manifest.ts` — **NEW.** Pure, no-network. `collectExpectedInstallPaths({repoDir, capabilities, layout})` → `Map<relPath, repoPath>` (the exact relative paths an archetype install writes; the derivation currently inline in `diff.ts`, lifted to a single source of truth). `conflictingWriteTargets({repoDir, projectRoot, capabilities, layout})` → `string[]` of those relPaths that already `existsSync` under `projectRoot`, **plus `pharn.config.json`** (which `confirmOverwriteIfExists` guarded). `safeJoin`-guarded. Layer: lib (shared).
- `src/lib/diff.ts` — refactor `diffInstalledCapabilities` to build its `expected` map via `collectExpectedInstallPaths` (behavior-preserving; single source of truth). Layer: lib.
- `src/steps/overwrite-check.ts` — **NEW.** The init stage `confirmWriteTargets(repoDir, cwd, selection): Promise<boolean>`: calls `conflictingWriteTargets`; **empty → returns true with no prompt** (zero friction); non-empty → `log.warn` listing the concrete paths **capped at 10 + "…and N more"** ("PHARN installs into your existing project. These paths already exist and may be overwritten:") then `confirm` **default No** (`confirmWarning`, recoverable), returning the result. Replaces the `runFreshCheck` slot **and** subsumes `confirmOverwriteIfExists`. Layer: step (one init stage, P3).
- `src/commands/init.ts` — drop the `runFreshCheck` import + top-level call; delete the private `confirmOverwriteIfExists` (+ its now-unused imports); at the same `action === 'install' && (await …)` slot call `confirmWriteTargets(repo.dir, cwd, selection)`. Layer: command (init).
- `src/steps/fresh-check.ts` — **DELETE.** Removes the heuristics, the three messages, the phantom `/docs/migrate`, and (since it is the only git caller) the git-invocation surface entirely.
- `tests/install-manifest.test.ts` — **NEW** (P1). Pure-derivation tests over fake fetched-repos on disk.
- `tests/overwrite-check.test.ts` — **NEW** (P1). Stage tests with `@clack/prompts` mocked (mirrors the deleted `fresh-check.test.ts` structure).
- `tests/fresh-check.test.ts` — **DELETE** (tests the removed heuristics + git hardening).
- `tests/init.test.ts` — drop the `runFreshCheck` mock + `expect(runFreshCheck).toHaveBeenCalledTimes(1)`; mock the new `steps/overwrite-check.js` boundary (→ true installs; add a decline → cancel case). Layer: test.
Docs (P4, sync to code) — one back-ticked bullet each so the writes-scope setter captures them:

- `CLAUDE.md` — pipeline step 1 wording: replace the fresh-check line with the post-fetch write-target conflict check. Layer: docs.
- `README.md` — L111 "fresh-project warnings" phrasing → "overwrite-conflict check"; L44 ("git-initialized") stays as-is. Layer: docs.
- `docs/getting-started.md` — replace the git-based fresh-project warnings (L15–19) with the write-target conflict check. Layer: docs.
- `docs/commands/init.md` — REDRAW the mermaid sequence diagram for the new post-fetch confirm (not merely delete the `fresh_check` participant), and replace the "### 3. Fresh check" section + heuristics table (grill P4). Layer: docs.
- `docs/troubleshooting.md` — replace the "## Fresh-project warnings" section with the overwrite-check note. Layer: docs.
- `docs/contributing.md` — update the `steps/` list (fresh-check → overwrite-check) and the test table (L64/L99). Layer: docs.
- `CHANGELOG.md` — one `### Changed` bullet under `[Unreleased]`. **No version bump** (release flow owns it).

## Contracts satisfied

- **`pharn.config.json` schema (CLI-owned, P3/P7)** — **untouched.** The check reads the filesystem (and optionally the existing config's `skillsVersion` for the note); it adds no field and changes no loader. Legacy configs and v1 pins are unaffected (install-time only).
- **`lib/layout.ts` mirror + `safeJoin` containment (`lib/validate.ts`)** — the derivation reuses `layoutPaths`/`detectLayout` and `safeJoin`, so the check addresses exactly the paths install writes, path-contained.
- No pharn-oss `pharn-contracts` schema is involved (CLI-internal change).

## Evals to write (P1) — vitest (this repo's spec-is-tests convention)

- `collectExpectedInstallPaths` (flat) → includes `pharn-pipeline/grillers/<cap>`, `pharn-review/<lens>`, product `pharn-*.md`, `*.cjs` hooks, `CONSTITUTION.md`+3 docs, `pharn-contracts/**`, `.dev/floor/**`; **excludes** `.claude/settings.json` and `pharn-dev-*.md`.
- `collectExpectedInstallPaths` (pharn layout, clone marked `pharn/pharn-contracts`) → same set under `pharn/…`; docs = `pharn/CONSTITUTION.md`,`pharn/ARCHITECTURE.md` only.
- `diffInstalledCapabilities` regression → output unchanged after the refactor (existing `diff`/`status` tests stay green).
- `conflictingWriteTargets`, fresh cwd (no PHARN, even with a bare `.claude/settings.json`) → `[]`.
- `conflictingWriteTargets`, cwd with a prior install / a colliding `CONSTITUTION.md` / an existing `pharn.config.json` → those paths listed; `pharn.config.json` present ⇒ included.
- `confirmWriteTargets` → `[]` conflicts ⇒ **no** `confirm` call, returns true; conflicts ⇒ warn text contains each listed path (and "…and N more" past 10) and `confirm` fires; default No ⇒ returns false (caller cancels).

## Guarantee audit (P0)

- **"The check lists init's ACTUAL write targets"** → **floor** (enum/regex + path-containment class): the set is a pure function of `layoutPaths(detectLayout(repoDir))` + `selection.selected` + the fixed surfaces, enumerated from the fetched clone and `safeJoin`-contained; "already present" is `existsSync` membership. **No LLM judgment.** (Reuses `diff.ts`'s already-reviewed derivation.)
- **"Branch: prompt iff a conflict exists"** → **floor**: `conflictingWriteTargets(...).length > 0` — a membership test (P5). Terminal fallback is the confirm's **default No** (safe) → clean cancel; never a guess.
- **The confirm itself is ADVISORY** — a user heads-up, **not** a safety guarantee. It sells no containment claim. The real write-time guarantees are unchanged: `installCapabilities`' `safeJoin` + symlink guards, the never-overwrite of `settings.json`, and the post-install `protect-trusted-paths` hook. Labeled advisory; nothing guaranteed rests on it.
- **Security REMOVAL, stated honestly (P7):** deleting `fresh-check.ts` removes the `core.fsmonitor`/hooks RCE hardening **because it removes the only git invocation**. The replacement touches the filesystem with `node:fs` only (no shell, no attacker-controlled `.git/config` read), so the attack surface is **eliminated, not merely hardened**. Optional backstop: a static test asserting the init flow imports no `node:child_process`.

## Trust audit (P2)

- The check **reads** the untrusted fetched clone to enumerate filenames, and **writes nothing**. Enumerated relPaths are used only for (a) `existsSync(safeJoin(cwd, rel))` membership — `safeJoin` rejects any `..`/escape — and (b) display to the user **as data** (a warning list, never executed). Filenames from the clone never drive a write here (the install stage, which does copy, keeps its own `CAPABILITY_NAME_RE`/`COPY_FILENAME_RE` + `safeJoin` + symlink guards). Taint is bounded to a displayed, path-contained list.

## Open questions (HALT — P6) — RESOLVED at GATE 1

> Both resolved by the human at plan approval (2026-07-22): **Q1 → A** (move post-fetch, unify with `confirmOverwriteIfExists`); **Q2 → A** (extract shared `lib/install-manifest.ts`). The Files/audit sections above already reflect this. No open HALT remains.

1. **Slot & scope of the new check.** The increment says "same slot in the init flow" (i.e. before the fetch, replacing `runFreshCheck`) **and** "compute init's ACTUAL write targets … derived deterministically … HALT if it can't be." These **conflict**: the write-target set (layout + selected capabilities) is not knowable before the fetch. **Recommended (A):** move the check **post-fetch** inside `runInitArchetype` (after resolve/summary=install), unify it with `confirmOverwriteIfExists`, and list the exact conflicting paths — fully deterministic and precise; delete `fresh-check`. **Alternative (B):** keep `confirmOverwriteIfExists` (the `pharn.config.json` prompt) as the only pre-install guard and merely delete `fresh-check` + the "fresh/migrate" copy — simpler, but it does **not** deliver the richer concrete-path listing the increment's "## Change" asks for.
2. **(Only if A) Where the "what init writes" derivation lives.** **Recommended (A):** extract it into `lib/install-manifest.ts` as the single source of truth, reused by `diff.ts` **and** the new check (touches `diff.ts`, behavior-preserving). **Alternative (B):** duplicate a self-contained derivation in the new check and leave `diff.ts` untouched (smaller blast radius, some duplication). Note: a **coarse root-level** listing (e.g. just warn on `.claude/`) is rejected either way — it would false-fire for every Claude Code user (who always has `.claude/`), breaking the "zero friction when nothing conflicts" goal; the listing must be **per-file precise** so `settings.json`-only projects stay silent.
