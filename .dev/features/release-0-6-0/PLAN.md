# PLAN — release 0.6.0 prep

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Bump `package.json` version from `0.5.0` to `0.6.0`, fold `CHANGELOG.md`'s
  `[Unreleased]` section (L8–L68) into `## [0.6.0] — 2026-09-25`, restore an empty
  `[Unreleased]` scaffold, and update the link definitions.
- layer(s): repo-meta — release documentation + package metadata. This increment touches **no**
  layer of the `ARCHITECTURE.md §4` capability tree, no `src/**`, no `tests/**`, and no
  `pharn-contracts` schema. Stated so the layer field is honest rather than forced (P7).
- constitution_refs: [P4, P5, P7]

## Context (P6 — grounded in live state, not memory)

Verified this run:

- `package.json` `version`: **`0.5.0`**
- `CHANGELOG.md` `## [Unreleased]` span: **L8–L68** (60 lines; `## [0.5.0] - 2026-09-10` at L69)
- Link definitions (L1394–L1401): `[Unreleased]` points at `compare/v0.5.0...HEAD`; no `[0.6.0]:`
  definition exists.
- `markdownlint-cli2 CHANGELOG.md` → **0 issues** — the file is already lint-clean; no style fixes
  are needed alongside the fold.
- `git tag` → no `v0.6.0` tag exists; the tag is created by the human when cutting the GitHub Release
  (out of scope for this increment).

The release flow per `docs/RELEASING.md`: bump `version` + fold changelog → merge to `main` → human
cuts GitHub Release tagged `vX.Y.Z`. Steps 3–4 are the human's; this increment is steps 1–2 only.

## Files

- `package.json` — change `"version": "0.5.0"` → `"0.6.0"` — layer repo-meta
- `package-lock.json` — update both `"version"` fields from `"0.5.0"` to `"0.6.0"` — layer repo-meta
- `CHANGELOG.md` — rename `## [Unreleased]` → `## [0.6.0] — 2026-09-25`, insert a new empty
  `[Unreleased]` scaffold above it, and update link definitions — layer repo-meta

The fold is a **pure mechanical transform** (P5):

1. Replace the `## [Unreleased]` heading at L8 with `## [Unreleased]\n\n## [0.6.0] — 2026-09-25`
   (insert empty scaffold; rename the old heading).
2. At the link definitions block:
   - Replace `[Unreleased]: …compare/v0.5.0...HEAD` → `compare/v0.6.0...HEAD`
   - Insert `[0.6.0]: https://github.com/pharn-dev/pharn-cli/compare/v0.5.0...v0.6.0`
     immediately below it.

No entry body is touched; no lines are reordered; the section content is preserved verbatim.

## Contracts satisfied

None — this increment touches no `pharn-contracts` schema. `docs/RELEASING.md` prescribes exactly
this fold (step 2); this increment executes those steps. Cite, don't restate (P4).

## Evals to write (P1)

None — there is no behavior change in `src/**` or `tests/**`. The transform is mechanical (a version
string + two heading/link edits); an eval would test the script, not the product. The existing
`tests/ci-workflow.test.ts` and the `lint:md` gate will cover the structural correctness of the
result (the lint gate rejects a dangling reference; the format check catches JSON drift).

Stated explicitly so P1 is not silently waived: P1 requires a test for every behavior. This increment
has **no** product behavior — it is release metadata. A test asserting `package.json` `version` equals
`"0.6.0"` would be pinning metadata, not testing behavior, and would break on the next release
without protecting anything. Absent, not forgotten.

## Guarantee audit (P0)

- **`package.json` version is bumped** → advisory (the file is written by this increment and
  read by the human before the PR merges; no floor mechanism enforces the value is "correct").
- **`CHANGELOG.md` fold is lossless** → advisory. The mechanical rule (above) is deterministic and
  stated; a human reviews the diff at the PR gate. No floor checker verifies changelog content.
- **`markdownlint-cli2 CHANGELOG.md` stays at 0 issues** → floor: `npm run lint:md` is a required
  CI gate (`.github/workflows/ci.yml` `Markdown lint` job). A dangling reference or duplicate heading
  introduced by the fold would fail that gate before merge.
- **`npm run check` stays green** → floor: the CI gates (format:check, lint, lint:md, typecheck,
  test, build) are all required status checks on `main`.

## Trust audit (P2)

No untrusted artifact is ingested. All files being edited (`package.json`, `package-lock.json`,
`CHANGELOG.md`) are in-repo, human-authored content. No fetch, no clone, no remote read.

## Open questions (HALT)

None. The version number (`0.6.0`) was given by the human in the task description. The date
(`2026-09-25`) is today's date. The fold rule is unambiguous given the live state verified above.
