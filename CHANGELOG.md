# Changelog

All notable changes to `pharn` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`pharn add` no longer makes `pharn update` report "Already up to date" over a stale install.**
  `add` clones the tip of `pharn-dev/pharn-oss`, and it used to write that clone's `SKILLS_VERSION`
  into your `pharn.config.json` — even though every file it did not just copy still held the old
  version's bytes. Because `update` skips when your recorded `skillsVersion` already equals the
  latest, any `add` run after an upstream release silently closed that gate, and the skew only
  healed on the next release or via `update --force`. `add` now **refuses** when the fetched version
  does not match the one your project records, naming both versions and pointing at `pharn update`:

  ```text
  ⚠ Skills version mismatch: pharn.config.json records v1.0.0, but the fetched
    github.com/pharn-dev/pharn-oss is at v2.3.0. `pharn add` installs only at the version your
    project is already on — run `pharn update` first, then re-run `pharn add`.
  ```

  The refusal fires before anything is written and before the interactive picker renders — no
  capability directory is copied and neither `pharn.config.json` nor `pharn.records.json` is
  touched — and it exits non-zero. It fires on **any** difference, so a clone older than your config
  (a rollback, a hand-edited value) refuses the same way rather than guessing a direction. When the
  versions do match, `add` behaves exactly as before, still refreshing `commit` so a same-version
  upstream push is recorded. **Limit:** there is no way to add a capability to a deliberately-pinned
  older install — `add` has no `--force`, and `pharn update` is the only resolution.

## [0.4.0] — 2026-08-07

### Changed

- **`pharn update` is drift-safe by default — it no longer overwrites files you have edited.** Every
  install now records a sha256 per written file in a new sidecar,
  [`pharn.records.json`](docs/reference/pharn-records.md), and `update` compares each expected file
  against it: a file that is exactly what `pharn` wrote is upgraded, a file that is already identical
  to upstream is left alone, and anything it cannot prove is untouched is **skipped and listed** under
  one of three labels — `modified` (you changed it), `unrecorded` (no record for that path), or
  `unverifiable` (no usable record store, which is every install predating this release). Skips exit
  `0`; `update` still never deletes. Full decision table in
  [`docs/commands/update.md`](docs/commands/update.md).
- **A run that skipped anything no longer advances `skillsVersion` / `commit`.** Those fields describe
  the last _complete_ install, so `pharn status` keeps reporting the available update and the next
  `pharn update` still has work to do, instead of the same-version early-return stranding the skipped
  files permanently.
- **`pharn update` now records the layout of the clone it copied from.** It previously wrote files at
  the clone's layout while re-recording the stale `layout` from your config, so `status`, `remove`, and
  `list` could address a tree the files were no longer in. A `flat → pharn/` migration leaves the old
  top-level copies behind (update never deletes) and now warns about them.
- **`pharn status`'s drift section renames "LOCALLY MODIFIED" to "DIFFERS FROM …@main"** and describes
  the new behavior. The comparison is against upstream `HEAD`, so a file can differ because upstream
  moved — only `update` (which reads the records) can tell that from an edit of yours.

### Added

- **`pharn update --force`** — overwrite the skipped files anyway. Each is copied, with its relative
  path preserved, to `.pharn-backup/<YYYYMMDD-HHMMSS>/` **before** anything is overwritten; if any
  backup write fails the run aborts with every original still intact, and a colliding timestamp
  directory is uniquified rather than reused. The directory is never gitignored or pruned for you.
  `--force` also bypasses the same-version early-return, so it works on an up-to-date install — which
  is exactly what `pharn status` now tells you to do about locally-changed files.

### Fixed

- **`pharn update` no longer silently overwrites a hand-edited `CONSTITUTION.md`.** It always had,
  despite docs claiming the constitution was left untouched. `CONSTITUTION.md` is in the install
  manifest's trusted-doc set (`paths.docs` in `lib/install-manifest.ts`): `update` restores it when
  missing and upgrades it when still at the recorded hash, skipping it when locally modified
  (`modified`, same as any other manifest path); `add`/`remove` still never touch it.
- **The interactive `pharn add` picker now carries the full config forward between picks**, not just
  `capabilities` — previously `skillsVersion` / `commit` in its in-memory config drifted from what had
  just been written to disk.
- **Path-traversal hardening at both ends of the new write path (P2).** The install manifest now
  rejects a **symlinked source root** in the fetched clone (it previously resolved through one, and it
  now drives writes, not just comparisons), and every per-file write and backup refuses a
  **symlinked destination** or parent directory — `safeJoin` is lexical and `copyFileSync` follows
  symlinks, so a dangling destination symlink could otherwise be written through.

## [0.3.2] — 2026-07-24

### Security

- **The fetched commit SHA is validated before it is used or recorded.** `pharn init` / `add` /
  `update` record a `commit` provenance SHA resolved from the GitHub commits API. It is now checked
  against a strict full-40-hex-lowercase pattern (`COMMIT_RE`) at the fetch boundary
  (`src/lib/repo.ts`, `fetchRepo`) before it becomes the `degit` clone ref or is written to
  `pharn.config.json`, so a malformed or hostile value is rejected loudly instead of recorded as
  provenance. Degraded-mode `commit: null` (offline / rate-limited, `LIMITS.md §3b`) is unchanged.
  Closes the CodeQL `js/http-to-file-access` finding on `writePharnConfig`; the config-write sink and
  its per-field validators (`VERSION_RE` / `CAPABILITY_NAME_RE` / `COMMIT_RE`) are now named in
  `THREAT-MODEL.md §3.1`.

## [0.3.1] — 2026-07-24

First automated release via npm Trusted Publishing (OIDC); no functional
changes.

## [0.3.0] — 2026-07-24

### Added

- **Model routing is visible after install** — `pharn init`'s summary and `pharn status` now print a
  "Models per stage" block (`default` / `plan` / `review`, one line per configured entry) rendered from
  the `models` block actually written to `pharn.config.json`, plus a pointer to change it
  (`models.stages`). Documented under
  [`docs/reference/pharn-config.md`](docs/reference/pharn-config.md#model-routing).
- **Bare `pharn add` / `pharn remove` open an interactive picker** — run either with no argument in a
  terminal to get a grouped multi-select (grillers / lenses). `add` lists the capabilities you don't
  have yet (installed ones shown as an `Installed (N): …` summary, since `add` is additive-only) and
  installs each pick through the same per-capability path as `pharn add <name>`; `remove` lists what's
  installed and, after one confirmation, deletes each pick. Named-argument invocations are unchanged.
  Documented under [`docs/commands/add.md`](docs/commands/add.md) /
  [`docs/commands/remove.md`](docs/commands/remove.md).
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

- **`pharn list` capabilities are readable at scale** — the human output now groups installed
  capabilities by role with a per-role count and prints **one capability per line** (dash-bulleted),
  instead of a single comma-joined string that re-wrapped mid-item inside the box at large capability
  counts. `pharn list --json` is unchanged (byte-identical). Documented under
  [`docs/commands/list.md`](docs/commands/list.md).
- **No-argument `add` / `remove` never prompt in a non-interactive context** — in CI or a pipe (stdin
  or stdout not a TTY), bare `pharn add` / `pharn remove` exit with a usage error instead of opening a
  prompt. `pharn remove` with no argument previously opened a single-select picker with no such guard;
  it now opens a multi-select with one confirmation and the non-TTY guard.
- **Spend-safe `review` default** — a fresh install now routes the `review` stage to `opus-4-8`/`high`
  instead of `fable-5`/`max`. Review fans out across lenses (a backend install ships ~22), so a premium
  model at `max` effort multiplied per lens was the worst-case token cost, applied silently. Cross-model
  review on `fable-5`/`max` has proven catch value and is now a documented opt-in (set
  `models.stages.review`). Existing configs are not migrated — `models` is user-owned after init.
- **`SECURITY.md` + `THREAT-MODEL.md`** — rewritten for the archetype/capability install flow
  (no module/manifest/wizard references); remote-input, validation, write-surface, and consent
  points now cite current files/functions; `degit` clone bounds documented as a labeled limit.
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
- **Renamed the npm package `pharn-cli` → `@pharn-dev/pharn`** and made it publish-ready — added `repository`,
  `bugs`, `homepage`, `keywords`, and `publishConfig` (public access + provenance); dropped the
  `pharn-cli` bin alias for a single `pharn` bin; and added a `prepack` build so `npm publish` always
  ships a freshly compiled `dist/`. No CLI behavior change and `version` is unchanged; the package now
  installs via `npx @pharn-dev/pharn@latest init`.
- The unscoped name `pharn` is **not publishable** — npm rejects it with E403 as too similar to
  existing packages (`yarn`, `charm`, `sharp`) — so the canonical name is the org-scoped
  **`@pharn-dev/pharn`** (the installed binary stays `pharn`). An earlier `@pharn-dev/pharn@0.2.0`
  was published then unpublished on 2026-07-22, burning `0.2.0` on that name; releases resume at
  `0.3.0`.
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
Next.js project. Exposes both `pharn-cli` and `pharn` bins.

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

[Unreleased]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/pharn-dev/pharn-cli/releases/tag/v0.3.0
[0.2.0]: https://github.com/pharn-dev/pharn-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/pharn-dev/pharn-cli/releases/tag/v0.1.0
