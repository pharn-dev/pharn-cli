# GRILL — core-191-pinning-tests-to-lint

ADVISORY. These findings surface concerns for the human; they gate nothing (P0). Spec hash
recomputed this run: `bca940a5…` = the plan's `spec_content_hash` (no drift).

## Findings

1. **rule_id P0 · severity advisory — "the rule is at least as strong as the scan" is a per-rule claim, not a global one.**
   Rule 6 (update's only prompt) moves from "`await <api>(` occurs once, as `confirm`" to "update.ts imports no prompt API but `confirm`". It no longer counts calls (two `await confirm(` would pass) but now also sees a namespace import. Rule 12's `log.error` selector does not see `const { error } = log`; the old text scan did not either. State per rule what moved, not one blanket sentence.
   _Plan response expected:_ name rule 6's lost "exactly once" in the PR table.

2. **rule_id P1 · severity advisory — the lint-rules test must load the REAL config, or it proves the probe, not the gate.**
   If the test builds its own `overrideConfig`, a typo in `eslint.config.mjs` (a rule scoped to the wrong glob, an options object that a later config object overrides) would pass the test and the gate would stay open. The plan says `new ESLint({ cwd: repoRoot })` — keep it that way, and include at least one case per exemption so an over-broad exemption is also caught.

3. **rule_id P5 · severity advisory — flat-config override is the one structural trap.**
   Two config objects that both set `no-restricted-imports` for the same file: the later replaces the earlier, silently. The plan's builder handles it; the test must include a case where a file-specific rule and a src-wide rule apply to the SAME file (e.g. `src/lib/diff.ts` importing `picocolors` must still fire next to its own `node:fs` ban), or the trap is untested.

4. **rule_id P7 · severity advisory — coverage floors.**
   `vitest.config.ts` has coverage thresholds over `src/**`. The deleted tests read text or YAML and execute no `src/` code paths that other suites do not, so coverage should not move — verify with `test:coverage` rather than assume.

5. **rule_id P4 · severity advisory — docs beyond the two named files.**
   Grep `docs/` and `CONTRIBUTING.md` for every deleted file name before claiming the docs are in sync; CLAUDE.md is CORE-192's (handed over in the pin-changes list).

6. **rule_id P6 · severity advisory — sibling merge surface.**
   `tests/init.test.ts` / `tests/update.test.ts` may be deleted by CORE-190. Whole-`it` removals are the right shape; also remove imports that become unused only when the removal leaves them unused (lint will say), to keep the diff minimal.

## Verdict (advisory)

Proceed. No blocking gap; findings 2 and 3 should shape `tests/lint-rules.test.ts`, finding 1 the PR table, finding 4 a verify-time check. This is not a judgment that the plan is sound — that stays the human's.
