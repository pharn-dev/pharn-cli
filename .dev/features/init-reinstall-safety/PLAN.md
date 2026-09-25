# PLAN — init-reinstall-safety (a re-run init calls only YOUR edits "edited", backs up every one of them, refuses before it backs up, and computes its manifest once)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `init`'s install path, six findings.
  - **Edited = changed since pharn wrote it (F9).** A re-install calls a file "edited", and backs it
    up, only when `update` would have skipped it: by `pharn.records.json`, through update's own
    `decideFileAction`, not "differs from upstream".
  - **Scan the real source (F10).** The scan compares each destination with its real SOURCE, so
    `PHARN-LICENSE` / `pharn/LICENSE` ← `LICENSE` is covered.
  - **Refuse before the backup (F20).** Every pre-flight runs before the backup. A refused install
    creates no `.pharn-backup/`.
  - **Config and records paths (F19).** The type pre-flight also covers `pharn.config.json` and
    `pharn.records.json`.
  - **A live symlinked settings.json is fine (F8, init half).** init never writes an existing file
    there, so only a dangling link is refused.
  - **One manifest per run (F28).** It is computed once and passed down.
- layer(s): the CLI itself (`src/commands/init.ts`, `src/steps/overwrite-check.ts`,
  `src/steps/install-archetype.ts`, `src/lib/install-capabilities.ts`, `src/lib/dest-drift.ts`),
  docs
- constitution_refs: [P0, P1, P2, P5, P6]

## Discovery — verified this run (P6), code read on HEAD `abb274a`

- **F9.** `confirmWriteTargets` (`overwrite-check.ts:108-155`) labels `(edited)` the conflicts
  whose bytes differ from the NEW upstream (`scanDest`). It says "N of them differ from upstream
  (your edits)". `runInstallArchetype` (`install-archetype.ts:83-101`) backs up the same set. So
  after any upstream bump, untouched pharn files are called your edits and copied to
  `.pharn-backup/`. The review reproduced 14 of them with zero edits.
  - `update` already has the right table: `decideFileAction` (`update-decision.ts:73+`). A disk
    hash equal to the record is a clean upgrade with no backup. A modified, unrecorded or
    unverifiable file gets `backup: true` under `force`, which is init's position, since init always
    overwrites.
  - init already reads the previous config's `(skillsVersion, commit)` as `carry.previousStamp`
    (`install-archetype.ts:54`, `init.ts:345`).
- **F10.** `collectExpectedInstallPaths` returns `Map<dest, sourcePath>`, and LICENSE is its one
  entry where they differ (`install-manifest.ts:172-181`). Both scans pass only `.keys()`, and
  `scanDest` (`dest-drift.ts`) joins the same `rel` on both sides. The clone has no `PHARN-LICENSE`,
  so an edited copy is never compared, never backed up, and silently overwritten (reproduced by the
  review, both layouts).
- **F20.** The backup (`install-archetype.ts:83-101`) runs before `installCapabilities`. That
  function's pre-flights (`install-capabilities.ts:160-171`: symlinked destinations, type
  collisions) then refuse with "Nothing was written". The user sees "Backed up…", and each retry
  adds `.pharn-backup/<ts>-2`, `-3`.
- **F19.** `assertDestinationTypes` (`:384-412`) walks only manifest paths. A DIRECTORY at
  `pharn.records.json` passes every check, with no prompt (records are not a conflict), so every file
  is copied and then the records rename fails (EISDIR): no records and no config.
  `pharn.config.json/` does the same after the confirm.
- **F8, init half.** `assertDestinationsInProject` (`:342-375`) walks `.claude/settings.json` with
  `findSymlinkComponent`, so a symlinked LEAF refuses the whole install. Its advice ("replace it
  with a real directory") is also wrong for a file. Yet `settingsPreserved = existsSync(settingsTo)`
  (`:196`) follows a live link, so an existing settings file is never written. Only a DANGLING leaf
  would be written through (`cpSync` follows it and creates the target outside the project).
- **F28.** `collectExpectedInstallPaths` runs 5× per init:
  1. `conflictingWriteTargets` (`install-manifest.ts:228`);
  2. the backup scan (`install-archetype.ts:88`);
  3. `assertDestinationsInProject` (`install-capabilities.ts:349`);
  4. `assertDestinationTypes` (`:392`);
  5. the records keys (`install-archetype.ts:203`).

  Every call returns the same map: it depends only on the clone, the selection and the layout, and
  none of those change during a run. The re-scan HASHING (prompt time, then again before the copy)
  is deliberate, because it catches an edit made while the prompt was open, and it stays.

## Files

- `src/lib/dest-drift.ts` — layer CLI/lib. Changes:
  - The scan takes `(dest → source)` pairs instead of plain rels; `add` passes identity pairs, so
    its behaviour stays as it is (F10).
  - An optional records baseline: a differing file is "drifted" exactly when
    `decideFileAction({…, force: true}).backup` holds — update's own table (F9). With no baseline,
    today's rule (differs from upstream) stands.
  - Each drifted file carries its label: modified, unrecorded, or unverifiable.
- `src/lib/install-capabilities.ts` — layer CLI/lib. An exported pre-flight wraps the symlink and
  type walks over a precomputed manifest:
  - The type walk also covers `pharn.config.json` and `pharn.records.json`, which must never be a
    directory (F19).
  - The settings leaf is refused only when it is a DANGLING link (F8, GATE 1 answer 2 → a). A
    symlinked `.claude/` is still refused, and the message distinguishes a linked file from a
    linked directory.
  - The install function (`installCapabilities`) accepts the precomputed manifest and still runs
    the pre-flight itself.
- `src/lib/install-manifest.ts` — layer CLI/lib. `conflictingWriteTargets` accepts an optional
  precomputed manifest, so the prompt reuses init's one computation instead of building its own
  (F28; amendment during build — the alternative was duplicating its logic in the prompt).
- `src/steps/install-archetype.ts` — layer CLI/steps. Order becomes pre-flight → scan with the
  records baseline (`carry.previousStamp`) → backup → copy (F20). The records keys come from the
  same manifest (F28).
- `src/steps/overwrite-check.ts` — layer CLI/steps. The `(edited)` marker and the edits line come
  from the same classifier, worded per label: "changed since pharn wrote them"; "pharn has no
  record of them"; and, with no usable store, "differ from upstream — pharn has no record to tell
  your edits from upstream changes". A file equal to its record is a clean upgrade: never marked,
  never backed up (GATE 1 answer 1 → a).
- `src/commands/init.ts` — layer CLI/commands. Computes the manifest ONCE after resolution and
  passes it to the prompt and the install (F28).
- `tests/dest-drift.test.ts` — layer tests. A file equal to its record but not to upstream → not
  drifted (FAILS on base); an unrecorded differing file → drifted, unrecorded; a dest≠src pair →
  compared with its source (FAILS on base).
- `tests/init-archetype.test.ts` — layer tests. An upstream bump with no edits → no `(edited)`, no
  backup (FAILS on base); one real edit → exactly that file listed and backed up; an edited
  `PHARN-LICENSE` (flat) or `pharn/LICENSE` → marked and backed up (FAILS on base); an edited file
  plus a type collision → refused, no `.pharn-backup/`, no "Backed up" line (FAILS on base). The manifest builder runs
  once per init, counted through the REAL steps with a pass-through spy (FAILS on base with 5;
  grill finding 1).
- `tests/install-capabilities.test.ts` — layer tests. A directory at `pharn.records.json` or
  `pharn.config.json` → refused before the first write (FAILS on base); a live
  `.claude/settings.json` symlink → the install proceeds and the link target stays untouched (FAILS
  on base); a dangling one → refused, target never created (guard); a symlinked `.claude/` →
  still refused (guard).
- `tests/init.test.ts` — layer tests. Only the call-shape assertions change (the prompt and the
  install now receive the manifest). The once-per-init count lives in init-archetype.test.ts,
  where the real steps run (grill finding 1).
- `tests/overwrite-check.test.ts` — layer tests. The three wordings.
- `docs/commands/init.md` — layer docs. The re-install paragraph (what "edited" means, the
  no-records fallback, LICENSE included) and the refusals (config/records directories; the
  dangling `settings.json` link).
- `docs/troubleshooting.md` — layer docs. A symlinked `.claude/settings.json` is fine and a dangling
  one is refused; the directory-at-config/records refusal.
- `CLAUDE.md` — layer docs. The init step-5 passage (prompt / scan / backup order) and the
  `installCapabilities` DESTINATION-guard sentence (settings.json rule, config/records in the type
  walk, manifest passed in).
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed`, one entry per finding

## Contracts satisfied

- `update`'s decision table (`lib/update-decision.ts`) becomes the single definition of "your
  edit" for both commands (cited, P4).
- PHARN-16's "no half-install": now true for the two CLI-owned files too.

## Evals to write (P1)

- Listed under Files. Eight cases FAIL on the base.

## Guarantee audit (P0)

- "a pristine pharn file is never called your edit when records are usable" → floor:
  `decideFileAction` (already tested) plus the scan tests. Without usable records → advisory,
  conservative (every difference is backed up), and the prompt says so.
- "every file init overwrites that update would have skipped is backed up first, LICENSE included"
  → floor: the pair scan plus tests.
- "a refused install writes nothing, not even a backup" → floor: pre-flight before backup, plus a
  test. Residual: a filesystem change between pre-flight and copy (TOCTOU), the same residual
  `update` names.
- "the manifest is computed once" → floor: a spy test (a performance claim, not a safety one).

## Trust audit (P2)

- The clone is untrusted. The scan joins source paths from the manifest, which are already
  `safeJoin`-contained. Records are local, stamp-checked data (a stale or foreign store is ignored
  → the conservative path). Nothing new is printed except CLI-owned wording and manifest paths,
  as today.

## Determinism audit (P5)

- Hash equality and set membership through the existing decision table. The fallback with no usable
  store is the conservative "back it up", never a guess.

## Open questions (HALT)

None open. Resolved at GATE 1 (human, 2026-09-25): every question below → **(a)**, the
recommended answer. Kept for the record:

1. A file that equals its record but differs from upstream (pharn's own bytes, just outdated).
   (a) Treat it as a clean upgrade: no `(edited)`, no backup, exactly as `update` does —
   recommended. (b) Keep backing it up, noisy but zero-risk.
2. `.claude/settings.json` as a symlink during init. (a) A live link is allowed (it is preserved, as
   today) and a dangling one is refused with a file-specific message — recommended. (b) Allow a
   dangling link too, by skipping the settings write and warning.
