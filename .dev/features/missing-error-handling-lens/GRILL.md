# GRILL — missing-error-handling lens (interrogation of PLAN.md)

- **Plan under interrogation:** `.dev/features/missing-error-handling-lens/PLAN.md`
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` **== plan pin** → **no drift**. (The actual block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — this stage only surfaces.)
- **Griller discovery (deterministic membership, P5):** `node .dev/floor/count-grillers.mjs .` → **13 registered**. Genuinely-relevant axes folded below: **architecture, coupling, testability, security, error-handling, comprehension, documentation**. Not-applicable to a markdown-lens + Node-scanner increment (no UI / user-data / DB / runtime service): **a11y, i18n, migrations, observability, performance, privacy** — recorded N/A rather than fabricating findings (P7, no manufactured concerns).
- **Nature:** ADVISORY end-to-end. Nothing here gates `/pharn-dev-build`. The `PLAN.md` is `trust: untrusted`; free-text below quotes it as DATA.

---

## Findings (finding-shape; enum-gated / free-text split honored)

### Axis: testability (+ security) — the NEW try-range guard mechanism

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P1 # enum-gated — evals are the spec; this mechanism needs eval/test coverage
  severity: important # enum-gated value; assignment is advisory (fix #3) — grill gates nothing
  file: ".dev/features/missing-error-handling-lens/PLAN.md:50"
  problem: "The 'is this op inside a try block' guard is a NEW mechanism (siblings brace-match a catch BODY or have no range test); its injection-immunity and correctness need explicit scanner tests the plan does not yet enumerate."
  evidence: "Line 50: 'brace-matched `try {…}` char-ranges … minus any match inside a `try` range … injection-immune by construction'. The immunity claim is only true if the try-range set is itself untamperable: a fake `try {` in a comment/string must NOT create a guard, an unbalanced `try {` must NOT suppress a real hit, and a nested try must guard correctly."
```

**So what (advisory):** the strongest value of this increment is the deterministic guard, so the `.test.mjs` should carry, at minimum: (a) a `try {` hidden in a `//` comment / string literal → masked → does **not** guard a following unguarded `await` (still `found:true`); (b) an **unbalanced** `try {` (matchDelim → -1) → range skipped → a real unguarded op is still flagged (no suppression); (c) nested `try { try { await } }` → guarded; (d) `await` in a `catch`/`finally` block → flagged (outside the try body — the plan's stated intent). Note the precise immunity claim (mirror the siblings): _no free text can **suppress** a real hit or **launder** into an enum-gated field_ — the un-masked backtick false-**positive** (line 51) is a separate, accepted family bound, not a hole in that claim.

### Axis: eval coverage (P1) — two risky kinds on one physical line

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/missing-error-handling-lens/PLAN.md:50"
  problem: "Dedup is by (line, kind), so a single line like `JSON.parse(await res.text())` yields TWO hits (unguarded-await + unguarded-json-parse) → two findings with IDENTICAL enum-gated fields (finding-shape has no `kind` field); the 4 planned evals never exercise this."
  evidence: "Line 50: 'deduped by (line,kind)' with two kinds in the roster. finding-shape's enum-gated fields are type/rule_id/severity/file — none carries the scanner's `kind`, so two same-line hits are indistinguishable in the enum-gated projection (they differ only in free-text problem/evidence)."
```

**So what (advisory):** at build, either (a) add one scanner test pinning the two-kind-same-line output (recommended — cheap, documents intent), or (b) keep the four eval **cases** single-op (as planned) and add a one-line note that same-line multi-kind emits one finding per kind. Not a blocker; just an unpinned corner.

### Axis: correctness reminder — the scanner runs over the `.md` fixture

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/missing-error-handling-lens/PLAN.md:42"
  problem: "The eval `file_resolves` line must be the risky-op's line WITHIN the .md fixture (fenced-code offset), not its line within the code block — an easy off-by-fence error at build time."
  evidence: "Lines 42–43: 'file = the `await` line (from the scanner)'. The sibling scanners run over the .md fixture directly (swallowed-exception cites `case-*.md:16`); check-structural.mjs's file_resolves also asserts line ≤ the .md's total line count. The build must run the scanner over the .md and copy its reported line verbatim."
```

### Axis: comprehension / signal (the roster the human chose at GATE 1)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/missing-error-handling-lens/PLAN.md:51"
  problem: "Flagging EVERY unguarded `await` is broad — in real code many awaits are legitimately unguarded (the caller's try handles them), so the lens leans hard on the ADVISORY 'is handling needed' layer for signal."
  evidence: "Line 51 documents the caller-handled false-positive. Roster = await + JSON.parse was explicitly chosen by the human at GATE 1 over the narrower/broader options; surfaced here for awareness, not as a defect — the over-breadth is honestly labeled and routed to advisory (consistent with the missing-await / off-by-one family posture)."
```

---

## Prose summary

The plan is **structurally sound and faithful to the family**: the P0 guarantee audit reduces every claim to the floor or labels it advisory (the "struck" disease-line is present), the P2 trust audit is concrete (mask-before-match, enum-gated vs free-text, the `needle_absent_from_enum_gated` trip-wire, the named residual), P3/P5/P7 hold (single axis, reads only `pharn-contracts/finding-shape`, membership-only branches, smallest coherent increment, no speculation). Spec-hash is un-drifted.

The concerns are **not about the plan's shape but its unpinned corners**, all downstream of the one genuinely-new element — the deterministic **try-range guard**. The headline (important) concern is that this new mechanism's injection-immunity and brace-matching correctness must be **proven by scanner tests**, not asserted; the three minor concerns (two-kind-same-line output, the `.md` fenced-line offset, and the honest signal-to-noise of an all-`await` roster) are build-time hygiene the family already knows how to handle. None blocks `/pharn-dev-build`; the floor gates (spec-hash, no open questions, `validate.mjs`) remain the real backstops.

## Advisory verdict

**ADVISORY VERDICT: 4 concerns raised (1 blocking-severity? no — 1 _important_, 3 minor; 0 blocking) — for the human to weigh before/at `/pharn-dev-build`.** This is **not** "grill passed" and **not** a guarantee the plan is sound (P0) — it is a surfaced list of gaps. The plan carries **no open questions** (resolved at GATE 1) and **no spec drift**, so `/pharn-dev-build`'s floor-gates will admit it; whether the increment is _wise_ remains the human's call.
