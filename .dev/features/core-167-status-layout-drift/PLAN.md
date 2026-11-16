# PLAN — core-167-status-layout-drift (Linear CORE-167, C2.5)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: when the fetched clone's layout differs from the install's recorded layout, `pharn status` no longer runs the file-drift comparison (it compared the wrong paths: capability dirs silently dropped out, pharn-oss's dev `.dev/floor` was compared as the product floor); the LAYOUT note explains why and names the command that moves the install; `--json` reports `drift: null` with `layout.recorded`/`layout.upstream` set; `--strict` exits 1 on the mismatch. Matching layouts: byte-identical output.
- base: origin/main @ 688a838 (0.19.0 released). Branch `przemek/core-167-c25-status-does-not-report-drift-against-a`. No version bump.
- layer(s): CLI source (`src/commands/status.ts`, `src/lib/status-report.ts`), tests, user docs (`docs/commands/status.md`, which also holds the `status --json` reference table), `CLAUDE.md`, `CHANGELOG.md`. No trusted (hook-protected) doc changes.
- constitution_refs: [P0, P1, P3, P4, P5, P6]

## Discovery (live state at 688a838)

1. Text path `src/commands/status.ts:285-332` and JSON path `:154-190` call `diffInstalledCapabilities({ layout: configLayout(config) })` against a clone whose layout is `detectLayout(repo.dir)` — never compared. `statusOrphans` (`:507-508`) already returns `null` on exactly this mismatch.
2. `printLayoutNote` (`:530-540`) says "`pharn update` moves the install to it. Until then the drift check compares your files at the recorded layout's paths." — the first half is false at the same skills version: `update`'s early return (`src/commands/update.ts:409`, "Already up to date (skills vX).") never checks layout, and `findMissingInstalled` checks at the recorded layout, where the files still are.
3. `strictFails` (`src/lib/status-report.ts:142-162`) has no layout input; its comment says a layout mismatch is NOT one. `StatusReport.layout` already carries `{recorded, upstream}` (`upstream: null` under `--no-drift`).
4. `detectLayout` is not mocked in `tests/status.test.ts` / `tests/status-json.test.ts` (fake clone dirs; a nonexistent `/repo` reads `flat`). So existing cases with `config({ layout: 'pharn' })` + a `/repo` clone are mismatches today and will need a pharn-layout fake clone (e.g. `tests/status.test.ts:573` "passes the recorded layout: pharn through to the capability diff").
5. Hook wiring (`diffHookWiring`) reads `.claude/settings*.json` — layout-independent — so HOOKS stays. Unknown-capabilities warning reads the clone index — layout-independent — stays. `absentUpstream` lives inside the `drift` block (text: the DRIFT note's NOT SHIPPED section; JSON: `drift.absentUpstream`), so it goes with the drift section.

## Design

**`src/lib/status-report.ts`**

- `StatusReportInput.drift` becomes `{ hooks; unknown; orphans; upstreamLayout } & ({ diff: InstallDiff; absentUpstream: readonly AbsentSurface[] } | { diff: null; absentUpstream: null })` — a discriminated union, so a caller cannot pass one without the other; existing callers/tests passing both still type-check.
- New exported pure predicate `layoutMismatch(recorded: Layout, upstream: Layout | null): boolean` (`upstream !== null && recorded !== upstream`) — the ONE comparison the text path, JSON path and report use.
- `strictFails` gains `layoutMismatch?: boolean` → fails when true. Comment updated (the mismatch IS now an input).
- `buildStatusReport`: `drift` is `null` when `drift === null` OR `drift.diff === null` OR `layoutMismatch(configLayout(config), drift.upstreamLayout)` (so the report can never carry a diff taken across layouts, whatever a caller passes); `layout` unchanged; `strict.failed` passes `layoutMismatch`. `hooks`/`unknownCapabilities`/`orphans` unchanged (orphans is already null on a mismatch). Field comments on `layout` and `drift` updated (`drift: null` = `--no-drift` OR layout mismatch).

**`src/commands/status.ts`** (layout/drift code paths only — CORE-163 edits the MISSING/SKIPPED wording beside it)

- Both drift paths compute `upstreamLayout = detectLayout(repo.dir)` first, then `mismatch = layoutMismatch(configLayout(config), upstreamLayout)`. On a mismatch they do NOT call `diffInstalledCapabilities` or `absentInstallSurfaces` (JSON: passes `diff: null, absentUpstream: null`).
- Text, mismatch: `printLayoutNote` then NO DRIFT note; ORPHANED (null → nothing) and HOOKS as today; `--strict` → `strictFails({ outdated, hooks, layoutMismatch: true })` → exit 1. Matching layouts: the exact current sequence (LAYOUT note prints nothing; DRIFT note; same strict inputs).
- `printLayoutNote` wording (only printed on a mismatch):
  - `Recorded at the flat layout; pharn-oss now ships the pharn layout.`
  - `Drift is not checked across layouts — your files are not where this source puts them.`
  - `Run \`pharn update\` to move the install; drift is checked after the move.`
  - `If it answers "Already up to date", \`pharn update --force\` moves it, but also overwrites files you edited (backed up to pharn/.backup/ first).`
  - `\`pharn status --strict\` fails until the install is moved.`
  Every command named either resolves the finding without overwriting edits (plain `update` when it plans: outdated, or a re-open) or says it overwrites (`--force`). No re-open of `update`'s early return (that is C5.3).

## Files

- `src/lib/status-report.ts` — input union, `layoutMismatch`, `strictFails` layout input, `drift: null` on mismatch — CLI lib
- `src/commands/status.ts` — skip the file diff + absent-surface scan on a mismatch (text + JSON), new LAYOUT wording, strict input — CLI command
- `tests/status-report.test.ts` — mismatch → `drift: null`, layout filled, strict fails; `strictFails({layoutMismatch})`; `layoutMismatch` truth table; invert the "a layout mismatch alone does not" assertion — tests
- `tests/status.test.ts` — flat config + pharn clone: no DRIFT note, diff/absent scan not called, LAYOUT note text (names `pharn update`, `--force` + overwrite caveat, drift checked after), `--strict` exits 1; invert `:1303` ("--strict stays 0"); rework `:1289` (no longer diffs at the recorded layout on a mismatch) and `:573` (pharn config needs a pharn-layout fake clone); matching layouts unchanged — tests
- `tests/status-json.test.ts` — flat config + pharn clone: `drift: null`, `layout: {recorded:'flat', upstream:'pharn'}`, hooks still reported, `--strict` → exitCode 1 and `strict.failed: true`; invert "a mismatch alone leaves the code 0"; matching layouts unchanged — tests
- `docs/commands/status.md` — Layout step (now a `--strict` input, no DRIFT section on a mismatch, the commands), Drift step, the "mid-way through a layout migration" paragraph, Exit code list, JSON table rows `layout` and `drift` (`null` also on a mismatch) — user docs
- `CLAUDE.md` — the `status` paragraph sentences about LAYOUT (not a --strict input) and `drift`/`null` — repo doc
- `CHANGELOG.md` — `## [Unreleased]` → `### Changed` entry — repo doc
- `.dev/features/core-167-status-layout-drift/*` — stage artifacts

## Contracts satisfied

- CLAUDE.md `status` paragraph: "`strictFails` is the ONE predicate both modes use" — the layout input goes through it in both modes; `layoutMismatch` is the one comparison.
- CLAUDE.md "`status --json` … `schemaVersion: 1`": no key added or removed; `drift` was already nullable, so the change is a new meaning for an existing `null` (documented), not a shape change.
- CLAUDE.md "`status` is strictly read-only": unchanged (no write path touched).

## Evals to write (P1) — tests first; new/inverted ones must FAIL before the build

- report: flat config, `upstreamLayout: 'pharn'`, diff given → `drift === null`, `layout = {flat, pharn}`, `strict.failed === true` under `strict` (FAILS today: drift filled, failed false).
- report: `diff: null, absentUpstream: null` with matching layouts → `drift === null`; matching layouts with a diff → unchanged object (guard).
- `strictFails({ outdated: false, layoutMismatch: true })` → true; `layoutMismatch('flat','flat'|null)` → false, `('flat','pharn')` → true.
- text: flat config + pharn fake clone → no `DRIFT` note, `diffInstalledCapabilities` and `absentInstallSurfaces` not called, LAYOUT note contains `pharn update`, `--force`, `overwrites`, `drift is checked after`; `runStatus({strict:true})` rejects `ProcessExit(1)` (FAILS today).
- text: matching layouts → DRIFT note, no LAYOUT note, `--strict` 0 on clean (guard).
- json: flat config + pharn fake clone → `drift: null`, `layout {flat, pharn}`, `hooks` non-null, `--strict` exitCode 1 (FAILS today).
- json: matching layouts → `drift` object as before (guard).

## Guarantee audit (P0)

- "on a layout mismatch status never reports a file diff" → floor-ish: a deterministic enum equality (`Layout` ∈ {flat, pharn}) gates the diff call in the command AND the report builder nulls `drift` on the same predicate — tested in both layers.
- "`--strict` fails on a layout mismatch" → deterministic: `strictFails` boolean input from the same equality; tested in text, JSON and the pure predicate.
- "the LAYOUT note names a command that moves the install" → advisory (prose). Its accuracy rests on `update` recording the clone's layout (CLAUDE.md update paragraph) — not re-tested here; the note says plain `update` may answer "Already up to date" and names `--force` with its overwrite caveat, so it makes no unconditional claim.

## Trust audit (P2)

- No new untrusted input. `detectLayout` reads one `existsSync` in the clone (`safeJoin`-guarded); the layout values printed are the closed enum, never clone text.

## Determinism audit (P5)

- The only new branch is `recorded !== upstream` over a two-member enum — a membership test.

## Open questions (HALT)

- None blocking. Choice made (flag for GATE 1): on a mismatch the `NOT SHIPPED UPSTREAM` scan is skipped with the rest of the drift section (it lives in `drift.absentUpstream`; the strict exit already fails on the mismatch; it is reported after the move). Alternative: keep scanning it and print it under the LAYOUT note — rejected as it would need a new JSON key outside `drift`.
