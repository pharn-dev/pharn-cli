# REVIEW — archetype-missing-signal

Reviewing the increment `/pharn-dev-build` produced: modifications to `src/lib/detect-archetype.ts` + `tests/detect-archetype.test.ts` (the increment is `trust: untrusted`; no instruction-looking content was found in it).

## Step 1 — Floor (P0, the only guaranteed part)

`node .dev/floor/validate.mjs .` → **GREEN** (exit 0). Everything below is **advisory**.

## Does it resolve the triggering finding?

**Yes.** The `archetype-io-boundary` REVIEW.md **P5** finding (missing `package.json` silently collapsed into the same `['lib']` as a frameworkless project) is resolved: `detectArchetypesFromProject` now returns `{ archetypes, packageJsonFound }`, and the suite pins the distinction directly — frameworkless-valid → `packageJsonFound: true` **vs** missing → `packageJsonFound: false` (both `archetypes: ['lib']`). Tested at `tests/detect-archetype.test.ts` ("missing package.json → packageJsonFound: false (distinct from frameworkless)").

## The four lenses

### L-floor → P0 — GREEN

The load-bearing claims reduce to the floor: `packageJsonFound` is a deterministic predicate (`existsSync` ∧ parses-to-non-null-non-array-object), and determinism of the whole result — both **tested**. The comment's "values are never executed, forwarded, or logged" remains an accurate description of the function (only `existsSync`/`readFileSync` + `JSON.parse`), not an unbacked runtime guarantee. No guarantee is stated without a floor reduction or an advisory label.

### L-eval → P1 — GREEN

No `enforces`/`rule_id` (a TS lib function, not a Capability), so nothing for the floor's rule↔eval binding to check (and `validate` vacuously agrees). Every behavior of the new shape is produced by ≥1 test: the seven found-object cases (`ssr`/`backend`/`spa`/`backend+spa`/frameworkless-`lib`/no-deps/mis-shaped, all `packageJsonFound: true`), devDeps, and the three `packageJsonFound: false` branches (missing, malformed, JSON-array non-object), plus determinism.

### L-trust → P2 — GREEN

`package.json` is untrusted; it is read for dependency key-NAME membership only, and `packageJsonFound` is derived from file-existence + parse-success — **not** from any untrusted value and **not** free text. The output is `{ Archetype[], boolean }` (closed enum + boolean); no untrusted free text escapes the boundary or reaches a downstream instruction, and no guaranteed decision rests on a tainted field.

### L-axis → P3 — GREEN

Still one axis of change: the disk-read/parse boundary and its own result shape change together. The new `ArchetypeDetection` interface is co-located (mirroring `ProjectPackages` in `archetype.ts`); imports are unchanged (`./archetype.js` + `../types.js`), no `steps → lib` inversion, no sibling reference.

## Findings

### floor-gate (blocking) — none

### advisory-gate (warn) — none new

No new findings. The one grill concern — the boolean groups **missing** and **malformed** both as `packageJsonFound: false` — is a **deliberate, human-approved** minimal scope (chosen at the contract preview and plan halt), not a defect; a later 3-state (`found`/`missing`/`malformed`) remains an available, non-speculative follow-up **iff** a real caller needs it (P7). It is noted, not re-raised as a finding.

## Proposed lessons (P7 — real recurring failure only)

**None promoted.** The pattern "an I/O boundary silently collapsing distinct input states into one output" surfaced once (the P5 finding) and was fixed here — a **single** occurrence, not yet a recurring failure, so it does not meet P7's bar for canon. No `/pharn-dev-memory-promote` candidate.

## Verdict

**GREEN** — 0 floor-gate findings, 0 new advisory findings; the triggering P5 finding is resolved. The floor is the only guaranteed part of this review; the four lenses are advisory judgment, not a certification of correctness beyond what the gates check.
