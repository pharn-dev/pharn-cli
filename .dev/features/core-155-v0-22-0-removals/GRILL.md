# GRILL — core-155-v0-22-0-removals

Advisory (gates nothing). Plan: `.dev/features/core-155-v0-22-0-removals/PLAN.md`, approved at GATE 1 by the
run's decision owner as written.

## Findings

1. **[medium] uninstall on a flat install is refused too.** `uninstall` never reads `layout` (it deletes by
   record), so it could work on a flat install. The plan refuses it through the shared loader, like the
   pre-archetype refusal, so a flat user must re-run `init` (or use 0.21.x) before uninstalling.
   - evidence: `src/commands/uninstall.ts` calls `loadArchetypeConfig`; `src/lib/uninstall-plan.ts` has no layout input.
   - disposition: keep (one message, one door, consistent with the policy); name it in the docs and the PR residuals.

2. **[medium] the legacy root paths must stay in the install-root bound, or old records vanish silently.** If
   `install-surfaces.ts` dropped the flat paths with `layoutPaths('flat')`, a re-run init (or an update on a
   pre-7.0 install) would prune every old root record without a word: the files stay, but no ORPHANED note,
   and `uninstall` could no longer remove them.
   - evidence: `findOrphans` and `planUninstall` both skip keys outside `isInstallRootPath`.
   - disposition: build keeps the root constants as old-record paths; a test pins an old flat file listed as ORPHANED after re-init.

3. **[medium] `detectLayout` now throws.** Every caller must sit after the fetch, inside the command's
   clone `try`, so the refusal is one reported line and the clone is removed.
   - evidence: callers in status, add, update-plan, init-plan, install-capabilities, capability-index (derivation), overwrite-check, write-targets.
   - disposition: pin one refusal per command with a flat tree (init, update, add, status).

4. **[low] a dropped capability's old flat directory is left untracked after re-init.** init plans removals
   at `pharn/` paths only and `findOrphans` prunes the records of a capability it no longer owns.
   - disposition: inert for PHARN 7 (it reads `pharn/`); the refusal message and the docs tell the user to delete the old top-level copies by hand.

5. **[low] overlap with #404.** Both remove `resolveTrustedDocs`/`PHARN_ROOT_FALLBACK_DOCS`, both rewrite the
   harness tree to the 7.x shape. Mirror #404's text where both remove the same lines.

6. **[low] test-integrity.** Rewritten tests must keep every title (TI02 compares names, then bodies), keep
   assertions (TI05), and avoid literal-only expectation edits (TI07 warns).

## Verdict

Proceed to build (advisory). Findings 2 and 3 become tests.
