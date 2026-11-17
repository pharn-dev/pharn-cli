# BUILD — c83-remove-derivation-fallback

## What landed

- **The refusal.** `readUpstreamManifest` no longer returns `null`. A tree without `pharn-install.json` throws `UpstreamManifestError` naming the tree's `SKILLS_VERSION` (escaped, and left out when unreadable), 7.21.0 and `--ref main`. `fetchRepo` reads and verifies the manifest unconditionally inside its cleanup `try`.
- **The derivation is gone** at every former fallback site:
  - `capability-index.ts` is now a one-line manifest projection.
  - `install-manifest.ts` lost its walk; the `layout`/`paths` params were dropped and callers updated.
  - `upstreamSettingsCopyable` and `readUpstreamModels` read only the manifest.
  - Also removed: `resolveTrustedDocs`, `resolveFeaturesReadme`, `PHARN_ROOT_FALLBACK_DOCS`, `FLOOR_TEST_FIXTURES_DIRS`, the eslint exemption, and the vendored `validate.mjs` + `capability-files-core.mjs`.
- **What moved:**
  - `root-migration.ts` owns its two-doc list.
  - The update-plan features-readme relocation reads the install set.
  - `model-config.ts` stays, with a "why kept" line.
- **Tests:**
  - The harness seals served trees at serve time (`upstream.seal`).
  - `legacyInstall('flat' | 'pre7')` seeds old installs.
  - `sealRepo` seals lib-test clones.
  - Refusal tests cover fetchRepo (release + main), readUpstreamManifest, init (default + `--ref main` + dry-run JSON), update (default, `--ref latest`, `--ref main`), status and add.
  - Old flat / pre-7.0 installs updating to the latest release are covered in update.test.ts ("a layout move", the root-footprint migration block).
- **Docs:** CHANGELOG, CLAUDE.md, architecture/init/update/status/add/README/getting-started/contributing. `THREAT-MODEL.md` changes go through the scratchpad `patch-C83.py`.

## Floor

GREEN: `format:check && lint && lint:md && typecheck && vitest` (3552 passed, 1 skipped). Coverage under CI=1: 98.44 / 95.59 / 99.09 / 98.92.

## Decisions surfaced while building

- **Existing behaviour, now visible.** After a flat → pharn move, the next run retires the flat tree's root `THREAT-MODEL.md`/`LIMITS.md` through the root-footprint migration. The old pre-7 fixtures hid this.
  - Documented in update.md and the CHANGELOG.
  - Asserted in "flat → pharn/ at the same skills version …", where the third run is up to date.
- **Write order.** Install writes now land in manifest path order (`.claude/` before `pharn/`). Two partial-failure tests moved their obstacle.
