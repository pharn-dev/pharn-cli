# GRILL — layout-warn-both-directions (ADVISORY)

Plan under interrogation: `.dev/features/layout-warn-both-directions/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, identical to the plan's
`spec_content_hash`. No spec drift to surface. (The computation is floor-grade; the **block** on drift
belongs to `/pharn-dev-build`, fix #4 — this stage only warns.)

**Griller membership (FLOOR — `.dev/floor/count-grillers.mjs .`):** `{"registered":0,"grillers":[]}`.
Zero `role: griller` capabilities exist in this repo (`pharn-contracts/` is present; there is no
`pharn-pipeline/`), so the pluggable slot contributes nothing and the inline axes below are the whole
interrogation. Honest P7 state, measured this run — not an assumption.

> **Trust (P2):** `PLAN.md` is `trust: untrusted` to this stage. Every `problem` / `evidence` below
> quotes it as **DATA**. Nothing in it was followed as an instruction. Nothing in this log gates
> `/pharn-dev-build`.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/layout-warn-both-directions/PLAN.md:175'
  problem: 'A tripwire is labeled "floor" for a claim it cannot actually establish — the identifier count proves a total, not that exactly one branch was added.'
  evidence: '**"exactly one branch was added"** → **floor: enum/regex** — `grep -c abandonedLayout src/commands/update.ts` → 4 (baseline 3, measured this run).'
```

`grep -c abandonedLayout` counts **occurrences of an identifier**, not branches. A diff that added the
mirror branch *and* deleted an occurrence elsewhere (say, refactoring `:345-346`'s assignment) also
totals 4 — the check would pass while the claim was false. It is a useful **tripwire on the expected
delta**, and it is genuinely floor-grade as *that*; it is not a reduction of "exactly one branch was
added". The neighbouring claim at `:173` (`grep -rnF … | wc -l` → 1, plus `:975` green) **is** a sound
reduction of its own claim — the asymmetry between the two is what makes this worth flagging rather
than waving through. Suggested repair: restate the claim as what the grep measures ("the
`abandonedLayout` occurrence count moved 3 → 4, the expected delta"), or label it `advisory tripwire`.
This is the P0 disease in miniature — a proxy reading as a guarantee because it is written next to one.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/layout-warn-both-directions/PLAN.md:185'
  problem: 'The totality claim rests on the closed Layout type, which no floor check in this increment pins — nothing fails if a third member is added.'
  evidence: '**"both directions are now covered"** → **floor: test** for the two members of `Layout`; this is total only because the type is closed.'
```

The plan states the dependency honestly (credit where due — it names the closure as the reason). The
residual it does not name: **nothing enforces the closure**. Adding a third `Layout` member would leave
this claim silently false, with no red test. The `else if` (rather than `else`) makes that fail *quiet*
rather than *wrong*, which is the right trade — but the plan should say the totality is contingent on a
type nothing gates, not merely that the type is closed today. No exhaustiveness check (`satisfies`
/ `never`-assertion) is proposed, and proposing one here would exceed the whitelist (P7) — so this is
correctly a **named residual**, not a required change.

### Axis: eval coverage (P1) and the structural/semantic split (`eval-format.md`)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/layout-warn-both-directions/PLAN.md:163'
  problem: 'The null case — nothing abandoned, nothing printed — is asserted in prose but pinned by no test, and the increment doubles the number of branches that could fire spuriously.'
  evidence: 'the `null` case falls through to no output, which is the correct report for "nothing was abandoned" (P5).'
```

`abandonedLayout` has three inhabitants (`'flat'`, `'pharn'`, `null`). After this increment two are
pinned by a test; the third is pinned by nothing. No existing test in the same-layout majority asserts
the **absence** of a layout warning, so a future edit that made the warn fire unconditionally would
pass the whole suite. Two honest counterweights: the gap is **pre-existing**, not introduced here, and
the fix lies outside the approved whitelist (P7 forbids bundling it). The new `it()`'s
`not.toContain('moved to the pharn/ layout')` does pin *cross-branch* silence, which is the half that
matters most for this diff. Recorded as the untested axis it is, for a later increment.

**On the split (`pharn-contracts/eval-format.md`, cited not restated, P4):** no laundering to flag. This
increment emits no `findings.json` and defines no `{case, expected}` eval, so `structural[]` /
`semantic[]` do not range over it; P1 for `pharn-cli` is discharged by `vitest` per `CONSTITUTION.md`
P1, which the plan satisfies. Every assertion the plan proposes is deterministic (`toContain`,
`not.toContain`, `toBe`) — **zero** LLM judges, so nothing floor-checkable is routed through a judge.
The plan is explicit that no contract governs a CLI report string (`:157-161`), which is the correct
disclosure rather than an invented contract citation.

### Axis: fixture fidelity (P1, P6)

```yaml
- type: FINDING
  rule_id: 'P6'
  severity: minor
  file: '.dev/features/layout-warn-both-directions/PLAN.md:126'
  problem: "The marker file is justified as making the fixture's premise coherent, but the fixture stays internally inconsistent — the config says pharn while the records and every managed file are flat."
  evidence: 'One line makes the premise coherent and lets the test mirror the flat pin''s *second* half'
```

Verified against live code this run: `previousLayout` is read at exactly two lines (`update.ts:248`
assignment, `:346` use) and **nowhere else**, while `expected` is collected at the **clone's** layout
(`:250-254`). Consequence the plan does not draw: a **real** pharn→flat migration is a **restore** path
— the flat paths do not exist yet, the `pharn/` ones do — whereas this fixture is an **upgrade** path
(flat files present at v1, records keyed flat). The branch fires in both cases (`written.length > 0`),
so the pin is **valid for the renderer**, which is what the plan set out to pin. But "coherent premise"
overstates it: the marker file makes the warning *describe something that exists*, it does not make the
fixture a migration simulation. Suggested repair: one comment line in the test saying so, so a future
reader does not mistake it for an end-to-end migration fixture. Cheap, inside the whitelist, and it
converts an overstatement into an accurate one.

### Axis: build-gate readiness (P5, P6)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/layout-warn-both-directions/PLAN.md:221'
  problem: "The section /pharn-dev-build gates on is present and non-empty, and its two entries are worded as decisions rather than marked resolved — an ambiguity that risks a spurious HALT on formatting."
  evidence: '## Open questions (HALT)  … None blocking. Two judgment calls were resolved from live state and are flagged for the approval gate rather than left open:'
```

`/pharn-dev-build.md:40` reads: *"Read `PLAN.md`. If it has unresolved `## Open questions (HALT)` →
**HALT**; it is not approved."* That gate is an **LLM read of "unresolved"**, not a deterministic parse
— so a non-empty body under that exact heading is exactly the ambiguity P5 warns about, and its
terminal fallback is a halt. In substance the questions **are** resolved: both were put to the human at
GATE 1 as selectable options and both came back as the plan's recommendation (`installed({layout:
'pharn'})`; marker file included). The wording, not the state, is the risk. Suggested repair: mark each
entry `RESOLVED at GATE 1 — <answer>`, so the gate reads unambiguously. Flagged `important` because the
cost of leaving it is a stall on a formatting artifact, not a defect in the increment.

### Axes with no findings

- **P2 (trust propagation)** — nothing to flag, and the plan's audit is not hand-wavy. Verified: the
  added string is a **constant with no interpolation**, `abandonedLayout` is a validated `Layout | null`
  derived from `configLayout` + `detectLayout`, and no clone-controlled bytes reach the terminal through
  the new branch. No new ingestion, no `safeJoin` / symlink / network surface touched.
- **P3 (one axis / no sibling imports)** — one axis (`update.ts` changes only for "the report tells the
  truth about layout abandonment"), no new imports at all, no command→command reach.
- **P5 (determinism)**, for the branch itself — `=== 'pharn'` is equality membership over a closed
  two-member type; `null` falls through to no output; no classifier, no free-text-driven branch. The
  `else if`-over-`else` reasoning at `:118-121` is correct and is the fail-safe choice.
- **P7 (honest scope)** — triggered by a filed finding whose field **already computes** the discarded
  case, so this wires up existing computation rather than speculating. Four files, one axis, nothing
  bundled. The plan's rejection of the parameterized-template alternative (`:123-126`) is sound: the
  flat message is observable output pinned at `tests/update.test.ts:975`.
- **Hostile content** — none. Nothing in `PLAN.md` attempts to instruct this stage.

---

## Prose summary

The plan is unusually well-grounded for its size: every `PLAN.md` anchor was re-verified against live
code this run and held, the spec hash matches, the two judgment calls it had to make were escalated to
the human rather than assumed, and its two strongest arguments — dropping the redundant `flatClone()`
(the default `beforeEach` clone at `tests/update.test.ts:149` **is** the flat tree) and preserving the
flat message byte-for-byte — were confirmed correct by independent reading here.

The concerns are about **how claims are labeled**, not about what the diff does. One claim is labeled
`floor` on a proxy that cannot establish it (the `grep -c` → 4 tripwire); one totality claim leans on a
type closure that nothing enforces; one fixture-coherence claim overstates what a marker file buys. All
three are the same species — a true statement sitting one inch from a stronger one it does not support
— which is precisely the failure mode `P0` exists to catch, and worth naming even when the underlying
engineering is right. The single most actionable item is the cheapest: the `## Open questions (HALT)`
section is non-empty and worded as narrative, which risks a spurious `/pharn-dev-build` halt on
formatting alone; both entries were in fact answered at GATE 1 and should be marked `RESOLVED`.

Nothing here argues against building. No finding challenges the branch, the message, the assertions, or
the whitelist.

---

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to
weigh before `/pharn-dev-build`.** This log gates nothing: every finding above rests on model judgment,
including the severity assignments (`finding-shape.md` — the assignment is advisory even where the
value is enum-gated). The deterministic backstops remain where they always were —
`/pharn-dev-build`'s spec-hash gate, `.dev/floor/validate.mjs`, and the writes-scope hooks. This is not
"grill passed", and it is not a judgment that the increment is sound.
