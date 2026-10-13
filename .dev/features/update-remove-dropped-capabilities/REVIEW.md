# REVIEW — update-remove-dropped-capabilities (after GATE 2: rebase, JSON convention, init half)

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0, `FLOOR: GREEN — 0 capabilities checked in .`. `/pharn-dev-verify`: `PASS`; `/pharn-dev-regress`: `no-regressions` (base `7f1b727`). The increment under review is `trust: untrusted`; no instruction-looking content in it changed this review's behaviour.

Reviewed: `git diff 7f1b727..HEAD` — the update half (as rebased) plus `src/lib/capability-removal.ts` (new), `src/lib/init-plan.ts`, `src/lib/init-report.ts`, `src/lib/write-targets.ts`, `src/steps/overwrite-check.ts`, `src/steps/install-archetype.ts`, `src/commands/init.ts`, the comment edits, their tests and the docs.

## Earlier findings — disposition

- Update half, iteration 1 floor-gate (test timeouts under host load): cleared in iteration 2 and in every full run since.
- Update half advisory (abort wording, upstream-decides-membership, type guard): fixed in iteration 2.
- GATE 2 change 1 (JSON key absent when empty): done for `update` (`plan.capabilities.removals`) and `init` (`capabilities.removals`); the original 0.10.0 byte-pin test is restored unchanged and passes.
- GATE 2 change 2 (compose with F-12 orphans): `findOrphans` skips every key under a capability outside the next `capabilities`, which is exactly the set the removals delete; pinned by `never reports a dropped capability's files as orphans`.

## Floor-gate findings (blocking)

None.

- L-floor (P0): containment reduces to `safeChildJoin` + `findSymlinkComponent` (refusal while planning, before any write, in both commands); classification to membership + content-hash equality against a stamp-checked store; the orders (update: backup → delete → write → records → config; init: pre-flight → re-plan → one backup → delete → copy → records → config) are labelled control flow and tested, including the failure paths.
- L-eval (P1): init half adds 2 `capability-removal` unit tests, 3 `write-targets`, 3 `overwrite-check`, 2 `init` command, 4 `init-archetype` end-to-end (delete + backup + records, gone manual, decline, symlink refusal), 1 `init --yes` refusal, 1 text dry-run (snapshot + parity), 1 JSON dry-run and 2 report-projection tests.
- L-trust (P2): every removal path is a validated config name under its role subtree at the replaced config's layout; the clone decides only membership. Named as a residual (below and in the LIMITS hand-over).
- L-axis (P3): `capability-dir.ts` (address/delete one directory) and `capability-removal.ts` (the removal plan) are separate axes, each shared by `update`, `init` (and `remove` for the first); no command→command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P2
  severity: important
  file: 'src/lib/capability-removal.ts:81'
  problem: "The untrusted upstream index can now cause a deletion: a capability it stops listing (or stops selecting for the project's archetypes) has its directory deleted by the next update / re-run init. Bounded (one validated directory per config entry, unprovable files backed up, symlinks refused, previewable with --dry-run, and init asks first) but it is a new capability for upstream; LIMITS.md and THREAT-MODEL.md (human-only) should name it — text handed over at GATE 2."
  evidence: 'export function planCapabilityRemovals(params: {'
- type: FINDING
  rule_id: P5
  severity: minor
  file: 'src/lib/init-plan.ts:186'
  problem: "A re-run init re-detects archetypes unless --archetype is passed again, so a project installed with `--archetype backend` and re-run bare will now DELETE the backend-only capabilities' directories (after listing them in the prompt, default No) where it used to only drop their config entries. Documented; the prompt is the guard."
  evidence: 'dropped.push({'
- type: FINDING
  rule_id: P5
  severity: minor
  file: 'src/lib/init-plan.ts:186'
  problem: 'A source-less (legacy) entry the archetypes no longer select is deleted by init while update would keep it as manual (merge row 8). This was the approved rule (init does not infer legacy provenance); stated so it is weighed at GATE 2.'
  evidence: "cap.source === 'auto' || inIndex.has(k)"
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'src/commands/init.ts:453'
  problem: "In --dry-run, the carry-over lines are printed in the present tense ('its directory is deleted') before the preview; the PLAN note and outro say nothing was changed, but the line reads as done."
  evidence: 'dropped from pharn.config.json, and its directory is deleted'
```

## Proposed lesson (not written to canon)

None.

VERDICT: GREEN — 0 floor-gate findings, 4 advisory findings (1 important, 3 minor). This review is advisory; the merge / fix / abandon decision is the human's.
