# REVIEW — product-loop (PHARN reviewing the /pharn-loop increment)

- **Floor (Step 1, P0):** `node .dev/floor/validate.mjs .` → **GREEN — 35 capabilities** (exit 0). The
  increment's 3 files are floor-ignored (`.claude/commands/`, `.dev/floor/`); the floor's guarantee here is
  the structural GREEN, and it holds. Everything below is **advisory**.
- **Increment reviewed (`trust: untrusted`):** `.claude/commands/pharn-loop.md`, `.dev/floor/check-loop.mjs`,
  `.dev/floor/check-loop.test.mjs`.

## Floor-gate findings (blocking) — NONE

All four lenses are clean on the floor axis; the increment is **not** blocked.

## The four lenses

### L-floor → P0 (guarantee reduction) — CLEAN

Every claim `pharn-loop.md` makes is reduced or labeled: "≤ N retries" / "retryable-only" / "terminal-
immediate" → FLOOR (`check-loop.mjs` enum + `iter>=cap`); "rebuild can't escape `## Files`" / "writes only
`LOOP.md`" → FLOOR (fix #7); "no advisory stage gates the loop" → STRUCTURAL (no `/review` input); "both
human gates" → ADVISORY (labeled). The disease is explicitly struck: "guarantees only the stop, never that
a fix converges." `check-loop.mjs`'s header matches its code. **No unreduced guarantee.**

### L-eval → P1 — CLEAN (N/A-with-substitute)

No Capability is added (the command has no `role:`; the checker is floor infra, `.dev/floor/`), so the
strict P1 "evals per Capability / `rule_id`↔eval binding" does not apply, and `validate` GREEN (35,
unchanged) agrees. The checker's spec is `check-loop.test.mjs` — **20 hermetic tests, green** — covering
every decision-table row + fail-closed + argv edges + a trust case. The floor and this lens **agree**.

### L-trust → P2 — CLEAN

`check-loop.mjs` reads only two `.verdict` enum strings + two ints; **no** free-text, **no** `/review`
input; the ★ trust test proves an injected `problem`/`evidence` field cannot move the decision. The
command's control flow reads only enum-gated verdicts; free-text reaches `LOOP.md` only as quoted DATA. The
reviewed files are a command + a checker whose instruction-looking prose is their **own legitimate**
directives (a trusted command being authored), **not** injected attacker content — no injection attempt
present, and my behavior was not steered. **No guaranteed decision rests on a tainted field.**

### L-axis → P3 — CLEAN

One axis per file (loop-command / stop-decision / its test). `check-loop.mjs` is a **standalone** sibling of
`check-ship.mjs` — it **names** it in comments to document the Design-A-vs-B difference but does **not import
it** (it duplicates the hermetic scaffolding, the established "each floor checker is self-contained" pattern),
so there is **no sibling-import**. `pharn-loop.md` **cites** `/pharn-ship` (P4 cross-command citation), not a
leaf→leaf module edge. **No P3 violation.**

## Advisory findings (warn — never a blocking basis; free-text = DATA)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor # ADVISORY assignment (fix #3)
  file: ".claude/commands/pharn-loop.md:151"
  problem: "A CONTINUE iteration re-invokes /pharn-build with no changed input, so the loop's real-world value on INCOMPLETE is narrow — transient/nondeterministic incompleteness only; a systematically-unbuildable plan just runs to STOP_CAP. This is honestly documented, but the human should weigh that /pharn-loop mostly rescues interrupted/truncated builds, not systematic gaps."
  evidence: "Transient / nondeterministic value only. A fresh build pass helps when the incompleteness was transient … A systematically unbuildable plan simply re-produces the same gap each iteration and runs to STOP_CAP (pharn-loop.md:151)."
```

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor # ADVISORY assignment (fix #3)
  file: ".claude/commands/pharn-loop.md:2"
  problem: "No cited dogfood/eval FAILURE motivates /pharn-loop now — it is a pharn-ship-reserved + human-requested generalization of the cap-1 Step 2b retry. Approved at GATE 1 and self-consistent, but P7's 'triggered by a real failure' bar is met by 'reserved follow-up + explicit request', not by an observed convergence failure. Surfaced for honesty (carried over from GRILL.md)."
  evidence: "instead of stopping after the first /pharn-verify it ITERATES the build→regress→verify middle … (pharn-loop.md:2); GRILL.md finding P7 raised the same."
```

## Proposed lesson candidate (NOT written to canon here — for a human-gated /pharn-dev-memory-promote)

- **Candidate (reinforces existing L9):** the dev `/pharn-dev-build` Step-3 floor runs **only**
  `validate.mjs`, not the full `npm run check`, so any increment that adds `.md`/`.js` lands **style-
  nonconformant** and first reddens `format:check` / `lint:md` at **`/pharn-dev-verify`** — as it did here
  (closed with `prettier --write` + `markdownlint --fix` + one manual indented-fence→inline edit).
- **Provenance:** increment `product-loop`; files `.claude/commands/pharn-loop.md`,
  `.dev/floor/check-loop.test.mjs`, `.dev/features/product-loop/{PLAN,REGRESSION}.md` (+ `regression-report.json`);
  verify's first pass `format:check=1 lint:md=1` → after fix, all six gates green (`VERIFY.md`).
- **Proposed remedy to weigh:** have `/pharn-dev-build` run `npm run format` (and optionally the style
  gates) on the files it wrote **before** its Step-3 floor, so style conformance is a build-completion step,
  not a verify surprise. **Do not self-promote (P2)** — this is a candidate for `/pharn-dev-memory-promote`
  to accept/deny against `.dev/memory-bank/lessons-learned.md` (check L9 first; may be an amend, not a new id).

## Verdict

**GREEN — 0 floor-gate (blocking) findings; 2 advisory (minor) + 1 lesson candidate.** The increment is
structurally sound and honestly scoped: the Design-B stop core is tested and total, the trust boundary is
structural, and the guarantee audit strikes the convergence disease. The advisory items are honesty/scope
notes for the human at the post-review gate, **not** blockers. `/pharn-dev-review` gates nothing — the
merge/fix/abandon decision is the human's.
