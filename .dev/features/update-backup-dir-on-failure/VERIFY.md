# VERIFY — update-backup-dir-on-failure

## FLOOR layer — the gates that own the verdict

| gate           | exit | command                          |
| -------------- | ---- | -------------------------------- |
| `test`         | 0    | `npm test` (988 tests, 49 files) |
| `validate`     | 0    | `node .dev/floor/validate.mjs .` |
| `lint`         | 0    | `npm run lint`                   |
| `format:check` | 0    | `npm run format:check`           |
| `lint:md`      | 0    | `npm run lint:md`                |
| `typecheck`    | 0    | `npm run typecheck`              |

`failing_gates[]`: empty. No `structural:*` gate: this feature ships no committed eval pair (its
deterministic correctness signal is its own `*.test.ts`, collected by `npm test`).

**VERIFIED: floor gates PASS.** (`check-verify.mjs` → `"PASS"`, exit 0.)

## What the feature's own tests actually pin

Inside the whole-repo `test` gate, seven assertions in `tests/update.test.ts` cover this increment:

- the aborted `--force` run names the timestamped directory that exists on disk, reports
  `Backed up 2 file(s)`, and says the run stopped part-way;
- that notice reaches **stderr** (asserted at the real call site — a `vi.fn()` mock swallows a missing
  option silently);
- a failure at the **config write** — a different post-backup throw site from `applyWrites` — still
  names the directory;
- a failure with **no** backup prints no pointer, and a run whose `createBackup` itself threw prints
  none either;
- the success path still prints both lines, the exact directory, and stays on **stdout**.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Nothing annotates this report, and nothing could have
flipped the verdict if it had: `check-verify.mjs`'s only input is the gate→exit-code map, so a verifier
finding cannot reach it even in principle (fix #3).

## Honest residual

Verified = **the named gates passed**; this is NOT a guarantee of correctness beyond what those gates
check. Verifier concerns are advisory help, not assurance — and there are none here.

Two specific things this verdict does **not** cover, named rather than left implied:

- The gates are whole-repo and re-run the suite with the feature present; the feature-specific signal
  is only as good as the seven assertions above. A defect in this change that none of them encodes —
  say, wording that reads badly to a real user, or a post-backup throw site none of the three tested
  paths reaches — is invisible here.
- The claim the increment makes ("the backup directory is printed whenever one was created") is
  **advisory** in the P0 sense: it is deterministic control flow demonstrated by tests, not one of the
  three floor primitives. A green `test` gate is evidence for it, not a reduction of it.
