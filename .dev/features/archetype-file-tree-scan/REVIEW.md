# REVIEW — archetype file-tree scan

**Verdict: GREEN (advisory) — 0 floor-gate (blocking) findings; 5 advisory findings.**

> The reviewed increment is `trust: untrusted`. Below, the enum-gated fields (`type`/`rule_id`/
> `severity`/`file`) are the reviewer's own assertions; `problem`/`evidence` quote the code as DATA.

**Step 1 — floor (P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). The increment
adds no markdown Capability, so the structural floor is vacuously green; the real floor for this
TypeScript increment (`npm run check`) is GREEN and was re-confirmed at `/pharn-dev-verify` (all 6 gates 0).
No instruction-looking content in the reviewed code changed the reviewer's behavior (the "human-owned
reconciliation" comments are notes for a human, correctly not obeyed as directives — L-trust below).

## Lens results (each cites a principle — P4)

- **L-floor → P0:** Guarantees reduce correctly. "Deterministic (same tree → same result)" → floor
  (booleans + sorted traversal + pure rule; backstopped by determinism tests + `npm run check`). The
  caps are **honestly labeled** advisory defensive bounds (not a hard guarantee). One honesty nit below.
- **L-eval → P1:** Not a Capability (no `role:` frontmatter) → P1's Capability⇒eval does not bind; the
  vitest suite is its regression-spec, and every new function/behavior is tested (401/401). Two minor
  coverage gaps below. No missing eval-binding; floor agrees (validate GREEN).
- **L-trust → P2:** **Clean.** Output is a closed `Archetype[]` enum + boolean — **no free-text field is
  emitted**, so no taint can propagate downstream. Untrusted inputs (package.json bytes, file/dir names)
  are tested for membership only — never executed, interpolated, forwarded, or logged; `JSON.parse` is
  used for data, `Object.keys` only; symlinks are structurally not followed. No guaranteed decision rests
  on a tainted field. One test-backstop nit below.
- **L-axis → P3:** **No sibling-module reference.** `detect-archetype.ts` imports only its same-layer pure
  sibling `./archetype.js` + `../types.js`; `archetype.ts` imports only `../types.js`. No leaf→leaf
  crossing. One ratified placement judgment below.

## Floor-gate findings (blocking)

None. The increment does not reach any blocking floor-finding (no unreduced P0 guarantee, no missing
eval binding, no P2 tainted-field gate, no P3 sibling reference).

## Advisory findings (inform — never the sole basis for a block; fix #3)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "src/lib/detect-archetype.ts:24"
  problem: "The 'names only / never execute / never read a file body' property is stated in the header comment as behavior, but it is ADVISORY (holds by construction + the scan-code lenses), not floor-enforced — no hook asserts it. Consistent with the plan's guarantee audit, but the comment could read as a guarantee."
  evidence: "patterns; we never execute, interpolate, forward, or log a value, and the tree walk never reads a discovered file's BODY"

- type: FINDING
  rule_id: P2
  severity: minor
  file: "tests/detect-archetype.test.ts:243"
  problem: "The symlink-escape-prevention test is platform-guarded (silently returns if symlinkSync throws), so on a platform without symlink privilege the property is UNTESTED — the structural safety holds by construction, but its deterministic backstop is not universal (it does run on Linux CI)."
  evidence: "it('does not classify or follow a symlink (even a .tsx-named one)', () => { ... } catch { // no symlink privilege ... } if (!symlinked) return;"

- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/lib/detect-archetype.ts:79"
  problem: "route.{tsx,js,mjs} and next.config.{ts,cjs} are pattern-covered but not individually exercised — only route.ts and next.config.{js,mjs} have tests. The branches are simple literals/prefix, but a stray edit to one variant would go uncaught."
  evidence: "lower === 'route.ts' || lower === 'route.tsx' || lower === 'route.js' || lower === 'route.mjs'"

- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/lib/detect-archetype.ts:57"
  problem: "MAX_DEPTH / MAX_ENTRIES are untested behavior — no fixture exercises a past-cap signal. This is the acknowledged P7 tradeoff (a signal past a cap is silently undetected), documented in-code and generous, but the truncation path itself has no regression test."
  evidence: "const MAX_DEPTH = 24; const MAX_ENTRIES = 50_000;"

- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/lib/detect-archetype.ts:68"
  problem: "classifyEntry is pure file-name classification living in the I/O file rather than beside the package-name membership in archetype.ts — a judgment call the grill surfaced and the human ratified at plan approval (defensible: it defines WHAT the reading strategy observes). Noted so a future split is an informed choice, not a surprise."
  evidence: "function classifyEntry(name: string, isDir: boolean): ArchetypeSignals {"
```

## Proposed canon lesson (P7)

**None.** No finding reveals a *recurring, real* product failure (P7 — the one orchestration glitch, a
regress capture-script variable-expansion bug, was a stage-mechanics slip already corrected in the run,
not a product pattern). Proposing a lesson here would be speculative; none is promoted. (Canon writes
are a separate human-gated `/pharn-dev-memory-promote` run regardless.)

## Honest scope (P0)

This review is **advisory**. GREEN here means no blocking floor-finding and that the four principle-lenses
raised only minor concerns — it is **not** a guarantee the increment is correct beyond what the floor
(`npm run check` GREEN, verify PASS, regress clean) already checks. The merge decision is the human's.
