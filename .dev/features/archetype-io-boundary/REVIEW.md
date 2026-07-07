# REVIEW — archetype-io-boundary

Reviewing the increment `/pharn-dev-build` produced: `src/lib/detect-archetype.ts` + `tests/detect-archetype.test.ts` (the increment is `trust: untrusted`; nothing instruction-looking was found in it).

## Step 1 — Floor (P0, the only guaranteed part)

`node .dev/floor/validate.mjs .` → **GREEN** (exit 0; 0 markdown capabilities — vacuous for a TS increment). The increment legitimately reached review. Everything below is **advisory**.

## The four lenses

### L-floor → P0 — GREEN

Every guarantee the increment states reduces to the floor or is honestly bounded. The load-bearing claims — determinism (same project → same `Archetype[]`) and the missing/malformed/non-object → `['lib']` default — are **tested** (floor: `tests/detect-archetype.test.ts`, membership + fixed `ARCHETYPE_ORDER`). The header comment's "values are never executed, forwarded, or logged" is an **accurate description of the 11-line function** (it only `existsSync`/`readFileSync`s `<cwd>/package.json` + `JSON.parse`; no `child_process`, no `fetch`, no other read), not an unbacked runtime guarantee. No P0 disease (a guarantee masquerading without a floor reduction). No floor-gate finding.

### L-eval → P1 — GREEN

The increment is a TypeScript lib function, not a PHARN Capability, so it declares **no `enforces` / `rule_id`** (nothing for the floor's rule↔eval binding to check — `validate` is vacuously green, and it agrees). Every behavior of the function is produced by ≥1 test: `ssr` / `backend` / `spa` / `backend+spa` / `lib`, valid-no-deps, devDeps, missing, malformed, mis-shaped-`dependencies`, and determinism. No missing binding.

### L-trust → P2 — GREEN

`package.json` is untrusted project input. It is read for **dependency key-NAME membership only** and never executed, interpolated, forwarded, or logged; the function emits **no finding free-text** — its output is the closed enum `Archetype[]`. So **no guaranteed decision rests on any tainted/free-text field**; taint is contained at the boundary (untrusted input → membership → enum output). No instruction-looking content in the reviewed files changed reviewer behavior (the test fixtures' dependency names — `next`, `express` — are pure data).

### L-axis → P3 — GREEN

Each file has one axis of change: `detect-archetype.ts` holds **only** the disk-read/parse boundary (changes only if the reading strategy changes); the pure membership rules stay in `archetype.ts` (changes only if the allowlists change). The new file imports the pure detector it wraps (`./archetype.js`) and shared types (`../types.js`) — the intended composition, not a leaf→leaf reference — and correctly does **not** import from `steps/` (no `steps → lib` layer inversion).

## Findings

### floor-gate (blocking) — none

No blocking findings. Verdict is not blocked.

### advisory-gate (warn) — 1, for the human at GATE 2

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: "src/lib/detect-archetype.ts:39"
  problem: "A missing package.json collapses to the same [lib] output as a genuinely frameworkless project, silently; whether 'not found' should be signalled distinctly is an intent decision, not a defect. Built as approved (the approved plan specifies missing -> ['lib']); surfaced so the human weighs it at the merge/fix/abandon gate."
  evidence: "if (!existsSync(pkgPath)) return detectArchetypes({});"
```

This rests on judgment/intent, not on anything the floor can check → **advisory**; it is not a basis for blocking. It is consistent with the existing `readProjectPackages` (steps/prereqs.ts) "no signal → nothing" handling, and low-impact today (no production caller yet).

## Proposed lessons (P7 — real recurring failure only)

**None.** Nothing here is a recurring, real failure warranting canon. (The one notable event — the increment description disagreeing with live state — was a one-off resolved correctly by the discovery halt, not a recurring pattern; not canon-worthy.) No `/pharn-dev-memory-promote` candidate proposed.

## Verdict

**GREEN** — 0 floor-gate findings; 1 advisory (minor) finding for the human. The floor is the only guaranteed part of this review; the four lenses above are advisory judgment, not a certification that the increment is correct beyond what the gates check.
