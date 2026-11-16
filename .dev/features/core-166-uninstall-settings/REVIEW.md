# REVIEW — core-166-uninstall-settings

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (vacuous: no markdown capability added).
`CI=1 npm run check` GREEN (3684 passed, 1 skipped). Reviewed: the source diff against 688a838 in
`src/commands/uninstall.ts`, `src/lib/{install-records,missing-installed,uninstall-plan,update-next,update-plan}.ts`,
`src/steps/install-archetype.ts`, plus tests and docs. The increment is `trust: untrusted`; nothing in it
read as an instruction to the reviewer.

## Floor-gate findings (blocking)

None.

- L-floor (P0): the one new delete path (`.claude/settings.json` in `planUninstall`) reduces to exact key
  equality + the existing `classify` (parent symlink walk, `safeJoin`, regular-file check, `contentHash`
  equality with the record). The record is minted only on `settingsWritten` (the same boolean that gated
  the copy) via `buildRecords` (dest hash, skips absent). `carriedSettingsRecord` is an lstat membership
  test. `isInstallRootPath` is unchanged (pinned by `tests/orphans.test.ts` and by the prettierignore
  integration test). No new writer of the file (grep of the diff: no write call on `CLAUDE_SETTINGS_FILE`;
  integration tests assert the bytes after `update`/`add`/`remove`/re-run `init`).
- L-eval (P1): every behaviour has a test that failed before the code (21 new/changed cases failed, then
  passed): unit (`install-records`, `uninstall-plan`, `missing-installed`, `orphans`, `update-next`,
  `update-plan`, `uninstall`, `init-archetype`) and integration (`commands-integration`). The
  orchestrator's GATE-1 check (a dropped record does not loop or prompt) is covered twice: the unit
  `update-plan` case plans, writes the next store, and re-plans to `changesNothing: true`; the integration
  case runs a real `update --force` in a TTY without `--yes` after the drop and asserts no confirm, no
  write.
- L-trust (P2): no new untrusted input; the record key is a fixed literal compared by equality, the hash
  is compared, never parsed. No free-text emitted.
- L-axis (P3): `carriedSettingsRecord` sits in the record-store module; uninstall changes stay in the
  uninstall classifier and command; no command→command or step→step import.

## Advisory findings (warn)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/uninstall-plan.ts:88'
  problem: 'A hand-edited record whose hash equals a user-owned settings.json lets uninstall delete it — the same residual every recorded install path has, now extended to one user-facing file; stated in PLAN.md but not in the user docs.'
  evidence: 'if (rel !== CLAUDE_SETTINGS_FILE && !isInstallRootPath(rel)) {'
```

Mitigations in place: the store is local and committed (a reviewed diff), the PLAN note counts the
delete, the confirm defaults to No, and the config is backed up. A copy of settings.json is not made
(GATE-1 decision 2). Left as stated residual; not blocking.

Checked and clean: the vendored `.agents/skills/pharn-cli/` (from pharn-dev/skills) makes no claim that
uninstall leaves `settings.json` (grep), so it needs no follow-up.

## Proposed lesson

None — no recurring failure surfaced (P7).

VERDICT: GREEN — 0 floor-gate findings, 1 advisory.
