# REVIEW — remove-prunes-records

**Step 1, floor first:** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`,
exit **0**. The increment adds no PHARN markdown capability, so the structural floor is vacuously
green here and gates nothing about this change; the deterministic weight sits in `/pharn-dev-verify`'s
gate set (all five exit 0) and `/pharn-dev-regress`'s comparison (`no-regressions`). **Everything below
this line is advisory.**

Reviewed as **`trust: untrusted`**: `src/commands/remove.ts`, `tests/remove.test.ts`,
`docs/commands/remove.md`, `docs/reference/pharn-records.md`, `CHANGELOG.md`, `CLAUDE.md`.

---

## Floor-gate findings (blocking)

**None.** No guarantee in the increment lacks a floor reduction or an `advisory` label, no eval
binding is missing (the floor confirms: 0 capabilities, so there is no `rule_id` roster to bind
against — the P1 obligation here is discharged by vitest, and it is), and no sibling import was
introduced (`commands/remove.ts` → `lib/install-records.ts` is command→lib, the permitted direction).

## Advisory findings

### L-floor → P0 · L-docs → P4

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'docs/reference/pharn-records.md:76'
  problem: 'The new Pruning lead sentence promises the store never describes gone bytes, but the two commands it names only prune what THEY remove — a file the user deletes by hand still has a record until the next `update` rewrites the map, so the sentence claims more than any code path delivers.'
  evidence: 'Two commands drop entries, and between them the store never describes bytes that are gone.'
```

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'docs/commands/remove.md:25'
  problem: "The behavior bullet's first clause is correctly scoped to that capability's entries, but its trailing clause restates the same absolute claim about the whole store."
  evidence: "Prunes that capability's entries from [`pharn.records.json`](../reference/pharn-records.md), so the store never describes files that are gone."
```

Both are **overstatement, not falsehood** — the mechanism is exactly right and every qualifying case
(absent / corrupt / stale-stamped store) is documented immediately below each sentence. But P4 is
specifically about docs not claiming what the code does not do, and "never" is a stronger word than the
prune earns. The honest form is about pharn's **own** write paths: *no pharn command now leaves records
describing bytes it removed.* Cheap to fix; worth fixing precisely because the surrounding prose is
otherwise scrupulous about its limits.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: important
  file: 'src/commands/remove.ts:87'
  problem: 'The role→subtree mapping now exists in four places in src/ — the new helper joins three pre-existing copies in install-records.ts, install-manifest.ts, and install-capabilities.ts — so the "single source" the helper establishes is local to one file rather than repo-wide.'
  evidence: 'const subtree = capability.role === ''griller'' ? paths.grillers : paths.lenses;'
```

Precise about what this is and is not. **Within its scope the increment is net-negative duplication
and did exactly what it promised**: `remove.ts` went from two copies of the ternary to one, and the
delete and the prune now address the same directory by construction. The plan named
`src/lib/install-records.ts` a non-goal and the build respected that — the right call, since widening
here would have been the drive-by refactor the brief forbade.

What review adds is the repo-wide view the increment could not: `grep -rn "=== 'griller' ? paths.grillers" src/` returns
**four** hits — `lib/install-records.ts:250`, `lib/install-manifest.ts:126`, `lib/install-capabilities.ts:89`,
and now `commands/remove.ts:91`. Every one of them derives a capability's directory from a `LayoutPaths`
and a role, which is precisely `lib/layout.ts`'s axis. A `capabilityDir(paths, cap)` exported there,
consumed by all four, is the P3-correct home. **Follow-up increment, not a change to make in this PR.**

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'CLAUDE.md:64'
  problem: "The increment writes into the agent's own standing instruction file, which is the one reviewed artifact whose content is read back as instructions in every later session — a category worth naming even when, as here, the write is authorized and benign."
  evidence: '`remove` also **prunes that capability''s entries from `pharn.records.json`** (`pruneCapabilityRecords`), so it is no longer the one write path leaving records that describe bytes that are gone'
```

Reported as an observation, not an objection. The write is **authorized three ways**: `CLAUDE.md` was
declared in the plan's `## Files`, the human approved that plan at the gate, and `set-writes-scope.cjs`
pinned the path so the hook would have denied anything else. The added clause is descriptive
architecture narration matching the code, with no directive in it.

**Did instruction-looking content change my behavior?** Reviewed for it deliberately and: **no.** The
prose in `remove.ts`'s new comments is unusually assertive ("The trailing slash is load-bearing",
"Silence here is a choice, not an oversight") and it would have been easy to accept those as settled
rather than check them. I checked instead — the trailing slash against the `a11y` / `a11y-extended`
fixture, and the `note` claim against `update.ts:264`, which does bind and report the note that this
code drops. Both hold as written. Noting the temptation because catching it is the defense.

**Trust flow through the new code, verified rather than assumed:** record keys reach only
`String.prototype.startsWith` and object assignment. Nothing joins, resolves, opens, or writes a key.
The one path constructed comes from `configLayout(config)` and the capability's own name through
`safeJoin` in the unchanged `deleteCapabilityDir`. `pharn-records.md:84`'s "a record key is never used
to build a filesystem path" therefore survives the increment with a second consumer, and the store's
output taint is a strict subset of its input's.

### L-eval → P1

**No finding — and this is the increment's strongest part**, so it is recorded rather than passed over
in silence.

Coverage moved the right way: `src/commands/remove.ts` is at **100% statements / 100% lines / 100%
functions**, branch **88% → 89.28%**. The four uncovered branches (`?? []`, the two plural ternaries,
the `if (target)` guard) are **the same four as at baseline** — lines `53, 93, 121, 206` before,
`59, 169, 197, 295` after, the identical constructs at shifted offsets. The increment introduced **no
new uncovered branch**.

The tests demonstrate rather than assert (P1's actual requirement): five targeted mutations of the new
code each turn at least one test red — trailing slash dropped, skip-write guard removed, prune gated on
`existed`, baseline null-guard removed, picker prune deleted. One mutation is instructive: removing the
null-guard **alone** passes everything, because an empty records map yields `dropped === 0` and the
skip-write guard catches it — the two guards are genuinely redundant in that direction. Mutating both
together turns five tests red. That is defense in depth working, not a coverage gap, but it is worth
knowing that the null-guard's individual necessity is argued rather than test-forced.

---

## Verdict

**GREEN — 0 floor-gate findings; 4 advisory (3 important, 1 minor).**

Not blocked. The two P4 wordings and the P3 mapping duplication are worth carrying into follow-ups —
neither affects behavior, and both are the kind of thing that is cheaper to fix now than after another
consumer lands on them.

---

## Proposed lesson (candidate for canon — NOT written here)

`/pharn-dev-review`'s scope is `REVIEW.md` only; this is a **proposal** for a separate, human-gated
`/pharn-dev-memory-promote` run, which sets its own scope, runs `check-provenance.mjs`, and halts for
accept/deny. The model never self-promotes.

- **Lesson:** `/pharn-dev-regress`'s `scope` partition treats every path in `git diff` as build output, so
  on a working-tree dogfood run the pipeline's **own** artifacts — `.pharn/writes-scope.json` (rewritten
  by `set-writes-scope.cjs` at every stage, including `/pharn-dev-regress`'s own two calls) and
  `.dev/features/<name>/{PLAN,GRILL}.md` (each written under its own stage's scope) — are reported as
  **blocking fix#7 scope breaches** that never happened. The stage's operator must exclude them and say
  so; the exclusion is safe only because none of them is a test or eval-pair file, so the outside gate
  set is byte-identical either way — a fact to **verify per run**, not assume.
- **Why it is real, not hypothetical (P7):** it fires on **every** dogfood `/pharn-dev-ship` run by
  construction, since `/pharn-dev-regress` itself mutates `.pharn/writes-scope.json` before it partitions.
  It fired in this run and is documented at `.dev/features/remove-prunes-records/REGRESSION.md`, which
  records both scope invocations — raw (exit 1, three false blocking findings) and feature-only
  (exit 0, `escaped: []`).
- **Provenance:** increment `remove-prunes-records`, base `21db522c0fe23c30c53510b954cccd4e34662e83`,
  6 files (`src/commands/remove.ts`, `tests/remove.test.ts`, `docs/commands/remove.md`,
  `docs/reference/pharn-records.md`, `CHANGELOG.md`, `CLAUDE.md`).
- **Candidate remedy for the human to weigh:** a deterministic exclusion list inside
  `check-regress.mjs scope` (`.pharn/**` and `.dev/features/**` are pipeline surfaces, never build
  output) would move this from operator discipline — which is advisory and re-derived every run — to
  the floor, where the rest of the partition already lives.
