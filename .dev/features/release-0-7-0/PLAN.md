# PLAN — release 0.7.0 prep

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Bump `package.json` / `package-lock.json` from `0.6.0` to `0.7.0`, fold `CHANGELOG.md`'s
  `[Unreleased]` section into `## [0.7.0] — 2026-09-26`, restore an empty `[Unreleased]` scaffold,
  and update the link definitions — the release half of roadmap Phase 2.0, after #231.
- layer(s): repo-meta — release documentation + package metadata. No `src/**`, no `tests/**`, no
  `pharn-contracts` schema, no layer of the `ARCHITECTURE.md §4` tree (P7: the field is honest, not
  forced).
- constitution_refs: [P4, P5, P7]

## Context (P6 — verified this run, on `origin/main` @ `9bd4e30`, #231 merged)

- `package.json` `version`: **`0.6.0`**; `package-lock.json` carries it twice (L3, L9).
- `CHANGELOG.md` `## [Unreleased]` spans **L8–L27** (the #231 entries: `### Changed`, `### Fixed`);
  `## [0.6.0] — 2026-09-25` at L28.
- Link definitions: L1416 `[Unreleased]` → `compare/v0.6.0...HEAD`; L1417 `[0.6.0]`; no `[0.7.0]:`.
- `git tag -l 'v0.7*'` → none; `gh release list` → latest `v0.6.0`; `npm view @pharn-dev/pharn version`
  → `0.6.0`.
- Release flow (`CLAUDE.md` "Releasing", `docs/RELEASING.md`): bump + fold → merge to `main` → GitHub
  Release `vX.Y.Z` → `publish.yml` publishes via OIDC. This increment is the bump + fold only. The
  Release (`gh release create v0.7.0 --target main`) and the publish watch follow its merge; the
  maintainer authorized both on 2026-09-25.
- Version: **0.7.0** as the maintainer specified (a minor bump — #231 changes what `init` writes and
  what `update` does to an existing config). Date: **2026-09-26**, today.

## Files

- `package.json` — `"version": "0.6.0"` → `"0.7.0"` — layer repo-meta
- `package-lock.json` — both `"version"` fields `"0.6.0"` → `"0.7.0"` — layer repo-meta
- `CHANGELOG.md` — `## [Unreleased]` → a new empty `## [Unreleased]` + `## [0.7.0] — 2026-09-26`;
  `[Unreleased]:` → `compare/v0.7.0...HEAD`; insert `[0.7.0]: …compare/v0.6.0...v0.7.0` — layer
  repo-meta

The fold is mechanical (P5): one heading inserted, two link lines touched, no entry body changed or
reordered.

## Contracts satisfied

None — no `pharn-contracts` schema is touched. `docs/RELEASING.md` steps 1–2, executed (cited, P4).

## Evals to write (P1)

None, stated rather than skipped: the increment changes release metadata, not behavior. A test
pinning `version === "0.7.0"` would pin metadata and break on the next release while protecting
nothing. The structure is still gated: `lint:md` (a dangling link reference fails it), and
`publish.yml`'s own guard refuses a tag that is not exactly `v` + `package.json` `version`.

## Guarantee audit (P0)

- **The version is bumped in both files** → advisory (read at the PR), backstopped at release time by
  `publish.yml`'s floor: the tag must equal `package.json` `version` or the run fails before `npm ci`.
- **The fold is lossless** → advisory (the diff is reviewed; no checker reads changelog content).
- **`CHANGELOG.md` stays lint-clean** → floor: the required `Markdown lint` CI gate.
- **`npm run check` stays green** → floor: the six required CI gates.

## Trust audit (P2)

No untrusted input: three in-repo, human-authored files. No fetch, no clone.

## Open questions (HALT)

None. The version was given by the maintainer; the date is today's; the fold rule is fixed above.
