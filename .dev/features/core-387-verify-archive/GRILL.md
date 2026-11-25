# GRILL — core-387-verify-archive

Advisory: `/pharn-dev-grill` gates nothing. Spec hash recomputed as `bca940a5…3c4e`, equal to the plan's. Registered
grillers: 0 (`count-grillers.mjs`), so only the built-in axes were applied.

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: 'PLAN.md:Guarantee audit'
  problem: '"A pass means an install would accept these bytes" holds only for the checks the command shares with install; the MIN_CLI comparison and the project-side steps are not run.'
  evidence: 'Docs must list the differences (MIN_CLI is checked for validity only and refused where install would warn; there is no version comparison, no archetype selection and no destination checks) so CI readers do not over-read a pass.'
- type: FINDING
  rule_id: P2
  severity: important
  file: 'PLAN.md:Decisions 7'
  problem: 'The user path reaches three messages (the input error, the refusal prefix, the summary); each must be escaped at its own interpolation, not as a whole line.'
  evidence: 'CLAUDE.md "One unsafe-character set": value by value. Test it with a control character in the file name.'
- type: FINDING
  rule_id: P1
  severity: important
  file: 'PLAN.md:Files (tests)'
  problem: 'A non-gzip input and an empty input take different routes (the input check for empty, and TarExtractError "could not decompress the fetched archive" for garbage); the second says "fetched" for a local file.'
  evidence: 'Test both. The "fetched" wording lives in tar-extract.ts (a 386 file); it is left alone and accepted as the extractor message, prefixed by "Archive <name> refused:".'
- type: FINDING
  rule_id: P5
  severity: minor
  file: 'PLAN.md:Decisions 1'
  problem: 'The rootless check is "pass 1 wrote no pharn-install.json", which also fires for a rooted archive without a manifest (pre-7.21.0) and for a deeper prefix such as a/b/.'
  evidence: 'Word the message to cover both: "holds no pharn-install.json under a single top-level directory", naming the --prefix line and the 7.21.0 floor. A membership test with an honest message, not a guess about which cause it is.'
- type: FINDING
  rule_id: P1
  severity: minor
  file: 'PLAN.md:GATE 1 amendments 1'
  problem: 'The unknown-capability warning path and the malformed-MIN_CLI refusal need cases of their own.'
  evidence: 'Add a manifest edit with an unknown applies token (passes, warns on stderr) and MIN_CLI "not-a-version" (refused, reason named).'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'PLAN.md:Files (tar-fixture)'
  problem: 'Extending the shared tar fixture changes a file every command suite uses.'
  evidence: 'Keep the opts argument optional and part of the memo key, so existing callers produce identical bytes.'
```

Verdict: proceed (advisory). All six are folded into the build.
