# GRILL — archetype-io-boundary

Interrogated: `.dev/features/archetype-io-boundary/PLAN.md`.
Spec-hash check: `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's `spec_content_hash` (no drift). Registered grillers: **0** (`count-grillers .` → `{"registered":0}`), so only the inline Step 2 axes were applied.

> **ADVISORY log — gates nothing.** Every finding below rests on the griller's judgment; none blocks `/pharn-dev-build`. The plan's untrusted free text is quoted as DATA (P2), never followed. The only floor-grade thing in this run was the spec-hash recompute (matched) and the writes-scope hook.

## Findings (by axis)

### P1 — eval coverage (untested axis)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/archetype-io-boundary/PLAN.md:69"
  problem: "A VALID package.json with no dependencies/devDependencies keys (distinct from 'missing' and 'malformed') is an untested branch; add a 'valid, no deps -> [lib]' case so the empty-but-present path is pinned, not just missing/malformed."
  evidence: "'missing package.json -> [lib]' and 'malformed package.json -> [lib]' are listed, but no 'valid JSON, no dependency keys -> [lib]' case."
```

### P2 — trust propagation (untrusted input shape)

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/archetype-io-boundary/PLAN.md:35"
  problem: "Untrusted package.json may set `dependencies`/`devDependencies` to a non-object (e.g. a string); the planned `JSON.parse(...) as ProjectPackages` cast is unchecked, so Object.keys would run on the wrong shape. Consequence is benign (numeric indices match no allowlist -> [lib]) and mirrors the existing readProjectPackages pattern, but the untrusted-shape assumption is unstated — state it (and that the benign outcome is intentional)."
  evidence: "'read + `JSON.parse` into `ProjectPackages` ({dependencies?, devDependencies?}), parse error -> {}'"
```

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/archetype-io-boundary/PLAN.md:88"
  problem: "The Trust audit states the boundary 'never executes, interpolates, forwards, or logs the values' as flat fact, but the Guarantee audit labels that same 'never executes/sends' property ADVISORY. The P2 gate is genuinely sound because it rests on the STRUCTURAL half (enum-typed Archetype[] output), not on 'never logs' — so tighten the wording to attribute containment to the enum output, and mark the 'never forwards/logs' half advisory, consistent with the Guarantee audit (P0 honesty)."
  evidence: "Trust audit: 'it never executes, interpolates, forwards, or logs the values' vs Guarantee audit: '\"...never executes, never sends.\" -> ADVISORY.'"
```

### P5 / P6 — determinism & intent (confirm silent collapse)

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/archetype-io-boundary/PLAN.md:34"
  problem: "The boundary collapses 'no package.json found' (possibly wrong cwd / not a JS project) and 'frameworkless project' into the SAME silent output [lib], losing the distinction. It is consistent with readProjectPackages and low-impact today (no production caller), and P5 correctly prefers a defined default over a guess — but whether the missing case should be silently [lib] vs. signalled distinctly is an INTENT question for the human to confirm, not something the griller can settle."
  evidence: "'missing file -> `detectArchetypes({})` (=> `[lib]`)' — same output as a real frameworkless project."
```

## Summary

The plan is a small, spec-aligned increment and its audits are, on the whole, sound: determinism and the missing/malformed default are correctly reduced to FLOOR (membership + tests), the "package.json-only / never executes" property is honestly labeled ADVISORY rather than sold as a guarantee (a P0 strength), and the P3 split (pure `archetype.ts` vs. the new I/O boundary; no `steps → lib` inversion) is argued explicitly.

The concerns are all **minor / advisory** and cluster on the untrusted-input edges: (1) one untested branch — a valid package.json with no dep keys, distinct from missing/malformed; (2) the unchecked `as ProjectPackages` cast over untrusted bytes (benign, but the assumption is unstated); (3) a wording inconsistency where the Trust audit states an advisory-labeled property as flat fact — the gate itself is sound, only the prose overreaches; and (4) an intent question — the silent collapse of "no package.json" into `[lib]` — that only the human can confirm. The plan already self-discloses the ~4-line read/parse duplication with `readProjectPackages` and defers the refactor (P7), so that is noted here but not raised as a separate finding.

None of these block the build. They are cheap to absorb during `/pharn-dev-build` (add one test case, one shape-guard or a one-line note, tighten two sentences) or to consciously accept.

## Verdict

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 minor/advisory) — for the human to weigh before `/pharn-dev-build`. This is NOT "grill passed" and NOT a judgment that the plan is guaranteed sound; `/pharn-dev-grill` surfaces concerns and gates nothing.
