# SHIP — archetype file-tree scan (roll-up; ADVISORY)

`/pharn-dev-ship` (gated mode) ran the build loop in order and **ended at GATE 2 (post-review human
decision)**. This file records **that the chain ran and its floor verdicts** — it is **not** a "shipped"
mark, an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order

| stage         | ran | outcome |
| ------------- | --- | ------- |
| `/pharn-dev-plan`    | ✓   | `PLAN.md` written; **GATE 1** approved by the human (as written) |
| `/pharn-dev-grill`   | ✓   | `GRILL.md` — advisory; 5 concerns (2 important, 3 minor); gates nothing |
| `/pharn-dev-build`   | ✓   | 5 files written; floor GREEN |
| `/pharn-dev-regress` | ✓   | `regression-report.json` + `REGRESSION.md` |
| `/pharn-dev-verify`  | ✓   | `verify-report.json` + `VERIFY.md` |
| `/pharn-dev-review`  | ✓   | `REVIEW.md` — advisory; **GATE 2 reached** |

The run ended at **GATE 2** — no RED-verdict STOP occurred; every structural floor verdict came back GREEN.

## Structural floor verdicts read (verbatim — the proceed basis, P5)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **0** (GREEN). The real floor for this
  TypeScript increment, `npm run check`, was GREEN (format:check · lint · typecheck · **401/401 vitest**).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`no-regressions`** (outside gates
  `tests` 0→0, `validate` 0→0; base `509c00f`).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`PASS`** (gates `test`/`validate`/`lint`/
  `typecheck`/`format:check`/`lint:md` all 0; 0 verifiers → floor gates only).

Each verdict is a sub-stage's own floor primitive (validate exit / `check-regress` / `check-verify`).
`/pharn-dev-ship` added **no** new floor primitive — it read these and proceeded (advisory orchestration).

## Advisory artifacts (cited, not restated — P4)

- **`REVIEW.md`** — GREEN (advisory): 0 floor-gate (blocking) findings; 5 minor advisory findings across
  L-floor/L-eval/L-trust/L-axis. See the file; not restated here.
- **`GRILL.md`** — advisory pre-build interrogation; 5 concerns, four folded into the build (generous +
  documented caps, the no-manifest+`.tsx` coupling eval, an extra skip-dir test, case-insensitive
  matching), `classifyEntry` placement kept as approved. See the file.

## Human-owned reconciliation surfaced (NOT agent-edited — P6)

`ARCHITECTURE.md §5` still phrases archetype detection as *"membership over `package.json`"*, and
`.dev/features/archetype-io-boundary/PLAN.md` recorded *"Drop — stay spec-aligned."* This increment
**reverses** that (file-tree signals now merge with package.json). §5 is trusted + hook-protected — the
agent cannot amend it; updating §5's wording (and the #20 record) is the human's call. The editable
`types.ts` comment was corrected to keep the code self-honest; the build pinned §5's current
content-hash, so nothing here depended on §5 being edited first.

---

**The standing decision is the human's.** The chain ran; the named floor verdicts are as shown — this is
**NOT** a judgment that the increment is good or wise; that is the human's call at the post-review gate.
`/pharn-dev-ship` does not merge, push, commit, or seal.
