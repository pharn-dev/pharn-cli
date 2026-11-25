# REVIEW — core-387-verify-archive

Floor first: `node .dev/floor/validate.mjs .` is GREEN, and `verify-report.json` is `PASS`. Everything below is
advisory. The review applied the four lenses (P0 guarantees, P2 trust, P3 one axis, P7 scope) to the diff against
origin/main.

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'src/commands/verify-archive.ts:runVerifyArchive (rootless hint)'
  problem: 'The rootless hint is chosen by matching the start of the extractor''s message ("tar entry has no path below the archive root"), so a rewording in tar-extract.ts would silently drop the hint.'
  evidence: 'Only the hint is lost, never the refusal or the exit code, and the rootless case in tests/commands/verify-archive.test.ts asserts both texts, so a rewording turns the suite red. A typed error code on TarExtractError would be cleaner, but it belongs in a tar-extract change, not here.'
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'docs/commands/verify-archive.md:Where it differs from an install'
  problem: 'A pass is "an install accepts these bytes" only for the shared steps.'
  evidence: 'The differences are listed: MIN_CLI is refused where install warns, there is no version comparison, and no project or destination checks run. The guarantee audit in PLAN.md labels the git-archive-vs-codeload equivalence advisory, and live run (c) covers the real codeload shape.'
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'src/commands/verify-archive.ts'
  problem: 'Every user-path interpolation must be escaped.'
  evidence: 'The path and the basename are escaped once (escapeUnsafe) and only those values are printed; logError strips on top. A test with ESC in both a missing path and a refused archive name asserts that no raw ESC reaches the output.'
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'src/lib/skills-version.ts:readSkillsVersion (reused)'
  problem: 'For a local archive, a missing SKILLS_VERSION reads "is missing in the fetched repo", which is the wrong word for a local file.'
  evidence: 'Cosmetic. It is prefixed by "Archive <name> refused:", and changing the shared message would touch every install path. Left as is.'
- type: FINDING
  rule_id: P3
  severity: info
  file: 'src/commands/verify-archive.ts'
  problem: 'Checked for command->command and step imports.'
  evidence: "Imports only lib/. Temp-dir lifecycle stays in repo.ts (the clone-producer eslint rule passes), the release check is shared through assertSkillsVersion, and fetchAt's message is byte-identical."
- type: FINDING
  rule_id: P7
  severity: info
  file: 'src/lib/cli-args.ts'
  problem: 'No --json, as decided at GATE 1.'
  evidence: 'CI gates on the exit code; --json is refused for verify-archive by the existing per-command option table.'
```

There are no blocking findings. The tests file `tests/release-consistency.test.ts` gains `v0.21.6` in KNOWN_TAGS:
that tag now exists (#448 was released), and the `[0.22.0]` link compares from it.
