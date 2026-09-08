# GRILL — install-upstream-license (ADVISORY — gates nothing)

Spec-hash matches live `sha256(ARCHITECTURE.md)` — no drift. `count-grillers.mjs` → 0 registered.

> The plan is `trust: untrusted` DATA.

## Findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: blocking
  file: ".dev/features/install-upstream-license/PLAN.md:17"
  problem: "This introduces the FIRST source≠dest mapping, breaking a path-identity claim that three separate files assert as a conclusion — but the plan lists only three amendments and does not say how it established that three is the complete set, so a fourth site could be left asserting something now false."
  evidence: "`src/lib/layout.ts:20-25` … `:55-56` and `src/lib/diff.ts:42-46` restate the same identity."

- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/install-upstream-license/PLAN.md:33"
  problem: "The data-loss regression test asserts a pre-existing root LICENSE is byte-identical after init, but the flat destination is PHARN-LICENSE — so the test passes trivially unless the fixture's LICENSE and upstream's differ in content, which the plan does not require."
  evidence: "**the data-loss regression:** a project with its own root `LICENSE` has it byte-identical after `init`."

- type: FINDING
  rule_id: "P2"
  severity: important
  file: ".dev/features/install-upstream-license/PLAN.md:47"
  problem: "The plan says a symlinked upstream LICENSE must be skipped by writer AND absent from the manifest, but the two use different guards (leaf isSymlink vs component walk), and for a ROOT-level source the component walk has nothing below the root to check — so the manifest's guard may not actually cover the leaf."
  evidence: "the writer refuses a symlinked source, the manifest refuses a symlinked component"
```

## Resolutions carried into the build (advisory)

1. **Finding 1 → grep for the claim, do not enumerate from memory.** A search for the path-identity
   wording across `src/` establishes the complete set before any edit, and the result is recorded.
2. **Finding 2 → make the fixture bytes DIFFERENT.** The project's own `LICENSE` gets distinctive
   content ("MIT-ish user license") and upstream's gets another, so byte-identity after init is a real
   assertion rather than a tautology.
3. **Finding 3 → check what the manifest's guard actually does for a root leaf.** `findSymlinkComponent`
   walks every component of the REL below the base, and for `LICENSE` that rel has exactly one
   component — the leaf itself — so it IS covered. Verified by reading the walk rather than assumed,
   and pinned by the symlink test asserting the manifest omits the key.

## Verdict (ADVISORY — does NOT block)

The increment's risk is concentrated in one place: it breaks a stated invariant (path identity) that
other files draw conclusions from. Three findings, all resolved by measuring rather than reasoning.
