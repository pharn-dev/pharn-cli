# SHIP — add-version-gate

Increment: `pharn add` must not close `pharn update`'s version gate (H2).
Base: `135406a` (`main`, v0.4.0 unreleased). Mode: **gated** (no `--loop`).

## Stages run, in order

| # | Stage                | Outcome |
| - | -------------------- | ------- |
| 1 | `/pharn-dev-plan`    | `PLAN.md` written → **GATE 1**, human approved *"Approve as written"* with three resolutions (include the `status.md` clause; add the `CLAUDE.md` sentence; reuse the existing `error` arm) |
| 2 | `/pharn-dev-grill`   | `GRILL.md` — advisory, gates nothing. 6 concerns (0 blocking, 2 important, 4 minor). F1/F3/F4/F5 folded into the plan before any code was written |
| 3 | `/pharn-dev-build`   | 6 files written (exactly the plan's `## Files`) — **floor GREEN** |
| 4 | `/pharn-dev-regress` | `regression-report.json` — **`no-regressions`** |
| 5 | `/pharn-dev-verify`  | `verify-report.json` — **`PASS`** |
| 6 | `/pharn-dev-review`  | `REVIEW.md` — 0 floor-gate findings, 4 advisory |

**Run ended at GATE 2** (present-to-human), not at a RED-verdict STOP.

## Structural verdicts read, verbatim

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code: `0`**
  Measured over tracked source with the feature applied (`git worktree` at `135406a` + the working
  diff): `FLOOR: GREEN — 0 capabilities checked in .`
  **Disclosed, not hidden:** the same command in the live working directory exits `1`. All 15
  blocking findings are inside the seven **gitignored** `test-*/` fixture installs (pharn-oss's own
  deliberately-red `floor/test-fixtures/red/skill.md`); **zero** are in tracked source, and
  `/pharn-dev-regress` independently measured this gate `0 → 0` across base and head. Full reasoning
  and the counter-reading are in `VERIFY.md`'s disclosure section. Scoping the measurement this way
  is **advisory orchestration**, and it is recorded so it can be disputed.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`: `"no-regressions"`**
  `regressions: []`, `pre_existing: []`. Outside gates `tests` `0 → 0` (665 tests, 665 pass, 0 fail
  on both sides) and `validate` `0 → 0`. `check-regress.mjs scope` returned `escaped: []` — the
  build did not write outside the plan's `## Files`.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`: `"PASS"`**
  `failing_gates: []`. Gates: `test` 0 (552 tests), `validate` 0, `lint` 0, `format:check` 0,
  `lint:md` 0. `verifiers: {registered: 0, findings: []}` — no verifiers registered, floor gates
  only; the advisory layer contributed nothing to this verdict and could not have.

## Pointers (cited, not restated — P4)

- `.dev/features/add-version-gate/REVIEW.md` — the four lenses, 4 advisory findings, 2 proposed
  lesson candidates. **Prose only**; every `severity` in it is an LLM assignment (advisory, fix #3).
- `.dev/features/add-version-gate/GRILL.md` — advisory pre-build interrogation.
- `.dev/features/add-version-gate/VERIFY.md` / `REGRESSION.md` — the human renders, including the two
  orchestration corrections made mid-run (the zsh word-splitting capture bug; the worktree-vs-working-
  directory `validate` measurement).

## Beyond the chain — the build prompt's Phase C

Run and passing: `npm run check` (exit 0), `npm run lint:md` (0 issues), `npm run test:coverage`
(`src/commands/add.ts` **up** on all four metrics — lines 82.72→86.95, stmts 80.16→84.25, funcs
91.66→92.30, branches 58.20→65.75; `versionGate` and both call sites 100% covered), `npm run build`
(`dist/index.js`, 66 KB).

**Manual e2e against live upstream (network available; not simulated).** Stale config
(`skillsVersion: "0.0.1"`) + real `dist/index.js add lens:trust-fence` against live
`pharn-dev/pharn-oss` (`SKILLS_VERSION` = `2.3.0`) → refusal naming both versions and `pharn update`,
**exit 1**, config sha256 byte-identical, no `pharn/` tree, no `pharn.records.json`. Then
`skillsVersion` set to `2.3.0` and re-run → capability installed at `pharn/pharn-review/trust-fence`,
`skillsVersion` unchanged, `commit` refreshed `null → 11c51a9b…`, and **no** `pharn.records.json`
minted (fail-closed — `add` only extends an already-readable store).

## Post-GATE-2 fixes applied (human elected "fix findings 1 & 2 first")

Both are the one-liners `REVIEW.md` recommended. The other two advisory findings stand as recorded
there (P2 terminal-escape interpolation — deferred as a pre-existing four-site issue; P3 half-stale
comment — deliberately untouched per the brief's byte-equivalence requirement).

- **Finding 1 (P0, `docs/commands/add.md`)** — "before **anything** is written" was unqualified while
  the clone had in fact already been fetched. Narrowed to "before anything **in your project** is
  written", with the clone fetch stated explicitly in a trailing parenthetical rather than left to be
  inferred.
- **Finding 2 (P1, `tests/add.test.ts`)** — the picker refusal test asserted no-prompt / no-write but
  never the message content, so "names both versions and `pharn update`" was proven only on the named
  path. Three `lastError()` assertions added, closing the invariant symmetrically. They pass, which
  independently confirms the picker's refusal text really does carry both versions and the resolution.

**Floor re-run after the fixes:** `npm run check` **exit 0** (38 files, **552 tests** — unchanged
count; the three assertions extend an existing test), `npm run lint:md` **0 issues**. The
`/pharn-dev-regress` and `/pharn-dev-verify` verdicts above were computed before these two edits; both
edits are confined to files already inside the feature's declared scope, and neither touches
`src/`, so the outside-scope comparison is unaffected.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** Nothing has been committed, merged,
pushed, or sealed. No `PHARN ✓ reviewed` seal has been applied, and `/pharn-dev-ship` did not issue one.
