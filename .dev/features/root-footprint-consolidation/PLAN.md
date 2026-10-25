# PLAN — root-footprint-consolidation

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md @ 4b6a42a)
- increment: on a `pharn`-layout install, move PHARN's non-JSON root footprint under `pharn/` — trusted docs
  probed at `pharn/<doc>` with a root fallback and an explicit, record-proven delete of the old root copies;
  lock at `pharn/.lock`; backups at `pharn/.backup/`; a SKILLS ≥ 7-gated move of `memory-bank/` and
  `pharn.spec-template.md`; a `rootMigration` key in `update --dry-run --json`; release 0.14.0.
- layer(s): CLI library (`src/lib`), commands (`src/commands`, `src/steps`), tests, user docs.
- constitution_refs: [P0, P1, P2, P4, P5, P6, P7]
- base: `origin/main` @ `4b6a42a` (fetched 2026-10-25; branch
  `claude/pharn-root-footprint-consolidation-907758` is at it, clean).

## Discovery (P6) — what the live tree says

Every path:line in the brief was re-checked against `4b6a42a`. All hold, except as recorded under
**Correcting the record**. Two facts the brief did not state:

- pharn-oss `main` has moved to `30968218` (SKILLS_VERSION **6.74.0**, MIN_CLI 0.5.0) and still keeps
  `THREAT-MODEL.md` / `LIMITS.md` at its root. No checkout with the 7.0.0 layout exists locally, so the
  real-world check uses a locally built 7.0.0 tree (see **Real-world check**).
- In this repo `ARCHITECTURE.md`, `THREAT-MODEL.md` and `LIMITS.md` are denied to Write/Edit by
  `.claude/hooks/protect-trusted-paths.cjs:58` (fix #2). Editing `ARCHITECTURE.md` would also change the
  hash pinned above, so `/pharn-dev-build` would refuse. → Q4.

## Design

### A. Trusted-doc probe (`lib/constants.ts`, `lib/layout.ts`, `lib/install-manifest.ts`, `lib/install-capabilities.ts`)

- `PHARN_TRUSTED_DOCS` becomes `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`, `pharn/THREAT-MODEL.md`,
  `pharn/LIMITS.md`; its comment is rewritten (root is a pre-7.0 window, not permanent).
- New `PHARN_ROOT_FALLBACK_DOCS` map (`pharn/THREAT-MODEL.md` → `THREAT-MODEL.md`, `pharn/LIMITS.md` →
  `LIMITS.md`), commented as the probe fallback, removable once every supported clone ships them under `pharn/`.
- New `resolveTrustedDocs(repoDir, layout): string[]` beside `resolveFeaturesReadme`, same shape: a pharn-layout
  doc with a fallback resolves to `pharn/<doc>` when it exists in the clone, else to the root path. Existence
  only, no content read. Flat → unchanged.
- The two readers of `paths.docs` that hold `repoDir` (`collectInstallManifest`, `installCapabilities`' doc
  loop) use it. A doc absent at both → `absentInstallSurfaces` names the LAYOUT path, as `features-readme` does.
- `layoutPaths` stays pure; `lib/orphans.ts` `SURFACE_FILES` keeps root `THREAT-MODEL.md`/`LIMITS.md` through
  the FLAT list (`BOTH_LAYOUTS`) — pinned by a test.

### B. Root-doc migration (new `lib/root-migration.ts`; one axis: the old root footprint of a pharn install)

- `planRootDocs(projectRoot, repoDir, layout, baselineRecords)` → `{rel, action}[]` for exactly
  `THREAT-MODEL.md` and `LIMITS.md`. Applies only when `layout === 'pharn'` AND `resolveTrustedDocs` resolved
  that doc to `pharn/<doc>`. Classified by calling `planUninstall(projectRoot, {[rel]: record})` (reuse, no
  fork): `delete` → `delete`; `edited` → `keep-edited`; `absent` → `absent`; `unverifiable` (symlinked leaf,
  non-file, unreadable) → `unverifiable`. No usable record → present = `unverifiable` (kept), absent = `absent`.
- Execution, inside the lock, after `applyWrites`, before records: a `delete` runs only if the new copy
  LANDED (`pharn/<doc>` is a regular file whose `contentHash` equals the clone's), then `unlinkSync`. No backup:
  record-equal bytes are provably pharn's (uninstall's rule).
- Records: the root keys leave the records write (`orphanRecords` / `frozenRecords` filtered) — `keep-edited`
  per Q3. The new `pharn/` keys come from the manifest as usual.
- `keep-edited` is reported with the `ORPHANED` wording.

### C. Lock → `pharn/.lock` (`lib/project-lock.ts`)

- `LOCK_FILE = 'pharn/.lock'`, `CORPSE_RE = /^\.lock\.[0-9]+\.[0-9a-f]{8}$/`, swept in `pharn/`. Internals take
  a `{dir, name, corpseRe}` site so one rename→verify→create path serves both sites.
- `withProjectLock` first ensures `pharn/`: a symlinked `pharn` (`findSymlinkComponent`) or a non-directory →
  `ProjectLockedError`; absent → `mkdirSync` (non-recursive), remembered. On release a `pharn/` this call
  CREATED is `rmdirSync`'d (ENOTEMPTY/ENOENT ignored), so a refused or no-op run leaves no empty dir.
- Legacy compat (one release, commented as such): after taking `pharn/.lock`, inspect root `.pharn.lock`:
  absent or a directory → ignore; live by the existing `isStale` rules → release ours, refuse with the
  0.13.0 wording naming `.pharn.lock`; stale → rename to a `.pharn.lock.<pid>.<hex>` corpse, byte-verify, unlink
  (never create) and sweep root corpses with the old pattern.
- `uninstall`: after `withProjectLock` returns, one `rmdirSync('pharn')`, ENOTEMPTY/ENOENT = success; if `pharn/`
  survives, one line naming what is left and that it may be deleted. (Uninstall always backs up
  `pharn.config.json`, so after a real uninstall `pharn/.backup/` exists and that line always prints.)

### D. Backups → `pharn/.backup/` (`lib/backup.ts`)

- `BACKUP_DIR = 'pharn/.backup'`; the symlink refusal walks both components; a non-directory `pharn` refuses;
  collision suffixing unchanged; the `.gitignore` advice names `pharn/.backup/`. Every message built from
  `BACKUP_DIR` follows; hard-coded `.pharn-backup` in help (`index.ts:108`) and ~12 comments is updated.
- Isolation tests for `pharn/.backup/<ts>/pharn/pharn-review/x/…`: not installed (status/diff), not an
  orphan (`isInstallRootPath` false), not drift (`dest-drift`), not an unknown capability, never in
  `planUninstall` (no record; a planted record is `outside`).

### E. User-data moves (SKILLS ≥ 7 only; `lib/root-migration.ts`)

Gate: `layout === 'pharn'` AND clone `SKILLS_VERSION` major ≥ 7 (`VERSION_RE`-parsed; unparseable → inert).
Below the gate nothing is read and the result is `null`.

- `memory-bank/` → `pharn/memory-bank/`, `pharn.spec-template.md` → `pharn/spec-template.md`: source absent →
  `absent`; source, a source parent or a destination parent is a symlink → `refused-symlink`; both exist →
  `conflict`; else `move`.
- Execution inside the lock, LAST (after the config write): the source's regular files join the run's ONE
  `createBackup`, then `renameSync` (EXDEV → refuse, nothing moved). Prints what moved. `conflict` /
  `refused-symlink` move nothing, warn, set `process.exitCode = 1`; the rest of the run stands.
- `.pharn/`: never moved or deleted. A real directory holding anything but `ci.yml` → `scratchNotice: true`
  - one line (scratch now lives in `pharn/.run/`; old contents other than `ci.yml` may be deleted).
- `.gitignore`: read-only, bounded. A line equal (after trim, optional leading `/`, optional trailing `/` or
  `*`) to `.pharn`, `.pharn-backup`, `.pharn.lock` → hint `pharn/.run/`, `pharn/.backup/`, `pharn/.lock*`.

### F. Reports

- `UpdatePlanReport.rootMigration` = `{docs, moves, scratchNotice, gitignoreHints}` | null; projected field by
  field into `plan.rootMigration` (Q2); key set and enums pinned; a `ROOT MIGRATION` note in
  `update-render.ts` (both tenses). Re-run `init` (real + `--dry-run` text) prints the same note;
  `init --dry-run --json` is not extended (P7).
- Docs (§B) migrate whenever the clone ships `pharn/<doc>`; moves (§E) need ≥ 7. `rootMigration` is non-null
  when either applies.

### G. Version + docs

`npm version --no-git-tag-version 0.14.0`; CHANGELOG `[0.14.0] — <date>` + compare links; `README.md`,
`CLAUDE.md`, `docs/**` (troubleshooting lock/backup, the JSON report reference for `rootMigration`,
uninstall's leftover line, the 0.13.0/0.14.0 lock residual); historical entries untouched;
`ARCHITECTURE.md`/`LIMITS.md`/`THREAT-MODEL.md` per Q4.

## Files

- `src/lib/constants.ts` — pharn docs under `pharn/`, fallback map, rewritten comment — lib
- `src/lib/layout.ts` — `resolveTrustedDocs` — lib
- `src/lib/install-manifest.ts`, `src/lib/install-capabilities.ts` — use the probe — lib
- `src/lib/root-migration.ts` (new) — doc plan/exec, moves, scratch notice, gitignore hints — lib
- `src/lib/project-lock.ts` — `pharn/.lock`, `pharn/` guard, legacy root lock — lib
- `src/lib/backup.ts` — `pharn/.backup` — lib
- `src/lib/update-plan.ts`, `src/lib/update-report.ts`, `src/lib/update-render.ts` — plan/report/render — lib
- `src/commands/update.ts` — execute inside the lock; exit code on conflict — command
- `src/steps/install-archetype.ts`, `src/lib/init-plan.ts`, `src/commands/init.ts` — re-run init — step/command
- `src/commands/uninstall.ts` — final `rmdir pharn`, leftover line — command
- `src/index.ts`, `src/lib/fatal-signal.ts` + comment-only touches — text
- `tests/root-migration.test.ts` (new) and updates to the layout, install-manifest, install-capabilities,
  project-lock(-commands), backup, uninstall, update(-report/-dry-run), orphans, init and
  commands-integration suites, plus every test hard-coding `.pharn-backup` / `.pharn.lock` — tests
- `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/**` — release/docs

### Files added at re-approval (2026-10-25, after the regress scope STOP)

The build touched these; the first `## Files` list named them only in prose. Each is a mechanical
follow-through of the approved design (old path names in comments and messages, or tests that
hard-code the moved paths). Stage artifacts under `.dev/features/root-footprint-consolidation/` and
the `.pharn/` scratch are deliberately NOT listed: they are not product writes.

- `src/commands/add.ts` — `.pharn-backup` / `.pharn.lock` renamed in comments or messages — text
- `src/commands/remove.ts` — `.pharn-backup` / `.pharn.lock` renamed in comments or messages — text
- `src/commands/status.ts` — `.pharn-backup` / `.pharn.lock` renamed in comments or messages — text
- `src/lib/bounded-read.ts` — `.pharn-backup` / `.pharn.lock` renamed in comments or messages — text
- `src/lib/capability-removal.ts` — `.pharn-backup` / `.pharn.lock` renamed in comments or messages — text
- `src/lib/dest-drift.ts` — `.pharn-backup` / `.pharn.lock` renamed in comments or messages — text
- `src/lib/removal-backup.ts` — `.pharn-backup` / `.pharn.lock` renamed in comments or messages — text
- `tests/add.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/backup.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/commands-integration.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/dest-drift.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/index.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/init-archetype.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/init-report.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/init-yes.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/install-manifest.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/layout.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/overwrite-check.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/project-lock-break.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/project-lock-commands.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/project-lock.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/release-consistency.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/remove.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/status.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/uninstall.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/update-report.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/update.test.ts` — test update for the moved lock/backup/doc paths — tests
- `tests/write-targets.test.ts` — test update for the moved lock/backup/doc paths — tests

## Contracts satisfied

- `pharn.config.json` / `pharn.records.json`: no new keys; records drop two root keys (P7).
- `update --dry-run --json` `schemaVersion: 1`: one additive key, `plan.rootMigration`.

## Evals to write (P1)

- probe: old clone → root paths; new clone → `pharn/` paths; neither → `absentUpstream` names `pharn/<doc>`.
- migration delete: record-equal → deleted + key dropped; edited → kept + reported; symlinked leaf → kept;
  new copy did not land → nothing deleted; flat → inert.
- `status --strict` exits 0 with no drift and no orphans right after a migrating `update` (integration suite).
- `isInstallRootPath('THREAT-MODEL.md')` / `('LIMITS.md')` stay true.
- fresh `init` creates `pharn/` for the lock; `pharn` symlink / regular file → refusal, nothing written; a
  flat-layout run leaves no empty `pharn/`.
- uninstall leaves no empty `pharn/`; the leftover line prints when `pharn/.backup/` exists.
- stale root `.pharn.lock` (+ corpses) broken and swept; live root lock → refusal, ours released, nothing written.
- backup isolation: uninstall, status/diff, orphans, dest-drift, unknown-capabilities.
- moves × {memory-bank, spec template}: `move`, `conflict` (exit 1, rest kept), `refused-symlink` (source,
  parent, destination parent), `absent`.
- inert: clone 6.x → no moves, no reads of `memory-bank`/`.gitignore`/`.pharn`.
- `rootMigration` key set + action enums pinned; ≥ 90 % line coverage per touched file.

## Guarantee audit (P0)

- root doc deleted only when bytes equal a usable record → floor: content-hash via `planUninstall`.
- only root `THREAT-MODEL.md` / `LIMITS.md` can be deleted by the migration → floor: enum (fixed list; no
  record key becomes a delete path here).
- delete only after the new copy landed → floor: content-hash of `pharn/<doc>` vs the clone.
- no write through a symlinked `pharn/`, `pharn/.backup`, source or destination → floor:
  `findSymlinkComponent` + `safeJoin`.
- 0.14.0 writers serialize → floor: `O_EXCL` (unchanged).
- a live 0.13.0 root lock blocks a 0.14.0 writer → floor: the same staleness rules. **Residual (advisory):** a
  0.13.0 CLI does not see `pharn/.lock`, so an old CLI started during a new run is not blocked — documented.
- inert below SKILLS 7 → floor: integer compare on a `VERSION_RE`-validated string.
- user data never merged → floor: existence test on both paths.

## Trust audit (P2)

- clone `SKILLS_VERSION` → `VERSION_RE` before the compare; drives the gate only.
- clone doc existence → existence only, never content.
- project `.gitignore`, `.pharn/` listing, record keys → local text, matched against fixed literals, printed
  only through `escapeUnsafe`, never used as a path.

## Real-world check (after build)

In the scratchpad: copy `~/Projects/pharn-oss` @ `origin/main`, move `THREAT-MODEL.md` / `LIMITS.md` under
`pharn/`, set `SKILLS_VERSION` 7.0.0, and serve it as a codeload tarball (`codeloadArchive`, `fetch` stubbed)
from a tsx script kept outside both trees. Run `runUpdate --yes`, then `runStatus --strict`, on a scratch copy
of `~/Projects/phargus` (never the original; nothing pushed). Phargus's root `LIMITS.md`/`THREAT-MODEL.md` may be
its own docs — the records decide. Report the root listing afterwards.

## Correcting the record

- "`removeEmptyDirs` … runs inside `withProjectLock` (:538) … After `release()` (:496)": both numbers are
  `src/lib/project-lock.ts` lines; `uninstall.ts` (380 lines) calls `withProjectLock` at :128. The claim holds.
- "a stale root key would make `status` report the doc as missing": `status`'s drift never reads
  `pharn.records.json`; it reads the store only for orphans, which need a file on disk. The real effect is in
  `update`: `findMissingInstalled` reads the absent key as missing and re-opens the early return every run.
  To be pinned by a test; the fix is unchanged.
- pharn-oss is at `30968218` / 6.74.0, not `56e3989` / 6.73.2; no 7.0.0 layout exists yet.
- "uninstall leaving no empty `pharn/`": uninstall always writes `pharn/.backup/<ts>/pharn.config.json`, so a
  real uninstall always leaves a non-empty `pharn/`; tested as "never empty" + the leftover line.

## Resolved decisions (GATE 1, 2026-10-25 — human answers)

- Q1 → lock and backups live under `pharn/` for EVERY layout (one lock location). A run that creates
  `pharn/` only for the lock removes it again when it is still empty.
- Q2 → `plan.rootMigration` is always present; `null` when nothing applies (brief's shape; key-set test updated).
- Q3 → a `keep-edited` (and any kept) root doc KEEPS its record and stays a listed orphan; only `delete` and
  `absent` drop the key.
- Q4 → `ARCHITECTURE.md` / `LIMITS.md` / `THREAT-MODEL.md` changes are delivered as `*.updated.md` drafts for
  the human to apply; the originals are not edited (hook + spec-hash).
- Q5 → re-open `update`'s same-version early return when the install is pharn-layout at SKILLS major ≥ 7 and a
  root doc key in the usable records baseline is record-equal on disk or absent. An edited/kept doc is NOT a
  signal (its record survives by Q3), so the re-open is bounded: the opened run deletes or un-records it.
- Q6 → commit on this branch and open a PR; no merge, no release.

Plan approved as written: "Approve as written".

Re-approved 2026-10-25 by the human with the added `## Files` entries above ("Add the escaped paths … to
PLAN.md ## Files as a re-approved plan, then resume from regress").
