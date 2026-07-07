# GRILL — archetype file-tree scan (ADVISORY — gates nothing)

Interrogated plan: `.dev/features/archetype-file-tree-scan/PLAN.md`. Spec-hash check: recomputed
`sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches**
the plan's `spec_content_hash` (no drift). Registered grillers (`count-grillers.mjs .`): **0** — the
`pharn-pipeline` module isn't in this repo, so no pluggable grillers ran; the inline axes below applied.

> The `PLAN.md` is `trust: untrusted` to this stage. `problem` / `evidence` below quote the plan as DATA.
> Enum-gated fields (`type`, `rule_id`, `severity`, `file`) are the griller's own assertions. **No finding
> here blocks `/pharn-dev-build`** (fix #3): drift blocks at `/pharn-dev-build`'s floor-gate, not here.

## Findings (finding-shape objects; `pharn-contracts/finding-shape.md` — conformed, not restated)

### Axis: honest scope / limits (P7, P0)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/archetype-file-tree-scan/PLAN.md:83"
  problem: "The depth/entry caps are labeled a perf 'defensive bound', but their real failure mode is a SILENT false-negative — a signal past the cap (e.g. a monorepo .tsx at apps/web/src/…/Foo.tsx) is undetected, yielding a wrong archetype with no signal that truncation occurred."
  evidence: "Bounded (advisory defensive caps, P7 — labeled, not sold as a hard guarantee): a depth cap and a total-entry cap bound a pathological tree"
```

Weigh at build: pick **generous** caps (lean on the skip-list + all-signals-true short-circuit for perf,
not a tight cap), and document the completeness-vs-bound tradeoff honestly — a truncated signal is a
determinism-preserving but completeness-sacrificing miss, not merely "perf." Determinism (same tree → same
result) is unaffected either way.

### Axis: eval coverage / changed invariant (P1, P6)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/archetype-file-tree-scan/PLAN.md:61"
  problem: "The plan says packageJsonFound 'keeps its exact current meaning', but the emergent invariant that USED to hold — packageJsonFound:false ⟹ archetypes == ['lib'] — is now broken by design (a manifest-less project with a .tsx → {archetypes:['spa'], packageJsonFound:false}). No listed eval pins the full ArchetypeDetection for a manifest-less-but-file-signalled project, so a future consumer could still assume the old coupling."
  evidence: "packageJsonFound keeps its exact current meaning (was a usable manifest read) — only archetypes becomes the merged set."
```

Weigh at build: add an eval asserting the **whole** `{archetypes, packageJsonFound}` for a project with
**no** package.json + a `.tsx` (expect `{archetypes:['spa'], packageJsonFound:false}`) — the sharpest proof
of "detect from files, not just package.json," and it locks the intentionally-changed coupling.

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/archetype-file-tree-scan/PLAN.md:98"
  problem: "Only node_modules is asserted as skipped; the .git / dist / build / .env* skips (the bounded-walk safety surface) hold by construction but are untested — one representative build-output skip test would pin them."
  evidence: "Bounded walk: a .tsx under node_modules/ is skipped → no spa (proves the skip-list)."
```

### Axis: one axis of change (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/archetype-file-tree-scan/PLAN.md:58"
  problem: "classifyEntry is PURE file-name membership — arguably the same 'classification rules' axis as the package-name membership that lives in archetype.ts. Placing it in the I/O file mixes 'reading strategy' with 'classification', a defensible but debatable split the human should ratify (alternative: put classifyEntry beside the other pure membership in archetype.ts, leaving detect-archetype.ts purely I/O)."
  evidence: "local pure classifyEntry(name, isDir): ArchetypeSignals (the file-name patterns above);"
```

### Axis: determinism (P5)

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/archetype-file-tree-scan/PLAN.md:44"
  problem: "The signal patterns don't state case handling. On case-insensitive filesystems (macOS/Windows) readdir returns the on-disk case, so exact-case matching would miss API/, .TSX, or Next.config.js. Specify a lowercase-normalized compare so membership is stable across case variants."
  evidence: "next.config.* file → ssr signal → ssr."
```

## Prose summary

The plan is **strong and unusually honest**: its guarantee audit correctly splits floor (determinism +
each pinned mapping) from advisory (mapping completeness, names-only, caps); its trust audit closes the
untrusted-file-name surface (names → membership → closed enum, symlink-safe, worst case = a flipped
boolean → an advisory mis-detection, never injection/escape); and the merge-**signals**-not-sets pivot
correctly implements the human's SSR-gating decision. The reversal of #20 and the ARCHITECTURE.md §5
"membership over package.json" tension are **surfaced and human-owned** (approved at GATE 1), not smuggled.

The concerns are refinements, not defects: (1) the walk caps' true failure mode is a **silent
false-negative**, so caps should be generous + the tradeoff documented; (2) the intentionally-changed
`packageJsonFound:false ⇏ ['lib']` coupling deserves a dedicated pinning eval (a no-manifest + `.tsx`
fixture — also the headline "detect from files" proof); (3) a placement judgment call for the pure
`classifyEntry` (P3); (4) unstated case-normalization; (5) one more skip-list test. None touches a
constitution principle as a violation; none blocks build.

## ADVISORY VERDICT

**5 concerns raised (2 important-severity, 3 minor) — all advisory, for the human to weigh before
/pharn-dev-build.** No blocking-severity findings; no spec-hash drift; no CONSTITUTION_VIOLATION. This
grill-log **does not gate** `/pharn-dev-build` (P0/fix #3) — the deterministic backstops remain
`/pharn-dev-build`'s floor-gates (spec-hash, unresolved HALTs) and `.dev/floor/validate.mjs`.
