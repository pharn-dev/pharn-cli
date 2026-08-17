# SHIP — layout-warn-both-directions

Gated `/pharn-dev-ship` run (no `--loop`). Base `210d0e487ddb6cd6aceba1fa07bf2c4a7574dea9` (`210d0e4`,
`main`). Ended at **GATE 2** — the full chain ran, no stage returned a non-GREEN verdict.

## Stages, in order

| # | stage                  | ran | outcome                                                   |
| - | ---------------------- | --- | --------------------------------------------------------- |
| 1 | `/pharn-dev-plan`      | yes | halted at **GATE 1**; human approved *as written*          |
| 2 | `/pharn-dev-grill`     | yes | advisory — 5 concerns (0 blocking); proceeded regardless   |
| 3 | `/pharn-dev-build`     | yes | floor GREEN                                                |
| 4 | `/pharn-dev-regress`   | yes | `no-regressions`                                           |
| 5 | `/pharn-dev-verify`    | yes | `PASS`                                                     |
| 6 | `/pharn-dev-review`    | yes | advisory GREEN — 0 floor-gate, 4 advisory findings          |

## Structural verdicts read, verbatim

The only three values that decided proceed-or-stop in this run:

| stage                | source                                       | verdict read                                    |
| -------------------- | -------------------------------------------- | ----------------------------------------------- |
| `/pharn-dev-build`   | `npm run check` exit code                    | **`0`** (also `.dev/floor/validate.mjs .` → `0`) |
| `/pharn-dev-regress` | `regression-report.json` `.verdict`          | **`"no-regressions"`** (helper exit `0`)         |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`              | **`"PASS"`** (helper exit `0`; `failing_gates[]` empty) |

Supporting floor reads, also verbatim:

- `check-regress.mjs scope` → exit `0`, `"escaped": []` — no fix #7 breach; 46 outside tests, 0 outside
  eval pairs; `outside_gates` `tests 0→0`, `validate 0→0`.
- `check-verify.mjs` gates → `test 0`, `validate 0`, `lint 0`, `format:check 0`, `lint:md 0`.
- `count-grillers.mjs .` → `{"registered":0,"grillers":[]}`; `count-verifiers.mjs .` →
  `{"registered":0,"verifiers":[]}`. Both are FLOOR membership reads; both empty is the honest P7 state
  of this repo, so the grill's axes were inline and verify was floor-gates-only.
- Spec content-hash (fix #4, enforced at `/pharn-dev-build`): live `sha256(ARCHITECTURE.md)` =
  `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` = `PLAN.md`'s `spec_content_hash`.
  **MATCH** — no drift.

## Pointers (cited, not restated — P4)

- `.dev/features/layout-warn-both-directions/PLAN.md` — the approved intent (GATE 1).
- `.dev/features/layout-warn-both-directions/GRILL.md` — advisory pre-build interrogation.
- `.dev/features/layout-warn-both-directions/REGRESSION.md` + `regression-report.json`.
- `.dev/features/layout-warn-both-directions/VERIFY.md` + `verify-report.json`.
- **`.dev/features/layout-warn-both-directions/REVIEW.md`** — the advisory review the human reads at
  GATE 2. Its findings are **not** restated here.

## Notable, for the human at the gate

- **Base drift from the build prompt, inert.** The prompt named `2cd061d` (#95); live `main` is
  `210d0e4` (#96, the shared symlink-walk refactor), which touched neither `reportOutcome` nor the layout
  plumbing. Every other `§0` anchor was re-verified verbatim before any edit.
- **One Phase C prediction missed and reported rather than engineered away.** `grep -c abandonedLayout
  src/commands/update.ts` measured **5**, not the predicted 4 (`3 baseline + 1 branch + 1 mention in the
  new comment`). The underlying claim — exactly one branch added — holds, established by
  `grep -rnF 'Your install moved to the pharn/ layout' src/ | wc -l` → **1** and by the flat pin staying
  green and absent from the diff's `-` lines. The comment was **not** reworded to make the number green.
  `GRILL.md` predicted this mismatch pre-build; `REVIEW.md` records it as a P0 labeling finding and
  proposes it as a lesson candidate.
- **Coverage on `update.ts` rose on every metric** (measured against a stashed baseline, not argued):
  stmts 90.4 → 90.55, branch 82.29 → 82.65, funcs 100 → 100, lines 92.17 → 92.30. Test count 754 → 755.
- **No manual e2e was run, deliberately.** Both directions are fixture-pinned through the real
  `runUpdate` harness against a real filesystem; a live reverse migration would require upstream to flip
  layouts, which is precisely the hypothetical the pins exist to cover without waiting for it.
- **A lesson candidate is proposed, not promoted.** It lives inside `REVIEW.md`; writing canon requires a
  separate human-gated `/pharn-dev-memory-promote` run. No `.dev/memory-bank/**` write occurred.

## Guarantee audit for this run (P0)

- **"the stages ran in order"** → **ADVISORY.** Nothing on the floor forces the sequence; this agent
  invoked each stage.
- **"the run proceeded only past GREEN verdicts"** → the **verdicts** are FLOOR (each sub-stage's own
  checker: `npm run check` exit, `check-regress.mjs`, `check-verify.mjs`); the **act** of reading them and
  proceeding is **ADVISORY orchestration**.
- **"both human gates were preserved"** → **ADVISORY** (command discipline). GATE 1 was
  `/pharn-dev-plan`'s own halt, and it was genuinely answered by the human — including two judgment calls
  put as selectable options. GATE 2 is this document's terminus.
- **"`/pharn-dev-ship` wrote only `SHIP.md`"** → **FLOOR: hook (fix #7).** `set-writes-scope.cjs` +
  `enforce-writes-scope.cjs` pinned this one path immediately before this write; each earlier stage's
  writes were pinned by its own Step 0 scope.
- **Net:** this gated run added **zero** new floor primitives. Every guarantee above belongs to a
  sub-stage. `/pharn-dev-ship` contributed convenience and two preserved human gates — nothing more.

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good
or wise; that is the human's call at the post-review gate. No merge, no push, no commit, and no
`PHARN ✓ reviewed` seal has been applied.
