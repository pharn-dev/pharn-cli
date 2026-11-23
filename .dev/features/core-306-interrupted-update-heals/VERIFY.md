# VERIFY — core-306-interrupted-update-heals

FLOOR layer (owns the verdict, `check-verify.mjs`): every gate run once at HEAD (rebased on 11925f08), each
through heavy.sh.

| Gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |
| build        | 0    |

- `test` is `npx vitest run --coverage --maxWorkers=1` (what CI's `Test` job runs): 106 files, 3625 passed,
  1 skipped; coverage floors met (98.53/95.66/99.06/99.02). The feature's own cases are
  `tests/commands/update-interrupted.test.ts` (9) and the `incoming` block of `tests/install-records.test.ts` (8).
- No eval-actual pair ships with this increment, so there is no `structural:*` gate.
- An earlier run under a load average near 96 (sibling agents) failed 11 tests on the 5 s vitest timeout, in
  files this change does not touch; the run above, after the reboot and on one heavy slot, is clean.

ADVISORY layer: no verifiers registered (`count-verifiers.mjs` → 0) — floor gates only.

VERDICT: PASS — the named deterministic gates passed. This says the gates passed, not that the feature is correct.
