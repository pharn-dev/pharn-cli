# REVIEW — unreadable-skips-force-advice

Floor first (P0): `node .dev/floor/validate.mjs .` → **GREEN** (`FLOOR: GREEN — 0 capabilities checked`,
exit 0). The increment adds no markdown capability, so `validate` is vacuously green here and gates
nothing; the increment's real deterministic signal is `npm run check` (951 vitest assertions) and the
46 stdlib floor tests, both green at HEAD (`VERIFY.md`, `REGRESSION.md`).

> Everything below the floor line is **advisory**. The increment under review is `trust: untrusted`;
> nothing in it attempted to instruct this review, and no free-text from it drove any decision here.

## Floor-gate findings (blocking)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: blocking
  file: 'src/commands/update.ts:453'
  problem: "A guarantee is claimed in a code comment with no floor reduction and no `advisory` label: `FORCEABLE_SKIPS` and `skipHeading`'s switch are two independent literal lists of the same three labels, so their complements agree today by coincidence of authorship — nothing (no shared enum, no test, no type) makes 'can never disagree' true, and adding a case to one and not the other silently reintroduces the exact heading/advice contradiction this increment removes."
  evidence: 'so the heading and the advice can never disagree about a label, and an unrecognised one fails in the safe direction'
```

## Advisory findings (inform; never the sole basis for a block)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: important
  file: 'src/commands/update.ts:500'
  problem: "The two closing advice lines are duplicated verbatim from `src/commands/status.ts` with nothing pinning the copies together — correct under P3 (a command→command import is forbidden and a shared lib/ constant for two dimmed strings would be its own smell), but the 'same sentence, so the two commands read as one product' property is advisory and unenforced, so the copies can drift apart silently."
  evidence: "The closing two lines are `pharn status`'s drift report verbatim (src/commands/status.ts): same situation, same sentence, so the two commands read as one product."

- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'src/commands/update.ts:446'
  problem: "The new `FORCEABLE_SKIPS` declaration was inserted between `reportOutcome`'s doc comment and `reportOutcome` itself, so the function's own comment now reads as documentation of the constant."
  evidence: '// The report. Skips are exit 0 — a skip is a decision the user asked for, not a'
```

## Lens-by-lens

- **L-floor (P0)** — one blocking finding above. Every *behavioural* claim the increment makes is
  floor-reduced: the partition is a `Set.has` membership test, the four branch combinations are each
  pinned by a vitest case that was RED before the change, and the withheld-bump rule is untouched
  (`versionWithheld = plan.counts.skipped > 0`, not edited). The overclaim is in prose about two code
  paths, not in the behaviour.
- **L-eval (P1)** — clean. Both new booleans and both new branches of the withheld warning are
  exercised: unreadable-only unforced, unreadable-only forced, mixed unforced, mixed forced. The
  fourth case also pins the derivable invariant the wording rests on (under `--force`, `unreadable` is
  the only label that can still reach the skip report). All four failed before the fix.
- **L-trust (P2)** — clean. `reportOutcome` prints `rel` paths from the install manifest
  (`safeJoin`-contained upstream) and never executes them; no decision in the increment rests on a
  free-text or fetched field. Nothing in the reviewed diff read as an instruction to this review, and
  no behaviour of this review changed on account of the content it read.
- **L-axis (P3)** — `src/commands/update.ts` keeps one axis (the `update` verb's report). No sibling
  import was added; `UpdateLabel` comes from `lib/`, which is the sanctioned direction. The
  duplicated status strings are the advisory finding above, not a sibling import.

## Verdict

**BLOCKED — 1 floor-gate finding** (P0, `src/commands/update.ts:453`) at the time of review. The
behaviour was right and every deterministic gate was green; the block was a prose overclaim inside the
increment.

### Resolution (applied after this review, re-gated)

Both the blocking P0 finding and the minor P4 placement finding were fixed in
`src/commands/update.ts`:

- the "can never disagree about a label" sentence now states the honest coupling — the two lists agree
  today by convention, there is no shared enum and no test pinning them, and a new skip label must be
  added in both places or the heading and the advice will contradict each other again;
- `FORCEABLE_SKIPS` moved ABOVE `reportOutcome`'s doc comment, so that comment documents the function
  again.

The advisory P3 duplication finding is **left standing** — importing across commands is forbidden and a
shared `lib/` constant for two dimmed strings would be its own smell, so the property stays advisory and
named rather than quietly asserted.

Re-gated after the fix: `npm run check` green (951 assertions), `check-verify.mjs` → `PASS` (all five
gates exit 0), 46 stdlib floor test files exit 0. **No floor-gate finding stands.**

## Proposed lesson (NOT written to canon here — P2/P7)

A candidate for `/pharn-dev-memory-promote` to weigh, with provenance = this increment
(`unreadable-skips-force-advice`, `src/commands/update.ts:446-460`):

> **A comment that says "can never" is a guarantee claim, and P0 applies to comments.** This increment
> exists because a *report* overclaimed what `--force` could do; its first draft then overclaimed, in a
> comment, what kept two label lists in agreement. The same reflex produced both. When writing "can
> never X", either cite the check that makes it so or write "today, because …".

Recurrence evidence so far: one occurrence (this increment) plus the shipped bug it fixes. That is
thin for canon — recorded here as a candidate, deliberately not promoted (P7: real, not hypothetical).
