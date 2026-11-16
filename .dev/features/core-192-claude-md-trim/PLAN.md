# PLAN — CORE-192: CLAUDE.md to ≤ 150 lines; incident history out of src comments

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: rewrite CLAUDE.md as a ≤150-line agent guide (narrative moved to a new docs/architecture.md ≤300 lines) and trim src/ comments to ≤50% of code lines — comments and docs only, zero behaviour change.
- layer(s): repo docs (CLAUDE.md, docs/), src/ comments only (no code tokens change)
- constitution_refs: [P0, P3, P4, P6, P7]
- branch: przemek/core-192-c73-claudemd-to-150-lines-incident-history

## Baseline (live, this run)

- `npx cloc` is not installed locally and is not in the npx cache; running it would download the `cloc`
  npm package (open question below). Interim count with a cloc-equivalent counter
  (`.dev/features/core-192-claude-md-trim/loc.tmp.mjs`, NOT committed; a line is code if it holds any
  non-comment, non-space token, cloc's rule): **src: 88 files, comment 8,527 / code 13,462 = 63.3%**
  (ticket baseline 8,155/13,282 = 61% — the tree has grown since).
- Target ≤ 50% → comment lines ≤ ~6,730 at the current code count: remove **≥ ~1,800 comment lines**
  (≈ 21% of all comments). Markers: 37 lines with F-xx ids, 279 with P0–P7, 70 with CORE-nnn,
  46 "used to"/"measured" lines.
- CLAUDE.md: 96 lines, ~15k words (single-line paragraphs up to ~2,200 words).

## Files

- `CLAUDE.md` — rewritten, ≤150 lines, no line >200 chars — repo docs
- `docs/architecture.md` — NEW, ≤300 lines: the narrative that leaves CLAUDE.md (per-command flows,
  the update planner/apply split, records/backups, root footprint, ignore files, models, status) —
  docs
- `docs/README.md` — one link line to docs/architecture.md — docs
- `.dev/features/core-192-claude-md-trim/tokens.tmp.mjs` — temporary token-equivalence + directive-count check, never committed — dev
- `CONTRIBUTING.md` — its two "architecture in CLAUDE.md" pointers also name docs/architecture.md — docs
- `docs/contributing.md` — its "see CLAUDE.md for the architecture in depth" pointer → docs/architecture.md — docs
- comment-only edits (no token outside a comment changes), one literal path per file:
  - `src/commands/add.ts` — comment-only edits — src
  - `src/commands/init.ts` — comment-only edits — src
  - `src/commands/list.ts` — comment-only edits — src
  - `src/commands/remove.ts` — comment-only edits — src
  - `src/commands/status.ts` — comment-only edits — src
  - `src/commands/uninstall.ts` — comment-only edits — src
  - `src/commands/update.ts` — comment-only edits — src
  - `src/index.ts` — comment-only edits — src
  - `src/lib/absent-surfaces.ts` — comment-only edits — src
  - `src/lib/agent-surface.ts` — comment-only edits — src
  - `src/lib/apply-update.ts` — comment-only edits — src
  - `src/lib/archetype.ts` — comment-only edits — src
  - `src/lib/atomic-write.ts` — comment-only edits — src
  - `src/lib/backup.ts` — comment-only edits — src
  - `src/lib/banner.ts` — comment-only edits — src
  - `src/lib/bounded-read.ts` — comment-only edits — src
  - `src/lib/capability-address.ts` — comment-only edits — src
  - `src/lib/capability-dir.ts` — comment-only edits — src
  - `src/lib/capability-groups.ts` — comment-only edits — src
  - `src/lib/capability-index.ts` — comment-only edits — src
  - `src/lib/capability-picker.ts` — comment-only edits — src
  - `src/lib/capability-removal.ts` — comment-only edits — src
  - `src/lib/color.ts` — comment-only edits — src
  - `src/lib/confirm.ts` — comment-only edits — src
  - `src/lib/constants.ts` — comment-only edits — src
  - `src/lib/deadline.ts` — comment-only edits — src
  - `src/lib/dest-drift.ts` — comment-only edits — src
  - `src/lib/detect-archetype.ts` — comment-only edits — src
  - `src/lib/diff.ts` — comment-only edits — src
  - `src/lib/executable-unit.ts` — comment-only edits — src
  - `src/lib/fatal-signal.ts` — comment-only edits — src
  - `src/lib/format.ts` — comment-only edits — src
  - `src/lib/gitignore.ts` — comment-only edits — src
  - `src/lib/hash.ts` — comment-only edits — src
  - `src/lib/hook-wiring.ts` — comment-only edits — src
  - `src/lib/ignore-file.ts` — comment-only edits — src
  - `src/lib/init-plan.ts` — comment-only edits — src
  - `src/lib/init-report.ts` — comment-only edits — src
  - `src/lib/install-capabilities.ts` — comment-only edits — src
  - `src/lib/install-manifest.ts` — comment-only edits — src
  - `src/lib/install-records.ts` — comment-only edits — src
  - `src/lib/install-surfaces.ts` — comment-only edits — src
  - `src/lib/json-report.ts` — comment-only edits — src
  - `src/lib/layout.ts` — comment-only edits — src
  - `src/lib/merge-capabilities.ts` — comment-only edits — src
  - `src/lib/min-cli-gate.ts` — comment-only edits — src
  - `src/lib/missing-installed.ts` — comment-only edits — src
  - `src/lib/model-config-format.ts` — comment-only edits — src
  - `src/lib/model-config.ts` — comment-only edits — src
  - `src/lib/models-update.ts` — comment-only edits — src
  - `src/lib/node-floor.ts` — comment-only edits — src
  - `src/lib/orphans.ts` — comment-only edits — src
  - `src/lib/pharn-config.ts` — comment-only edits — src
  - `src/lib/prettierignore.ts` — comment-only edits — src
  - `src/lib/project-lock.ts` — comment-only edits — src
  - `src/lib/proxy-env-format.ts` — comment-only edits — src
  - `src/lib/proxy-env.ts` — comment-only edits — src
  - `src/lib/release.ts` — comment-only edits — src
  - `src/lib/removal-backup.ts` — comment-only edits — src
  - `src/lib/repo.ts` — comment-only edits — src
  - `src/lib/report-error.ts` — comment-only edits — src
  - `src/lib/resolve-capabilities.ts` — comment-only edits — src
  - `src/lib/root-migration.ts` — comment-only edits — src
  - `src/lib/semver.ts` — comment-only edits — src
  - `src/lib/skills-version.ts` — comment-only edits — src
  - `src/lib/status-report.ts` — comment-only edits — src
  - `src/lib/symlink-guard.ts` — comment-only edits — src
  - `src/lib/tar-extract.ts` — comment-only edits — src
  - `src/lib/terminal-safe.ts` — comment-only edits — src
  - `src/lib/uninstall-plan.ts` — comment-only edits — src
  - `src/lib/unknown-capabilities.ts` — comment-only edits — src
  - `src/lib/update-decision.ts` — comment-only edits — src
  - `src/lib/update-next.ts` — comment-only edits — src
  - `src/lib/update-plan.ts` — comment-only edits — src
  - `src/lib/update-render.ts` — comment-only edits — src
  - `src/lib/update-report.ts` — comment-only edits — src
  - `src/lib/upstream-models.ts` — comment-only edits — src
  - `src/lib/validate.ts` — comment-only edits — src
  - `src/lib/version-status.ts` — comment-only edits — src
  - `src/lib/write-targets.ts` — comment-only edits — src
  - `src/steps/add-picker.ts` — comment-only edits — src
  - `src/steps/archetype-summary.ts` — comment-only edits — src
  - `src/steps/install-archetype.ts` — comment-only edits — src
  - `src/steps/node-prereq.ts` — comment-only edits — src
  - `src/steps/overwrite-check.ts` — comment-only edits — src
  - `src/steps/prereqs.ts` — comment-only edits — src
  - `src/types.ts` — comment-only edits — src
  - `src/version.ts` — comment-only edits — src

NOT touched: root `ARCHITECTURE.md` (hash-pinned, human-only), tests/ (see "Tests" below),
CHANGELOG (no release, no [Unreleased] note — avoids sibling conflicts), package.json.

## CLAUDE.md outline (target ~140 lines)

1. **What this is** (~5 lines): pharn installs PHARN capabilities from pharn-oss into a project by
   archetype; npm `@pharn-dev/pharn`, bin `pharn`; archetype-only (pre-archetype config is refused);
   Claude Code today.
2. **Commands** (~15 lines): the npm scripts block as today + single-file vitest + PHARN_DEBUG.
3. **CI and branch protection — guardrails** (~10 lines): six job names (`Format check`, `Lint`,
   `Markdown lint`, `Typecheck`, `Test`, `Build`) are a ruleset contract: never rename, never matrix a
   required job (add a separately named job instead); ruleset also requires `floor`, `gitleaks`,
   `Analyze (javascript-typescript)` and the two Socket checks (`Socket Security: Project Report`,
   `Socket Security: Pull Request Alerts`, from the Socket app); ubuntu/node 24 only; node floor
   24.2.0 = `engines.node` = `NODE_FLOOR`.
4. **Releasing** (5 lines): bump travels in the feature PR (package.json + lock + CHANGELOG section);
   merge to main = release via publish.yml (4 jobs); **no npm tokens anywhere — OIDC Trusted
   Publishing only**; first-publish exception; link docs/RELEASING.md.
5. **Conventions** (~10 lines): ESM, NodeNext, relative imports with `.js`; strict +
   noUncheckedIndexedAccess; sync `node:fs` throughout (no async fs in commands); the colour rule
   (only `lib/color.ts`, never `picocolors` directly); per-command flag tables (`ALLOWED_FLAGS`,
   `REQUIRED_WITH`) — unknown flags refuse; prompting commands hard-fail off a TTY via
   `interactiveAllowed`; P3 no command→command / step→step imports.
6. **Invariants** (~14 bullets): safeJoin/safeChildJoin lexical containment; destination symlink
   walks (`findSymlinkComponent`) + hard-link-safe writes (atomic replace / filtered cpSync); the
   clone holds only regular files and dirs (tar-extract typeflags) and is never executed (pinned
   copies of pharn-oss rules, never a call); records are the proof for overwrite/delete (hash
   equality, `contentHash` only; stamp never gates); backup before overwrite/delete (one
   `createBackup`, announced via `printBackupNotice`); release resolution fails closed (never floats
   to main); network bounds (redirect:error, timeouts, body caps); one unsafe-char set
   (`lib/terminal-safe.ts`), escape where printed; untrusted names via allowlists in
   `lib/validate.ts`; project lock + `assertConfigUnchanged` first inside the lock, no prompt held
   under the lock; config schema additive (P7), every key CLI-owned except `models` and `seam`
   (pharn-oss's, carried verbatim); `--json` reports keep `schemaVersion: 1` bytes (new keys
   additive, absent when empty; stdout one object, diagnostics on stderr); bounded local reads
   (`readBoundedFile`); `update` deletes only dropped capability dirs, never user data.
7. **Module map** (~20 lines, one line per area): dispatch (`index.ts`), commands/, steps/,
   fetch boundary (release, repo, tar-extract, skills-version, capability-index), install
   (install-capabilities, install-manifest, layout, install-surfaces), update engine (update-plan,
   update-decision, apply-update, update-next, update-render, update-report), records/backups
   (install-records, hash, backup, removal-backup, atomic-write), config (pharn-config,
   model-config, models-update, upstream-models), detection (detect-archetype, archetype), safety
   primitives (validate, symlink-guard, terminal-safe, bounded-read, project-lock), reports
   (status-report, init-report, json-report), ignore files (gitignore, prettierignore, ignore-file).
   Pointer: docs/architecture.md for the flows.
8. **Testing** (~10 lines): vitest node env; helpers (`stubProcessExit`, `useTmpDir`, `CANCEL`);
   fake clones must respect the clone invariant (no links); `dist-smoke` runs the shipped bundle;
   `commands-integration` mocks no src module; vendored pharn-oss files are sha256-pinned; update
   the test before the code.
9. **Docs discipline** (~3 lines): docs/ user-facing, cite code, Coming soon / roadmap; never edit
   root ARCHITECTURE.md / CONSTITUTION.md / THREAT-MODEL.md / LIMITS.md (human-owned).

## docs/architecture.md outline (≤ 300 lines)

Sections condensed from the current CLAUDE.md narrative (no new claims; every statement already in
CLAUDE.md today, checked against code where touched): argv dispatch & help; `init` flow (prereqs →
detect → resolve source → fetch → index → selection/carry-over → summary → pre-flight → overwrite
prompt → install) and `init --dry-run`; capability copy core & the fixed surfaces; release channels;
`add`; `remove`; `uninstall`; `update` (plan vs apply, 6-row decision table, executable unit,
removals, orphans, early-return re-open signals); root footprint, root migration; .gitignore /
.prettierignore; the `models` block; `status`. Incident ids (F-xx, CORE-nnn) and "used to" stories
are dropped (they live in git history and CHANGELOG).

## src comment pass — rules

- KEEP: module headers (shortened where they narrate history), "why" comments, named residuals
  (P0 honesty statements about what a guard does NOT cover), comments a guard depends on.
- REMOVE: "used to…" / "before this…" stories; F-xx ids; CORE-nnn ids used as provenance; P-refs
  that restate the code; "measured on Node X" notes — EXCEPT where a guard depends on the
  measurement (hard-link/`cpSync` filter, cpSync-through-symlink in add, styleText array): keep one
  line + the pinning test's path.
- Shorten JSDoc that restates the signature; collapse multi-paragraph rationale to its conclusion.
- Work order: largest comment owners first (project-lock, update, pharn-config, add, init-plan,
  install-capabilities, archetype, init, detect-archetype, remove, install-archetype, index, …).
- Execution: split by file group across up to 4 parallel worker agents (src/** is in the
  writes-scope default set), each held to the same rules; I review every diff.

## Tests

- No test reads CLAUDE.md except `tests/docs-models-claims.test.ts`, whose CLAUDE.md checks are
  `not.toContain` only — the rewrite keeps passing them, so NO test deletion is needed for the
  CLAUDE.md rewrite (CORE-191 deletes that file anyway). AC4 ("tests that pin CLAUDE.md text are
  gone") is therefore met by CORE-191 (C7.2); this PR deletes nothing in tests/ unless the suite
  proves otherwise.
- Src-text-reading tests found (init isTTY/child_process scans, remove runRemove params,
  root-migration no-rename, executable-unit no-fs, color, terminal-safe, hash) all assert on CODE
  tokens; comment removal cannot add a match. If one breaks, the comment wording is restored rather
  than the test edited.

## Evals to write (P1)

- None: no capability or rule_id is added; behaviour is unchanged. The existing suite is the spec.

## Guarantee audit (P0)

- "No behaviour change" → floor: a token-equivalence check — for every `src/**/*.ts`,
  `ts.transpileModule(…, {removeComments: true})` output at the base commit equals the output at HEAD
  (temporary script, run before commit; result recorded in the PR) — plus `npm run check` and
  `npm run build` green.
- "src comment ratio ≤ 50%" → floor: line count (`npx cloc src` if approved, else the
  cloc-equivalent counter), before/after recorded in the PR.
- "CLAUDE.md ≤ 150 lines, no line > 200 chars" → floor: `wc -l` + `awk 'length > 200'`.
- "docs/architecture.md ≤ 300 lines; markdownlint-clean" → floor: `wc -l` + `npm run lint:md`.
- "The guardrails are kept" → advisory (human review of the CLAUDE.md text against the ticket's
  four named guardrails + the Socket checks).
- "docs/architecture.md says nothing the code does not do" → advisory (condensed from the existing
  CLAUDE.md, which is code-reviewed text; no new claims added).

## Trust audit (P2)

- No untrusted input is ingested; no code path changes.

## Determinism audit (P5)

- No branch is added. The only decision procedure is the token-equivalence check (exact string
  equality per file).

## Risks

- Merge conflicts with CORE-190/191 in src/ comments are unlikely (they own tests/ and
  eslint.config.mjs); a CORE-191 eslint rule over src comments could conflict in wording — rebase
  and re-run if so.
- Dropping a "why" that guarded a non-obvious choice: mitigated by the KEEP rule and my review of
  every diff; named residuals are kept.

## Resolved questions (GATE 1, coordinator, 2026-11-16)

- `npx --yes cloc src` approved. Before, at origin/main a4bbcb93 (= this branch's base, src identical):
  **TypeScript 88 files, blank 1,167, comment 8,530, code 13,459 → 63.4%**. Target: comment ≤ 6,729.
- No test deletions in this PR (docs-models-claims stays green; CORE-191 owns it).
- At most 3 worker sub-agents at a time; every heavy command through heavy.sh. Keep the measured notes that
  justify a guard (the hard-link cpSync filter, symlink-leaf behaviour) as one line plus the pinning test.

## Grill reductions adopted (GRILL.md)

- The no-behaviour-change floor compares the TypeScript SCANNER token stream (comments and whitespace
  skipped, every other token kind + text compared, types included), per file, base vs HEAD. This
  replaces the emit comparison, which erases types.
- Directive comments are counted base vs HEAD and must match exactly: `eslint-disable`, `@ts-expect-error`,
  `@ts-ignore`, `prettier-ignore`, `@__PURE__`, `c8 ignore`, `istanbul ignore`, `v8 ignore`.
- Effort goes to full-line comment blocks, because cloc counts a code line with a trailing comment as code.
- docs/contributing.md: only the pointer line changes; its stale layout tree is out of scope.
- Temporary scripts (`*.tmp.*` in this folder) are never committed.
