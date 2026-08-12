# SHIP — ci-matrix-required-checks

**Where this run ended: GATE 2** — the post-review human decision (merge / fix / abandon).

## Stages run, in order

| #   | stage                | outcome                                                                 |
| --- | -------------------- | ----------------------------------------------------------------------- |
| 1   | `/pharn-dev-plan`    | GATE 1 — halted, revised once on human feedback, then approved           |
| 2   | `/pharn-dev-grill`   | advisory — 6 concerns (0 blocking, 4 important, 2 minor); gates nothing  |
| 3   | `/pharn-dev-build`   | floor GREEN                                                              |
| 4   | `/pharn-dev-regress` | run 1 **`regressions` → STOP**; human widened scope; run 2 `no-regressions` |
| 5   | `/pharn-dev-verify`  | `PASS`                                                                   |
| 6   | `/pharn-dev-review`  | GREEN — 0 floor-gate findings, 7 advisory                                |

## Structural verdicts read, verbatim

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit `0`** (GREEN). Alongside it, all six
  gates the new workflow defines pass locally: `npm run check` exit 0, `lint:md` exit 0, `build`
  exit 0.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict` = `"no-regressions"`**, helper exit
  `0`. `regressions[]: []` · `pre_existing[]: []` · base `4b8a0be0c4cbb1e84c93cf0ae47ffd3324c205b9` ·
  gates `tests 0→0`, `validate 0→0`.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict` = `"PASS"`**, helper exit `0`.
  `failing_gates: []` · gates `test`, `validate`, `lint`, `format:check`, `lint:md` all `0` ·
  `verifiers: {registered: 0, findings: []}`.

**The one STOP, recorded rather than smoothed over.** `/pharn-dev-regress` run 1 returned
`"regressions"` (exit 1) and halted the chain. Cause: six `npm ci` lines instead of one tripped the
exact-count tripwire in `.dev/floor/check-run-pins.test.mjs` (`d.skipped` 2 → 7) — a floor test
outside the approved `## Files`, so the fix-#7 hook denied the fix, correctly. The human approved a
scope amendment; the count was updated with a comment naming the new arithmetic and the scope was
re-set **from the amended plan**, never bypassed. A prior capture in that same stage had also been
invalid (a zsh word-splitting bug produced a false green over a real regression) — see
`REGRESSION.md`, which keeps both runs.

## GATE 1 decisions (the human's, recorded)

The plan was rewritten once. The first draft proposed building the 30-context OS/node matrix the
ruleset demanded; the human rejected that direction — **one required check per gate, no matrix** —
and chose **node 24**, and **report-only** on the signing blocker.

## Pointers (cite, don't restate — P4)

- `PLAN.md` — approved plan (incl. the post-STOP scope amendment), guarantee audit, named limits.
- `GRILL.md` — advisory grill-log, 6 concerns.
- `REGRESSION.md` / `regression-report.json` — both regress runs and the corrected capture.
- `VERIFY.md` / `verify-report.json` — the floor gate table and its residual.
- `REVIEW.md` — 7 advisory findings and a proposed canon lesson (not yet promoted).

## Out-of-repo change APPLIED — GitHub ruleset 18605288 (`main protection`)

`required_status_checks` reduced from **33** contexts to **9**. All other rules preserved unchanged:
`pull_request`, **`required_signatures`**, `non_fast_forward`, `deletion`; `enforcement: active`;
bypass actors untouched.

Now required: `Format check`, `Lint`, `Markdown lint`, `Typecheck`, `Test`, `Build`, `floor`,
`gitleaks`, `Analyze (javascript-typescript)`.

**Rollback record (durable — this is repo settings, so `git revert` cannot undo it).** To restore the
previous list, PUT the same payload with `required_status_checks` set back to these 33 contexts:

```text
Format check (ubuntu-latest / node 20)     Typecheck (ubuntu-latest / node 20)
Format check (ubuntu-latest / node 22)     Typecheck (ubuntu-latest / node 22)
Format check (ubuntu-latest / node 24)     Typecheck (ubuntu-latest / node 24)
Format check (windows-latest / node 24)    Typecheck (windows-latest / node 24)
Format check (macos-latest / node 24)      Typecheck (macos-latest / node 24)
Lint (ubuntu-latest / node 20)             Test (ubuntu-latest / node 20)
Lint (ubuntu-latest / node 22)             Test (ubuntu-latest / node 22)
Lint (ubuntu-latest / node 24)             Test (ubuntu-latest / node 24)
Lint (windows-latest / node 24)            Test (windows-latest / node 24)
Lint (macos-latest / node 24)              Test (macos-latest / node 24)
Markdown lint (ubuntu-latest / node 20)    Build (ubuntu-latest / node 20)
Markdown lint (ubuntu-latest / node 22)    Build (ubuntu-latest / node 22)
Markdown lint (ubuntu-latest / node 24)    Build (ubuntu-latest / node 24)
Markdown lint (windows-latest / node 24)   Build (windows-latest / node 24)
Markdown lint (macos-latest / node 24)     Build (macos-latest / node 24)
floor                                      Analyze (javascript-typescript)
gitleaks
```

## State left behind

- **Working tree, uncommitted:** `.github/workflows/ci.yml` (rewritten), `tests/ci-workflow.test.ts`
  (new), `.dev/floor/check-run-pins.test.mjs` (one constant), `CLAUDE.md`, `docs/contributing.md`,
  plus this feature folder. **Nothing committed, nothing pushed** — that is the human's call.
- **Blocker B untouched, as decided:** commit `4b8a0be` is `"verified": false, "reason": "unsigned"`
  and `required_signatures` remains active, so PR #92 stays blocked on signatures regardless of
  checks. No git signing config was modified.
- **Until the branch is pushed**, the six new contexts cannot report — the workflow that produces
  them exists only in this working tree. Expect PR #92 to show six pending required checks in the
  interval, which looks like the original symptom but is not it.
- **The two open dependabot PRs (#88, #89)** need an update-to-`main` before they report the six new
  contexts. `strict_required_status_checks_policy: true` already forces that rebase (#88 is
  `mergeable_state: "behind"`), so this is self-healing, not a trap.

## Standing decision

The chain ran end to end and the named floor verdicts are as shown — `validate` exit 0,
`no-regressions`, `PASS`. **This is NOT a judgment that the increment is good or wise; that is the
human's call at the post-review gate.** `/pharn-dev-ship` has not merged, pushed, committed, or
applied any `PHARN ✓ reviewed` seal, and does not do so.
