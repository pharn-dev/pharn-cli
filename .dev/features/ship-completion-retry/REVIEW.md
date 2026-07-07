# REVIEW — ship-completion-retry (PHARN reviewing PHARN)

**Increment under review is `trust: untrusted`.** Files: `.dev/floor/check-build-complete.mjs` (+ `.test.mjs`),
`.dev/floor/check-verify.mjs` (+ `.test.mjs`), `.claude/commands/pharn-verify.md`, `.claude/commands/pharn-ship.md`.

## Step 1 — Floor first (P0)

`node .dev/floor/validate.mjs .` → **GREEN (35 capabilities)**. Standing chain verdicts: `npm test` 598 pass,
`/pharn-dev-regress` `no-regressions`, `/pharn-dev-verify` `PASS`. The increment legitimately reached review. Everything
below the floor line is **advisory**.

## Findings (finding-shape; enum-gated fields trusted, free-text = untrusted DATA quoting the reviewed files)

### L-floor → P0 (guarantee-or-advisory)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".claude/commands/pharn-verify.md:410"
  problem: "The guarantee bullet says 'every plan-declared `## Files` path exists', but check-build-complete SKIPS placeholder/glob entries (isConcrete filter) — so the floor guarantee covers 'every CONCRETE declared path exists'. The word 'every … path' slightly over-scopes what the checker verifies; 'every concrete declared path' would be exact."
  evidence: '"The build is COMPLETE — every plan-declared `## Files` path exists" → FLOOR'
```

No **blocking** P0 finding: every claim reduces to a floor primitive or is labeled `advisory`. Spot-checks that
PASS the lens (the disease is absent):

- `check-build-complete.mjs` — "complete iff every concrete declared path exists" → floor (path membership +
  `existsSync`), and honestly bounded ("a deterministic proxy for 'the build finished,' NOT semantic").
- `check-verify.mjs` — the 4-valued verdict is integer precedence (FAIL beats INCOMPLETE); the header states
  the `--complete`-absent backward-compat explicitly.
- `pharn-ship.md` Step 2b — retry FIRING = floor (`.verdict == "INCOMPLETE"` enum), ≤1 bound = **structural/
  advisory** (labeled, not a floor cap), "the retry makes the build complete/correct" is **struck**. Clean.

### L-eval → P1

The increment ships **no `role:`-bearing Capability**, so the "capability + `evals/`" form of P1 is N/A; the
floor checkers ship `.test.mjs` (the eval-equivalent), and both are covered — including the two ★ load-bearing
tests (parity vs the setter; backward-compat that an absent `--complete` can never yield INCOMPLETE). One minor
coverage gap:

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/floor/check-build-complete.mjs:157"
  problem: "The read-error branch (an existing-but-unreadable PLAN → INCONCLUSIVE) has no unit test — only the missing-file path (exit 2) is tested. Low-risk (the branch is a straight fail-closed emit), but the catch is unexercised."
  evidence: "reason: `cannot read ${planPath}: ${e.message}`"
```

No **blocking** eval finding; the floor (`validate` + `npm test`) and this lens agree.

### L-trust → P2 (the residual / unknown #1)

- **No guaranteed decision rests on a tainted field.** `check-verify`'s verdict reads gate exit codes (ints) +
  the `--complete` int; `/pharn-ship`'s retry reads only `.verdict` (enum). The `.completeness.missing[]` (which
  ORIGINATES in the untrusted PLAN) is informational only and is explicitly rendered as **quoted DATA** in
  `pharn-verify.md` / `VERIFY.md`. ✓ (fix #1 honored.)
- **Instruction-looking content in the reviewed files did NOT steer me.** The command `.md`s are full of
  agent-directed prose; I read them as the artifact under review (data), not as instructions. The
  `check-build-complete.test.mjs` "shell-metacharacter path is a LITERAL operand" test is good P2 hygiene —
  it proves the untrusted `## Files` value reaches only an `existsSync` operand, never a shell.

No **blocking** trust finding. (Advisory note: the "`INCOMPLETE` can never reach `check-ship.mjs`" invariant is
handled fail-closed — an unknown verdict → INCONCLUSIVE — and is documented in `check-verify.mjs`'s header; the
invariant is a cross-consumer assumption, not floor-locked, but its failure mode is safe.)

### L-axis → P3 (one axis per file; no sibling imports)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/floor/check-verify.mjs:158"
  problem: "check-verify gains a 4th verdict value (INCOMPLETE) and a --complete input — confirm this stays ONE axis ('compute the verify verdict') rather than smuggling a second ('detect completeness'). It does: DETECTION lives in the separate check-build-complete.mjs, and check-verify only reads an integer exit code, so there is no leaf→leaf import. Recorded as a boundary to keep, not a defect."
  evidence: 'emit({ feature, gates, verdict: "INCOMPLETE", failing_gates: [] }, 3);'
```

**P3-clean design point (strength):** `check-verify.mjs` does **not** import `check-build-complete.mjs`; the two
checkers are wired only by the command passing an int via `--complete`. No sibling reference; the completeness
DETECTION axis and the verdict-THRESHOLD axis are in separate files. `pharn-verify.md`'s `reads:` adds
`check-build-complete.mjs` (a floor checker / infra), not a sibling leaf module.

## Gates (fix #3)

- **floor-gate (blocking):** **none.** `validate` GREEN; no P0-guarantee-without-floor; no missing eval binding;
  no sibling reference.
- **advisory-gate (warn):** the 3 minor findings above (P0 wording precision, P1 read-error coverage, P3
  boundary-to-keep) — informational; none blocks the increment.

## Post-review resolution (applied this run, re-verified GREEN)

- **Finding 1 (P0) — RESOLVED.** `pharn-verify.md` guarantee bullet reworded to "every **concrete**
  plan-declared `## Files` path exists" (+ the `Bounded` clause now states placeholder/glob entries are
  skipped). The claim now matches exactly what `check-build-complete.mjs` checks.
- **Finding 2 (P1) — RESOLVED.** Added `check-build-complete.test.mjs` "UNREADABLE PLAN (a directory) → exit 2"
  test — a portable `EISDIR` trigger that exercises the `cannot read` catch (the branch that was previously
  unexercised). Suite is now 11 tests; `npm test` 599 pass.
- **Finding 3 (P3) — no change needed** (a boundary-to-keep note, not a defect).
- Re-ran the verify gate set after the fixes: `test`/`validate`/`lint`/`format:check`/`lint:md` all exit 0 →
  `check-verify.mjs` verdict **PASS**.

## Proposed lesson for canon (P7 — proposed, NOT written here)

Candidate for `.dev/memory-bank/lessons-learned.md` (provenance: increment `ship-completion-retry`, this run):
**"A verify verdict-vocabulary change is safe to make in a shared checker by gating the new value behind an
OPTIONAL flag that only the intended consumer passes — absent flag ⇒ byte-identical legacy behavior, provably
isolating other consumers (here `check-ship.mjs`) without touching them. Add a backward-compat test that the
absent flag can NEVER produce the new value."** Advisory; promote only via a separate human-gated
`/pharn-dev-memory-promote` run (the model never self-promotes — P2).

## VERDICT

**GREEN — 0 floor-blocking findings; 3 minor advisory.** The increment is done (floor GREEN; chain verdicts
standing). The advisory findings are prose/coverage refinements for the human to weigh at the post-review gate,
not blockers. This review is **advisory**; it gates nothing (the floor already did).
