# SHIP — skills-version-timeout-and-cap (roll-up; ADVISORY)

Gated `/pharn-dev-ship` run (no `--loop`). Increment: make `fetchRemoteSkillsVersion`'s 8s timeout and
256KB body cap actually cover the response **body**.

## Stages run, in order, and where the run ended

| # | stage                | artifact                                    | structural verdict read          |
| - | -------------------- | ------------------------------------------- | -------------------------------- |
| 1 | `/pharn-dev-plan`    | `PLAN.md`                                   | GATE 1 — see the note below      |
| 2 | `/pharn-dev-grill`   | `GRILL.md`                                  | none (advisory by design)        |
| 3 | `/pharn-dev-build`   | the three files in `PLAN.md` `## Files`     | `validate.mjs` exit **0**        |
| 4 | `/pharn-dev-regress` | `regression-report.json`, `REGRESSION.md`   | `.verdict` = **`no-regressions`**|
| 5 | `/pharn-dev-verify`  | `verify-report.json`, `VERIFY.md`           | `.verdict` = **`PASS`**          |
| 6 | `/pharn-dev-review`  | `REVIEW.md`                                 | none (prose only, gates nothing) |

The run ended at **GATE 2** — the post-review human decision — not at a RED-verdict STOP.

## The structural verdicts, verbatim

- `/pharn-dev-build` → `node .dev/floor/validate.mjs .` **exit 0** (`FLOOR: GREEN — 0 capabilities
  checked in .`). The increment's real deterministic gate, `npm run check`, also exited **0**.
- `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`no-regressions`**, `regressions[]`
  empty, `pre_existing[]` empty. Base `2db65631d1243c96b75e19281b6ad19ea1d81722`; outside gates
  `tests` 0→0 and `validate` 0→0; style gates skipped by the deterministic rule (no shared style
  config touched).
- `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`PASS`**, `failing_gates[]` empty, over
  `format:check` / `lint` / `lint:md` / `typecheck` / `test` / `build` / `validate`, all exit 0.
  `verifiers: {registered: 0, findings: []}` — none registered, floor gates only.

Both reports were **recomputed after** the two blocking review findings were fixed; the verdicts
above are the post-fix ones.

## Pointers (cited, not restated — P4)

- Intent + file list: `.dev/features/skills-version-timeout-and-cap/PLAN.md`
- Pre-build interrogation (advisory): `.dev/features/skills-version-timeout-and-cap/GRILL.md` —
  6 findings, 1 blocking (an overstated peak-allocation claim); 4 resolutions folded into the plan.
- Post-build review (advisory): `.dev/features/skills-version-timeout-and-cap/REVIEW.md` —
  2 blocking findings, both resolved in-increment; 3 advisory residuals stand.
- Human renders of the two floor verdicts: `REGRESSION.md`, `VERIFY.md`.

## Scope disclosure for the human (GRILL.md F6)

The originating brief heads itself "PR bundle: PR 3 — land together with 4.11 and the degit pin
(FABLE 4.10)". This increment folds in **4.11** (its own acceptance criteria require those two
negative tests) and scopes **4.10 out**: the degit exact-version pin is a dependency-declaration
change with its own separate acceptance list (`package-lock` re-resolution, a new
`tests/degit-pin.test.ts`, `THREAT-MODEL.md` / `LIMITS.md` / `docs/contributing.md` prose), and the
pasted brief itself lists it under **Out of scope**. Bundling it would make one PR pass-or-fail on
two unrelated verdicts. **Whether to bundle it anyway is the human's call.**

## GATE 1, recorded honestly

The increment was specified in full by the human in the `/pharn-dev-ship` invocation — task, three
verified defects, the fix shape, the invariant list and the acceptance criteria — and the same
message pre-authorised the post-review decision ("create pull request … merge pr"). GATE 1 was
therefore satisfied by that message rather than by a separate approval halt, and **GATE 2 was
delegated in advance, not self-issued.**

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
