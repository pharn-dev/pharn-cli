# Changelog

All notable changes to `pharn` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-07-23

### Added

- **`pharn remove <module | category:skill>`** — the inverse of `pharn add`. Removing a
  skill is a precise single-directory delete with no clone or network; removing a module
  clones once, computes the exact files that module contributed (so shared directories like
  `commands/` keep other modules' files), deletes only those, and prunes emptied directories.
  Refuses to remove `pharn-core` or a module with installed dependents, never touches
  `CONSTITUTION.md` / `memory-bank/`, and updates `pharn.config.json` to match. No arg opens
  an interactive picker; `--yes`/`-y` skips the confirmation and `rm` is an alias.
- **`pharn list`** — a read-only inventory of installed vs. available modules and
  `category:skill` skills, with update markers when the manifest is newer. Adds `--json`
  for scripting/CI (single object on stdout; diagnostics on stderr). Never writes or clones.
- **`pharn status`** — a read-only audit of the install: a version section (is `skillsVersion`
  / each module current?) and a drift section that clones `pharn-dev/pharn-oss@main` and
  byte-compares every PHARN-owned file against `.claude/`, reporting locally-modified and
  missing files. Never writes, deletes, or overwrites — the temporary clone is always cleaned
  up. `.claude/CONSTITUTION.md` and `.claude/memory-bank/` are excluded (hand-edited, anchored
  at the root, so `templates/` is still diffed). `--strict` exits 1 on any drift/outdated for
  CI; `--no-drift` skips the clone and checks the version only.
- Repo-health tooling: `CHANGELOG.md`, GitHub issue/PR templates, `CODEOWNERS`,
  Dependabot config, markdownlint for docs, an aggregate `npm run check` script, and
  an enforced test-coverage gate in CI.

### Changed

- **`pharn init` first-run hint now enters at `/pharn-spec`** — the post-install "Next steps" hint
  (`FIRST_FEATURE_COMMAND`) and the getting-started / `README` / `init` docs that state the entry point
  now lead with **`/pharn-spec`** (intent capture) instead of `/pharn-plan`, so the first-run norm no
  longer teaches users to skip intent capture; `/pharn-spec` feeds `/pharn-plan`. It reaches every
  install via the existing product-command (`pharn-*`) prefix copy — a constant, not a conditional —
  and the docs reword the earlier "optional" framing to "recommended first".
- **`pharn init` overwrite check** — replaced the git-history "fresh project" heuristic (and its
  broken `/docs/migrate` reference) with a concrete pre-install **write-target conflict check**: just
  before installing, `init` lists which of its _actual_ write targets already exist in your project
  (derived from the fetched clone's layout + the resolved selection via `lib/install-manifest.ts`) and
  confirms before overwriting — default **no**, with **no prompt at all** when nothing conflicts. It
  subsumes the old `pharn.config.json`-only overwrite prompt; `.claude/settings.json` (always preserved)
  is excluded. Deleting the old `steps/fresh-check.ts` — the CLI's only `git` caller — also removes the
  `core.fsmonitor` RCE surface entirely, with a guard test keeping it gone.
- **Renamed the npm package `pharn-cli` → `pharn`** and made it publish-ready — added `repository`,
  `bugs`, `homepage`, `keywords`, and `publishConfig` (public access + provenance); dropped the
  `pharn-cli` bin alias for a single `pharn` bin; and added a `prepack` build so `npm publish` always
  ships a freshly compiled `dist/`. No CLI behavior change and `version` is unchanged; the package now
  installs via `npx pharn@latest init`.
- Initially published to npm as `@pharn-dev/pharn` (unpublished on 2026-07-22); the canonical name is `pharn`.
- Docs: surfaced the new optional `/pharn-spec` stage (intent capture before `/pharn-plan`) in
  getting-started and the `pharn-pipeline` module description, matching `pharn-oss`. No CLI code
  change — `/pharn-spec` ships transparently via the existing whole-module install from `main`.
- Docs: completed the getting-started day-to-day loop with `/pharn-regress` and refreshed the
  `pharn.config.json` example module versions to match the current `pharn-oss` manifest
  (`skillsVersion` 0.70.0).
- Docs: the root `README.md` Commands table and the `pharn -h` help text now document the
  already-implemented `add <category>:<skill>` form (install one technology skill, e.g.
  `orm:prisma`) alongside the whole-module `add <module>` form. No CLI code change.
- **Stricter `models` / `seam` validation in `pharn.config.json`.** The `models` and `seam` blocks now
  reject — naming the offender — an unknown/typo'd key (e.g. `stgaes`, `haltOnUnknwon`), a duplicate
  `resolutionOrder` step, and a `modelConfidenceThreshold` with no `model` step to gate. Previously
  such slips were silently ignored, leaving the intended setting quietly dead. The seam contract
  (`pharn-contracts/seam-config.md`) and its floor validator move to this strict posture in lockstep;
  offending keys are echoed JSON-escaped as data.

### Fixed

- **A hand-edited `pharn.config.json` now fails loudly instead of lying.** A present-but-invalid
  `models` / `seam` block previously made `add` / `status` / `update` / `remove` / `list` print
  `No pharn.config.json found. Run pharn init first.` — a lie that risked clobbering your edits. They
  now surface the validator's specific, offender-naming message and exit non-zero; `init` names an
  invalid existing config before offering to overwrite it, instead of silently treating it as absent.

## [0.2.0] — 2026-06-11

Realigned the CLI with the current `pharn-dev/pharn-oss`, which is now a
**module-based** repo (`pharn-core` + optional `pharn-pipeline`, `pharn-review`,
`pharn-audits`, and a `pharn-stack-nextjs` stack pack) described by a root
`manifest.json` and per-module `module.json` `installs` maps.

### Changed (breaking)

- **`pharn init` is now a module wizard.** It fetches the module catalog from
  `pharn-dev/pharn-oss`, then asks: which optional modules, which stack pack, and a
  privacy posture (constitution variant). It resolves dependencies + exclusivity from
  the manifest, clones the repo, copies each selected module's `installs` into
  `.claude/`, and materializes `memory-bank/` + the chosen `CONSTITUTION.md`. The old
  UI/db/auth/orm stack-scaffolder wizard and the vendor-skills consent flow were removed.
- **GitHub coordinates fixed** — `pharn/pharn` → `pharn-dev/pharn-oss`; first feature
  command `/ship-feature` → `/pharn-plan`.
- **`pharn.config.json` schema** — now records `skillsVersion`, `repo`, pinned `commit`,
  `constitution`, and the resolved `modules[]` (name + version), plus `installedAt`.

### Added

- **`pharn add <module>`** — adds a module (and its dependencies) to an existing project
  and updates `pharn.config.json`; never touches `CONSTITUTION.md`.
- **`pharn update`** — compares the pinned `skillsVersion`/module versions against the
  latest manifest, shows a diff, and re-fetches installed modules on confirmation.
- **Path-escape hardening** — module names, versions, and `installs` paths are validated
  against strict allowlists, and every copy is guarded by `safeJoin`.

## [0.1.0] — 2026-06-11

Initial published release. `pharn` bootstraps the PHARN stack into an existing
Next.js project. Exposes both `pharn` and `pharn` bins.

### Added

- **`pharn init` wizard** — the default command. A `@clack/prompts` step pipeline that
  configures a stack and writes `pharn.config.json`:
  - **Prerequisite checks** — hard-fails if `next` isn't in `package.json` or the project
    isn't a git repository.
  - **Fresh-project check** — warns (via commit count and a custom-file heuristic) when the
    project isn't a fresh Next.js scaffold.
  - **Mode select** — `default-mode` (a canned stack) or `custom-mode` (the full wizard over
    every option defined in `src/types.ts`), followed by warnings and a summary the user can
    accept, cancel, or loop back to edit.
- **Skill installation** — clones the PHARN skills repo into `.claude/` via `degit`,
  prompting before overwriting an existing `.claude/` or `pharn.config.json`, then records
  `pharnVersion`, `skillsVersion`, and the chosen `stack` in `pharn.config.json`.
- **Vendor-skills flow** — fetches a remote, schema-versioned manifest, matches each vendor's
  `triggeredBy` features against the selected stack, shows commit-age hints, and presents an
  opt-in multiselect (nothing selected by default). Accepted/declined vendors are recorded
  under `vendorSkills`. Any network failure soft-fails and install proceeds.
- **Security-hardened remote input** — all remote strings (manifest, repo/branch/commit) are
  validated against strict regex allowlists, checked for `..` and control characters, and
  fetched with `redirect: 'error'`, an 8s timeout, and a 256KB body cap. The manifest
  `schemaVersion` must be exactly `1`.
- **`PHARN_DEBUG=1`** — surfaces full error output for skill-clone and vendor-manifest
  failures.
- **`pharn add` and `pharn update`** — stubbed; full behavior planned for a later release.

### Notes

- **v0.1 scope:** `init` only clones `.claude/` skills and serializes stack choices into
  `pharn.config.json`. It does not yet install npm packages or scaffold the stack — that is
  planned for v0.2 (see `docs/roadmap.md` and the `TODO(v0.2)` markers).

[Unreleased]: https://github.com/pharn-dev/pharn-cli/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/pharn-dev/pharn-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/pharn-dev/pharn-cli/releases/tag/v0.1.0
