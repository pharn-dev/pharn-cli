# REVIEW — `security-md-tarball-path`

**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN**, exit 0 — confirmed before any
judgment below, and again after the two in-review fixes. Everything past this line is **advisory**.

**Scope reviewed:** `SECURITY.md` (five sites), `CHANGELOG.md` (one entry). No `src/`, no tests.

---

## Floor-gate findings (blocking)

**None.** The increment adds no Capability, no `rule_id`, no `enforces`, and no code, so there is no
guarantee for L-floor to catch unreduced, no eval binding for L-eval to find missing (`validate` agrees:
0 capabilities), and no sibling reference for L-axis. The two findings below are **advisory**, and both
were **fixed in place** — see the note under the verdict.

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'SECURITY.md:57'
  problem: 'The clause explaining the decompressed cap joined two true statements with a "so" that does not follow, leaving the reason the cap exists unstated in the one document meant to hand a researcher that reasoning.'
  evidence: '"the latter enforced **twice**, as `gunzipSync`''s `maxOutputLength` … and again over the bytes of accepted entries, so a compression bomb is bounded by neither the header nor the archive size alone."'
```

Both halves are individually correct — the cap _is_ enforced twice, and a bomb _is_ bounded by neither
the header nor the archive size — but "so" asserts the second follows from the first, which it does
not. `src/lib/repo.ts`'s own comment states the real relation: the decompressed cap is what bounds a
bomb, **because** neither the header nor the archive size would. In a paragraph whose entire purpose is
to correct a false claim about bounds, a broken causal connector is worth more than its word count.

**FIXED in place** (within the plan's `## Files`): now reads _"…enforced **twice**: as `gunzipSync`'s
`maxOutputLength` over the decompressed stream, and again over the bytes of accepted entries. That
decompressed cap is what bounds a compression bomb, which neither a response header nor the archive's
own size would."_

### L-floor → P0 (a claim narrower than the code)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'SECURITY.md:60'
  problem: 'The supply-chain scope bullet called the download "SHA-pinned" without naming the documented degraded mode in which it is not pinned at all — an omission of exactly the kind this whole increment exists to repair.'
  evidence: '"the one commit-SHA resolve and the SHA-pinned `codeload.github.com` tarball download it feeds (`src/lib/repo.ts`)"'
```

Read live: `fetchCommitSha` returns `null` on **any** failure — rate limit, offline, non-`ok`
response, a non-string `sha`, or a throw — and `fetchRepo` then sets `ref = 'refs/heads/main'` and
records `commit` as absent (`LIMITS.md` §3b). So an actor who can make that one API call fail
downgrades a SHA-pinned fetch to a **branch-tip float**, which is a supply-chain-relevant property
sitting in the supply-chain bullet. Saying only "SHA-pinned" there overstates the guard — the mirror
image of the `:56` understatement this increment came to fix, and it would have shipped in the same
paragraph that fixes it.

**FIXED in place:** the bullet now reads _"…**including its degraded mode** — when the SHA cannot be
resolved the fetch floats `refs/heads/main` instead and records `commit` as absent (`LIMITS.md` §3b)"_.

### L-floor → P0 (placement; reported, not changed)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'SECURITY.md:60'
  problem: 'A "do not re-report this" instruction sits inside the In scope section, where a reader skimming for what is reportable could take it as a broader carve-out than the one documented residual it means.'
  evidence: '"Note the standing residual rather than re-reporting it: provenance is by-SHA, **not cryptographic** (`LIMITS.md §1b`)"'
```

Left as-is deliberately. The clause is precise about **which** residual it means and cites the document
that defines it, and keeping it beside the claim it qualifies is more useful to a researcher than
exiling it to **Out of scope**, where the connection to the SHA-pinning sentence would be lost. Raised
so the choice is visible rather than accidental; a maintainer who disagrees can move it in one line.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'SECURITY.md:1'
  problem: 'No deterministic gate reads this file, so the drift the increment repairs can recur silently — the same gap the grill stage raised and the same one that let three degit-era claims survive to a release blocker.'
  evidence: "PLAN.md: '**None — and that is a scope decision the human pre-approved, not an oversight.**'"
```

**Not a P1 violation** — the constitution binds _behavior_ to a `vitest` test, and this increment ships
no behavior. The floor and this lens agree (`validate` GREEN, 0 capabilities, no unbound `rule_id`),
so there is no floor/lens disagreement to report. It is recorded because the gap is **real and
recurring**, it was already raised as grill finding **F1**, and it was deferred as scope growth rather
than resolved. See the proposed lesson below.

### L-trust → P2

**No finding.** The increment emits no findings and ingests no untrusted artifact at runtime. Nothing
in the reviewed files is instruction-shaped, and nothing in them altered this review's behavior. One
thing worth stating rather than assuming: the driving audit text was treated throughout as **DATA** —
every factual claim in it (five constants, the dependency count, the `grep` result) was independently
re-read from source, which is the reason a claim that had disagreed would have been reported instead
of copied. No guaranteed decision anywhere in this increment rests on a free-text field.

### L-axis → P3

**No finding.** `SECURITY.md` changes for one reason (the fetch boundary it describes); `CHANGELOG.md`
gains one entry under the existing `### Fixed` with no heading added, renamed, or moved. No code, so no
sibling import is possible.

---

## Verdict

**GREEN — 0 floor-gate findings.** Advisory: 5 findings (3 important, 1 minor, plus the P2/P3 clean
passes recorded above), of which **2 were fixed in place** within the plan's declared `## Files`, and
the floor was re-run after the fix: `npm run check` exit **0**, `validate.mjs` exit **0**, and both
stage verdicts recomputed against the final tree (`check-regress` exit 0, `check-verify` exit 0).

Two things this GREEN does **not** mean, stated because this increment is unusually easy to
over-read: no gate in the suite opens `SECURITY.md`'s prose, so the correctness of the rewritten
claims rests on the source citation in `PLAN.md` and on this review — not on the floor; and
`CHANGELOG.md` is in markdownlint's `ignores`, so nothing lints it at all.

## Proposed lesson (candidate — NOT written to canon here)

> **Provenance:** increment `security-md-tarball-path`, base `377e1f5`; files `SECURITY.md`,
> `CHANGELOG.md`. Raised independently by `/pharn-dev-grill` (F1) and `/pharn-dev-review` (L-eval).

**Candidate:** _When a document asserts a property of the code (a constant, a guard, a dependency
list), the assertion needs a gate or it will drift — and the drift is discovered by an outside
auditor, not by the suite._ Three instances now: the install tables (`docs-layout-tables`, gated in
the same PR), `SECURITY.md` (this increment, **not** gated), and `CONSTITUTION.md:21,:60` (still
saying `degit`; trusted and human-only, so it can only be fixed by a human). The generalizable form is
the shape `tests/docs-install-tables.test.ts` already uses: derive the required token set from the
code's own exported constants, then assert the document names each one.

Recording it here only. Canon is written exclusively by a separate, human-gated
`/pharn-dev-memory-promote` run under its own scope — the model never self-promotes (P2).
