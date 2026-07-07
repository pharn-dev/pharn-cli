# GRILL — hallucinated-api lens (advisory interrogation of PLAN.md)

- **Plan under interrogation:** `.dev/features/hallucinated-api-lens/PLAN.md` (`trust: untrusted` to the griller).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** recomputed `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` = the plan's pinned `spec_content_hash` (line 2). **No drift.** (The actual drift block is `/pharn-dev-build`'s floor-gate, fix #4 — not here.)
- **Open questions:** the plan's `## Open questions (HALT)` were **RESOLVED at GATE 1** (human-approved 2026-07-04, "Approve as written"). None remain — `/pharn-dev-build` will not refuse on an open question.
- **Grillers registered (deterministic membership, `count-grillers.mjs`):** 13 — a11y, architecture, comprehension, coupling, documentation, error-handling, i18n, migrations, observability, performance, privacy, security, testability. Applied inline over the plan (the isolated `claude -p` per-griller runner is deferred, P7).

> **This grill-log is ADVISORY end-to-end (P0).** Nothing below gates `/pharn-dev-build`. It surfaces concerns for the human to weigh; "produced a GRILL.md" never means "the plan is sound." The plan **closely mirrors the already-approved-and-built `input-validation-lens` precedent** (same file shape, same advisory-only floor posture, same trust-fence dogfood), so the findings are few and all **minor / build-time** — no blocking concern.

---

## Findings (finding-shape; enum-gated / free-text split honored)

### Axis: eval coverage + structural/semantic split (P1, `eval-format.md`)

```yaml
- type: FINDING # enum-gated (griller's own assertion)
  rule_id: P1 # enum-gated
  severity: minor # enum-gated value; ASSIGNMENT advisory (fix #3)
  file: ".dev/features/hallucinated-api-lens/PLAN.md:78" # enum-gated — resolves
  problem: "The plan relies on skill_kind: llm (so semantic[] is legal) but the three expected-*.json Files bullets (lines 64/66/68) do not state it explicitly; the build must set skill_kind: 'llm' on every expected JSON, since a deterministic skill_kind FORBIDS semantic[] per eval-format.md and would RED the intended fixtures." # free-text — DATA
  evidence: "line 78: '… and, since `skill_kind: llm`, `semantic[]` (advisory judge).' — the split is correct, but skill_kind is named only in the contracts section, not on the per-file bullets." # free-text — quoted
```

### Axis: guarantee-audit honesty on an advisory `llm` lens (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/hallucinated-api-lens/PLAN.md:64"
  problem: "On an advisory llm lens, `finding_count == 1` pins the EXPECTED OUTPUT of a model judgment, not a floor computation of 'the API does not exist'; the model's conformance is itself advisory (identical to input-validation's clean case). The plan is honest overall (line 107 strikes 'ensures the APIs are real'), but the built expected-*.md prose should state plainly that finding_count here pins an expected judgment, so no reader mistakes it for a deterministic API-existence verdict."
  evidence: 'line 64: ''structural[]: finding_count == 1; … file_resolves "<the call line>"'' — floor-CHECKABLE at eval-time against the committed fixture, but NOT a runtime floor that the API is real.'
```

### Axis: build-time line-resolution of the ★ trip-wire (P6, trust-fence discipline)

```yaml
- type: FINDING
  rule_id: P6
  severity: minor
  file: ".dev/features/hallucinated-api-lens/PLAN.md:68"
  problem: "The plan correctly DEFERS exact `file_resolves` line numbers to build (the fixtures do not exist yet — P6, do not guess a line). But the ★ needle trip-wire's whole point is that `file` cites the CALL-SITE line, never the injected-comment line; the build must author case-injection-comment.md and set expected-injection-comment.json's file_resolves to the real `Object.fromPairs(pairs)` call line. A wrong line silently defeats the trip-wire's demonstration."
  evidence: 'line 68: ''file_resolves "<the CALL line, never the comment line>"'' — the intent is right; this is a build-correctness reminder, not a plan defect.'
```

### Axis: honest scope / triggering failure (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor # acknowledged, not a gap — the plan is upfront
  file: ".dev/features/hallucinated-api-lens/PLAN.md:28"
  problem: "There is no cited dogfood/eval failure triggering this lens; it rests on the human's GATE-1 directive via /pharn-dev-ship. This is the SAME P7 posture the human already accepted for input-validation-lens, and the plan is explicit about it — surfaced for completeness, not as an unstated speculation. The increment is the smallest coherent unit (1 lens + evals) and correctly DEFERS the intra-file no-undef check to a separate axis/increment."
  evidence: "line 28: '### The distinct axis (P7 — genuinely non-redundant vs the 8 existing lenses)' — the distinctness argument (authorship-error vs input-flow) is sound; the human directive is the acknowledged trigger."
```

---

## Griller-slot results (applied inline; advisory — gates nothing)

- **architecture (structural fit):** **FITS.** The lens is a `pharn-review` leaf reading only `pharn-contracts` (no leaf→leaf), `coupling: agnostic`, mirroring the established lens pattern. No structural-inconsistency finding.
- **security (injection resistance of the increment's OWN design):** **COVERED.** The plan dogfoods P2 with the ★ `case-injection-comment` fixture + `needle_absent_from_enum_gated` + the call-line-not-comment-line `file` discipline. No security-design gap.
- **coupling (axis-of-change):** **CLEAN.** One reason to change (the hallucinated-api authorship-error axis); genuinely distinct from the 8 input-flow lenses. No P3 finding.
- **comprehension:** **CLEAR.** The plan states the crux (no honest deterministic floor exists) plainly and defers exactly what should be deferred. No ambiguity finding.
- **testability:** **PRESENT.** Three eval pairs bind the output shape, the P2 `enforces`, and the trust-fence; the post-build live checks + exit codes are named (validate exit 0 / check-structural exit 0). No missing-verification finding.
- **error-handling / documentation:** the lens's ambiguity path is P5 ask-the-human (line 128-ish "Determinism audit"); the capability body will document the two-layer split. No finding.
- **a11y, i18n, migrations, observability, performance, privacy:** **NOT APPLICABLE** to a stdlib markdown review-lens capability (no UI, no locale surface, no DB migration, no runtime telemetry, no data handling, no perf-sensitive path). No findings manufactured (P7 — do not invent concerns off-axis).

---

## Prose summary

The plan is strong and low-risk: it is a near-exact structural clone of the **already-approved-and-built `input-validation-lens`** increment, adapted to an even-more-advisory axis. Its central intellectual claim — **there is no honest deterministic floor for "does this API exist," so the floor is membership-only and the existence-verdict is entirely advisory** — is investigated explicitly (member existence, import resolution, arity, and a name-roster are each rejected with a reason; the intra-file `no-undef` check is correctly ruled OFF-axis for a separate increment). That is exactly the P0/P7 discipline this repo exists to enforce, and it was ratified by the human at GATE 1.

The four findings are all **minor and build-facing**, not design defects: (1) set `skill_kind: llm` on every expected JSON so `semantic[]` is legal; (2) keep the expected-`.md` prose explicit that `finding_count` pins an expected _judgment_, not a deterministic API-existence verdict; (3) at build, resolve `file` to the real **call-site** line (never the comment line) so the ★ trip-wire actually demonstrates; (4) the P7 trigger is the human directive (acknowledged, precedented). None blocks; all are naturally satisfied by mirroring `input-validation` faithfully.

---

## ADVISORY VERDICT

**4 concerns raised (0 blocking-severity, 4 minor/advisory) — for the human to weigh before `/pharn-dev-build`.** Spec hash matches (no drift); no open questions remain (resolved at GATE 1). This is **advisory** and does **not** gate `/pharn-dev-build`; the deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash, open-questions) and `.dev/floor/validate.mjs`. Nothing here says "the plan is sound" — it says the interrogation surfaced only minor, build-time reminders on a plan that faithfully mirrors an approved precedent.
