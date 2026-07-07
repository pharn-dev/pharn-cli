# GRILL — template-mask-suppression

Plan interrogated: `.dev/features/template-mask-suppression/PLAN.md` (trust: untrusted to this stage).
Spec-hash check: `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` **== the plan's `spec_content_hash`** → no drift (content-hash floor primitive; the actual block on drift is `/pharn-dev-build`'s gate, fix #4 — surfaced here, not enforced here).

Griller membership (deterministic, `count-grillers.mjs`): 13 registered. The app-facing axes (a11y, i18n, migrations, observability, performance, privacy) are N/A to a deterministic text-masking floor helper with no runtime/user surface; the axes that bite this increment — **testability, determinism (P5), trust/security (P2), architecture (P3)** — are interrogated below.

## Findings (advisory — grouped by axis; enum-gated / free-text split honored)

### Axis: testability (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/template-mask-suppression/PLAN.md:112"
  problem: "Option A deliberately introduces a documented ${…} false-positive, but the Tests-to-write section pins NO test on that behavior, so the documented bound is unregressioned and a future edit could silently change it."
  evidence: "':112 Tests to write' lists V1/V2 immunity + fence-robustness only; the ${…} over-flag is described at ':84' ('`${u?.name}` … a later raw u.name reads as a HIT') but never asserted by a case."
```

### Axis: determinism (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/template-mask-suppression/PLAN.md:70"
  problem: "The masker spec pins a run of ≥3 backticks (fence-skip) and a single backtick (toggle) but leaves a run of exactly TWO backticks (`` `` ``) unspecified — the build should pin it deterministically rather than leave it to incidental scan order."
  evidence: "':66 a run of ≥3 backticks is a markdown code-fence marker …; :70 a single backtick toggles template state' — no rule is stated for a 2-backtick run (empty JS template vs markdown double-backtick inline code)."
```

### Axis: trust / security (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/template-mask-suppression/PLAN.md:133"
  problem: "The trust audit asserts the fix is safe but omits the MONOTONICITY property that actually makes it auditable: a suppression-only second mask can only ADD masking to the suppression copy (over-flag / safe direction) and never remove masking from detection, so it can never re-enable laundering-suppression — worth stating so the P0/P2 claim is checkable, not asserted."
  evidence: "':133 Trust audit (P2)' says 'template string content is masked … so it can no longer move the guaranteed verdict' — true, but the reason (the mask is monotone toward over-flagging; detection reads the untouched `masked`) is left implicit."
```

## Prose summary

The plan is unusually well-grounded: it **reproduced both bugs live**, **prototyped the fix and ran it against the real fixtures + payloads**, and thereby **discharged the named HALT condition with evidence** (the ≥3-backtick fence-skip preserves fenced code; all 8 fixtures keep verdicts; baseline suite green). Its P0 guarantee audit, P2 trust audit, and P3 one-axis argument (per-file duplication mirroring the accepted `mask` convention; docs bundled because the "no free text moves the verdict" claim is only true _after_ the code fix) all hold up.

The three concerns are **refinements, not defects**:

- **F1 (testability, important):** the increment's whole thesis is "make the floor claim match behavior," so the one _new_ behavior it introduces — Option A's `${…}` over-flag — should itself be pinned by a test, or the documented bound rides on prose alone (P1: evals are the spec). Cheap to close: one `${u?.name}`-first-use case asserting the chosen HIT semantics.
- **F2 (determinism, minor):** a 2-backtick run is benign under either reading, but P5 wants it _specified_, not incidental.
- **F3 (trust, minor):** stating the monotonicity property turns "trust me, it's safe" into an auditable one-liner and strengthens exactly the P0/P2 story this increment exists to defend.

None of these blocks the build; all are one-line additions the build can fold in. The security posture is a **strength**: because detection still reads the untouched `masked` and the suppression mask only ever masks _more_, the fix is monotone toward over-flagging and opens no new laundering vector (F3 asks only that this be written down).

## Verdict

**ADVISORY VERDICT: 3 concerns raised (0 blocking, 1 important, 2 minor) — for the human to weigh before `/pharn-dev-build`.** `/pharn-dev-grill` gates nothing; the deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift; unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`. This grill-log is advisory end-to-end and is **not** a judgment that the plan is sound (P0).
