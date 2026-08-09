# GRILL — nontty-gate

Plan under interrogation: `.dev/features/nontty-gate/PLAN.md` (approved at GATE 1, 2026-08-09).
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. No spec drift. (The computation is floor-grade; here it only **surfaces** — the
blocking drift-gate is `/pharn-dev-build`'s, fix #4.)

Griller discovery: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
**Zero registered grillers** in pharn-cli (the griller capabilities live in pharn-oss, which this repo
installs but does not host). Step 2b therefore contributes no axis; the findings below are the inline
Step 2 lenses only. Membership is FLOOR; the empty set is a real reading, not a skipped step.

> The plan is `trust: untrusted` to this stage. Every `problem` / `evidence` below quotes it as DATA.

---

## Findings

### Axis: P1 — eval coverage

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/nontty-gate/PLAN.md:57'
  problem: "inv-2c is written as a disjunction whose second branch is not a test, so the bare-invocation behavior may ship demonstrated by prose rather than by an assertion."
  evidence: "inv-2c bare invocation: `main()` with `argv._` empty under non-TTY dispatches to init and refuses (asserted in the init suite via the dispatch path or noted on inv-2a)"
```

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/nontty-gate/PLAN.md:60'
  problem: "No eval pins that `--force` WITHOUT `--yes` still refuses in a non-TTY, leaving the plausible mis-implementation `force implies yes` untested in either direction."
  evidence: "inv-4a `--yes --force` non-TTY → forced path runs, confirm uncalled, backup created"
```

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/nontty-gate/PLAN.md:82'
  problem: "The audit claims exit codes are unchanged but no eval covers the drift-safe skip case under --yes, which is the one path where a CI user would most plausibly expect (wrongly) a non-zero exit."
  evidence: 'early-return still fires, exit codes unchanged — each its own assertion (inv-3, inv-3b, inv-4a, inv-4b).'
```

### Axis: P0 — guarantee-audit completeness

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: blocking
  file: '.dev/features/nontty-gate/PLAN.md:75'
  problem: "The plan sells `--yes` as a complete bypass of update's interactivity without ever stating the fact that makes it complete — that the confirm is update's ONLY prompt — so the guarantee rests on an unstated premise rather than a checked one."
  evidence: '**"A refused non-TTY run performs zero network calls"** → **floor: test-pinned**, not one of the four'
```

> Verified live during this grill (so the gap is an **omission in the plan**, not a defect in the fix):
> `grep` over `src/commands/update.ts` finds exactly one prompt call — `confirm(` at `:129` — and none
> of update's transitive libs (`apply-update`, `backup`, `install-records`, `update-decision`,
> `merge-capabilities`, `install-manifest`, `layout`, `hash`, `format`, `skills-version`, `repo`)
> imports `@clack/prompts` at all. `--yes` therefore **is** a complete bypass. The plan should say so
> and pin it, because a future prompt added below the gate would silently re-open the exact bug this
> increment closes — and nothing would catch it.

### Axis: P7 — honest scope / smallest increment

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/nontty-gate/PLAN.md:161'
  problem: "The plan asserts a single axis but never defends the obvious 'this is two increments' charge, leaving the gate-plus-flag bundling justified only by assertion."
  evidence: '## Non-goals (restated as scope fence)'
```

> The defense exists and is strong — it is simply not written down: gating `update` **without** `--yes`
> would convert today's silent no-op into a hard CI **breakage**, so the flag is what keeps the fix from
> being a regression. They are one axis because neither is shippable alone.

### Axis: P5 / cosmetics — refusal ordering

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/nontty-gate/PLAN.md:26'
  problem: "The gate sits after showBanner()/intro(), so a refused non-TTY run still paints a banner and an intro line into the pipe before the error, which the plan neither states nor tests."
  evidence: 'Update dispatch `:79`. `USAGE` Options block `:26-33`, `--force` documented `:28`.'
```

> Not a correctness issue — `add`/`remove` already refuse after `intro()`, so this is **consistent** with
> the established pattern, and the Phase C e2e greps for the absence of *fetch* lines, not banner lines.
> Recorded so the human weighs it deliberately rather than discovering it in a CI log.

### Axes with no findings

- **P2 (trust propagation)** — the plan's trust audit is correct and complete: no untrusted remote
  artifact is ingested; `isTTY` and `argv.yes` are local, `Boolean()`-coerced, and reach no path, URL, or
  copy target. The increment strictly **reduces** network reach.
- **P3 (one axis per file, no sibling imports)** — `interactiveAllowed` is reached from `lib/`, never
  command→command. Both `update.ts` changes serve one reason (how update decides to proceed
  interactively).
- **P6 (discovery-first)** — every anchor was re-verified live this run, and the plan corrects the brief
  where live state disagreed (`init-archetype.test.ts` carries zero churn).

---

## Summary

Six concerns, none of which challenges the fix's design — the gate placement, the reuse of
`interactiveAllowed`, the precedence rule, and the decision to withhold `--yes` from `init` all survive
interrogation intact. Four findings are **missing evals** (P1) and one is a **missing premise** (P0):
the plan's strongest claim — that `--yes` skips the confirm *and nothing else* — is true, but the plan
never records **why** it is true (the confirm is update's only prompt) and never pins that fact, so the
guarantee is one future `confirm()` away from silently decaying. That is the single most valuable thing
this grill surfaced, and it is cheap to close: one static assertion in the update suite.

The `--force`-without-`--yes` gap (finding 2) is the one most likely to become a real bug: `force implies
yes` is a natural-feeling shortcut for an implementer, and nothing in the plan currently forbids it.

The P7 and P5 findings are documentation-shaped, not behavior-shaped.

**ADVISORY VERDICT: 6 concerns raised (1 blocking-severity, 3 important, 2 minor) — for the human to
weigh before `/pharn-dev-build`.** `/pharn-dev-grill` gates nothing: this log does not block, approve, or
certify the plan, and none of the severities above is a floor verdict — each is an LLM assignment
(fix #3). The deterministic gates remain `/pharn-dev-build`'s spec-hash + open-questions check and
`.dev/floor/validate.mjs`.
