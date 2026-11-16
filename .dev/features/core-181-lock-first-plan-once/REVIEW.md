# REVIEW — core-181-lock-first-plan-once

## Floor results

These floor checks were in place before this review:

- `node .dev/floor/validate.mjs .` is GREEN. It checks 0 capabilities, so it says nothing about a TypeScript increment.
- `npm run check` was GREEN at the build (104 files, 3530 passed, 1 skipped; also with `CI=1`), and again after the
  review's added test (3531 passed). `npm run build` is GREEN. `npm run test:coverage`: 98.24 / 95.47 / 99.19 / 98.83
  (floors 90/85/90/90).
- `/pharn-dev-regress` reported **no-regressions**: tests and validate were identical at base and head.
- `/pharn-dev-verify` was **PASS**: test, validate, lint, format:check, lint:md and typecheck.

Reviewed: `git diff 8e38bf7e..HEAD` over `src/`, `tests/`, the docs, `CLAUDE.md` and `CHANGELOG.md`. `src/` plus
`tests/` add up to +1848 / −977 lines. The increment is `trust: untrusted`, and nothing in it read as an instruction.

## Floor-gate findings (blocking)

None. Each lens's result:

- L-floor (P0):
  - "a writer takes the lock before reading the config, and a held lock refuses it before any fetch": every writing
    command calls `withProjectLock` before `configFingerprint`/`loadConfig`, and the held-lock table in
    `tests/commands/lock.test.ts` asserts `fetchStub` was never called, for `update --yes` and `init --yes` too.
  - "a second command during a prompt is refused, naming the holder": O_EXCL plus same-host liveness. Five tests run a
    second writer inside a stubbed prompt (update confirm, init summary, remove-picker confirm, uninstall confirm, add
    picker). Each asserts exit 1, `pharn <holder> (pid <pid> on <host>`, the static sentence, the holder's lock
    untouched, no download, and the first run then completing.
  - "planned once": `vi.spyOn` on the `update-plan` / `init-plan` namespaces (no `vi.mock`) shows one
    `buildUpdatePlan` call per real update (confirm and `--yes`) and one `buildInitPlan` call per real init (re-install
    and `--yes`).
  - "an edit made while a prompt is open is not lost" reduces to content-hash comparisons at write time:
    - `changedSince`: `update` refuses with nothing written, tested with and without `--force`, and the re-run keeps
      the edit;
    - `applyWrites`' `seen`: `init` backs the file up, then writes it (tested);
    - `removalBackupsNow`: a file added to a dropped dir is backed up (tested); an unreadable one refuses (tested);
    - `reclassifyDeletes`: uninstall keeps an edited file (existing test) and refuses a swapped parent (new test);
    - `assertConfigFingerprintUnchanged`: refuses in all five writers (tests for init, update, uninstall, the remove
      picker and the add picker).
  - Every pre-existing symlink-refusal and hard-link test passes unchanged except one uninstall case. Its symlinked
    `pharn/` is now refused by the lock itself, so it moved to a symlinked `.claude/`, and the `pharn/` case got its
    own test asserting the lock's refusal.
- L-eval (P1): there is no capability or `rule_id`. Every new helper has a unit test that imports it statically:
  `changedSince`/`changedSincePlan`, `removalBackupsNow`, `reclassifyDeletes`, `deleteCapabilityDir`'s walk,
  `installPrepared`, `refuseExistingTargets`, `planWriteTargets`' given labels, `confirmWriteTargets`' given targets,
  `nextRecordStore`'s `unwritten`, `apply.seen`, `resolveAddPicker`'s `beforeWrite`, the lock's wording, and readers
  under a held lock (`list`, `status`).
- L-trust (P2): no new input is ingested. The lock payload's fields were already printed and shape-checked
  (`parsePayload`); the added sentence is static. File names in the new update refusal pass through `terminalSafe`.
- L-axis (P3): the new helpers live in `lib/` (`apply-update`, `capability-removal`, `capability-dir`,
  `uninstall-plan`, `write-targets`). No command→command or step→step import was added. `install-archetype.ts`
  imports the plan type from `lib/init-plan.ts`, not from the overwrite-check step (GRILL finding 5).

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/commands/update.ts:707'
  problem: "Between applyConfirmed's check and a file's own write (milliseconds) an edit is caught by applyWrites' seen: the file is left unwritten and keeps its old record, but the version bump the plan decided still lands. The next run then classifies the file as modified, but a same-version run returns early. This is the named residual of any write-time check; nextRecordStore's unwritten handling is unit-tested, since no command test can reach that window."
  evidence: '({ written, changed: unwritten } = applyWrites({ ... seen: apply.seen }))'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/steps/overwrite-check.ts:98'
  problem: "confirmWriteTargets keeps its own planWriteTargets fallback for a caller without `targets`. init always passes the plan's targets now, so only the step's own tests reach the fallback. It was kept so ~20 tests did not have to be rewritten (TI02). It could go in a later cleanup."
  evidence: 'context.targets ?? planWriteTargets({ ... })'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'THREAT-MODEL.md:262'
  problem: '§4d names the deleted assertConfigUnchanged as the partial backstop against a pre-0.14.0 CLI. The file is protected, so the change ships as a patch script for the human to run (scratchpad patch-CORE-181.py). The new backstop is assertConfigFingerprintUnchanged after the last prompt, which is stronger.'
  evidence: '(`assertConfigUnchanged`) refuses a 0.14.0 run whose config an old run wrote before the lock was taken'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/remove.ts:73'
  problem: "deleteCapabilityDir now throws ManifestValidationError for a link swapped in between remove's own walk and the rmSync. runRemove does not map that class, so it would print as an unexpected error with the PHARN_DEBUG hint rather than as a named refusal. That window is microseconds, right after remove's own walk; update and init wrap it as a failure. Left as is."
  evidence: 'if (linked !== null) { throw new ManifestValidationError(...)'
```

Test-integrity changes (accepted at GATE 1), for the PR body:

- deleted: the `describe('assertConfigUnchanged')` block (3 `it`s) in `tests/pharn-config.test.ts`; "refuses when the
  membership itself differs under the lock, naming both sides" in `tests/commands/update.test.ts`;
- renamed or rewritten:
  - in `update.test.ts`:
    - "refuses when the locked re-plan would delete a directory the confirm did not show" became "a directory that comes
      back while the confirm is open is not deleted (the plan did not name it)";
    - "writes nothing when the plan under the lock changes nothing; …" became "a file put back with upstream bytes
      while the confirm is open is not an edit: the confirmed plan applies";
  - `lock.test.ts`: the describe "a config rewritten between the read and the lock refuses the writer" became "a config
    edited while a writer waits for input refuses it";
  - `lock.test.ts`: the held-lock rows for `update --yes` and `init --yes` now read "(downloads first: false)";
  - `pharn-config.test.ts`:
    - "refuses with ProjectChangedError on any change — …" became "refuses with a CliError refusal on any change — …";
    - the `loadConfigOrExit` / `loadArchetypeConfigOrExit` describes are renamed with the functions.
