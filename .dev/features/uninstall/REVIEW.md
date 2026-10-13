# REVIEW — uninstall

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0, `FLOOR: GREEN — 0 capabilities checked in .` (vacuous for this TypeScript increment; the deterministic gates that matter are `/pharn-dev-verify`'s). The increment under review is `trust: untrusted`; no instruction-looking content in it changed this review's behaviour.

Reviewed: `git diff ff9312f..HEAD` — `src/commands/uninstall.ts` (new), `src/lib/uninstall-plan.ts` (new), `src/lib/install-manifest.ts` (`isInstallSurfacePath`), `src/lib/hook-wiring.ts` (`hooksReferencing`), `src/lib/install-records.ts` (header), `src/index.ts`, five test files, and the docs named in the plan. Dist smoke run by hand on a scratch `pharn`-layout project: off a TTY without `--yes` it printed the PLAN and exited 1 writing nothing; with `--yes` it deleted the 4 recorded unchanged files and the 2 emptied directories, kept an edited `THREAT-MODEL.md`, the user's `pharn/features/my-feat/PLAN.md` and `.claude/commands/mine.md`, left `.claude/settings.json` byte-identical, backed up the config, and listed the one hook still wired to the removed script. That run surfaced a hard-wrapped HOOKS sentence, fixed in `92a4c9a`.

## Floor-gate findings (blocking)

None.

- L-floor (P0): deletion reduces to record-key membership + sha256 string equality against a stamp-checked store (`recordsBaseline`), bounded by `isInstallSurfacePath` (string membership) and contained by `safeJoin` + `findSymlinkComponent`; directory removal is `rmdirSync` (kernel refuses non-empty). The orderings (refusals before the first unlink; config deleted last; re-plan under the lock) are labelled as control flow / ordering arguments, not floor primitives, in `src/commands/uninstall.ts`'s header and the docs. The hook listing is labelled textual/advisory. No unlabelled guarantee found.
- L-eval (P1): every new behaviour has a vitest test — `tests/uninstall-plan.test.ts` (13: every bucket, both layouts, FIFO, unreadable, symlinked parent, ENOTDIR on both walks), `tests/uninstall.test.ts` (29: full run with byte-identical config backup and settings.json, edited/unrecorded/outside files kept, every refusal with a whole-tree `snapshotTree` before/after, TTY confirm accept/decline/cancel, config changed and file edited and symlink planted while the prompt was open, resumable part-way failure, root never removed, the HOOKS bound), `tests/install-manifest.test.ts` (predicate mirror against a real `installCapabilities` run in both layouts + the pre-relocation features README, 34 rejections), `tests/hook-wiring.test.ts` (8), `tests/index.test.ts` (7 dispatch/flag cases).
- L-trust (P2): no fetched input; `uninstall.ts` imports no repo/network module. Record keys are joined into paths only after `isInstallSurfacePath` (which also rejects empty/`.`/`..` segments on its own) and only via `safeJoin` after a parent symlink walk; a hand-edited `src/app.ts` key with a matching hash is `outside` and survives (tested). Every path printed goes through `escapeUnsafe`; project hook entries are printed only through `displayHook` (control-character test).
- L-axis (P3): `uninstall-plan.ts` has one axis (which recorded files may be deleted); `isInstallSurfacePath` sits beside the manifest it mirrors; `hooksReferencing` reads hook wiring exactly as `diffHookWiring` does. No command→command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: 'src/commands/uninstall.ts:226'
  problem: 'The failure branch of unlinkIfPresent (records/config unlink failing after every provable file is gone) and the ENOENT tolerance on the file and rmdir loops are untested; they are reachable only through a concurrent local change or a permission flip mid-run, which the test harness cannot interleave without mocking fs.'
  evidence: 'Every file pharn could prove it wrote is already gone; delete ${label} yourself to finish.'
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'src/lib/uninstall-plan.ts:45'
  problem: 'Hash-then-unlink is a check, not a lock: a local process rewriting a file between the in-lock plan and its unlink is not covered. Stated in the code header, as for remove/add; not repeated in the user docs.'
  evidence: 'NOT a lock (stated, P0): the classification reads the tree at time T and the delete runs at T+1'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'CONSTITUTION.md:74'
  problem: "P3's parenthetical verb list (`init`/`add`/`remove`/`update`/`list`/`status`) no longer names every file in commands/; it is a human-only trusted doc, so the agent did not edit it (replacement text handed over at GATE 2)."
  evidence: 'verb (`init`/`add`/`remove`/`update`/`list`/`status`); each file in `steps/` owns one init stage;'
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'LIMITS.md:63'
  problem: "LIMITS.md has no entry for uninstall's residuals (unrecorded/edited files survive; settings wiring reported, not removed; a hand-edited record inside the install paths can opt a file in; no usable store means no uninstall). Human-only; proposed section 1e handed over at GATE 2."
  evidence: '### 1d. `update` / `status` resolve against upstream HEAD; `remove` resolves offline'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'src/commands/uninstall.ts:213'
  problem: "Behaviour worth the human's attention: when every recorded file was edited, uninstall still deletes pharn.records.json and pharn.config.json (backed up) and reports 'Deleted 0 file(s)'. That matches the approved design (the config marks the install; edited files become the user's), but it means a mistaken uninstall on a heavily customised project leaves only the config backup as a way back."
  evidence: 'Records first, config LAST (see the header).'
```

## Proposed lesson (not written to canon)

None — no recurring failure pattern.

VERDICT: GREEN — 0 floor-gate findings, 5 advisory (minor) findings. This review is advisory; the merge / fix / abandon decision is the human's.

## After GATE 2

The human kept advisories 2 and 5 as they are. Advisory 1 was addressed in `ae4edb3`: `tests/uninstall.test.ts` now drives a recorded file and a directory vanishing mid-run (ENOENT tolerated) and the final `pharn.records.json` / `pharn.config.json` delete failing, through a pass-through `node:fs` mock. Advisories 3 and 4 (trusted docs) stay with the human.
