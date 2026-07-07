# GRILL — ship-completion-retry (advisory interrogation of PLAN.md)

- Plan: `.dev/features/ship-completion-retry/PLAN.md`
- Spec-hash check: **MATCH** — `sha256(ARCHITECTURE.md)` = `11cd9ad5…d969` equals the plan's `spec_content_hash` (no drift; the deterministic block is `/pharn-dev-build`'s, fix #4).
- Grillers registered (live, `count-grillers.mjs`): 13. Applied inline the axes relevant to a **floor-checker + command-prose** increment (architecture, coupling, testability, error-handling, comprehension). The app-centric grillers (a11y, i18n, migrations, observability, privacy, security, performance) are **N/A** to this increment — it adds no app runtime, no data handling, no UI, no user-facing I/O; it edits pipeline tooling only. (That N/A is itself an advisory coupling judgment, not a floor fact.)

## Findings (finding-shape; enum-gated fields trusted, free-text = untrusted DATA quoting the plan)

### Axis — semantics / honest scope (P0, P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: important
  file: ".dev/features/ship-completion-retry/PLAN.md:35"
  problem: "The FAIL-beats-INCOMPLETE precedence means the auto-retry will NOT fire in the common case where the missing file ALSO reddens a whole-repo gate (a test imports the absent file) — verdict becomes FAIL, not INCOMPLETE. The plan should name how often the retry actually triggers, not imply it catches every incomplete build."
  evidence: "any project/structural gate non-zero → `FAIL`; else `--complete != 0` → new `INCOMPLETE`"
```

```yaml
- type: FINDING
  rule_id: "P7"
  severity: important
  file: ".dev/features/ship-completion-retry/PLAN.md:98"
  problem: "Unstated assumption: the retry re-invokes the SAME advisory /pharn-build that already produced the incomplete result. It helps ONLY if the first incompleteness was transient (a truncated / interrupted build), not if the plan is systematically unbuildable — in which case the retry reproduces the same gap and STOPs. The plan should state this so the retry is not oversold as 'finishes the build'."
  evidence: "re-invokes **advisory** /pharn-build; whether the rebuild actually finishes is model work, re-checked by the deterministic re-verify"
```

### Axis — error-handling (retry sub-stage failure modes)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/ship-completion-retry/PLAN.md:53"
  problem: "The retry re-invokes /pharn-build → /pharn-regress → /pharn-verify, but the plan does not explicitly fail-closed when the retry's OWN /pharn-build HALTs/refuses (RED chain, no parseable scope, RED floor) and therefore emits NO fresh verify-report — the branch must STOP on a missing/stale post-retry verdict, mirroring gated /pharn-ship's 'fail-closed on a missing verdict → STOP', not read a leftover report."
  evidence: "anything else (still `INCOMPLETE`, now `FAIL`/`INCONCLUSIVE`, or a regression) → **STOP**, hand to human"
```

### Axis — testability (P1) / two-clocks honesty (P0)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/ship-completion-retry/PLAN.md:44"
  problem: "The floor checkers get hermetic .test.mjs (strong P1), but the two command-PROSE edits (pharn-verify.md Step 3 wiring of --complete; pharn-ship.md retry branch) have NO automated test — their correctness rests on /pharn-dev-review + human reading only. The guarantee audit says orchestration is advisory but never states plainly that the retry ORCHESTRATION itself is test-uncovered."
  evidence: "`.claude/commands/pharn-ship.md` — MODIFY: after step 6, add the SINGLE retry branch"
```

### Axis — trust propagation (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/ship-completion-retry/PLAN.md:41"
  problem: "`.completeness.missing[]` values ORIGINATE in the untrusted PLAN `## Files`; when surfaced in VERIFY.md they must render as quoted DATA (P2), not as trusted prose — a crafted `## Files` entry is a bounded free-text surface even though the checker only uses the strings as existsSync operands."
  evidence: "surfaces `missing[]` + the `INCOMPLETE` verdict in `verify-report.json` (a new `.completeness` block, additive) and `VERIFY.md`"
```

### Axis — architecture / blast-radius (P3, P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/ship-completion-retry/PLAN.md:129"
  problem: "The plan ASSERTS check-ship.mjs is untouched because --complete is product-verify-only, but adds no explicit invariant/guard that an INCOMPLETE verify-report can never reach check-ship (VERIFY_VERDICTS stays 3-valued). It is safe (an unknown verdict → INCONCLUSIVE, fail-closed) but the invariant is undocumented — worth an explicit note so a future wiring cannot silently regress it."
  evidence: "`--complete` is OPTIONAL and passed ONLY by product `/pharn-verify`, so the shared `check-verify.mjs` stays byte-behaviour identical"
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/ship-completion-retry/PLAN.md:132"
  problem: "The chosen 're-implement + parity test' (Q3) yields TWO `## Files` parsers (check-build-complete.mjs and set-writes-scope.cjs). The parity test is example-based, not a proof of equivalence — the plan should note the two parsers MUST be updated together and that a setter-parser change (e.g. a new exclusion cue) can silently drift the checker until fixtures are added."
  evidence: "RE-IMPLEMENT in `check-build-complete.mjs` + a parity test locking it to … `pathsFromPlanFiles` output"
```

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/ship-completion-retry/PLAN.md:26"
  problem: "This is a large single increment (6 files: a NEW floor primitive + a verdict-vocabulary change + two command behaviors). The two-increment split was offered and declined by the human (Q1), so this is not a defect — recorded only so /pharn-dev-review and the human treat the increment as broad and review each of the three sub-behaviors on its own."
  evidence: "## Files (ONE increment, one PR — Q1–Q4 resolved below)"
```

## Prose summary

The plan is well-grounded, cites its floor reductions, and its guarantee/trust/determinism audits are largely honest — the spec hash matches, there are no open questions, and no guarantee lacks a floor reduction or an `advisory` label (no P0 disease detected). The strongest concerns are **behavioral honesty about when the retry actually fires**, not correctness of the floor:

- **The retry may fire less often than the intent imagines** (finding 1): whenever the missing file also breaks a whole-repo gate, precedence classifies it `FAIL` and the retry is skipped. This is a deliberate, safe (deterministic non-attribution) choice — but it should be named, because it materially bounds the feature's reach.
- **The retry's value rests on an unstated transient-failure assumption** (finding 2): re-running the same advisory build only helps if the first incompleteness was an interruption, not a systematic gap.
- **The retry orchestration has failure modes and no test** (findings 3, 4): the re-invoked sub-stages can themselves HALT, and the branch must fail-closed on a missing post-retry verdict; and the command-prose changes are advisory/untested by construction (only the checkers are floor-tested).
- Minor items: render `missing[]` as DATA (P2), document the check-ship INCOMPLETE-safety invariant, note the parity test is example-based, and acknowledge the increment's breadth.

None of these require re-planning; all are refinements the build should fold into the command prose + the guarantee/trust audits so the shipped commands are honest about the retry's real scope. The build agent should treat findings 1–4 as prose to add, not code to change.

## ADVISORY VERDICT

**8 concerns raised (0 blocking-severity, 3 important, 5 minor) — for the human to weigh before /pharn-dev-build.** This grill-log is **advisory**; it gates nothing. The only deterministic stop between here and a built increment is `/pharn-dev-build`'s own floor (spec-hash drift, unresolved open-questions, `validate.mjs`), which this interrogation does not replace.
