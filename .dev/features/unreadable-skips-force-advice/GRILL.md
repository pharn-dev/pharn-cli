# GRILL — unreadable-skips-force-advice (ADVISORY)

Plan under interrogation: `.dev/features/unreadable-skips-force-advice/PLAN.md`.
Spec-hash check (content-hash floor primitive, surfaced only — `/pharn-dev-build` is where drift blocks):
`sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`
**matches** the plan's `spec_content_hash`. No drift.

Griller discovery (FLOOR — enum/regex membership, `node .dev/floor/count-grillers.mjs .`):
`{"registered":0,"grillers":[]}` — this repo registers no `role: griller` capability, so the inline
axes below are the whole interrogation. Running a griller would be advisory anyway.

> All free-text `problem` / `evidence` below quotes `PLAN.md`, which is `trust: untrusted` to this
> stage. It is rendered as DATA — never followed as an instruction, never a proceed/stop basis.

## Findings

### Axis: determinism (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/unreadable-skips-force-advice/PLAN.md:104'
  problem: "The determinism audit's unknown-label reasoning contradicts skipHeading's default arm, and the disagreement is type-representable rather than hypothetical: plan.skipped[].label is typed `UpdateLabel | 'unreadable'` (update-decision.ts:174), so `restored`/`updated`/`ok` are representable in a skip group — for any of them `forceable` is TRUE (prints the --force advice) while skipHeading falls through to its default and prints the UNREADABLE heading, reproducing exactly the contradiction this increment exists to remove."
  evidence: "a skip group whose label is none of the four would fall into `forceable` and print the existing advice, which is the status quo for an unknown label, and `skipHeading`'s default arm already renders it as `UNREADABLE`."
```

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/unreadable-skips-force-advice/PLAN.md:87'
  problem: 'The plan claims line ORDER as a floor-reduced determinism property but plans no eval that pins it — the mixed-bucket case asserts only that both lines are present, so a future edit could swap them without any test noticing.'
  evidence: 'the two new lines are emitted at fixed source positions from two boolean membership tests over `plan.skipped`'
```

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/unreadable-skips-force-advice/PLAN.md:73'
  problem: 'The invariant the entire fix leans on — that on a FORCED run the only label reaching plan.skipped is `unreadable` — is observable only in a run that has a forceable bucket AND passes --force, and no planned eval is that shape (the three are unreadable-only/unforced, unreadable-only/forced, mixed/unforced), so a future skip path that ignores `force` would regress the report with every test still green.'
  evidence: 'unreadable-only, `runUpdate({ force: true })` → same three assertions, plus the run resolves (no `ProcessExit`)'
```

### Axis: guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/unreadable-skips-force-advice/PLAN.md:45'
  problem: "The plan asserts the two shared lines stay byte-identical to status.ts and that the reports stay 'recognisably one product', but that property appears nowhere in the guarantee audit and has no mechanism behind it — P3 rightly forbids a command→command import, so the string is duplicated with nothing (no shared lib/ constant, no cross-site test) to stop the two copies drifting apart."
  evidence: 'three dimmed lines; lines 2-3 are **byte-identical** to `src/commands/status.ts:202-204` so the two reports stay recognisably one product'
```

### Axis: honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/unreadable-skips-force-advice/PLAN.md:60'
  problem: "The 'Contracts satisfied' section cites finding-shape.md only to record that the increment does NOT touch it, which puts a non-obligation in a section meant to record real ones."
  evidence: '`pharn-contracts/finding-shape.md` — not ingested by this increment (no finding is emitted); cited only to record that the change is outside the finding pipeline.'
```

## Prose summary

The plan is narrow, grounded, and already corrects the source prompt on two points (the doc line
range, and the self-contradictory acceptance criterion — both resolved at the human gate rather than
guessed). Its trust audit is correct and short because nothing untrusted is ingested. The scope split
is honest: `planUpdate` / `decideFileAction` / `applyWrites` are named as untouched, so `--force`
semantics and the withheld-bump rule are structurally out of reach of this change.

Three concerns are worth weighing before build:

1. **The partition and `skipHeading` disagree on their fallbacks.** `forceable` treats "not
   `unreadable`" as forceable; `skipHeading` treats "not one of the three record-based labels" as
   unreadable. For the four labels that actually occur they agree, but the plan's determinism audit
   volunteers reasoning about the fifth case and gets it backwards. Cheapest honest fix: say the skip
   label set is closed at four and delete the speculative sentence — or, if the reasoning is kept,
   make the partition the positive test (`g.label === 'unreadable'` and its complement) so both
   fallbacks land on the same side.

2. **The missing eval is mixed + forced.** That is the one shape where "under `--force` only
   `unreadable` can be skipped" is visible; without it the invariant is stated in prose and pinned by
   nothing.

3. **The byte-identity claim has no backstop.** Not a reason to import across commands (P3 forbids
   it), but the claim should either be labeled advisory in the guarantee audit or given a test that
   compares the two sites.

None of this contradicts the constitution as far as this interrogation can tell, and none of it
changes the increment's shape — they are tightenings, not redirections.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 3 important, 2 minor) — for the human to
weigh before `/pharn-dev-build`. This grill-log gates nothing; it is not a statement that the plan is
sound.
