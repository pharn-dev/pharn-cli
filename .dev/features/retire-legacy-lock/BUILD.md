# BUILD — retire-legacy-lock (CORE-187)

`src/lib/project-lock.ts` is rewritten around one lock path (`pharn/.lock`): the `LockSite` indirection,
the legacy root `.pharn.lock` check and the corpse sweep are gone, and every other rule (O_EXCL create,
payload, refusal wording, C3.3 staleness, rename → re-verify → O_EXCL break with link(2) restore,
own-payload release, exit listener, fatal-signal hook, directory refusal, `pharn/` create/remove,
ENOENT retry) is kept. Code lines, comments and blanks excluded: 344 on `main` → 240 now (373 lines in
all). `legacyBackupNotice` and its four call sites are removed, and root-migration's `.gitignore` hints
for the two old names go with them (the `.pharn/` hint stays until v0.22.0). Legacy tests were rewritten
in place to assert the new behaviour (a root lock and corpse-named files are ignored and left alone; no
`.pharn-backup` notice), plus one new test for a payload whose `startedAt` is not a date. Grill findings
folded in: the STRANDED CORPSE residual is named in the module header and in troubleshooting, and the
THREAT-MODEL §4d patch script states the both-directions residual. Floor: `npm run check` GREEN (103
files, 3653 tests passed); `validate.mjs` is vacuous (no markdown capability added).
