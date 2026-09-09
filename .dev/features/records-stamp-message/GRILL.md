# GRILL — records-stamp-message

Plan under interrogation: `.dev/features/records-stamp-message/PLAN.md`.
Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's
`spec_content_hash` (surfaced here; the blocking check is `/pharn-dev-build`'s, fix #4).
Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}` — the
pluggable slot is empty in this repo (P7), so only the inline axes below ran.

> The plan is `trust: untrusted` to this stage. `problem` / `evidence` below quote it as DATA.

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/records-stamp-message/PLAN.md:135'
  problem: 'The plan claims the message "cannot disagree with the branch by construction", but its own wording section keeps the rejection `if` and builds the mismatch list from a SECOND, duplicated pair of `!==` comparisons — so the two can drift, and a future stamp field added to the `if` alone would render an empty pair of parentheses.'
  evidence: '"the two sides are built from one membership list produced by the same two `!==` comparisons that drive the rejection, so the message cannot disagree with the branch by construction"'
```

The claim is the right claim; the planned code does not yet earn it. It becomes literally true — one
source of truth, no duplication — if the branch is **derived from the list** rather than written
beside it:

```ts
const mismatches = [ /* … pushed per differing field … */ ];
if (mismatches.length > 0) return { records: null, note: `…` };
return { records: store.files, note: null };
```

Same semantics, same cost (two string compares, unconditionally), and it also disposes of the
unstated empty-list case: an empty list is then exactly the "stamp agrees" path, not a message with
nothing in its parentheses.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/records-stamp-message/PLAN.md:120'
  problem: "The new tail hard-codes `unverifiable`, a label owned by `src/lib/update-decision.ts`, and the plan's guarantee audit calls that reduction 'floor' — but nothing in the planned change pins the two together, so renaming the label there would leave this message quietly asserting a bucket that no longer exists."
  evidence: '"the tail\'s `unverifiable` is the label the user will actually see → **floor**: `decideFileAction`\'s `if (!recordsAvailable) return skipOrForce(''unverifiable'', force)`"'
```

The cited branch is floor-grade *there*; the plan's message merely agrees with it *by hand*, which is
the same shape as the convention `src/commands/update.ts` already flags about `FORCEABLE_SKIPS` vs
`skipHeading` ("agreement is convention, not a check"). A cheap, in-scope reduction exists and needs
no source export: pin it at **compile time** from the test file, which `npm run typecheck` gates —
e.g. bind the literal through `import type { UpdateLabel }` from `../src/lib/update-decision.js` so a
rename fails `tsc` rather than shipping a stale word. Whether that is worth one line is the human's
call; the plan should not claim `floor` for it as written.

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/records-stamp-message/PLAN.md:57'
  problem: "The plan's `## Files` promises 'three assertions on the note text, one per mismatch shape' while `## Evals to write` lists five bullets — the two sections disagree about what the build owes, and the build will pick one."
  evidence: '"tests/install-records.test.ts — three assertions on the note text, one per mismatch shape, written FIRST"'
```

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/records-stamp-message/PLAN.md:110'
  problem: "`JSON.stringify` is justified partly by the empty-string case ('makes `\"\"` visible instead of blank'), but no eval covers an empty-string `skillsVersion` — an untested axis carrying part of a design decision's weight."
  evidence: '"quoting makes `\"\"` visible instead of blank and escapes the rest"'
```

Either add the one-line case (store `skillsVersion: ''` vs config `'1.0.0'`) or drop that half of the
justification. The null-commit half **is** covered by the planned eval, so only this half is bare.

### Axis: trust propagation (P2)

No finding. The trust audit is specific about what changes (two already-compared values become part
of a printed string), why quoting matters (control characters from a hand edit), and where taint
stops (no branch, path, or fetch consumes it). Consistent with the file header's existing rule that a
stamp value is only ever compared.

### Axis: one axis of change (P3)

No finding. All three planned edits stay inside one reason to change — how the store's stamp mismatch
is reported. No command is touched, no leaf imports a sibling.

### Axis: determinism (P5)

No finding beyond the one folded into the P0 finding above (the empty-list case). Field order is
source order; both branches are string equality, not classification.

### Axis: honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/records-stamp-message/PLAN.md:113'
  problem: 'Printing two full 40-character SHAs plus the new cost clause makes a single `log.warn` line roughly 240 characters, which will hard-wrap in a narrow terminal — a real readability cost the plan asserts away rather than weighing.'
  evidence: '"The commit is printed in FULL, never abbreviated."'
```

The reasoning for full length is sound and the griller does not dispute it — an unvalidated stamp
value has no guaranteed-unique prefix, and truncating could reproduce the very defect being fixed.
This is raised only so the human weighs the wrap explicitly rather than inheriting it silently.

## Summary

The plan is narrow, its reachability analysis corrects the audit rather than repeating it (`add`
re-stamps the store to match the config it writes, so the mismatch comes from a torn write, a hand
edit, or an older CLI — not from a routine `add`), and its three contested decisions are argued
rather than asserted. Two concerns are worth acting on before build: the "by construction" claim is
not yet earned by the planned code shape (derive the branch from the list and it is), and the tail's
`unverifiable` is a cross-module agreement the plan mislabels as floor. The remaining three are
housekeeping: an internal count mismatch, one untested half of a justification, and a line-length
trade the human should see stated.

Nothing here questions whether the fix should happen — the defect is real, reachable, and the message
is the whole product surface for it.

ADVISORY VERDICT: 5 concerns raised (0 blocking, 2 important, 3 minor) — for the human to weigh
before `/pharn-dev-build`. This grill-log gates nothing.
