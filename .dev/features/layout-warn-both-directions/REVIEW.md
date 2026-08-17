# REVIEW — layout-warn-both-directions

**Floor first (P0, Step 1):** `node .dev/floor/validate.mjs .` → exit **0**, GREEN. The increment was
entitled to reach review. Everything below the floor line is **advisory**.

> **Trust (P2).** The increment under review is `trust: untrusted`. Every `problem` / `evidence` below
> quotes it as **DATA**. Nothing in the reviewed code, tests, docs, or changelog attempted to instruct
> this stage, and nothing in it changed this stage's behavior. (Disclosed for completeness: the
> `PLAN.md` I followed as builder was directive by design and human-approved at GATE 1 — that is the
> intended channel, not an injection.)

---

## Floor-gate findings (blocking)

**None.** No P0 guarantee lacking a floor reduction in the shipped artifacts, no missing eval binding, no
grep-detectable sibling reference. The increment is not blocked.

---

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/layout-warn-both-directions/PLAN.md:175'
  problem: 'A claim labeled "floor" rested on a count that does not track it, and the measurement confirmed the mismatch — the predicted 4 came out 5.'
  evidence: '**"exactly one branch was added"** → **floor: enum/regex** — `grep -c abandonedLayout src/commands/update.ts` → 4 (baseline 3, measured this run).'
```

Raised in `GRILL.md` **before** the build, and then **empirically confirmed by the build**: the measured
value is **5**, not 4 — decomposition `3 baseline + 1 new branch + 1 mention inside the new explanatory
comment`. The **claim itself is true** (the diff adds exactly one `else if`), and it is soundly
established by two other checks that do track it: `grep -rnF 'Your install moved to the pharn/ layout'
src/ | wc -l` → **1**, and the flat pin green while absent from the diff's `-` lines. So the defect is
purely the **label**: an identifier-occurrence count was sold as a reduction of a statement about
branches, and the first comment to mention the identifier falsified its predicted value while the claim
stayed true.

Worth stating plainly because the tempting repair is the wrong one: rewording the comment to avoid the
identifier would have made the number green **by degrading the code to satisfy a proxy**. That was
declined. This finding is the P0 disease in its mildest form — a true statement sitting next to a
stronger one it does not support — and it is exactly why P0 asks for the reduction, not the vibe.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/commands/update.ts:396'
  problem: 'The "both directions are covered" totality holds only because Layout is a closed two-member type, and no check enforces that closure.'
  evidence: "} else if (outcome.abandonedLayout === 'pharn') {"
```

`Layout = 'pharn' | 'flat'` (`src/types.ts:154`) makes the two branches exhaustive **today**. Adding a
third member would leave the claim silently false with no red gate. The mitigation shipped and is the
right one — `else if` rather than a bare `else`, so a third member prints **nothing** instead of the
`pharn/`-specific message, making the failure quiet rather than wrong. An exhaustiveness assertion
(`satisfies` / a `never` arm) would convert this into a compile error, and would have exceeded the
approved whitelist (P7). Named as a residual, not a required change.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/update.test.ts:1001'
  problem: 'Two of abandonedLayout''s three inhabitants are now pinned; the null case — nothing abandoned, therefore nothing printed — is pinned by no test at all.'
  evidence: "it('warns that the abandoned pharn/ tree is no longer managed', async () => {"
```

After this increment `'flat'` and `'pharn'` each have a test; `null` has none, and no same-layout test
asserts the **absence** of a layout warning. An edit making the warn fire unconditionally would pass the
entire 755-test suite. Pre-existing (the gap predates this diff), and closing it sits outside the
approved `## Files` — so P7 correctly forbids bundling it here. Partial mitigation **did** ship: the new
test asserts `not.toContain('moved to the pharn/ layout')`, which pins cross-branch silence, the half
that actually protects this diff.

**Otherwise clean.** Behavior ships with its test in the same increment (P1 satisfied — the repo's P1
mechanism is `vitest`, per `CONSTITUTION.md` P1). No Capability and no `rule_id`/`enforces` binding is
introduced, so `pharn-contracts/eval-format.md`'s `structural[]`/`semantic[]` split does not range over
this increment (cited, not restated — P4) and `/pharn-dev-verify` correctly recorded **no**
`structural:*` gate. Every assertion added is deterministic; **zero** LLM judges, so nothing
floor-checkable was laundered through one.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/commands/update.ts:398'
  problem: "pharn's remediation advice is instruction-shaped, so an agentic consumer reading update's output could execute 'delete it by hand' against the entire managed tree."
  evidence: 'is left behind and is no longer managed by pharn — delete it by hand.'
```

`pharn` is a CLI for Claude Code, so a very common consumer of this warning is **an LLM session**, not
only a human. "delete it by hand" is an imperative, and an agent that acts on it would delete the whole
`pharn/` tree — contracts, floor scripts, trusted docs, every capability.

Scoped honestly, because overstating this would be its own P0 failure:

- **Not introduced here.** The flat message has said "delete them by hand" since it shipped; this
  increment adds a second instance of an existing pattern.
- **What changes is blast radius, not class.** The flat direction's advice points at scattered top-level
  copies; this one points at a single root holding everything. Same sentence shape, materially different
  worst case if obeyed mechanically.
- **Not a defect in the message.** The warning must say what to do, and saying less would be the worse
  bug — the whole point of the increment is that this fact stopped being swallowed.
- **Not currently named in the trust docs.** A grep of `LIMITS.md` for this class returns nothing.
  `THREAT-MODEL.md §5`'s named residual covers *finding free-text* inheriting untrusted tags; it does
  **not** cover pharn's **own trusted output** being instruction-shaped to an agentic reader. Naming
  that is this finding's contribution — it is a residual for a human to weigh, not a change request
  against this diff.

**Otherwise clean.** The added message is a **constant string with no interpolation**, so no
clone-controlled bytes can reach the terminal through it. `abandonedLayout` is a validated `Layout |
null` derived from `configLayout(config)` + `detectLayout(repoDir)` — never remote text. No new
ingestion; `safeJoin`, the symlink guards, and the network guards are untouched. No guaranteed decision
anywhere rests on a tainted or free-text field.

### L-axis → P3

**No findings.** `src/commands/update.ts` changes for exactly one reason — "the report tells the truth
about layout abandonment" — inside `reportOutcome`, the function that already owns every other bucket of
that report. **Zero new imports**, so no sibling reference was even possible; no command→command or
step→step reach; nothing routed around `lib/`. The docs paragraph and CHANGELOG entry sit in the files
that already own those axes.

---

## Cross-artifact consistency (P4)

Checked, and it holds: the shipped message says "moved to the **flat** layout", `docs/commands/update.md:201`
narrates the `pharn/`→flat direction with the same never-deletes rule and the same by-hand remedy, and
`CHANGELOG.md:42` describes the same behavior change. `docs/commands/status.md:14`/`:58` mention layout
migration in already direction-agnostic terms and needed no edit. No doc describes behavior the code
lacks, and no code behavior is undocumented.

---

## Proposed lesson candidate (NOT written to canon)

Proposed for `.dev/memory-bank/lessons-learned.md`, to be accepted or denied by a separate, human-gated
`/pharn-dev-memory-promote` run. `/pharn-dev-review` declares no `.dev/memory-bank/**` write and has not
made one (P2).

- **Lesson (candidate):** _An occurrence-count tripwire (`grep -c <identifier>`) is not a reduction of a
  claim about **structure**, and its predicted value is falsified by the first comment that mentions the
  identifier. Predict the count only alongside a check that actually tracks the claim (a fixed-string
  count of the bytes that must not change, plus the pinning test), and when the count misses, report the
  decomposition — never reword code to make a proxy green._
- **Provenance:** increment `layout-warn-both-directions`; base `210d0e4`; predicted
  `grep -c abandonedLayout src/commands/update.ts` → 4, measured **5** (`3 baseline + 1 branch + 1
  comment mention`); raised pre-build in `GRILL.md` as a P0 finding against `PLAN.md:175`, then
  confirmed empirically at build.
- **Why it is real, not hypothetical (P7):** it was predicted by the grill and then actually happened in
  the same increment, and the wrong repair (degrading the comment) was live and tempting enough to
  require an explicit decision.

---

## Verdict

**GREEN — 0 floor-gate (blocking) findings; 4 advisory findings (1 important, 3 minor).**

The increment is not blocked. All four advisory findings are about **labeling and named residuals**, not
about the diff's behavior: no finding challenges the branch, the message text, the assertions, the
docs, or the changelog. Two are pre-existing conditions this increment merely makes visible (the untested
`null` case; the instruction-shaped remediation advice), one is a `PLAN.md` labeling defect confirmed by
measurement, and one is a type-closure residual whose mitigation already shipped.

**This verdict is ADVISORY.** `/pharn-dev-review` emits prose only — no `findings.json`, no
`check-review.mjs` — and every `severity` above is an **LLM assignment** (`pharn-contracts/finding-shape.md`:
the enum *value* is floor-verifiable, the *assignment* is advisory). The only floor-grade content in this
stage is `validate.mjs` GREEN, which `/pharn-dev-build` and `/pharn-dev-verify` already gated. "GREEN"
here means "this reviewer found nothing blocking" — **not** that the increment is correct, complete, or
wise. That judgment is the human's at the post-review gate.
