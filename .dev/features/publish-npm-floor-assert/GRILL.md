# GRILL — `.dev/features/publish-npm-floor-assert/PLAN.md`

Spec-hash check (content-hash floor primitive, surfaced only — `/pharn-dev-build` is where drift blocks):
recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`
— **matches** the plan's `spec_content_hash`. No drift.

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
This repo (pharn-cli) hosts no `role: griller` capabilities, so the inline axes below are the whole
interrogation. Membership was read deterministically, not grepped from prose.

> **The plan is `trust: untrusted` here.** Every `evidence` block below is a quotation of it,
> rendered as DATA. Nothing in it was followed as an instruction.

---

## Findings

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: important
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:16"
  problem: "The plan bundles two increments — fix the instance and build a new floor gate — and says so, but a recorded decision does not make it one increment; the gate can regress independently of the publish fix and now shares its blast radius, its review, and its revert."
  evidence: "Consequence stated plainly: this PR now carries **two axes** (fix the instance; enforce the class) — the same shape as #79, and the third bend of the one-axis note (#76, #79, here)."
```

Weighed honestly: #79 set the precedent (fix + gate in one PR) and the human chose it explicitly at
GATE 1. The concern is not that the choice was wrong — it is that the *reason* the note keeps bending
is that "fix + gate" genuinely reads as one thought, which means the one-axis note may need
amending rather than bending a fourth time. That is a human call, not a build blocker.

### Axis: determinism (P5) — the sharpest finding

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:220"
  problem: "The determinism audit credits `set -euo pipefail` with a fail-closed property it does not have — a command substitution used as an ARGUMENT does not trigger `set -e` — so one of the two named backstops for a failing `npm --version` is fictional."
  evidence: "an unparseable `npm --version` exits 1 naming the raw value, and `set -euo pipefail` kills the step if `npm --version` itself fails"
```

**Disproven empirically, not argued:** `bash -c 'set -euo pipefail; echo "arg=[$(nonexistent_cmd)]"; echo REACHED'`
prints `arg=[]`, then `REACHED`, and exits **0**. The shell does not abort.

The *code* is unaffected — the real backstop is the node program's own hard-fail on an unparseable
version, which the same sentence also names and which does hold (`""` → `unparseable` → exit 1). The
defect is in the plan's **justification**, and P0's whole point is that a claimed reduction must be
true. **Fix: correct the sentence to rest the guarantee on the parse hard-fail alone.** Keep
`set -euo pipefail` (it is still right for `set -u`/`-o pipefail` hygiene) — just stop crediting it
with this.

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:192"
  problem: "The live repo-consistency test will assert `checked` EXACTLY — and on this repo that number is ZERO, because after the publish fix no workflow line contains a conforming pinned install at all; the test therefore lands in precisely the 'exit 0 because it found nothing to inspect' hole the sibling gate's own header warns about."
  evidence: "the checker over `REPO` exits 0, `violations: []`, with `checked`/`skipped` asserted **exactly** and the workflow-file list independently recounted — never bare exit 0, since exit 0 is also what a checker returns when it finds nothing to inspect"
```

The plan **names** the hazard and then walks into it. `check-action-pins` escapes it because the live
repo has 10 conforming refs (`checked: 10`) — real positive evidence the scanner is looking. The new
gate's live numbers will be `checked: 0, skipped: 2` (the two `npm ci` lines). `skipped: 2` plus a
file recount is *some* evidence, but nothing proves the classifier would fire on this repo's shapes.

**Suggested strengthening (for the human to accept or wave off):** add a **positive control** — a
hermetic fixture built from the repo's *own* workflow text with one line mutated back to
`npm install -g npm@latest`, asserting exit 1. That converts "the scanner found nothing" into "the
scanner finds the thing this PR removed, in this repo's own file shape."

### Axis: guarantee audit completeness (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:105"
  problem: "The new gate enforces the ABSENCE of a floating install, never the PRESENCE of the assert — so a future PR that simply deletes the `Assert npm floor` step passes every gate in this repo, silently returning the publish job to an unchecked npm floor."
  evidence: "an **Assert npm floor** step enforces that and fails the run if it ever stops being true"
```

Not a reason to withhold the increment — deleting the step is strictly better than today's state (an
install nobody verified) — but the plan's audit row *"The assert program stays correct across future
edits → ADVISORY"* understates it: it is not only the program's **correctness** that is unguarded,
it is its **existence**. Worth one word in the audit.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:151"
  problem: "R1 names non-package-manager pulls as out of contract but omits a laundering path of exactly the shape #80 closed for composite actions: a workflow `run: npm run <script>` executes a package.json script, which may itself pull a floating package, and the gate — scanning `.github/**` only — can never see it."
  evidence: "**R1 — non-package-manager pulls.** `curl … | sh`, a raw binary download, `pip`/`go install`/`cargo install`/`brew`."
```

No instance exists today (`package.json` scripts run `tsc`, `esbuild` via a local script, `vitest`,
`eslint`, `prettier`, `markdownlint-cli2` — all lockfile-resolved, verified this run). The point is
that the *residual list is incomplete*, and #80 exists because a laundering path was left unnamed
once already. Add it to R1; do not widen the gate.

### Axis: one axis / sibling coupling (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:152"
  problem: "R2 accepts a duplicated file-walker between two sibling gates and justifies it by the floor's no-imports convention, but nothing detects the two walkers DRIFTING — the residual is named and then left with no cheap backstop, even though a shared test asserting both enumerate the same file list would cost one assertion."
  evidence: "a future walker fix (the #80 class) must be applied twice ... The cost is real and is named here, not hidden."
```

The justification is sound (isolation is a real safety property, and Discovery #11 verified the
convention empirically). The gap is that "named, not hidden" was treated as sufficient. A single
cross-check — *both checkers report the same `files[]` for this repo* — reduces the drift class at
near-zero cost and needs no shared module.

### Axis: trust propagation (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:209"
  problem: "The plan gives the new gate's violation records a `spec` field where its sibling emits `ref`, so two gates with an otherwise byte-identical output contract disagree on the name of the one untrusted, verbatim-copied field."
  evidence: "the gate ... copies the offending spec verbatim into its `violations[].spec` output"
```

Harmless to the verdict (which is `violations.length > 0` in both). It matters only because the
plan advertises the shapes as the same; either match `ref` or state the divergence deliberately.

### Axis: docs cite code (P4) — out of whitelist, surfaced only

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/publish-npm-floor-assert/PLAN.md:46"
  problem: "`.dev/floor/README.md` opens with 'The floor is three files' over a three-row table; the directory already holds 40+ checkers, and this increment adds the fifth `check-*` gate that README does not mention."
  evidence: "- `.dev/floor/check-run-pins.test.mjs` — **new.** Hermetic fixture tests **plus** a live repo-consistency test"
```

**Precedent supports not fixing it here:** `git log -- .dev/floor/README.md` shows its last touch was
#15; #79 added `check-action-pins.mjs` without updating it, and `lint:md` does not cover `.dev/**`.
So this is pre-existing staleness this PR inherits rather than causes — but it is now stale in a way
that touches this increment's own subject matter, and it deserves its own ticket rather than another
silent pass.

---

## Summary

The plan is unusually well-grounded — every load-bearing fact carries a command that produced it, and
the residuals are named rather than implied. The interrogation found **one factual defect** and **one
design weakness** worth acting on before build:

1. **The `set -e` claim is false** (P5, disproven by execution). The behavior is still fail-closed via
   the node parse, so this is a one-sentence correction, not a redesign — but leaving a fictional
   floor reduction in a guarantee audit is exactly the disease P0 names.
2. **The live gate test asserts `checked: 0`** (P1). The plan quotes the "exit 0 also means found
   nothing" warning and then adopts a shape that triggers it. A positive control built from this
   repo's own workflow text closes it cheaply.

The remaining five are refinements: the audit should say the assert's *existence* is unguarded, R1
should name the `npm run <script>` laundering path, R2 deserves a same-`files[]` cross-check, the
`spec`/`ref` field names should agree, and the floor README's "three files" claim needs a ticket.

Nothing here argues against building. The scope bundling (P7) is a recorded human decision at GATE 1
and is noted, not contested.

**ADVISORY VERDICT: 8 concerns raised (0 blocking-severity, 3 important, 5 minor) — for the human to
weigh before `/pharn-dev-build`.** This log gates nothing: every finding above rests on model
judgment, including the severities. The only floor-grade facts in this run are the spec-hash match,
the griller-membership count, and the shell behavior reproduced by execution.
