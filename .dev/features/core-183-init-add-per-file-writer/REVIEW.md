# REVIEW — core-183-init-add-per-file-writer

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0) at the build commit and again at HEAD. Everything
below is advisory (four inline lenses over `git diff 790d9c3..HEAD`). The reviewed increment is `trust: untrusted`; no
instruction-looking content was found in it.

## Floor-gate findings (blocking)

None.

- L-floor (P0): every guarantee the increment claims reduces to a floor primitive, as the PLAN's guarantee audit says —
  "no `cpSync` in `src/`" → the new `no-restricted-syntax` entry (`Identifier[name='cpSync']`,
  `ImportSpecifier[imported.name='cp']`) proven by three `lint-rules.test.ts` cases; "writes exactly the manifest" →
  the install iterates the manifest map itself and the two MIRROR tests compare a real install with it; hard links →
  `copyFileAtomicSync` (temp + rename) and `COPYFILE_EXCL`; symlinks → `findSymlinkComponent` per file + the pre-flight;
  "changed since plan" → `contentHash` equality; "no records/config after a failure" → control flow, tested in both
  command suites. The two named residuals (check-then-write window per file) are stated in the PLAN and in
  `docs/commands/add.md` "Known limit".
- L-eval (P1): no markdown capability or `rule_id` is added, so `validate.mjs` is vacuously green; every new behaviour
  has a vitest test (`apply-update`, `dest-drift`, `install-capabilities`, `commands/init`, `commands/add`,
  `lint-rules`).
- L-trust (P2): clone-derived paths printed in the failure message go through `terminalSafe`
  (`writtenBeforeFailureLines`), and the fatal reporter strips control characters again (`logError`). No decision rests
  on free text.
- L-axis (P3): `install-capabilities.ts` (lib) now imports `apply-update`, `backup`, `gitignore` and `report-error`, all
  `lib/`; no command→command or step→step import. `add.ts` and `install-archetype.ts` lost code, gained none.

## Advisory findings (warn)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/lib/install-capabilities.ts:217'
  problem: 'A failure writing .claude/settings.json (after every manifest file landed) threw a bare fs error that named no written file.'
  evidence: 'const settingsWritten = upstreamSettingsCopyable(repoDir) && copySettingsIfAbsent(repoDir, projectRoot);'
  status: "FIXED in 597b35f — settings is written as `last` inside writeInstallFiles' failure handling; test 'a settings.json write failure names the files already written'."
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'src/lib/install-capabilities.ts:241'
  problem: "The non-ApplyError path (createBackup refusing between the two passes) was uncovered, so a failed backup naming the first pass's files was untested."
  evidence: 'err instanceof ApplyError ? [...written, ...err.written] : written'
  status: "FIXED in bb13664 — test 'a failed changed-file backup names the files already written'."
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/lib/install-capabilities.ts:254'
  problem: 'The write-time `.claude` symlink refusal in copySettingsIfAbsent cannot be reached by a test: the pre-flight refuses the same link first, so the line is a defence-in-depth backstop with no coverage.'
  evidence: "const link = findSymlinkComponent(projectRoot, '.claude');"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'src/lib/install-capabilities.ts:233'
  problem: 'The changed-since-plan backup notice reads `.gitignore` as it is now, so on a first `init` it may advise adding `pharn/.backup/` that init adds a moment later; only reachable when a file changes between scan and write.'
  evidence: 'gitignored: backupDirIgnored(projectRoot),'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/apply-update.ts:94'
  problem: "`update` passes no `seen` yet, so the compare protects only init/add's scan→write window (milliseconds) until C5.2 moves the prompt between plan and write; required by the ticket, stated in the PR body."
  evidence: 'seen?: ReadonlyMap<string, string | null>;'
```

Deviation from the PLAN (advisory, recorded): the PLAN listed adding `.claude/agents/` and a `pharn-core` file to the
F-19 hard-link test's destinations; the flat test scaffold ships neither, so the test kept its eight destinations (one
per surface it ships). Agents and core files go through the same `applyWrites` call as every other manifest entry.
The written-files list is carried in the fatal error's message rather than a separate `log.warn`, so `add.ts` and
`install-archetype.ts` need no new error handling (less overlap with C5.1).

## Test-integrity notes (for the PR)

No test file, `describe` or `it` is deleted. Two `it`s are renamed and rewritten because the features-README decision
changed their expectation from skip to refuse: "skips the copy (does not throw) when the project has a FILE named
features" → "refuses, writing nothing, when the project has a FILE named features", and "skips (does not refuse) a
directory at the optional features/README.md" → "refuses a directory at features/README.md, writing nothing". One
assertion is replaced: `prepared.featuresRel` (field removed) → `prepared.manifest.has('features/README.md')`.

## Proposed lesson

None: no recurring failure surfaced.

VERDICT: GREEN — 0 floor-gate findings; 5 advisory (2 fixed, 3 minor left as named residuals).
