# SHIP — capability-source-provenance

A roll-up of the `/pharn-dev-ship` run **plus the post-review fix pass**. **Advisory.** It records
that the chain ran and what each stage's floor verdict was — nothing more.

## Stages run, in order

| #   | Stage                | Ended                 | Structural verdict read                     |
| --- | -------------------- | --------------------- | ------------------------------------------- |
| 1   | `/pharn-dev-plan`    | **GATE 1** — approved  | _(human gate; no floor verdict)_            |
| 2   | `/pharn-dev-grill`   | advisory, proceeded    | _(none by design — grills gate nothing)_    |
| 3   | `/pharn-dev-build`   | proceeded              | `validate.mjs` exit **0**                   |
| 4   | `/pharn-dev-regress` | proceeded              | `.verdict` = **`no-regressions`** (exit 0)  |
| 5   | `/pharn-dev-verify`  | proceeded              | `.verdict` = **`PASS`** (exit 0)            |
| 6   | `/pharn-dev-review`  | **GATE 2** — BLOCKED   | _(no structural verdict; advisory prose)_   |
| 7   | fix pass             | **GATE 2** — here      | re-verify `.verdict` = **`PASS`** (exit 0)  |

The run ended at **GATE 2** both times, never at a RED-verdict STOP.

## The verdicts, verbatim (after the fix pass)

- **`validate.mjs`** → exit **0**, now measured in the **working tree** directly. The first pass had
  to use a clean worktree; that caveat is gone (below).
- **`/pharn-dev-regress`** → `.verdict` = `"no-regressions"`; `regressions[]` and `pre_existing[]`
  both empty. `check-regress.mjs scope` exit 0, zero fix-#7 findings.
- **`/pharn-dev-verify`** (re-run) → `.verdict` = `"PASS"`, `failing_gates[]` empty. Gates:
  `test` 0 (**595** vitest tests), `validate` 0, `lint` 0, `format:check` 0, `lint:md` 0. Floor/hook
  suite: **666** tests, 0 failures. Verifiers registered: **0**.

## What the fix pass changed

**Review findings — all resolved.** The two blocking P0 overclaims (`CHANGELOG.md`,
`docs/reference/pharn-config.md`) were rewritten, as were **two code comments** in
`src/lib/merge-capabilities.ts` carrying the same false certainty — which the original review had
wrongly called careful. Both `important` P1 findings are now pinned by tests.

**A third defect, found during the fix pass and worse than the two the review caught.**
`CHANGELOG.md` and `docs/commands/remove.md` claimed removing a `manual` capability is permanent
("the union can never re-add it"). That is **false** whenever the archetypes also select it: `remove`
empties the entry from the _manual_ half of the union, but the _resolved_ half re-adds it as `auto`
through merge row 1. Reproduced against the real merge before fixing; both docs corrected and the
truth pinned by a new test. The claim came verbatim from the source brief's invariant 8 and had been
transcribed rather than re-derived.

**Every new assertion was mutation-tested.** The first draft of the records-prune test was
**vacuous** — it never seeded the clone, so `addDir` bailed and its assertions held even with the
drop inverted. Rewritten and re-checked: inverting row 5 now fails it on the bytes assertion alone.

## The `validate` caveat is resolved (a separate increment)

The first verify pass disclosed `validate` exiting 1 locally, with all 15 findings inside gitignored
`test-*/` scratch, and measured on a clean worktree instead. Root causes, both now removed:

1. Seven gitignored dogfood trees (1.5 GB; six a month stale) deleted, after archiving their
   non-regenerable artifacts.
2. `.dev/floor/validate.mjs` was a **stale vendored copy** of pharn-oss's, missing the
   `${sep}pharn${sep}floor${sep}` exclusion upstream already had. It and the three counters were
   synced under their own plan, `.dev/features/floor-exclude-sync/PLAN.md`, with a new
   mutation-checked test.

Counters now report the truth: **0** grillers / **0** lenses / **0** verifiers, against 81 / 142 / 0
before — every one of those was scratch, and the 81 polluted this run's own `GRILL.md`.

**No user was ever affected**, and neither was CI: each install runs its own already-fixed
`pharn/floor/validate.mjs` (verified GREEN on all seven scratch installs, 28–35 capabilities each),
and `floor.yml` runs on a fresh checkout.

## Artifacts (cited, not restated — P4)

- `PLAN.md` — the approved plan, incl. the 9-row merge table.
- `GRILL.md` — advisory; 7 concerns. Its "81 registered grillers" line was scratch noise (now 0).
- `REGRESSION.md` + `regression-report.json`.
- `VERIFY.md` + `verify-report.json` — re-run, no measurement caveat.
- `REVIEW.md` — original BLOCKED verdict, the resolution pass, and three proposed canon lessons.

## What the human is being handed

`/pharn-dev-review` is advisory and has no structural verdict, so `/pharn-dev-ship` computed no
proceed/stop from it. Its **resolution-pass** verdict is GREEN — no outstanding floor-findings; two
`minor` advisory items stand as explicitly recorded non-goals (name/role validation; the allowlist
asymmetry vs models/seam).

Still outstanding for the human: **nothing is committed.** No branch, no commit, no PR. The
increment plus the separate floor sync are uncommitted working-tree changes.

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate. Note in particular that every gate
was GREEN on the first pass while a **false** sentence was still shipping: the gates check what they
check, and no lint, test, or floor check can read a claim and know it is untrue.
