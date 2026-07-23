# PLAN — canonical-npm-name (rename npm package `@pharn-dev/pharn` → `pharn`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Publish the package under the canonical **unscoped** name `pharn` by setting `package.json.name` and aligning every npm-name reference in the docs/repo surface — no version bump, no CLI behavior change.
- layer(s): packaging (`package.json`) + docs/repo-surface (`*.md`, `docs/**`, `.github/ISSUE_TEMPLATE/**`) — **no `src/` code-behavior layer** (ARCHITECTURE.md §4). See OQ1 for the one src edge case.
- constitution_refs: [P0, P4, P6, P7]

## Live-state discovery (this run — P6, not from memory)

- `package.json`: `"name": "@pharn-dev/pharn"` ✓, `"version": "0.2.0"` ✓ (preconditions match).
- `npm view pharn` → **E404 Not Found** ✓ — unscoped name is free on the registry.
- git tag `v0.2.0`: **does not exist** (the repo has **no tags at all**). Nothing to create/move/delete.
- `dist/` is git-ignored (`.gitignore:2`) and untracked; it is rebuilt at pack time by `prepack` → the published tarball = `package.json` + freshly-built `dist/index.js`.
- `.github/workflows/publish.yml` publishes `package.json.name` (no hard-coded name) and runs `npm publish --provenance --access public`, which **deliberately overrides** `publishConfig.provenance:false` (its comment says so). → the workflow needs **no** edit, and `provenance:false` is intentional (see FYI-A).
- `CLAUDE.md:7` already reads "Published on npm as `pharn`" — **already canonical, no change**.
- Trusted docs (`CONSTITUTION/ARCHITECTURE/THREAT-MODEL/LIMITS.md`) contain **no** `@pharn-dev/pharn`; they are write-protected at the floor (`protect-trusted-paths.cjs`) — **not touched**.

## Classification of every `pharn-dev` hit (task discovery step 3)

**Category A — npm package name `@pharn-dev/pharn` → becomes `pharn` (change):**

| File:line | Context |
| --- | --- |
| `package.json:2` | `"name"` — the core change |
| `README.md:9` | npm version badge (`shields.io/npm/v/…`) + `npmjs.com/package/…` link |
| `README.md:16`, `:41` | install commands (`npx … init`) |
| `README.md:54` | prose "The npm package is `@pharn-dev/pharn`" |
| `SECURITY.md:13`, `:20`, `:78` | package link + `npx`/`npm i -g` invocation examples |
| `.github/ISSUE_TEMPLATE/bug_report.md:17`, `:39` | `npx …` version / install-method hints |
| `docs/contributing.md:30`, `:33` | install cmd + "published package" prose |
| `docs/getting-started.md:25`, `:28`, `:38` | package name prose + install cmds |
| `docs/troubleshooting.md:27`, `:68` | re-run / debug install cmds |
| `CHANGELOG.md:35`, `:39` | historical rename bullet + its install cmd — **see OQ2** (treatment differs) |
| `src/index.ts:13` (USAGE) | help-text install hint — **see OQ1** (bundled into `dist`) |
| `src/steps/prereqs.ts:11` | git-missing error hint — **see OQ1** (bundled into `dist`) |

**Category B — GitHub org paths → MUST NOT change (leave):** every `github.com/pharn-dev/pharn-cli`
(repository/bugs/homepage in `package.json`, README/SECURITY/CHANGELOG badges & links,
`.github/ISSUE_TEMPLATE/config.yml`) and every `pharn-dev/pharn-oss` reference (the degit source repo,
in `CLAUDE.md`, `CONSTITUTION.md`, `LIMITS.md`, `THREAT-MODEL.md`, `README.md`, `docs/**`,
`src/lib/constants.ts`, `src/commands/*.ts`, `tests/**`). These are repo coordinates, not the npm name.

**Category C — noise (leave):** `/pharn-dev-*` slash-command references throughout `.claude/commands/**`
and `.dev/features/**`; the `pharn-dev/pharn` fragments inside `.claude/settings.local.json`
permission strings and historical `.dev/features/*/PLAN.md`/`GRILL.md` prose.

## Files (proposed edits — Category A only)

- `package.json` — line 2 `"name": "@pharn-dev/pharn"` → `"pharn"`. **Nothing else touched** (repository, bugs, homepage, bin, files, engines, publishConfig all unchanged).
- `README.md` — badge (9), install cmds (16, 41), prose (54): `@pharn-dev/pharn` → `pharn`. **Install command is `npx pharn@latest init` — no `--wizard` (OQ3 resolved).**
- `SECURITY.md` — lines 13, 20, 78: `@pharn-dev/pharn` → `pharn` (each occurrence).
- `.github/ISSUE_TEMPLATE/bug_report.md` — lines 17, 39: `npx @pharn-dev/pharn` → `npx pharn`.
- `docs/contributing.md` — lines 30, 33: `@pharn-dev/pharn` → `pharn`.
- `docs/getting-started.md` — lines 25, 28, 38: `@pharn-dev/pharn` → `pharn`.
- `docs/troubleshooting.md` — lines 27, 68: `@pharn-dev/pharn` → `pharn`.
- `CHANGELOG.md` — **(OQ2 resolved)** reconcile the rename bullet (35: `→ pharn`; 39: `npx pharn@latest init`) **and** add the clarifier "Initially published to npm as `@pharn-dev/pharn` (now deprecated); the canonical name is `pharn`."
- `src/index.ts` — **(OQ1 resolved: edit)** USAGE (line 13) `npx @pharn-dev/pharn init` → `npx @pharn-dev/pharn init`. Copy-only (no control-flow); rebuilds `dist/index.js`.
- `src/steps/prereqs.ts` — **(OQ1 resolved: edit)** git-missing error (line 11) `npx @pharn-dev/pharn init` → `npx @pharn-dev/pharn init`. Copy-only (no control-flow); rebuilds `dist/index.js`.

## Contracts satisfied

- None. This increment touches no `pharn-contracts/*` schema and no inter-layer boundary — it is a packaging-name + docs alignment. (P3: `package.json` is the packaging axis; docs are the doc axis; no code-behavior axis changes.)

## Evals to write (P1)

- **None required.** No Capability, `rule_id`, griller, or lens is added, and (default OQ1) no runtime behavior changes → P1 is satisfied vacuously. The existing `tests/index.test.ts` `--help` assertion checks `toContain('Usage:')`, **not** the package-name string, so it stays green whether or not the USAGE string changes. No `.cjs`/`.mjs` floor file is modified → the `node --test` coverage gate does not trigger. Regression is covered by re-running `npm run check`.

## Guarantee audit (P0)

- "Published tarball is `pharn-0.2.0.tgz`, **same file list** as the scoped publish; content diffs = `package.json.name` **+ the bundled help/error strings in `dist/index.js`** (OQ1 resolved: edit src)" → **floor**: `npm pack --dry-run` output (deterministic file list + tarball name), captured in the PR body.
- "The repo still builds and all gates pass" → **floor**: `npm run check` (format:check + lint + typecheck + test — deterministic exit codes).
- "Docs/help now name the canonical package `pharn`" → **advisory** (doc/code coherence, P4): backstopped only by `markdownlint`/`prettier` shape gates; textual correctness is human-reviewed at the gate.
- **No new guarantee is made over fetched/untrusted content.** `lib/validate.ts`, `safeJoin`, the degit fetch, and the network guards are **untouched** → P2 surface unchanged.

## Trust audit (P2)

- N/A — the increment ingests **no** untrusted artifact (no manifest, no `module.json`, no degit content). It edits static in-repo files + one `package.json` field. No taint is introduced or propagated. THREAT-MODEL.md / LIMITS.md are therefore not engaged by this increment.

## Determinism audit (P5)

- N/A — no new branch or classification is added. The only decision points are the open questions below, whose terminal fallback is **ask the human at this gate** (P6-compliant).

## FYI (noted discrepancies — not blocking)

- **FYI-A — `publishConfig.provenance`:** the task text says keep `publishConfig { … "provenance": true }` "untouched", but live value is `false` — and `publish.yml` intentionally passes `--provenance` to override it for CI while keeping local `npm publish` working. Action: **leave `publishConfig` untouched** (provenance stays `false`), which satisfies the dominant "untouched" instruction. Flagged only because the task's parenthetical value was inaccurate.
- **FYI-B — CHANGELOG layout:** the `@pharn-dev/pharn` rename is under `## [Unreleased] › ### Changed`; the `## [0.2.0] — 2026-06-11` heading is a *different, older* (module-wizard) release. "Under 0.2.0" is therefore read as the Unreleased rename bullet (lines 35–39), not the dated 0.2.0 section.

## Resolved decisions (approved by human at GATE 1, 2026-07-22)

- **OQ1 → Update src strings too.** Edit `src/index.ts` USAGE + `src/steps/prereqs.ts` error; `dist/index.js` rebuilds. Pack check relaxed to "same file list; content diffs = name + help/error strings."
- **OQ2 → Reconcile bullet + clarifier** in `CHANGELOG.md`.
- **OQ3 → `npx pharn@latest init`** (no `--wizard`; the flag was removed).

The original open-question reasoning is retained below for the record.

### Open questions (as raised — now resolved above)

- **OQ1 — the two `src/*.ts` help/error strings (pack-identity vs. full coherence).** `src/index.ts`
  USAGE and `src/steps/prereqs.ts` embed `npx @pharn-dev/pharn init`; both are bundled into
  `dist/index.js`. The task simultaneously says (a) "every `@pharn-dev/pharn` must become `pharn`" and
  (b) the packed tarball must be "identical to the scoped publish except the name field." These
  **conflict**: editing the src strings changes `dist/index.js` too, so the tarball would differ by more
  than `package.json.name`. **Default/recommended:** leave the two src strings this increment (dist stays
  byte-identical; `@pharn-dev/pharn` still resolves, so `--help`/error text is non-canonical but not
  broken), ship the string cleanup in the next version bump. Alternative: edit them now and relax the
  pack-identity check to "same file list, content diffs = name + help string."
- **OQ2 — CHANGELOG treatment.** Recommended: reconcile the rename bullet to the canonical outcome
  (35: `→ pharn`; 39: `npx pharn@latest init`) **and** add the clarifier "Initially published to npm as
  `@pharn-dev/pharn` (now deprecated); the canonical name is `pharn`." Alternative: add **only** the
  clarifier line and leave the historical bullet verbatim (keeps a literal record that the scoped name
  was published, at the cost of an internally mixed bullet).
- **OQ3 — README install command / the `--wizard` premise is stale.** The task says the canonical UX is
  `npx pharn@latest init --wizard` and that the README must read exactly that. **But `--wizard` is not a
  real flag:** `src/index.ts` declares no `wizard` boolean, `init` takes no options and runs
  `runInitArchetype()` unconditionally, and CLAUDE.md + `init.ts:29-31` state the wizard flow was
  **removed entirely** (`--wizard` would parse as a no-op, documenting a phantom flag → P4 violation).
  The README currently has **no** `--wizard`. **Recommended:** README install stays `npx pharn@latest init`
  (truthful). Alternative: write `--wizard` exactly as the task says (documents a dead flag — not
  recommended), or treat re-adding a real `--wizard` as a separate increment.
