# PLAN — npm-name-scoped (rename npm package `pharn` → `@pharn-dev/pharn`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Make the org-scoped **`@pharn-dev/pharn`** the canonical npm package name (the unscoped `pharn` is unpublishable — npm E403 "too similar to yarn/charm/sharp") by setting `package.json.name` and aligning every npm-package-name reference across the repo/docs surface — no version bump, no CLI behavior change, **binary stays `pharn`**.
- layer(s): packaging (`package.json`, `package-lock.json`) + docs/repo-surface (`*.md`, `docs/**`, `.github/ISSUE_TEMPLATE/**`) + two copy-only `src/*.ts` help/error strings (OQ1). **No `src/` code-behavior layer** (ARCHITECTURE.md §4).
- constitution_refs: [P0, P4, P6, P7]

## Live-state discovery (this run — P6, not from memory)

- `package.json`: `"name": "pharn"` ✓, `"version": "0.3.0"` ✓, `bin { "pharn": "dist/index.js" }` ✓, `publishConfig { "access": "public", "provenance": false }` ✓ — preconditions match the task exactly.
- **npm registry (live):** `npm view pharn` → **E404** (never landed — consistent with the E403 publish failure). `npm view @pharn-dev/pharn` → **E404** (the `@pharn-dev/pharn@0.2.0` publish was unpublished 2026-07-22). **Neither name is currently on npm** — the task premise is confirmed by live state.
- `.github/workflows/publish.yml`: **name-agnostic** — the tag guard reads `package.json.version` (line 39), and `npm publish --provenance --access public` (line 46) publishes `package.json.name` with **no hard-coded name**. `--access public` is present (scoped packages default to `restricted`, so this is now load-bearing). → **verify-only, NO edit** (per task).
- `package-lock.json`: root + `packages[""]` pin `"name": "pharn"` (lines 2, 8) and a **stale** `"version": "0.2.0"` (line 3). A future `npm install` would rewrite these — see OQ2.
- **Tests:** no test asserts `package.json.name`. `tests/index.test.ts:134` asserts USAGE `toContain('Usage:')` (not the package name), so the USAGE string edit stays green. → **no test change required**; P1 satisfied vacuously (no new behavior).
- `scripts/install-local.mjs`: installs the local build into a **hardcoded** `node_modules/pharn` dir (line 31) and a `.bin/pharn` symlink (line 33); its `npx pharn init` message (line 58) resolves the **local binary**, not the registry package. Scoping does not affect it and changing it would break the local-bin call → **LEAVE (Category B/C)**.
- Trusted docs (`CONSTITUTION/ARCHITECTURE/THREAT-MODEL/LIMITS.md`) contain **no** npm-package-name reference; write-protected at the floor (`protect-trusted-paths.cjs`) → **not touched**.
- This increment is the **inverse of the prior `canonical-npm-name` increment** (2026-07-22, which renamed `@pharn-dev/pharn → pharn`); it is a directed reversal on a new external fact (E403), not a re-litigation.

## Why scoping fixes it (context, not a change)

npm's name-similarity/typosquat rejection (E403) applies to **unscoped** names only. A scoped `@org/name` is exempt from the similarity check, so `@pharn-dev/pharn` sidesteps the `yarn`/`charm`/`sharp` collision entirely. The **installed binary is unchanged** (`bin: { "pharn": … }`) — package `@pharn-dev/pharn`, binary `pharn`.

## Classification of every npm-name hit (task discovery step 3)

**Category A — npm PACKAGE name / npx-resolved invocation → change to `@pharn-dev/pharn` (or `npx @pharn-dev/pharn …`):**

| File:line | Context |
| --- | --- |
| `package.json:2` | `"name"` — the core change |
| `README.md:9` | npm version badge (`img.shields.io/npm/v/pharn`) + link (`npmjs.com/package/pharn`) |
| `README.md:16`, `:41` | install commands (`npx pharn init` / `npx pharn@latest init`) |
| `README.md:54` | prose "The npm package is `pharn`" (the package↔binary sentence) |
| `SECURITY.md:13`, `:20`, `:78` | linked package name + `npx`/`npm i -g` invocation examples |
| `CLAUDE.md:7` | "Published on npm as `pharn`" (project summary) |
| `CLAUDE.md:32` | Releasing-section canonical-name narrative — **rewrite** |
| `CHANGELOG.md:51`, `:55` | 0.3.0 rename bullet + its install cmd — **see OQ3** |
| `CHANGELOG.md:56` | 0.3.0 naming clarifier — **rewrite** (see OQ3) |
| `docs/getting-started.md:23`, `:26`, `:36` | package-name prose + install cmds |
| `docs/contributing.md:30` | install cmd |
| `docs/troubleshooting.md:27`, `:67` | re-run / debug install cmds |
| `docs/RELEASING.md:3`, `:12`, `:13`, `:28`, `:54`, `:57` | package-name prose + npmjs links + Trusted-Publisher target + smoke-test cmd |
| `docs/RELEASING.md:15–17` | the scoped-name blockquote — **rewrite** (currently backwards) |
| `.github/ISSUE_TEMPLATE/bug_report.md:17`, `:39` | `npx pharn --version` / install-method hint |
| `src/index.ts:13` (USAGE) | help-text `npx pharn init` — **OQ1** (bundles into `dist`) |
| `src/steps/prereqs.ts:11` | git-missing error `npx pharn init` — **OQ1** (bundles into `dist`) |
| `package-lock.json:2`, `:8` | `"name"` — regenerate for `npm ci` consistency — **OQ2** |

**Category B — binary / org paths / brand → MUST NOT change (leave):** the installed `pharn` **bin** (`package.json` bin, README/`docs/commands/**` `pharn init|add|remove|update|list|status` usages, the second `pharn` in the "single `pharn` binary" sentences); every `github.com/pharn-dev/pharn-cli` coordinate (`package.json` repository/bugs/homepage, README/SECURITY/CHANGELOG badges & links); every `pharn-dev/pharn-oss` degit-source reference; the PHARN brand; `/pharn-*` slash-command names; **`scripts/install-local.mjs`** (dev harness — local bin, hardcoded internal dir); **`.github/workflows/publish.yml`** (name-agnostic — verified).

**Category C — noise (leave):** `pharn`/`@pharn-dev/pharn` fragments inside `.dev/features/**` (historical PLAN/GRILL prose, incl. the prior `canonical-npm-name` feature) and `.claude/**` (command prose, `settings.local.json` permission strings).

## Files (proposed edits — Category A only)

- `package.json` — line 2 `"name": "pharn"` → `"@pharn-dev/pharn"`. **Nothing else** (repository/bugs/homepage/bin/files/engines/publishConfig unchanged; `access: public` already correct for scoped).
- `README.md` — badge+link (9), install cmds (16, 41), package↔binary prose (54). Shields scoped badge: `img.shields.io/npm/v/@pharn-dev/pharn`; link `npmjs.com/package/@pharn-dev/pharn`.
- `SECURITY.md` — linked package name + `npx`/`npm i -g` invocations (13, 20, 78) → scoped; leading subject "`pharn`" (the CLI) left as brand.
- `CLAUDE.md` — line 7 "Published on npm as `@pharn-dev/pharn`" (bin stays); line 32 **rewrite** the canonical-name narrative (see draft below).
- `CHANGELOG.md` — **(OQ3)** in `## [0.3.0]`: 51 `pharn-cli → @pharn-dev/pharn`; 55 `npx @pharn-dev/pharn@latest init`; 56 **rewrite** (see draft below).
- `docs/getting-started.md` — line 23 package name `@pharn-dev/pharn` (the "single command **`pharn`**" stays); install cmds (26, 36).
- `docs/contributing.md` — line 30 install cmd.
- `docs/troubleshooting.md` — lines 27, 67 install/debug cmds.
- `docs/RELEASING.md` — 3, 12, 13, 28, 54, 57 (package name / npmjs links / Trusted-Publisher target / smoke-test) → scoped; **rewrite** the 15–17 blockquote (see draft below). "single `pharn` bin" (13) stays.
- `.github/ISSUE_TEMPLATE/bug_report.md` — lines 17, 39 `npx pharn …` → `npx @pharn-dev/pharn …`.
- `src/index.ts` — **(OQ1)** USAGE (13) `npx pharn init` → `npx @pharn-dev/pharn init`. Copy-only (no control-flow); rebuilds `dist/index.js`.
- `src/steps/prereqs.ts` — **(OQ1)** git-missing error (11) `npx pharn init` → `npx @pharn-dev/pharn init`. Copy-only; rebuilds `dist/index.js`.
- `package-lock.json` — **(OQ2)** regenerate name via `npm install --package-lock-only` (also syncs the stale `version` 0.2.0→0.3.0).

### Narrative-rewrite drafts (key points the build must hit; final prose is build's)

- **CLAUDE.md:32 / docs/RELEASING.md:15–17 / CHANGELOG.md:56** must all state: the unscoped name **`pharn` is not publishable** — npm rejects it with **E403** as too similar to existing packages (`yarn`, `charm`, `sharp`) — so the canonical name is the **org-scoped `@pharn-dev/pharn`**; the **installed binary remains `pharn`**; the earlier `@pharn-dev/pharn@0.2.0` was published then unpublished (2026-07-22), so **0.2.0 is burned** on that name and releases resume at **0.3.0**.

## Contracts satisfied

- None. Touches no `pharn-contracts/*` schema and no inter-layer boundary — a packaging-name + docs alignment (P3: `package.json`/lock = packaging axis; docs = doc axis; the two `src` strings are copy on the same name axis; no code-behavior axis).

## Evals to write (P1)

- **None required.** No Capability, `rule_id`, griller, or lens is added, and no runtime behavior changes (the `src` edits are copy-only help/error strings) → P1 is satisfied vacuously. `tests/index.test.ts` asserts `toContain('Usage:')`, not the package name, so it stays green. No `.cjs`/`.mjs` floor file is modified → the floor `node --test` coverage gate does not trigger. Regression is covered by re-running `npm run check`.

## Guarantee audit (P0)

- "Published tarball is **`pharn-dev-pharn-0.3.0.tgz`** (scope `@pharn-dev/` → `pharn-dev-`), `files:["dist"]` file list unchanged" → **floor**: `npm pack --dry-run` output (deterministic tarball name + file list), captured in the PR body.
- "The repo still builds and every gate passes" → **floor**: `npm run build` + `npm run check` (format:check + lint + typecheck + test — deterministic exit codes).
- "`package.json.name` and `package-lock.json.name` agree (npm ci stays consistent)" → **floor**: after regen, `node -p "require('./package.json').name===require('./package-lock.json').name"` = `true`; `git diff package-lock.json` shows only name/version.
- "Docs/help now name the canonical package `@pharn-dev/pharn`" → **advisory** (doc/code coherence, P4): backstopped only by `markdownlint`/`prettier` shape gates; textual correctness is human-reviewed at the gate.
- **No new guarantee over fetched/untrusted content.** `lib/validate.ts`, `safeJoin`, the degit fetch, the network guards are **untouched** → P2 surface unchanged.

## Trust audit (P2)

- N/A — the increment ingests **no** untrusted artifact (no manifest, no `module.json`, no degit content). It edits static in-repo files + one `package.json` field + regenerates the lock. No taint is introduced or propagated.

## Determinism audit (P5)

- N/A — no new branch or classification. The only decision points are the open questions below, whose terminal fallback is **ask the human at this gate** (P6-compliant).

## FYI (noted — not blocking; not code changes)

- **FYI-A — republish timing (release-time, not this PR).** `@pharn-dev/pharn` is currently E404 (0.2.0 unpublished 2026-07-22). npm burns the exact unpublished version (0.2.0) permanently and blocks republishing an unpublished name for ~24h. Publishing `@pharn-dev/pharn@0.3.0` should succeed once outside that window; attempted too soon it may fail with a policy error **distinct from E403**. The plan's edits are independent of this.
- **FYI-B — `publishConfig.access: public` is now load-bearing.** Scoped packages publish `restricted` by default; the existing `access: public` + `publish.yml`'s `--access public` keep it public. No change — but now required, not redundant.
- **FYI-C — first-publish exception (`CLAUDE.md:38`, `docs/RELEASING.md:59–72`) is generic** (no package name to swap) and stays as-is. Whether a Trusted Publisher can be configured on a previously-published-then-unpublished scoped name is a maintainer/npmjs.com concern, not a repo edit.

## Open questions (raised at planning — all resolved at GATE 1; see "Resolved decisions" below)

- **OQ1 — the two `src/*.ts` help/error strings.** The task's file list enumerates package.json/README/docs/CLAUDE.md/CHANGELOG/.github but **omits `src/`**. `src/index.ts:13` (USAGE) and `src/steps/prereqs.ts:11` (git-missing error) embed `npx pharn init` and bundle into `dist/index.js`. Because unscoped `pharn` is now unpublishable, **leaving them makes `--help` and the error advertise a command that resolves to a non-existent package** (P4). **Recommend: edit both** (copy-only, no behavior change; the prior `canonical-npm-name` increment resolved the identical OQ by editing them). Alternative: limit to the enumerated surfaces and ship the string fix next version.
- **OQ2 — `package-lock.json`.** It pins `"name": "pharn"` (lines 2, 8) and a stale `"version": "0.2.0"`. **Recommend: regenerate** via `npm install --package-lock-only` (name → `@pharn-dev/pharn`; also corrects the stale version to 0.3.0). Alternatives: hand-edit only the two `"name"` lines (tightest diff, leaves version stale); or leave it (CI's `npm ci` has tolerated the stale version, but a future `npm install` rewrites it → unrelated noise).
- **OQ3 — CHANGELOG 0.3.0 edited in place.** The `## [0.3.0] — 2026-07-23` entry is dated, but its naming bullets never reached npm (publish failed) and are now factually wrong. A successful `@pharn-dev/pharn@0.3.0` publish makes 0.3.0 the **first** npm release, so the corrected bullets are forward-consistent. **Recommend: edit 51/55/56 in place** + fold in the required "unscoped `pharn` blocked by npm similarity policy (yarn/charm/sharp)" line (task-directed). Alternative: add a new `[Unreleased]` note and leave 0.3.0's wrong text (internally inconsistent — not recommended).

## Resolved decisions (approved by human at GATE 1, 2026-07-23)

- **OQ1 → Edit both `src/*.ts` strings.** `src/index.ts:13` USAGE + `src/steps/prereqs.ts:11` git-missing error → `npx @pharn-dev/pharn init`; copy-only, rebuilds `dist/index.js`.
- **OQ2 → Regenerate `package-lock.json`** via `npm install --package-lock-only` (name → `@pharn-dev/pharn`; also corrects the stale version 0.2.0 → 0.3.0). Verify `git diff` shows only name/version.
- **OQ3 → Edit the CHANGELOG `[0.3.0]` naming bullets in place** (51/55/56) + fold in the required "unscoped `pharn` is blocked by npm's name-similarity policy (yarn/charm/sharp); canonical is `@pharn-dev/pharn`" line.

Plan **approved as written**. Proceeding through the ship chain: grill → build → regress → verify → review, halting at the post-review human gate (GATE 2).
