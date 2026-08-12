# GRILL — detect-skip-framework-caches (ADVISORY)

Plan under interrogation: `.dev/features/detect-skip-framework-caches/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. (Content-hash is a floor primitive; here it only **surfaces** — `/pharn-dev-build`
is where drift blocks, fix #4.)

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
Zero `role: griller` capabilities exist in this repo, so this run is the **inline axes only** (P7 —
the isolated griller runner stays deferred; nothing is invented to fill the slot).

> Trust (P2): `PLAN.md` is `trust: untrusted` to this stage. The `problem` / `evidence` free-text
> below quotes it and **inherits that tag** — it is DATA for the human, never an instruction to
> `/pharn-dev-build`. The enum-gated fields (`type`, `rule_id`, `severity`, `file`) are this stage's own
> membership / path-resolution assertions.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/detect-skip-framework-caches/PLAN.md:140'
  problem: 'The zero-budget property is labeled "floor: enum-regex" but no floor primitive and no planned test actually pins it — it is a consequence of statement ORDER, which nothing in CI observes, so a refactor that moved `budget -= 1` above the skip check would silently restore the exact bug this increment fixes while every planned test still passed.'
  evidence: '"a `SKIP_DIRS` subtree consumes zero walk budget" → **floor: enum-regex** — the same membership test, executed before the `budget -= 1` statement. Structural (statement order), not a promise.'
```

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/detect-skip-framework-caches/PLAN.md:174'
  problem: 'The declined cap-injection alternative is the only mechanism that would have made the zero-budget claim floor-reducible, and it is declined on the grounds that "the mechanism pins above already guarantee the property" — but the mechanism pins prove skip-before-CLASSIFY (no signal), not skip-before-DECREMENT (no budget cost); the two are different statements about different lines.'
  evidence: 'the mechanism pins above already guarantee the property that matters (a skipped subtree costs zero)'
```

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: '.dev/features/detect-skip-framework-caches/PLAN.md:8'
  problem: 'Six of the eleven added members (.nuxt, .svelte-kit, .astro, .cache, .parcel-cache, storybook-static) have no measured or reported trigger — the plan itself recommended declining them under P7 and the recommendation was overridden at the gate, so the increment now ships more untriggered surface than triggered surface.'
  evidence: 'the wider cache zoo is **IN** — "Add all six" was chosen over the plan’s own recommendation to decline'
```

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/detect-skip-framework-caches/PLAN.md:189'
  problem: '`.cache` is the one added member whose name is not owned by any single tool — it is a generic convention (Parcel, Gatsby, eslint, and hand-rolled scripts all use it), so its accepted lost-signal direction is materially wider than the framework-specific members it is grouped with, and the plan groups them without distinguishing.'
  evidence: 'the six are **canonical, not measured** — only `.next` carries a live measurement'
```

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/detect-skip-framework-caches/PLAN.md:121'
  problem: 'The skip comparison is `SKIP_DIRS.has(name.toLowerCase())`, but no planned test exercises a non-lowercase directory name — every per-member fixture is created from the lowercase literal in the set, so the case-folding half of the membership test ships unpinned even though the file already treats case-insensitivity as a stated determinism property.'
  evidence: "`it.each` over the live set: `<member>/Widget.tsx` → `{archetypes: ['lib'], packageJsonFound: false}`"
```

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/detect-skip-framework-caches/PLAN.md:121'
  problem: "The neutrality pin exercises `['app']` but not `['pages']`, so only one of `classifyEntry`’s two parent triggers for the `api` rule is covered by the future-proofing test that exists specifically to catch someone skipping `api`."
  evidence: "`[]`; `['app']` — the `api` trigger; `['db']` — a `SQL_HOST_DIRS` ancestor, the `migrations` trigger"
```

### Axis: docs cite code (P4)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/detect-skip-framework-caches/PLAN.md:70'
  problem: 'Replacing the doc’s explicit four-name enumeration with a class name removes the user’s only way to learn which directories are skipped without reading source, which is a readability regression on the exact line this PR touches to keep the doc true.'
  evidence: 'line 86’s four-dir enumeration refreshed, named as a class rather than re-enumerated in full'
```

### Axes with no findings

- **Trust propagation (P2)** — the plan’s trust audit is concrete and correct: widening the skip set
  strictly *reduces* the untrusted names reaching the classifier, the output stays a closed
  `Archetype[]` enum plus a boolean, and it correctly notes that `entry.isSymbolicLink()` `continue`s
  **before** the skip check, so a symlink named `.next` is refused as a symlink rather than merely
  skipped.
- **One axis of change (P3)** — the constant and the walk are the reading strategy, which is
  `detect-archetype.ts`’s declared single axis; the classification rules in `archetype.ts` are
  untouched. No sibling import is introduced. The read-only export is a test seam, not a behavior
  edge.
- **Determinism (P5)** — the added branch is set membership over lowercase literals; no new fallback.
- **`eval-format.md` structural/semantic split** — **not applicable, and correctly not claimed.** That
  contract governs Capability evals (`{case, expected}` with `structural[]` / `semantic[]`); this
  increment adds no Capability. Its tests are `vitest` deep-equality assertions — structural by
  construction, with no LLM judge anywhere. The plan does not launder anything into a judge because
  there is no judge in scope.

---

## Summary

The plan is unusually well-grounded — every §0 claim was re-verified against live source this run,
and it volunteers two corrections to its own brief rather than absorbing them silently. Three
concerns are worth the human’s attention before `/pharn-dev-build`.

**The sharpest is the P0 one.** The increment’s headline mechanism is that a skipped subtree costs
zero walk budget, and that property lives entirely in the *order of two adjacent statements* —
`continue` at `:105` versus `budget -= 1` at `:108`. The plan labels it `floor: enum-regex`, but the
membership test is only half of it; nothing in CI observes the ordering. Every planned test uses a
handful of fixture files, so the budget never approaches `MAX_ENTRIES` and all of them would still
pass if the decrement moved above the skip. The honest options are to **relabel that line advisory**
(cheap, accurate) or to **reopen the declined cap-injection** (which the plan declined on a reason
that conflates skip-before-classify with skip-before-decrement). Either is defensible; leaving it
labeled `floor` is the one that is not.

**The P7 concern is a recorded human override, not an oversight** — the plan argued for declining the
zoo and the gate said add it. Worth naming only because the ratio inverted: six untriggered members
against five measured-or-canonical ones, all inheriting the same accepted lost-signal direction. If
that direction is ever regretted, `.cache` is the member most likely to be the reason.

**The P1 case-folding gap is cheap to close** and is the kind of thing this PR is otherwise being
rigorous about: the walk explicitly lowercases before the membership test, and the file already
treats case-insensitivity as a determinism property with a test for `classifyEntry` (`Widget.TSX`) —
but the skip path would ship with no equivalent. One extra fixture (`.NEXT/Widget.tsx` or
`Coverage/Widget.tsx`) covers it.

None of the above blocks anything. `/pharn-dev-build`’s real gates are unchanged: spec-hash drift (MATCH
this run) and an unresolved `## Open questions (HALT)` (all three resolved and recorded at the gate).

**ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 3 important, 4 minor) — for the human to
weigh before `/pharn-dev-build`.** This log gates nothing and is not a judgment that the plan is sound.
