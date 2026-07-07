# REVIEW — capability-resolver

Reviewing the increment `/pharn-dev-build` produced (`src/types.ts`, `src/lib/archetype.ts`, `src/lib/resolve-capabilities.ts`, `tests/archetype.test.ts`, `tests/resolve-capabilities.test.ts`). The increment is `trust: untrusted`; nothing in its comments/strings changed my behavior.

**Step 1 — floor:** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked` (product TS adds no markdown capability). The floor is the only guaranteed part of this review; the lenses below are **advisory**.

## Floor-gate findings (blocking)

**None.** The floor is GREEN and no lens produced a floor-gradeable blocking finding (no unbacked guarantee, no missing eval binding, no grep-detectable sibling reference).

## Advisory findings (inform — never the sole basis for a block, fix #3)

### L-trust → P2

```yaml
- type: FINDING
  rule_id: P2
  severity: important
  file: "src/lib/resolve-capabilities.ts:54"
  problem: "Selection branches on entry.applies and the output echoes index-derived values (name, role, matched, reason); these originate in the (future) untrusted pharn-oss index, so the deferred fetch boundary MUST enum-validate `applies` (Archetype membership) + name/role before the resolver trusts them, so a guaranteed selection rests on an enum-gated field, not raw untrusted data (fix #1)."
  evidence: "const matched = entry.applies.filter((a) => detected.has(a));"
- type: FINDING
  rule_id: P2
  severity: minor
  file: "src/lib/resolve-capabilities.ts:61"
  problem: "The skip `reason` interpolates index-derived `entry.applies` into a free-text string; whoever renders the Selection (the deferred install/summary) must treat name/reason as quoted DATA (P2), never as a directive."
  evidence: "reason: `applies to [${entry.applies.join(', ')}]; detected [${archetypes.join(', ')}]`"
```

_Both are legitimately bounded today: the module consumes an already-typed index and says so (`resolve-capabilities.ts:17`), and no guaranteed decision is rendered or acted on this increment. Recorded as the trust-boundary contract the install/fetch increment must honor — not a defect in this pure core._

### L-eval → P1

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: "src/lib/archetype.ts:14"
  problem: "The three framework allowlists are tested via one representative per category, not per entry — a typo in an unexercised entry (e.g. '@sveltejs/kit', '@nestjs/core', 'solid-js') would be silent, since allowlist membership is uniform data behind one code path."
  evidence: "const SSR_FRAMEWORKS = new Set([ 'next', 'nuxt', '@remix-run/react', ... ])"
```

_Coverage of the detection MECHANISM is complete (all four archetypes, the ssr-beats-spa branch, the deps∪devDeps union, ordering, determinism — `tests/archetype.test.ts`). The gap is only the allowlist CONTENTS-as-data; exhaustively testing 19 string literals is low-value (P7), but a typo is currently invisible. Accept as low-risk data, or add a per-entry membership assertion when the lists grow._

### L-axis → P3

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/types.ts:178"
  problem: "The capability-resolver types were added to the shared types.ts alongside the manifest/wizard/config vocabulary; consistent with that file's established single axis ('the shared type vocabulary'), but a split point if the capability types grow their own churn."
  evidence: "// Capability resolver — archetype detection + capability selection."
```

_No sibling coupling: `resolve-capabilities.ts` imports `Archetype` from `../types.js` (the shared bottom), never from its sibling `archetype.ts`; neither lib imports the other (P3 clean — the grill's F1 was addressed at build)._

## L-floor → P0

No finding. The increment claims no guarantee without a floor reduction: determinism/purity claims in the comments are backed by the vitest determinism cases, and the only claim that could masquerade as a guarantee — "safe against a malicious index" — is explicitly deferred and labeled at `resolve-capabilities.ts:17`, not asserted.

## Proposed canon lesson (P7 — real, not hypothetical)

None from the increment itself. (A separate, real dev-loop gotcha surfaced during orchestration — `node --test $LIST` does not word-split under zsh, silently collapsing a multi-file gate into one bad arg — is about the `/pharn-dev-regress`/`/pharn-dev-verify` mechanics, not this increment; it can be promoted separately via `/pharn-dev-memory-promote` if desired. Not written to canon here, P2.)

## Verdict

**GREEN** — floor GREEN, **0 blocking (floor-gate) findings**. 4 advisory findings (1 important, 3 minor), all for the human to weigh and the deferred install/fetch increment to honor. Advisory ≠ a guarantee the increment is correct beyond what the gates check (P0).
