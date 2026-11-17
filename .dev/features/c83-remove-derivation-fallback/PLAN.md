# PLAN — c83-remove-derivation-fallback (C8.3, epic CORE-157; no Linear issue by the owner's decision)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: a fetched pharn-oss tree without `pharn-install.json` is refused inside `fetchRepo` (an `UpstreamManifestError` naming the fix: a pharn-oss release from 7.21.0 on, or `--ref main`), and the derivation fallback behind every `removed in v0.22.0 (CORE-186)` branch point is deleted, with the frontmatter port, its vendored validator and its differential test. Written as the v0.22.0 change: held unmerged until v0.21.0 ships; CHANGELOG `[Unreleased]` **Removed**, no version bump.
- base: origin/main @ 33ffae19. Branch `przemek/core-157-c83-remove-derivation-fallback`.
- layer(s): CLI fetch boundary + install/selection libs (`src/lib`), callers' arguments (`src/commands`, `src/steps`), eslint config, tests + harness, docs, CHANGELOG, `CLAUDE.md`; `THREAT-MODEL.md` by a patch script the user runs.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Why (discovery, live state this run)

- Six fallback sites, grep `CORE-186` in src: `parseCapabilityIndex` (capability-index.ts, frontmatter port), `collectInstallManifest` and `capabilityCloneFiles` (install-manifest.ts, surface walk + `FLOOR_TEST_FIXTURES_DIRS` + `resolveTrustedDocs`/`resolveFeaturesReadme` probes), `upstreamSettingsCopyable` (install-capabilities.ts), `readUpstreamModels` (upstream-models.ts, root `pharn.config.json`), and `readUpstreamManifest`'s `null` (upstream-manifest.ts).
- `fetchRepo` (repo.ts) is the only producer of a clone and already calls `readUpstreamManifest` + `verifyUpstreamManifest` inside the `try` that removes the tree on a throw. Every command reports a `fetchRepo` throw by its message (`init` names `UpstreamManifestError` explicitly; `status`/`update` via `CliError.failure`; `add` via its labelled catch).
- The manifest's `checkLayout` already requires the `pharn` layout and its marker, so once the manifest is mandatory every clone is `pharn`: the `layout` argument of `collectExpectedInstallPaths` / `absentInstallSurfaces` / `conflictingWriteTargets` and the `paths` argument of `capabilityCloneFiles` select nothing any more (every caller passes `detectLayout(repoDir)` or a layout it has already compared with it).
- Commands only fetch the latest release or the tip of `main` (`resolveSource(channel)`); no command fetches a recorded commit. So "fetching a pharn-oss older than 7.21.0" means only: the latest release is older (impossible today, 7.21.0 shipped 2026-11-17) or a future regression.
- `tests/fixtures/pharn-oss/check-model-config.mjs` imports `./frontmatter-core.mjs`, and `tests/model-config-parity.test.ts` pins its sha256. **So `frontmatter-core.mjs` cannot be deleted while the pinned model checker stays** (owner decision: keep it). Only `validate.mjs` and `capability-files-core.mjs` go.
- `PHARN_ROOT_FALLBACK_DOCS` has two readers: the clone probe `resolveTrustedDocs` (pre-7.0 clones: dies with this change) and `root-migration.ts`, the project-side root-doc retirement (a separate v0.22.0 shim, kept).
- The `flat` layout and the root-footprint migration are PROJECT-side shims (installs recorded `flat`, root docs left by a pre-7.0 install). Removing the manifest-less path removes only their CLONE-side halves (a flat clone, a pre-7.0 clone). They do not fall out naturally, so they stay (follow-up). `install-surfaces.ts` (`isInstallRootPath`, `isPharnOwnedPath`, both layouts) stays.
- `docs/contributing.md`'s shim table carries the derivation row and the `PHARN_ROOT_FALLBACK_DOCS` row (v0.22.0); retired rows are kept and marked `Removed:` with the ticket.

## Design

1. **`readUpstreamManifest(repoDir): UpstreamManifest`** (never `null`). Absent → `UpstreamManifestError`: "The fetched pharn-oss ships no pharn-install.json, so it is older than 7.21.0, and this pharn installs only from pharn-oss 7.21.0 or newer. Re-run on the latest release (the default) or with `--ref main`. Nothing was written." `fetchRepo` calls it unconditionally, so the refusal happens at fetch time with the tree removed; every later call site re-reads through the same parser (no second path). Kept as `UpstreamManifestError` → each command's existing catch makes it a `CliError` (the `failure` form, the same as the manifest's other refusals). `init`'s explicit `UpstreamManifestError` branch already prints it bare.
2. **Branch points collapse to the manifest projection** (comments drop "fallback / CORE-186"):
   - `parseCapabilityIndex(repoDir)` = `manifestCapabilityIndex(readUpstreamManifest(repoDir))`; the module keeps its name and header, rewritten (the frontmatter port, `readCapabilityMarkdown`, `extractFrontmatter`, `readField`, `readRole`, `readApplies`, `BOM_RE`, `DISPLACED_LEAD_RE` go).
   - install-manifest.ts: `collectInstallManifest` = manifest install set + `accountManifest`; the walk, `addDir`, `copyNameFloor`, `walkFiles`, `isFloorTestFixturePath` go; `layout` leaves `collectExpectedInstallPaths` / `absentInstallSurfaces` / `conflictingWriteTargets`; `capabilityCloneFiles(repoDir, cap)` loses `paths`. Callers updated: overwrite-check, write-targets, init-plan, update-plan, diff, status, install-capabilities, add.
   - `upstreamSettingsCopyable` = `manifestDeclaresSettings(readUpstreamManifest(repoDir))`.
   - `readUpstreamModels` = `checkUpstreamBlock(manifest.modelsDefaults)`; the root-config read and `MAX_UPSTREAM_CONFIG_BYTES` go.
3. **Clone probes go with it**: `resolveTrustedDocs`, `resolveFeaturesReadme` (layout.ts) and `PHARN_ROOT_FALLBACK_DOCS`, `FLOOR_TEST_FIXTURES_DIRS` (constants.ts). Their remaining readers switch to the manifest's set: `installPrepared`'s `docs` = `paths.docs` held in the install set; `update-plan`'s features-readme relocation = records hold root `features/README.md` AND the install set holds `pharn/features/README.md`; `root-migration.ts` owns its fixed old-root-doc list (`ROOT_DOCS`, pharn path → root path, the same two entries) and checks "the clone ships the pharn/ copy" by an existence test of that path.
4. **eslint**: the `DISPLACED_LEAD_RAW` exemption and its two `tests/lint-rules.test.ts` rows go (the rule then applies to every file with no exemption).
5. **Model rules (owner decision, made): KEEP the pinned checker.** `model-config.ts`, `model-config-parity.test.ts`, vendored `check-model-config.mjs` (+ its import `frontmatter-core.mjs`) stay, because `status`/`update` validate the project's `models` block with no clone. `models.rules` from the manifest stays unread. The `model-config.ts` header gains one "why" sentence saying so.
6. **Out of scope (follow-up)**: removing the `flat` layout (project side), the root-footprint migration, `detectLayout` (still the manifest's marker check), `install-surfaces.ts`.

## Files

> Every path below is literal, so the writes-scope setter can read it. The test list is wider than the files that will change; a test file that turns out untouched stays unchanged.

- `src/lib/upstream-manifest.ts` — absent manifest refuses (version escaped); header — fetch boundary
- `src/lib/repo.ts` — unconditional read + verify; comment — fetch boundary
- `src/lib/capability-index.ts` — frontmatter port deleted; thin manifest projection — fetch boundary
- `src/lib/install-manifest.ts` — derivation deleted; `layout`/`paths` params dropped — install
- `src/lib/install-capabilities.ts` — settings + docs from the manifest; new signatures — install
- `src/lib/upstream-models.ts` — root-config read deleted — fetch boundary
- `src/lib/layout.ts` — `resolveTrustedDocs`/`resolveFeaturesReadme` deleted — install
- `src/lib/constants.ts` — `FLOOR_TEST_FIXTURES_DIRS`, `PHARN_ROOT_FALLBACK_DOCS` deleted — lib
- `src/lib/root-migration.ts` — owns `ROOT_DOCS`; existence probe — update engine
- `src/lib/update-plan.ts` — new signatures; relocation from the install set — update engine
- `src/lib/init-plan.ts` — new signatures — install
- `src/lib/diff.ts` — new signature — reporting
- `src/lib/write-targets.ts` — new signature — install
- `src/lib/executable-unit.ts` — imports the name predicates from install-surfaces (install-manifest no longer re-exports them) — lib
- `src/types.ts` — `UnknownCapability` comments (no frontmatter any more) — types
- `src/lib/model-config.ts` — header "why kept" sentence — config
- `src/lib/install-surfaces.ts` — comment only, if it names the derivation — install
- `src/steps/overwrite-check.ts` — new signature — steps
- `src/steps/install-archetype.ts` — new signature — steps
- `src/steps/add-picker.ts` — comment only, if needed — steps
- `src/commands/status.ts` — new signatures — commands
- `src/commands/add.ts` — new signature — commands
- `src/commands/init.ts` — comment only, if needed — commands
- `src/commands/update.ts` — comment only, if needed — commands
- `eslint.config.mjs` — exemption removed — tooling
- `tests/support/harness.ts` — 7.x-shaped `upstreamTree`; serve-time sealing (`upstream.seal`; an explicit manifest is never resealed); `flatTree`/`upstreamTree7`/`FLAT` gone; `seedInstall` (real-shaped records via `contentHash`); `sealRepo(dir)` — tests
- `tests/helpers.ts` — only if a shared helper belongs there — tests
- `tests/fixtures/pharn-oss/validate.mjs` — deleted — tests
- `tests/fixtures/pharn-oss/capability-files-core.mjs` — deleted — tests
- `tests/capability-index.test.ts` — tests
- `tests/install-manifest.test.ts` — tests
- `tests/install-capabilities.test.ts` — tests
- `tests/upstream-models.test.ts` — tests
- `tests/model-config-parity.test.ts` — the root-config cases read the manifest — tests
- `tests/upstream-manifest.test.ts` — tests
- `tests/repo.test.ts` — tests
- `tests/repo-signals.test.ts` — tests
- `tests/layout.test.ts` — tests
- `tests/root-migration.test.ts` — tests
- `tests/diff.test.ts` — tests
- `tests/overwrite-check.test.ts` — tests
- `tests/write-targets.test.ts` — tests
- `tests/orphans.test.ts` — tests
- `tests/lint-rules.test.ts` — tests
- `tests/update-plan.test.ts` — tests
- `tests/backup.test.ts` — tests
- `tests/hook-wiring.test.ts` — tests
- `tests/install-records.test.ts` — tests
- `tests/project-lock.test.ts` — tests
- `tests/constants.test.ts` — tests
- `tests/source-hygiene.test.ts` — tests
- `tests/dist-smoke.test.ts` — tests
- `tests/commands/init.test.ts` — tests
- `tests/commands/init-dry-run.test.ts` — tests
- `tests/commands/add.test.ts` — tests
- `tests/commands/update.test.ts` — tests
- `tests/commands/update-dry-run.test.ts` — tests
- `tests/commands/status.test.ts` — tests
- `tests/commands/uninstall.test.ts` — tests
- `tests/commands/list.test.ts` — tests
- `tests/commands/remove.test.ts` — tests
- `tests/commands/clone-cleanup.test.ts` — tests
- `tests/commands/lock.test.ts` — tests
- `docs/architecture.md` — docs
- `docs/commands/init.md` — docs
- `docs/commands/update.md` — docs
- `docs/commands/status.md` — docs
- `docs/commands/add.md` — docs
- `docs/contributing.md` — docs
- `docs/README.md` — docs
- `docs/getting-started.md` — docs
- `docs/support-policy.md` — docs
- `docs/troubleshooting.md` — docs
- `docs/reference/pharn-config.md` — docs
- `CLAUDE.md` — module map, the clone invariant — docs
- `CHANGELOG.md` — `[Unreleased]` Removed — docs
- `.dev/features/c83-remove-derivation-fallback/BUILD.md` — build note — dev-loop

### Explicitly not touched

- THREAT-MODEL.md (hook-protected): scratchpad `patch-C83.py`, run by the user.

## Contracts satisfied

- pharn-oss `docs/install-manifest.md` schemaVersion 1 — now the only install source (cite, unchanged parser).
- docs/support-policy.md v0.22.0 row — "Fetching a pharn-oss older than 7.21.0" retired; the `flat` and root-footprint items of the same row stay for a follow-up.
- CLAUDE.md invariants: "The clone is data" (manifest sha256 verified in `fetchRepo`, `isPharnOwnedPath` outer bound) and "Fail closed on release resolution" — unchanged; this tightens the former.

## Evals to write (P1) — vitest

- fetchRepo: a tree without `pharn-install.json` (release and `--ref main`) → throws `UpstreamManifestError` naming 7.21.0 and `--ref main`; no clone left on disk.
- readUpstreamManifest: absent → throws (was `null`).
- init / update / status / add command suites: an unsealed tree → exit 1, the refusal message, nothing written (project bytes unchanged), no clone left.
- parseCapabilityIndex / collectExpectedInstallPaths / capabilityCloneFiles / upstreamSettingsCopyable / readUpstreamModels on a manifest-less dir → throw (no derivation answer).
- Existing manifest-path cases stay green; every command suite runs on sealed trees (the default), so the whole install/update/status surface is exercised through the manifest.
- Project-side shims still work: a seeded `flat` install updates to `pharn` (layout move); a seeded pre-7.0 install's root docs are retired (root migration) — rewritten from fetch-installed to seeded.
- update-plan: features-readme relocation reported when records hold root `features/README.md` and the manifest ships `pharn/features/README.md`.
- lint-rules: a `DISPLACED_LEAD_RE`-shaped literal in capability-index.ts now fires `unsafeChars`.
- Coverage floors 90/85/90/90 hold.

## Guarantee audit (P0)

- "Nothing is installed from a tree without a manifest" → floor: `fetchRepo` throws inside its cleanup `try` (deterministic presence test via `readJsonBounded` kind `absent`), before any command reads the tree; every branch point re-reads through the same parser and throws too (defence in depth).
- "What is installed is exactly what the manifest declares, byte-verified" → floor: existing raw-sha256 check + `isPharnOwnedPath` dest bound (unchanged).
- "Capability applicability is upstream's" → advisory-free now: it is manifest data validated by enum (`assertAppliesToken`); the frontmatter-port parity claim (differential test) is removed with the port, not weakened.
- "The project's `models` block obeys pharn-oss's rules" → floor: pinned checker + parity test (kept, decision 5).

## Trust audit (P2)

- `pharn-install.json` stays the only untrusted index input: bounded read, field allowlists, safeJoin, outer bound, sha256 — unchanged. Removing the frontmatter reader removes an untrusted-markdown parser from the fetch boundary (attack surface shrinks). Error text keeps quoting untrusted values through `escapeUnsafe`; the new absent-manifest message quotes nothing from the tree.

## Determinism audit (P5)

- Presence of the manifest is a membership test (`absent` kind); absent ends in a hard refusal naming the fix, never a guess or a fallback.

## Risks

- Test churn is large (every command suite's default tree changes shape; lib tests scaffold clones on disk). Mitigation: seal at serve time / `sealRepo`, so most tests change only their tree builder. Deleted tests are only those whose subject is the derivation (frontmatter fence/value parity, flat-clone and pre-7.0-clone install enumeration, COPY_FILENAME_RE walk floor, floor fixture exclusion); pharn-ci will flag them (TI01/TI02), expected for this ticket.
- `CHANGELOG` names 0.21.x as the last pharn that installs from a pharn-oss without `pharn-install.json`.
- P7 ("old pins never break"): the owner's support policy schedules this exact removal for v0.22.0; the PR is held until v0.21.0 ships.

## Grill resolutions (GRILL.md, advisory)

- The message names the tree's `SKILLS_VERSION` through `escapeUnsafe`, with a hostile-value test.
- The old-ref case, command level: `--ref` takes only `latest`/`main`, so "old" means a release resolved to `v7.20.0` (unsealed) or an unsealed main tip, for `init` (default + `--ref main`) and `update` (`--ref latest` + `--ref main`). Each exits 1, writes nothing and leaves no clone.
- Old install → latest: a seeded `flat` install and a seeded pre-7.0 `pharn` install each `pharn update` to a sealed latest release. End state asserted: config `layout: "pharn"`, records rewritten, root docs retired where provable.
- Serve-time sealing never touches a tree that already has `pharn-install.json`. `seedInstall` records use `contentHash`.

## Open questions — resolved (coordinator, 2026-11-17: "Q1–Q4 as designed")

- Q1: keep `UpstreamManifestError`, reported as `CliError.failure`.
- Q2: keep `frontmatter-core.mjs`.
- Q3: drop the dead `layout`/`paths` params.
- Q4: move the root-doc list into `root-migration.ts`.
