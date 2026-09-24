# PLAN — reinit-preserve-edits (PHARN-11: re-running `init` must back up edits and keep manual adds)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: on a re-install over an existing project, `init` (1) lists the existing files that DIFFER
  from upstream first in its overwrite prompt, saying they will be backed up; (2) copies those files to
  `.pharn-backup/<ts>/` (the same `scanDest` + `createBackup` `add` uses) before the first write, naming
  the directory at creation; and (3) keeps every `source: 'manual'` capability of a readable existing
  archetype config that is still in the fetched index — installing it and recording it as `manual` —
  instead of rewriting the config from archetype resolution alone.
- layer(s): the CLI itself (`src/steps/overwrite-check.ts`, `src/steps/install-archetype.ts`, `src/commands/init.ts`)
- constitution_refs: [P0, P1, P3, P4, P5, P7]

## Discovery — verified this run (P6)

Reproduced (`repro/reinit`): `init`, `add a11y`, edit `pharn-spec.md`, `init` again, confirm → the
prompt shows 10 of 417 paths ("…and 407 more"), no `.pharn-backup/` is made, the edit is lost, and
`a11y` drops out of the config while its files stay. The CLI itself points users at `init` as the
repair (`LEGACY_CONFIG_MESSAGE`, `ConfigParseError`'s last resort). `steps/overwrite-check.ts` caps the
list at `MAX_LISTED = 10` with no edit classification; `steps/install-archetype.ts` builds the config from
scratch, every entry `source: 'auto'`. `lib/dest-drift.ts` `scanDest` + `lib/backup.ts` `createBackup` are
the existing primitives `add` already uses for exactly this.

## Files

- `src/steps/overwrite-check.ts` — `confirmWriteTargets` runs `scanDest` over the conflicting install
  paths: the drifted ones are listed first under a heading saying they differ from upstream and will be
  backed up to `.pharn-backup/` before being overwritten; the rest follow; the cap applies to the total — layer CLI/step
- `src/steps/install-archetype.ts` — before `installCapabilities`, `scanDest` over the expected install
  paths; a non-empty `drifted` (and an empty `unsafe` — a symlinked destination is refused by the install
  pre-flight anyway) goes to `createBackup`, logged at creation; the config marks the capabilities named in
  a new `manualKeys` argument `source: 'manual'` — layer CLI/step
- `src/commands/init.ts` — reads the existing config tolerantly (absent / unreadable / invalid / legacy →
  none; `init` is the recovery path and must never be blocked by the file it replaces); its
  `source: 'manual'` entries still present in the fetched index and not already selected are added to the
  install selection (named in one info line) and passed as `manualKeys` — layer CLI/command
- `tests/overwrite-check.test.ts` — drifted paths listed first with the backup note; identical files are
  not called edits
- `tests/init-archetype.test.ts` — re-init backs up an edited file (bytes preserved under
  `.pharn-backup/`, pointer printed) and keeps a manual capability (installed, `source: 'manual'`); a
  corrupt existing config does not block re-init; a manual entry gone from the index is not resurrected
- `tests/init.test.ts` — the `runInstallArchetype` call gains its `manualKeys` argument
- `docs/commands/init.md` — re-install behavior (P4)
- `CLAUDE.md` — init step 5 (P4)

## Contracts satisfied

- The product's three edit protections (init's prompt, update's skips, `--force`'s backup) — init's is no
  longer a bare "overwrite?" but names the edits and backs them up, as `add` does.
- `merge-capabilities.ts` "sticky manual" semantics — now honoured by `init` too.

## Evals to write (P1)

- listed above; backup, manual-keep and edit-first listing fail on the base source.

## Guarantee audit (P0)

- "an edited file overwritten by re-init is first copied to `.pharn-backup/`" → floor: sha256 inequality
  (scanDest) + `createBackup` before `installCapabilities` (same primitives as `add`).
- "a manual capability survives re-init" → set membership over the existing config and the fetched index.
- Residual (named): `init` still overwrites after confirmation — the protection is the backup, not a skip.

## Trust audit (P2)

- The existing config is local, hand-editable input read through `readPharnConfig` (validated); failures
  degrade to "no previous config", never to trusting unvalidated entries.

## Determinism audit (P5)

- Hash inequality, key membership; a failed read of the previous config → the documented fresh-install path.

## Open questions (HALT)

- none
