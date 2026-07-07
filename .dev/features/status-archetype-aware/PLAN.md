# PLAN — status-archetype-aware (slice 2/5: archetype-aware `pharn status`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Make `pharn status` work on an archetype install — version via `SKILLS_VERSION` (not the absent manifest) and byte-level **capability drift** against `@main` — instead of crashing.
- layer(s): product (`src/`).
- constitution_refs: [P2, P3, P4, P5, P6, P7]

## Files

- `src/lib/skills-version.ts` — **NEW** — `readSkillsVersion(repoDir)` (read+validate the clone's
  `SKILLS_VERSION`, `VERSION_RE`, P2) + `fetchRemoteSkillsVersion()` (lightweight raw fetch with the 3
  guards: `redirect:'error'` + 8s timeout + 256KB cap, mirroring `fetchRemoteManifest`). The single home
  for reading the version pharn-oss ships in place of a manifest. Layer product.
- `src/lib/diff.ts` — **EDIT** — add `diffInstalledCapabilities({repoDir, projectRoot, capabilities})`:
  mirror `install-capabilities.ts`'s expected file set (selected capability dirs + the fixed product
  surfaces: non-dev `pharn-*` commands, non-test hooks, trusted docs, `pharn-contracts/`, non-test
  `.dev/floor/`) and `sha256`-compare against the project. **Excludes `.claude/settings.json`** (user-owned
  — preserved at install). Reuses `walkFiles`/`hash`/`toPosix`/`safeJoin`. Parallels the existing
  `diffInstalled`↔`installModule` mirror (cited, P4).
- `src/commands/status.ts` — **EDIT** — branch on `isArchetypeConfig`: `--no-drift` → `fetchRemoteSkillsVersion`
  version only; default → `fetchRepo` clone → `readSkillsVersion` (version) + `diffInstalledCapabilities`
  (drift), reusing the existing `printDriftSection` + cleanup-before-exit ordering. Legacy path unchanged.
- `src/steps/install-archetype.ts` — **EDIT (DRY)** — import `readSkillsVersion` from `lib/skills-version.js`;
  drop the private copy (avoids a copy-paste-drift with the new lib).
- `tests/skills-version.test.ts` — **NEW** — `readSkillsVersion` reads/validates/reject-malformed (fake repo).
- `tests/diff.test.ts` — **EDIT** — `diffInstalledCapabilities`: modified/missing/ok over a fake clone +
  project; `settings.json` excluded; dev-only never expected.
- `tests/status.test.ts` — **EDIT** — archetype config → version via skills-version (no manifest fetch),
  drift via capability diff; legacy path unchanged (regression guard).

## Contracts satisfied

- **`ARCHITECTURE.md §5`** — status is the read-only audit over an archetype install's recorded
  capabilities + skillsVersion. Cited (P4).

## Evals to write (P1)

- `readSkillsVersion` `1.0.0\n` ⇒ `1.0.0`; missing ⇒ throws; non-semver ⇒ throws (P2).
- `diffInstalledCapabilities` ⇒ a modified capability file ∈ `modified`; a missing one ∈ `missing`;
  identical ⇒ `okCount`; `settings.json` never appears; a `pharn-dev-*` command never expected.
- `runStatus` archetype `--no-drift` ⇒ version note, no manifest fetch; default ⇒ drift note; no crash.

## Guarantee audit (P0)

- **"status no longer crashes on an archetype install"** → floor: `isArchetypeConfig` membership routes
  before the manifest path + vitest.
- **"drift is exact"** → floor: `sha256` byte-compare (`ARCHITECTURE.md §2` content-hash) over the
  install-mirrored expected set + vitest.
- **"version currency"** → floor: string compare of validated `SKILLS_VERSION` values.
- Remote fetch guarded → floor: `redirect:'error'` + timeout + body-cap (mirrors `fetchRemoteManifest`).

## Trust audit (P2)

`SKILLS_VERSION` (clone + remote) is untrusted → trimmed + `VERSION_RE`-validated before use/persist.
Drift reads only file bytes for `sha256` (never interprets content) and guards every read with `safeJoin`.

## Open questions (RESOLVED — pre-authorized "build all remaining slices")

- Slice 2 scope = version + capability drift for `status`; `settings.json` excluded from drift (user-owned).
