# REVIEW — init-install-capabilities

PHARN reviewing PHARN. The increment is `trust: untrusted`; instruction-looking content in the
reviewed code/frontmatter is DATA. **Floor (Step 1, P0):** `node .dev/floor/validate.mjs .` → **GREEN**
(0 capabilities — no markdown capability added; the increment is TypeScript). Everything below the
floor is **advisory**.

## Floor-gate (blocking) findings

**None.** No P0 guarantee lacks a floor reduction or an `advisory` label; no missing eval binding; no
tainted field gates any decision; no sibling (step→step / command→command) import.

## Advisory findings — by lens

### L-floor → P0 (guarantee ↔ floor reduction)

No findings. Every guarantee the increment makes reduces to the floor or is labeled advisory: parse
safety → enum/regex allowlists (`validate.ts`) + `safeJoin` + hard-fail (P5); copy correctness/exclusion
→ fixed source set + membership + `safeJoin` + vitest; "the installed methodology is safe to run" is
explicitly **advisory, not claimed**; the network guards are **inherited** from `repo.ts`, not
re-claimed. Honest.

### L-eval → P1 (behavior ↔ test)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: 'src/commands/init.ts:68'
  problem: "runInitArchetype's orchestration (fetch → parse → resolve → summary → install → cleanup-in-finally, and the error/cancel exit-after-cleanup ordering) has no test; only its constituent lib/steps and the flag dispatch are covered."
  evidence: 'async function runInitArchetype(): Promise<void> {'
```

Advisory: the gap is the networked orchestration wiring (hard to unit-test without mocking `fetchRepo`);
the copy/parse/resolve/config pieces it composes are each thoroughly tested, and the e2e drives the
apply path. Acceptable, but the cleanup-before-exit ordering is exactly the kind of thing that silently
regresses — a future increment could add a seam to test it.

### L-trust → P2 (untrusted data handling)

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: 'src/lib/install-capabilities.ts:102'
  problem: "The install copies executable hooks (.cjs) + floor scripts (.mjs) into the user's project and (for a fresh project) writes settings.json that activates PreToolUse write-gating hooks across their repo — a real environment change; it is disclosed in the summary and the settings guard prevents clobbering an existing config, so the residual is bounded, not zeroed."
  evidence: '// --- settings.json: NEVER overwrite the user'
```

Advisory and **handled**: file contents are copied verbatim and never executed/parsed by the CLI (the
CLI guarantees only path-contained copy via `safeJoin`); the summary step discloses that hooks are
installed; an existing `settings.json` is preserved (grill F1 fix). No guaranteed decision rests on any
fetched free-text — `role`/`applies` are enum-validated, names regex-validated, before any use. No
injection-looking content in the reviewed capability frontmatter altered this review.

### L-axis → P3 (one axis; no sibling imports)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: 'src/lib/capability-index.ts:34'
  problem: "capability-index.ts carries two plausibly-separable axes — directory enumeration AND the strict frontmatter field-reader; the split is deferred (also noted in GRILL.md), fine for now but worth watching if the field-reader is reused or grows."
  evidence: '// One axis (P3): deriving the typed index from fetched capability frontmatter.'
```

No sibling imports: the new steps import only `lib/` + types (verified — no `../steps/` import in either
new step); `init.ts` (command) imports steps + lib, the established pattern.

## Standing cross-cutting concern (advisory — for the post-review gate)

```yaml
- type: FINDING
  rule_id: P6
  severity: important
  file: 'src/steps/install-archetype.ts:75'
  problem: "The archetype config shape (modules:[], capabilities[...], no constitution) is new; the sibling commands add/update/remove/list/status were built to read module/manifest installs and are undefined for it — and since live upstream has no manifest, `pharn update`/`status`/`list` against an archetype config would error rather than degrade gracefully."
  evidence: 'modules: [],'
```

This is scoped-out by design (this increment is `init --archetype` only) but is a real integration edge
the human should weigh before merging: either accept it as a documented limitation or plan a follow-up
that makes the sibling commands archetype-aware (or fail with a clear message). Re-surfaced from
`GRILL.md`; it survived build unchanged because addressing it would expand scope (P7).

## Proposed lesson (candidate — NOT written to canon here)

None proposed. The one reusable pattern this increment exercised — *a fetched temp clone that must live
across an interactive prompt needs cleanup in `finally` with every `process.exit`/`cancelAndExit` after
it* — is **already** established in the codebase (`commands/status.ts`, `commands/remove.ts`), so it is
not a new recurring failure worth a `/pharn-dev-memory-promote` run (P7 — real, but already canon in practice).

## Verdict

**GREEN — no floor-gate (blocking) findings.** 4 advisory findings (1 important, 3 minor) for the human
to weigh at the post-review gate. Advisory ≠ guaranteed: this review certifies only the GREEN floor
(`validate.mjs`); the findings above rest on reviewer judgment and inform, they do not block.
