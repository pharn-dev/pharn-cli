# PLAN — update-confirm-names-membership: `pharn update` confirms only after it can name the membership changes (F-24)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: Move `pharn update`'s tarball fetch, `MIN_CLI` gate and `buildUpdatePlan` AHEAD of the confirm (still after the TTY gate, still outside the lock), print the capabilities the run would ADD / DROP (and the directories it would DELETE) in a pre-confirm `CAPABILITIES` note, then confirm, take the lock and re-plan from the SAME clone under it. Refuse (exit 1, nothing written) if the re-plan's membership differs from what was shown. Closes F-24 (LOW): today `update` confirms before the fetch, so it applies `added` / `dropped-unselected` / `dropped-gone` changes, including F-04's directory deletes, after a confirm that could not name them, and `--yes` applies them unattended.
- layer(s): CLI command (`src/commands/update.ts`) + tests + user docs. No lib change unless the build shows one is needed (see Files). No `pharn-contracts` change. No trusted-doc edit.
- constitution_refs: [P0, P1, P2, P4, P5, P6, P7]

## Discovery (read this run, P6)

- `src/commands/update.ts` `runUpdate`: the order today is node floor → `loadArchetypeConfigOrExit` → TTY gate (`interactiveAllowed`, exit 1 unless `--dry-run`/`--yes`) → `runArchetypeUpdate`.
- `runArchetypeUpdate` then runs: proxy notice → `resolveSource` + `fetchRemoteSkillsVersion` (ONE small GET, already before the confirm) → ahead-of-source guard → same-version early return (re-opened by `--force` / frozen / models / channel switch / `findMissingInstalled`) → header `note` (with generic dim lines "Capabilities no longer selected are removed … `pharn update --dry-run` lists them") → `if (dryRun) runDryRun(...)` → `confirm` ("Re-fetch capabilities …?", `initialValue: true`, skipped by `--yes`; a cancel goes to `cancelAndExit` with exit 0).
- After the confirm: `withProjectLock` → `assertConfigUnchanged` → spinner → `fetchRepo(source)` → `checkMinCli` → `buildUpdatePlan` → `applyPlannedUpdate` → `repo.cleanup()` in a `finally`. Exits come after cleanup. `ProjectLockedError` and `CapabilityRemovalError` are reported as policy refusals (exit 1, no PHARN_DEBUG hint).
- `fetchAndPlan` (dry run only) wraps fetch → `checkMinCli` → `buildUpdatePlan` → cleanup, and returns `PlanOutcome` (`planned` / `refused` / `failed`).
- `buildUpdatePlan` (`src/lib/update-plan.ts`) is read-only and never logs. Membership (`report.capabilityChanges` from `mergeCapabilities`) depends ONLY on `config.archetypes` / `config.capabilities` and the clone's index. `report.removals` (`present`, `backups`) also depends on project disk state.
- `reportCapabilityChanges(changes, removals, preview)` already renders future tense ("directory would be deleted (N file(s) would be backed up first)"). It prints nothing when there are no changes.
- `src/lib/repo.ts`: every clone is registered in `liveClones` and removed on `exit`/`SIGINT`/`SIGTERM`. A clone held across the prompt is therefore not leaked by `cancelAndExit`'s `process.exit(0)` or by Ctrl-C. Explicit cleanup stays the discipline anyway.
- Tests pinning the current order (they change on purpose): `tests/update.test.ts:779` "cancels when declined — no clone"; `:560-575` "a held lock … fetchRepo not called"; `tests/project-lock-commands.test.ts:421` "`update` refuses before fetching or writing" (config changed). `tests/update.test.ts:787` "takes the lock AFTER the confirm" stays true. The MIN_CLI command tests (`:2427`) assert only the outcome.
- Docs stating the old order: `docs/commands/update.md` steps 6-7, "Visible beforehand" (:313), Concurrency (:639-646); the CLAUDE.md update paragraph ("the pre-confirm note says dropped capabilities are deleted and points at `--dry-run` (the confirm precedes the fetch, so it cannot name them)"); the lock comment block in `update.ts` (~:509-535).
- `LIMITS.md` §1d still says "`update` never deletes", which is stale since F-04. It is trusted, so I will REPORT it and not edit it.

## Design

New order for a real (non-dry) run. Everything up to and including the header note is unchanged:

1. **Pre-confirm planning (no lock).** Spinner `Planning from <REPO_URL>` → `fetchRepo(source)` → `checkMinCli` → `buildUpdatePlan({… onUnknownWarning: log.warn})`, keeping the clone (no cleanup yet).
   - To do this, split `fetchAndPlan` into `planFromClone(repo, …)` (gate + plan, no cleanup) and `fetchAndPlan` (fetch + `planFromClone` + cleanup, unchanged for the dry run).
   - A MIN_CLI refusal, a `CapabilityRemovalError` or a fetch failure now exits 1 BEFORE the confirm. Same codes and messages, with the clone cleaned up first.
2. **Pre-confirm note.** `reportCapabilityChanges(snapshot.capabilityChanges, snapshot.removals, /*preview*/ true)`, the existing future-tense `CAPABILITIES` note. Nothing prints when nothing changes. The header's generic dim lines (which pointed at `--dry-run`) are dropped for the real run. The dry run's header is unchanged.
3. **Confirm** (skipped by `--yes`, which still skips ONLY this). New messages, because "Re-fetch" no longer describes the step: `Apply this update?` / `Apply this update and overwrite your changes?`. When the snapshot deletes directories, append `It deletes N capability director(y|ies).` A cancel cleans up the clone, then calls `cancelAndExit()` (exit 0, unchanged).
4. **Lock** (still after the confirm, so no prompt is ever held under it) → `assertConfigUnchanged` → spinner `Updating` → **re-plan from the SAME clone** → membership guard → `applyPlannedUpdate` → cleanup in `finally` → exits after cleanup (unchanged discipline).
   - The re-plan is authoritative for every disk-dependent fact: per-file rows, removal `present` and backups.
   - It passes no `onUnknownWarning`, and the MIN_CLI check is not repeated, because it is the same clone.
5. **Membership guard (deterministic).** Compare the re-plan's `capabilityChanges` (`reason` + `role:name`, in order) and its removal keys with the snapshot's. Any difference → named refusal: "The capabilities this update would change differ from what you confirmed … Nothing was changed. Run `pharn update` again." Exit 1, nothing written, handled like `ProjectLockedError`.
   - With the config unchanged (asserted) and the clone unchanged, the two are equal by construction. The guard turns "you confirmed exactly the membership that is applied" into an equality test instead of an argument.
6. **Kept as is:**
   - the TTY gate before any network call;
   - the early returns (before the fetch);
   - `--dry-run` and `--dry-run --json`: same code path and the same bytes;
   - every exit code;
   - `--yes` semantics.

**Cost (named, accepted):** the ~2.5 MB tarball is downloaded before the user can answer.
- A cancelled confirm now costs that download. Before, it cost one small GET.
- So does a run refused by a held lock (the lock is still taken after the confirm; taking it earlier would hold it across a human prompt, the P-9 decision).
- The prompt appears a few seconds later.
- In exchange: MIN_CLI and removal-safety refusals now come BEFORE the user is asked, and `--yes` logs name what it changes.

**Rejected alternatives:**
- (B) Keep the pre-fetch confirm and add a second confirm after the plan when membership changes: two prompts, and `--yes` would have to skip both.
- (C) Make `--yes` refuse deletions: changes `--yes` semantics and an exit code.
- (D) Re-fetch under the lock: two downloads, and the tip could move between them, so the confirmed membership would not be the applied one.

## Files

- `src/commands/update.ts` — reorder (pre-confirm fetch + plan, clone held to the end), `planFromClone` split, pre-confirm CAPABILITIES note, confirm wording, membership guard + refusal, comment updates — layer: command
- `tests/update.test.ts` — new ordering/membership tests; update the three order-pinning tests — layer: tests
- `tests/project-lock-commands.test.ts` — the update config-changed test: refuses before writing (now after one fetch), clone cleaned up — layer: tests
- `docs/commands/update.md` — steps 6-7, "Visible beforehand", `--yes` section, Concurrency — layer: docs
- `CLAUDE.md` — update paragraph: the new order + the membership guard (surgical) — layer: docs
- `CHANGELOG.md` — `[Unreleased]` → Changed — layer: docs
- `.dev/features/update-confirm-names-membership/*` — stage artifacts (plan/grill/regress/verify/review/ship) — layer: dev

## Contracts satisfied

- None in `pharn-contracts`. The CLI contract is CLAUDE.md's update paragraph and `docs/commands/update.md`, both updated (P4).

## Evals to write (P1) — vitest

- The pre-confirm note names an ADDED capability and a DROPPED one with "directory would be deleted", and `note` is called BEFORE `confirm` (`mock.invocationCallOrder`).
- `--yes` prints the same pre-confirm note, the confirm is not called, and the outcome is the same.
- No membership change → no pre-confirm CAPABILITIES note.
- The confirm message names the deletion count when the snapshot deletes. Plain message otherwise; `--force` wording otherwise.
- Cancel → exit 0, nothing written, no lock file, `fetchRepo` called once, the clone's `cleanup` called once.
- Success → `fetchRepo` called exactly ONCE (no re-fetch) and `cleanup` called once.
- MIN_CLI refusal → exit 1, confirm NOT called, nothing written, cleanup called.
- `CapabilityRemovalError` (a symlinked dropped dir) → exit 1 before the confirm, nothing written.
- Membership guard: `resolveCapabilities` returns a different selection on the second call → exit 1 with the named message, nothing written (config/records/files byte-identical), cleanup called.
- Held lock → exit 1, cleanup called, nothing written. Updated from "fetchRepo not called".
- The TTY gate still refuses before any network call (existing test, unchanged).
- Dry run / `--dry-run --json` tests unchanged (bytes pinned by the existing suites).

## Guarantee audit (P0)

- "The confirmed membership is the applied membership" → floor: deterministic equality check of the change lists under the lock (refusal on mismatch), plus `assertConfigUnchanged` (content fingerprint). Tested.
- "The pre-confirm note lists every membership change" → follows from rendering the snapshot's `capabilityChanges` with the existing renderer. Tested on added/dropped. Completeness rests on `mergeCapabilities`' own tested table.
- "The deleted-dir set shown before the confirm is final" → ADVISORY. `present`/`backups` are re-decided under the lock from disk (a dir that vanished meanwhile becomes "already gone"; a file added meanwhile is backed up). The post-run note reports what actually happened.
- "No prompt is held under the lock" → unchanged (test `:787`).
- "No network before the TTY gate" → unchanged (existing test).

## Trust audit (P2)

- The clone stays untrusted. It is now read before the confirm, by the same validated parsers (`parseCapabilityIndex`, `minCliGate`, `buildUpdatePlan`). Capability names reach the terminal through the existing renderer, the same strings and path as the post-run note and the dry run. No new sink. The clone is held a little longer (across the prompt) in its private temp dir, and it is registered for exit/signal cleanup.

## Determinism audit (P5)

- The guard is an exact equality over `(reason, role, name)` tuples and removal keys. No heuristic.
- Every branch keeps its membership tests. The terminal fallback on mismatch is a refusal, never a guess.

## Open questions (resolved at GATE 1 — see below)

1. Confirm default when the snapshot deletes directories: keep `initialValue: true` (as today), or make it default No only when there are deletions? Recommendation: keep `true`. The note and the message now name the deletes, and changing the default shifts the interactive contract.
2. Membership mismatch under the lock: refuse (exit 1, recommended) or proceed and print the real changes (the post-run note)? Recommendation: refuse. The point of the increment is that what the user confirmed is what happens.
3. Scope of the pre-confirm note: membership + deletes only (recommended, P7), or also a one-line file count (`would write N · skip M`)? Recommendation: membership only. `--dry-run` remains the full preview.

## Resolved at GATE 1 (human, 2026-10-18)

1. When the snapshot deletes at least one capability directory (a removal with `present: true`), the confirm defaults to **No** (`initialValue: false`), matching init's overwrite/removal prompt; otherwise the default stays Yes. `--yes` skips the confirm and nothing else — no change for `--yes`.
2. A second-plan membership mismatch REFUSES: exit 1, nothing written, and the refusal NAMES what changed (the differing `role:name` entries on each side).
3. No file counts in the pre-confirm note.
4. Additional eval: a non-TTY refusal still makes ZERO round-trips (`resolveSource`, `fetchRemoteSkillsVersion` and `fetchRepo` all uncalled).
5. Branch rebased onto origin/main after #297 (F-22) merged. LIMITS.md is not touched; its stale §1d line ("`update` never deletes") is flagged in the final report.
