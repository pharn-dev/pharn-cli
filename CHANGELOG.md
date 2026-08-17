# Changelog

All notable changes to `pharn` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Docs

- **The trust map now matches the records era.** `LIMITS.md` and `THREAT-MODEL.md` still described the
  deleted module/manifest subsystem and a world with no stored file hashes, both of which stopped being
  true when `pharn.records.json` shipped. Three claims were corrected in place. `LIMITS.md §1d` said
  `update`, `remove`, and `status` all reconstruct by reading a manifest from `@main` — there is no
  manifest, and `remove` is fully offline, addressed from `pharn.config.json` alone; the section now
  splits those two cases and names what each leaves behind. `THREAT-MODEL.md §4c` said pharn stores no
  per-file content-hash; it does, and the honest residual is that the baseline covers only pharn-written
  files at a matching stamp — so an absent or skewed store makes `update` **skip** present files while
  still **restoring** absent ones. `LIMITS.md §1b` said the same thing one section earlier and now draws
  the real distinction: the hashes pharn stores are drift baselines taken from the written file, which
  authenticate nothing about upstream. No section numbers changed.

### Removed

- **Internal: the module-era symbols nothing calls are gone, and the security narration they left
  behind is corrected.** Four unused validators (`MODULE_NAME_RE`, `INSTALL_PATH_RE`,
  `WIZARD_VALUE_RE`, `PACKAGE_NAME_RE`), `shortDescription`, `toInstalledModules`, and all of
  `lib/constitution.ts` were retained after their callers (`install-modules.ts`, `wizard.ts`) were
  deleted; a fresh reference sweep found zero production callers for each. None is user-facing —
  `package.json` exposes only `bin`/`files`, never a library entry point — so there is no API
  change. The correction that does matter is documentation: `CLAUDE.md` and `docs/contributing.md`
  both listed `INSTALL_PATH_RE` among the allowlists that validate untrusted remote input, and it
  had validated nothing since the module install path was removed. Both now enumerate the
  allowlists that are actually enforced. Path containment itself never depended on it and is
  unchanged — `safeJoin` is the live gate. The four tests that pinned `assertSafeString`'s
  reject/pass ladder used `MODULE_NAME_RE` only as a sample pattern; they were rewritten against
  `CAPABILITY_NAME_RE` before the regex was deleted, so that function's coverage is intact.

### Fixed

- **`pharn update` now warns on both layout-migration directions, not just flat→`pharn/`.** The outcome
  field recording an abandoned layout has always been direction-agnostic, but the report only tested it
  for `flat` — so a project recorded at the `pharn/` layout meeting a flat clone was migrated in
  silence, leaving the entire `pharn/` tree (contracts, floor scripts, trusted docs, and every
  capability) behind with nothing managing it and nothing said about it. That direction now prints its
  own warning naming what was left and how to clean it up. The flat→`pharn/` message is unchanged, and
  `update` still never deletes in either direction.

- **`pharn init` no longer misdetects a project whose framework build cache is large.** Archetype
  detection walks your file tree under a bounded entry budget, and that budget was being spent on
  generated output: a `.next/` directory of 55 000 files consumed the whole allowance before the walk
  reached `src/`, so a React project with no `package.json` framework dependency was detected as a
  frameworkless `lib` instead of `spa` — the same wrong answer on every machine, because the walk is
  sorted and `.next` sorts before `src`. Build and deploy caches are now skipped, which costs the
  walk nothing: `out`, `coverage`, `storybook-static`, `.next`, `.nuxt`, `.svelte-kit`, `.astro`,
  `.turbo`, `.vercel`, `.cache`, and `.parcel-cache` join the `node_modules`, `.git`, `dist`, and
  `build` that were already skipped. The tradeoff is a lost signal, never a false one: a source file
  you hand-authored inside one of those directories is no longer seen, and your `package.json`
  dependencies are what normally cover that case.

- **`pharn remove` now prunes the removed capability's entries from `pharn.records.json`.** It deleted
  the capability's files and dropped its config entry but left the record store alone, so until the
  next `pharn update` rewrote the store it was the one command that left records describing bytes that
  no longer existed. Those entries are now dropped as part of the removal. They are matched as a string
  prefix on the record key rather than by walking your filesystem, which is why this also works on the
  path where the capability's directory was already gone — there, the stale records were the only thing
  left to clean up. Nothing else in the store changes: sibling capabilities' entries are untouched, and
  the `skillsVersion`/`commit` stamp does not move, because `remove` changes neither. A store that is
  absent, unreadable, or stamped for a different install state is left exactly as found — `remove`
  never mints a store and never rewrites one it could not verify, the same rule `pharn add` follows —
  and the removal itself completes regardless.

- **`pharn status` no longer crashes on a path it cannot read, and no longer misreports what sits
  there.** The drift check read your project with its own bare `existsSync` / `readFileSync`, which
  went wrong four ways. A **directory** where a file belongs threw `EISDIR` out of the middle of the
  comparison, so status printed a raw errno naming no file and **the drift report for every other file
  was lost** — one bad path took down the whole run. A **symlink** was read *through*: pointing it at a
  file with other bytes listed the path under "differs", erasing the fact that a link — not an edit —
  was the cause, and pointing it at a **byte-identical** file made status count it as matching and say
  **nothing at all**, silently blessing a path that leads outside your install and can change under it
  tomorrow. A **dangling** symlink was reported as "missing", when the truth is a link squats on the
  path. And a path whose **parent is a regular file** was likewise reported "missing", when in fact it
  cannot exist. All four are now a fourth drift category, **Unreadable**, listed by name with the
  reason, while every other file still compares normally. `--strict` exits 1 on them like any other
  drift; a plain `pharn status` still exits 0, because it is a report. This is the same classification
  `pharn update` has always used to decide what it refuses to write over — so the read side and the
  write side can no longer disagree about what a symlink at a pharn-owned path means.
- **One canonical sha256.** `lib/hash.ts` has always claimed a single implementation "so the drift
  check (status), the install record store, and the update decision can never disagree" — while the
  drift check quietly kept a private copy. It now uses the shared one, and a test holds the claim.

- **`pharn init` and `pharn update` no longer report success having done nothing off a TTY.** Both
  commands confirm before they write, and when stdin was not a terminal that confirmation cancelled on
  stream end and routed through the graceful-cancel path — `process.exit(0)`. So `echo "" | pharn update`
  and `pharn update < /dev/null` **exited 0 having updated nothing**, and piped `pharn init` **exited 0
  having installed nothing** — after paying for a full clone, because the fetch precedes init's first
  prompt. A pipeline that "passes" having done nothing is the worst failure shape for automation.
  Both commands now **exit 1** with a usage error naming the way out, using the same TTY predicate the
  `pharn add` / `pharn remove` pickers have always used (`interactiveAllowed` — imported, not
  re-implemented; a static test pins that this repo has exactly one such predicate). Each gate sits
  **after** that command's promptless local step — `update`'s config load, `init`'s git prerequisite —
  so an uninitialized directory still gets *"run `pharn init`"* and a directory with no `.git` still
  gets *"run `git init`"*, never a misleading message about a prompt they would not have reached. Each
  gate also sits **before any network call**, so a refused run costs zero round-trips and wastes no
  clone. **TTY behavior is deliberately unchanged:** a human choosing Cancel is still a user-initiated,
  graceful exit 0 — only EOF masquerading as that choice is now unreachable.

- **`pharn add` no longer installs at a layout your config does not record.** PHARN ships in two
  install layouts (the legacy flat one, and everything under `pharn/`). `add` copied at the *clone's*
  layout while `pharn remove`, `pharn list`, and `pharn status` all look at the layout recorded in
  `pharn.config.json` — so when the two disagreed, the capability landed where nothing would ever find
  it: invisible to `list`/`status`, and a later `remove` reported *"its files were already gone"* while
  dropping only the config entry, orphaning the directory on disk. `add` now **refuses** when the
  clone's layout differs from your recorded one, naming both layouts and pointing at `pharn update --force`,
  and writes nothing — no capability directory, no `pharn.config.json`, no `pharn.records.json`.
  `add` deliberately does **not** record the clone's layout the way `update` does: `update` may only
  because it rewrites your whole install at that layout, while `add` writes a single capability.
  *Scope, honestly:* the common flat→`pharn` migration window was already closed by the version gate
  in the previous release, since a pre-migration install also has a pre-migration `skillsVersion`.
  What this closes is the residual case — a config that reached the current version with a stale,
  absent, or hand-edited `layout`. Note that resolving such a same-version drift needs
  `pharn update --force`, as a plain `pharn update` returns early at a matching version.

### Added

- **`pharn update --yes` (`-y`) — a real flag, for CI and scripts.** It skips **the confirmation prompt
  and nothing else**: the version note still prints, the same per-file decision table applies, files you
  edited are still skipped rather than overwritten, the recorded version is still withheld when anything
  was skipped, and every exit code is unchanged. It means *"do not ask"*, not *"non-interactive mode"* —
  so it works in a terminal too — and it composes with `--force` (`pharn update --yes --force` is the
  full CI re-apply). `--force` does **not** imply `--yes`: overwriting your edits is the most destructive
  thing `update` does, so it still asks. Because `--yes` is only consent, it is not a drift check — a run
  that skips your edited files still exits 0; use `pharn status --strict` when CI should fail on drift.
  The flag was previously parsed but consumed by nothing.

  There is deliberately **no `--yes` for `pharn init`**: init's second prompt is the destructive overwrite
  confirmation, and auto-confirming file overwrites in a pipeline is precisely the hazard that prompt
  exists to prevent — so non-interactive `init` refuses rather than offering a bypass.

- **`capabilities[].source` — selection provenance, so `pharn update` stops deleting what you added.**
  Each entry in `pharn.config.json` now records how it got there: `auto` (selected for your archetypes
  by `pharn init`) or `manual` (you asked for it by name with `pharn add`). The field is **optional** —
  a config written by an older CLI omits it and still loads.

- **`pharn list` shows provenance.** The human listing marks a hand-added capability `(manual)`;
  `--json` gains a `source` field on each capability, **omitted** (never defaulted) when the config
  does not record one. This is an additive JSON change — existing consumers are unaffected.

### Changed

- **The lint gate lost its soft tier and now covers the checked-in source surface.** `npm run lint`
  runs ESLint over `src/`, `tests/`, and `scripts/` with `--max-warnings 0`, so **any** warning from
  **any** rule now fails the gate, locally and in CI. Before this it linted `src/` only, and its one
  custom rule sat at `warn` — a severity nothing could ever fail on — while `tests/` and `scripts/`
  were typechecked but never linted. Closing it needed no code change: the tier was measurably empty.
  The flat config also now declares the platform it actually runs on — `globals.nodeBuiltin`, Node
  minus the CommonJS-only names, because this package is ESM — which is what let `scripts/` join the
  gate without editing a single script: their `console`/`process` were never wrong, the config simply
  declared no globals at all. Choosing `nodeBuiltin` over plain `node` keeps `__dirname`/`require` in
  an `.mjs` a lint error, since those do not exist in ESM and would otherwise crash at runtime.
  *Scope, honestly:* the root config files (`eslint.config.mjs`, `vitest.config.ts`), `.dev/floor/`,
  and `.claude/hooks/` are **not** linted. And `--max-warnings 0` counts warnings that are actually
  **emitted** — it is not a defence against a rule set to `off`, a new `ignores` entry, or an inline
  `eslint-disable` comment.

### Fixed

- **`pharn update` no longer silently deletes capabilities you added by hand, or silently resurrects
  ones you removed.** `update` re-resolves your `archetypes` against the latest index, and it used to
  overwrite `capabilities` with that result **wholesale**. Two things went wrong, both without a word:

  - a capability installed with `pharn add` that your archetypes do not select was **dropped** from the
    config on the next update — its files orphaned on disk, invisible to `list`, `remove` and `status`;
  - because most capabilities are `universal`, a `pharn remove` was **undone** by the next update.

  `update` now writes the **union** — `resolve(archetypes, latest index) ∪ your manual entries` — so a
  manual add survives, and its files upgrade, restore, or skip-on-edit through the same per-file
  decision table as everything else. An entry that is both manual and re-selected stays manual, so a
  later archetype change cannot quietly drop it. A manual entry whose capability no longer exists
  upstream is dropped from the config (its files left alone) rather than kept as a phantom pointing at
  nothing.

- **Every capability membership change is now named.** When the list changes, `update` prints a
  `CAPABILITIES` section saying exactly what moved and why — `ADDED — newly selected for your
  archetypes`, `REMOVED — no longer selected for your archetypes`, `REMOVED — no longer exists upstream
  (was a manual add)`, or `KEPT — your manual add, not selected by your archetypes`. When nothing
  changed, nothing is printed.

  > **Named limit:** a removal is not a tombstone. If your archetypes still select a capability you
  > removed, the next `update` re-adds it — but it now **says so** under `ADDED` instead of restoring it
  > in silence. Preventing that (rather than reporting it) needs a `removed:` list, which is deliberately
  > not in this release.

- **`pharn remove` warns when a removal will not stick.** Removing an entry recorded as `auto` now warns
  that the next `pharn update` will reinstall it. The warning reads the stored field only, so `remove`
  still needs no network — which also bounds what it can tell you: removing a `manual` entry warns
  nothing, but that is **not** a promise the removal is permanent. The union's _manual_ half can no
  longer re-add it, yet the _resolved_ half still can — if your archetypes select that capability, the
  next `update` re-adds it as `auto`. It will be named under `ADDED` when that happens.

- **Existing installs migrate themselves, without losing anything.** An entry with no `source` (written
  before this release) is inferred exactly **once**, on your next `pharn update`: in the resolved set it
  becomes `auto`, outside it becomes `manual`. That second half is a **reconstruction, not a recovered
  fact** — an entry outside the resolved set was either added by hand, or auto-selected by an older
  index and since de-selected upstream, and nothing offline can tell those apart. It is tagged `manual`
  either way, which is the fail-safe direction: a still-existing capability is then kept, and one that
  has disappeared upstream is dropped **and named**. So no pre-existing `pharn add` is lost by the
  upgrade, and the preserved entries are named in that run's report. Absence is never treated as a
  default anywhere else: `pharn remove` stays silent on an absent `source` rather than give a legacy
  manual add a wrong "update will reinstall it" warning.

  A `source` present but outside `{auto, manual}` is reported by name (`capabilities[2].source`) and
  exits, instead of falling back to "run `pharn init`". Deleting the field is a valid fix.


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
