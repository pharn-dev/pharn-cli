# GRILL — add-version-gate (advisory interrogation of `.dev/features/add-version-gate/PLAN.md`)

**Spec-hash check:** `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`
— **matches** the plan's `spec_content_hash` (PLAN.md:3). No spec drift. (The computation is
floor-grade; the *block* on drift belongs to `/pharn-dev-build`, not to this stage — fix #4.)

**Trust:** the PLAN is `trust: untrusted` to this stage (P2). Every `problem` / `evidence` below quotes
it as DATA. Nothing in the plan was read as an instruction. No injection-shaped content was found in
the plan.

**Griller membership (FLOOR — `.dev/floor/count-grillers.mjs`):** see finding **F6** — discovery in this
repo returns 81 registrations, *all* of them inside gitignored `test-*/` fixture installs. The
`testability` griller's procedure was applied inline from `test-lib/pharn/pharn-pipeline/grillers/testability/testability.md`.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/add-version-gate/PLAN.md:195"
  problem: "The plan claims the gate compares two VERSION_RE-validated values, but only the clone side is regex-validated — the config side passes a bare typeof-string guard, so the stated floor reduction is half-true as written."
  evidence: |
    PLAN.md:195 — "an exact string-equality membership test over two `VERSION_RE`-validated values."
    PLAN.md:176 — "over two values already regex-validated by `VERSION_RE` at their ingest boundaries
    (`readSkillsVersion` → `assertSafeString`; `pharn-config.ts:43` type guard)" — the sentence
    asserts VERSION_RE for both while its own parenthetical calls the second one a "type guard".
    Ground truth read this run: src/lib/pharn-config.ts:43 is
    `if (typeof raw.skillsVersion !== 'string' || !Array.isArray(raw.modules))` — no VERSION_RE.
    src/lib/install-records.ts:105-110 documents this asymmetry deliberately ("The formats are
    enforced where the values ENTER").
```

> **Assessment (advisory).** The *behavior* is still fail-closed and correct: a hand-edited
> `skillsVersion: "wat"` compares unequal, refuses, and reaches only a stderr message (no path, ref,
> or fetch sink). So this is an **accuracy defect in the P0 claim, not a security hole** — but P0
> exists precisely to stop overstated reductions, so it should be corrected in the wording at build
> time. Suggested honest form: *string equality over a clone-side value validated by `VERSION_RE`
> (`readSkillsVersion` → `assertSafeString`) and a config-side value type-checked at ingest
> (`pharn-config.ts:43`); an unparseable hand-edited value compares unequal and therefore refuses,
> which is the fail-closed direction.*

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/add-version-gate/PLAN.md:164"
  problem: "The invariant-3 eval row presents `expect(cleanup).toHaveBeenCalled()` as the pin for cleanup-before-exit ordering, but under the stubbed process.exit that assertion can only prove cleanup was reached, never that it ran before the exit."
  evidence: |
    PLAN.md:164 — "| 3 | cleanup ordering | asserted in the two refusal tests:
    `expect(cleanup).toHaveBeenCalled()` (the mock-clone `cleanup` spy) |"
    tests/helpers.ts:13-19 — stubProcessExit makes process.exit THROW, so `finally` always runs in
    tests; the real process.exit does not throw and Node skips `finally`. The ordering guarantee
    therefore rests on code placement (gate inside the try, exit after the try/finally), which the
    plan's guarantee audit states correctly at PLAN.md:179 — the eval table is the inconsistent one.
```

> **Assessment (advisory).** Not a defect in the design — the plan's own guarantee audit gets this
> right. It is a mislabel in the eval table that would let a future reader believe a test enforces
> something only structure enforces. Recommend rewording the row to "cleanup is *reached* on both
> refusal paths (`toHaveBeenCalled`); the *ordering* is structural — gate inside the `try`."

### Axis: eval coverage / testability griller (P1)

**Testability griller, Layer 1 (presence): PRESENT — no absence finding.** The plan carries a real
`## Evals to write (P1)` section (PLAN.md:156-171) with nine rows mapped 1:1 onto the brief's
invariants, each naming a concrete test and its assertion. Presence recognized from the plan's
*structure*, not from any self-claim it makes.

**Layer 2 (adequacy — advisory):**

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/add-version-gate/PLAN.md:125"
  problem: "The ordering decision explicitly extends gate-first to the picker's all-installed outcome, but no eval in the test table pins that case — the only ordering test named covers the named path's already-installed no-op."
  evidence: |
    PLAN.md:125 — "### Ordering decision: **gate-first** (before the already-installed no-op and
    before `all-installed`)"
    PLAN.md:171 — "Plus the ordering pin: `refuses an already-installed capability too (gate before
    the no-op)`" — singular, and the named path is the one with a no-op outcome.
    tests/add.test.ts:208-227 is the existing all-installed picker test; nothing in the plan
    re-exercises it under a version mismatch, so a regression that let `all-installed` answer from a
    stale clone would not be caught.
```

> **Assessment (advisory).** A genuine, cheap coverage hole: one extra test (picker + everything
> installed + mismatched version → refuses, `groupMultiselect` never called, `outro` never called
> with "All available capabilities are already installed."). Recommend adding it.

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/add-version-gate/PLAN.md:1"
  problem: "The plan does not name the user-facing limit it introduces: after this change there is no way to add a capability to a deliberately-pinned older install, because the brief excluded an add-side --force and update is the only stated resolution."
  evidence: |
    PLAN.md:1 header, and the absence of any "Limits" entry. The brief's non-goals exclude
    "No new CLI flags (no `--force` on add)", and the refusal message (PLAN.md:145-149) offers
    exactly one resolution: "run `pharn update` first". A user who pins an older skills version on
    purpose therefore loses `add` entirely until they update.
```

> **Assessment (advisory).** This is a deliberate, defensible trade — a stale-version `add` is
> precisely the bug being fixed, and the escape hatch already exists at a coarser grain
> (`pharn update --force`). But P7 asks that limits be *labeled as limits*, and this one is
> currently unlabeled. Recommend one line in `docs/commands/add.md` and/or the CHANGELOG entry
> stating it plainly.

### Axis: one axis of change (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/add-version-gate/PLAN.md:117"
  problem: "The plan correctly forbids refactoring the picker's cfg-threading block, but does not note that the gate makes that block's explanatory comment describe a failure mode which can no longer occur, leaving a stale rationale in the code."
  evidence: |
    PLAN.md:117 — option (A) row, "no typed outcome is added and no exit-code contract changes";
    the brief's inside-file scope requires the copy → records → config sequence stay byte-equivalent.
    src/commands/add.ts:250-258 threads `skillsVersion: result.version` forward and its comment
    justifies it with "the records store is stamped with the persisted skillsVersion/commit, so a
    stale `cfg` makes the next pick's stamp check fail". After the gate, result.version is always
    equal to config.skillsVersion, so the skillsVersion half of that rationale is unreachable — the
    commit half remains live and still justifies the block.
```

> **Assessment (advisory).** **Do not act on this in this PR** — the whitelist forbids touching that
> block, and the code stays correct. Surfaced only so the human knows a comment goes half-stale, and
> so a future reader does not mistake the dead half for evidence the gate is missing.

### Axis: discovery / live-state verification (P6) — the griller slot itself

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/add-version-gate/PLAN.md:1"
  problem: "Griller discovery in pharn-cli registers 81 grillers that all live inside gitignored test-*/ fixture installs, so the grill stage's pluggable axis depends on untracked local state and would register zero grillers in a clean checkout."
  evidence: |
    `node .dev/floor/count-grillers.mjs .` → {"registered":81, ...} — every path is
    test-backend/, test-edge/, test-edge2/, test-full/, test-lib/, test-next/, test-spa/.
    `ls pharn-pipeline` → "No such file or directory" (pharn-cli is the installer; it owns no
    capability tree). `.gitignore:6-12` ignores all seven test-* dirs; `git ls-files test-lib` is
    empty. The stage command asserts "Today the registered set is the `testability` griller
    (`pharn-pipeline/grillers/testability/testability.md`)" — that repo-root path does not exist here.
```

> **Assessment (advisory).** Not a defect in *this* increment — flagged because it means the
> griller half of this grill-log is reproducible only on a machine with the local fixture installs
> present, and CI would grill with zero registered grillers. Worth a separate ticket; **out of
> scope here**, and it did not affect any finding above (the inline axes are stage-owned, and the
> testability procedure was applied from the fixture copy verbatim).

---

## Summary

The plan is unusually well-grounded: every anchor was re-verified against live state this run, the
degit dead-end is re-confirmed rather than assumed, and the two findings the brief itself did not
anticipate (the records-block tests being built on the forbidden skew; `readSkillsVersion` throwing,
which forces the gate inside the `try`) are exactly the kind of discovery that should surface before
a build rather than during one. Option (A) is the right placement, and the reasons given for
rejecting (B), (C), and (D) hold up against the code I read.

The concerns are concentrated in **claim accuracy**, not design:

1. **F1 (P0, important)** — the "two `VERSION_RE`-validated values" reduction is half-true; the
   config side is only type-checked. Behavior is still fail-closed, so this is a wording fix, but P0
   is the principle that exists to catch exactly this.
2. **F3 (P1, important)** — the gate-first ordering decision covers the picker's `all-installed`
   outcome in prose but nothing pins it in the eval table. One cheap test closes it.
3. **F2, F4, F5, F6 (minor)** — an eval-table row that overstates what a `toHaveBeenCalled()`
   assertion proves; an unlabeled user-facing limit (no `add` on a deliberately-pinned install); a
   comment that goes half-stale in a block the whitelist correctly forbids touching; and the
   fixture-dependent griller registry, which is a repo-level observation rather than an increment
   defect.

None of these argues against building. F1 and F3 are worth folding in **before** `/pharn-dev-build`
writes code, since both are cheap: F1 is a sentence, F3 is one test.

**ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 2 important, 4 minor) — for the human to
weigh before `/pharn-dev-build`.**

This grill-log is **advisory end-to-end**. It gates nothing: no finding here blocks `/pharn-dev-build`,
and none of it is a guarantee that the plan is sound. The deterministic backstops remain where they
always were — `/pharn-dev-build`'s spec-hash re-check and unresolved-HALT gate, and
`.dev/floor/validate.mjs`. "The plan was grilled" never means "the plan is correct."
