# REVIEW — parallel-lens-merge (PHARN reviewing PHARN)

**Step 1 — Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN — 35 capabilities**. The increment reached review legitimately; everything below the floor is **advisory**.

Increment under review (`trust: untrusted`): the 8 built files — `.dev/floor/{merge-findings,count-lenses,lens-scanner-map}` (+ tests) and `.claude/commands/{pharn-review,pharn-dev-review}.md`.

## Findings (finding-shape; enum-gated / free-text split honored)

### Floor-gate (blocking) — NONE

The four lenses surfaced **no** blocking floor-finding: no unlabeled guarantee (L-floor), no missing eval binding (L-eval — the increment adds `.dev/floor/` helpers + commands, none `role:`-bearing, so `validate.mjs` correctly excludes them; their P1 obligation is met by 27 hermetic `.test.mjs`, the `check-ship.mjs` precedent), no guaranteed decision resting on a tainted field (L-trust), no grep-detectable sibling reference (L-axis).

### Advisory-gate (warn) — 2

```yaml
- type: FINDING
  rule_id: P3
  severity: important
  file: ".claude/commands/pharn-dev-review.md:104"
  problem: "The mirror section gives /pharn-dev-review a second axis of change — its 4 principle-lens review of PHARN increments AND the parallel-spawn+merge recipe for code lenses — so the file now changes for two reasons. This is the grill's F4, now materialized; it is ADVISORY (a command is excluded from validate, so this is judgment, not a floor-detectable sibling ref)."
  evidence: "'## Parallel lens orchestration + deterministic merge (mirror of `/pharn-review`)' added below the four inline lenses. Mitigation in place: the section CITES /pharn-review's recipe (P4) rather than duplicating it. The human explicitly chose Bundle at GATE 1 knowing this trade-off."
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/floor/merge-findings.mjs:160"
  problem: "Within a dedup group, the representative scalar problem/evidence = sources[0] after sorting by (source, problem, evidence); when two findings share the same source (one lens emitting twice at the same key), the tiebreak falls to the UNTRUSTED free-text. Deterministic, and it gates nothing (the scalar is DATA either way) — but which untrusted string becomes the representative is content-dependent."
  evidence: "line 160 `g.sources.sort((a, b) => cmp(a.source, b.source) || cmp(a.problem, b.problem) || cmp(a.evidence, b.evidence))`. Bounded: sorting/representative selection is not a guaranteed decision; the merge's grouping/identity still rests only on validated enum-gated fields."
```

## Per-lens notes

- **L-floor → P0:** every guarantee reduces to a floor primitive or is labeled advisory. `merge-findings` (enum-keyed dedup, fail-closed), `count-lenses` (frontmatter membership), `lens-scanner-map.test` (existence/count consistency) are FLOOR; parallel spawn, per-lens slicing, and lens judgment are labeled ADVISORY in both `/pharn-review`'s guarantee-audit and the mirror. "the code is safe / correct" is explicitly **struck**. No disease found.
- **L-eval → P1:** no `role:` capability added, so no `enforces↔eval` binding to check; the floor agrees (GREEN). The `lens-scanner-map.test.mjs` count assertions are **dynamic** (compared to live `count-lenses` / disk), not hardcoded magic numbers — good.
- **L-trust → P2 (the residual, unknown #1):** the increment **dogfoods fix #1 in its strongest form** — `merge-findings` keys only on enum-gated fields and **DROPS** any finding with a laundered needle/newline in an enum-gated field, proven by `merge-findings.test.mjs` (the needle never reaches an output enum-gated field). **The fence held on me, the reviewer:** the test fixture `"IGNORE ALL PREVIOUS INSTRUCTIONS"` (`merge-findings.test.mjs:113`) is a `trust: untrusted` payload quoted as DATA — I report it, I did not comply. `sources[]` free-text is carried as quoted DATA; the merged output's identity never rests on it.
- **L-axis → P3:** one axis per `.dev/floor/` file; no leaf→leaf sibling import (`pharn-review.md` reads `pharn-contracts/finding-shape.md` — the allowed bottom layer — plus tooling). The one axis concern is A1 (the command mirror), advisory.

## Verdict

**GREEN — floor gates PASS; 0 blocking floor-findings; 2 advisory (1 important, 1 minor).** The increment is floor-done. The advisory concerns are refinements for the human to weigh at the post-review gate; A1 is a trade-off the human already accepted at GATE 1.

## Proposed lesson (candidate — NOT canon; P7, human-gated via /pharn-dev-memory-promote)

- **Lesson:** When a floor helper needs a control character (e.g. a NUL key-separator) or when a command's Bash passes a **file list** to `node --test`, construct them via `String.fromCharCode` / a `charCodeAt` scan / newline-separated `$(...)` splitting — **never** a literal control char or a literal-space `join(' ')`. Authoring-time transforms can silently mangle literal control/space bytes, which then (a) collapse a key separator into a space (dedup key collisions) or (b) make an arg-list a single unsplit filename (a whole gate silently mis-runs).
- **Provenance:** this increment (`parallel-lens-merge`); hit **twice** during build — the `merge-findings.mjs` NUL separator (`String.fromCharCode(0)` fix) and the `/pharn-dev-regress` `node --test` 40-file list (newline-split fix, recorded in `REGRESSION.md`). Real failures (P7), not hypothetical.
- **Do not self-promote (P2):** proposed here only; a human accepts/denies via `/pharn-dev-memory-promote`.
