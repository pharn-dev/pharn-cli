# BUILD — gitignore-run-state

Landed `src/lib/gitignore.ts` (the plan, append, covered test and wording) and `writeFileAtomic` (`writeJsonAtomic` delegates to it). They are wired into `init` (`runInstallArchetype`, after the config write) and `update` (`applyPlannedUpdate`, after the config write, plus the same-version re-open). Both dry runs (text PLAN line, additive JSON `gitignore` / `plan.gitignore`) and the conditional backup-notice advice are in. Tests: `tests/gitignore.test.ts` (59, including a real `git check-ignore`) plus the cases folded into the atomic-write, backup, init/update dry-run (text + JSON), update and integration suites. Docs, CHANGELOG 0.16.0 and the version bump are in too. Floor: `npm run check` GREEN (3323 passed, 1 skipped; also with `CI=1`), `test:coverage` GREEN, `build` GREEN, `validate.mjs .` GREEN (0 capabilities).

Grill resolutions folded in:
- root-migration matching unchanged (wording only);
- backup advice suppressed when this run adds the entry;
- a created `.gitignore` gets the umask mode (tested);
- the write-failure and refused-re-open evals added;
- the uninstall note names the kept lines;
- the comment is written once per file.

Deviations from `## Files` (each a one-line, necessary change):
- `src/commands/add.ts`, `src/commands/remove.ts`, `src/commands/uninstall.ts` pass `gitignored` to the backup notice. The plan had `printBackupNotice` compute it, but it has no project root. `uninstall.ts` also carries the PLAN-note wording.
- `tests/uninstall.test.ts` pins that wording.
- `tests/release-consistency.test.ts` gains `v0.15.0` in `KNOWN_TAGS`, a tag the previous release created.
- The shared wording lives in `gitignore.ts` (`gitignoreLines`), not `update-render.ts`, so init does not import update's renderer.
