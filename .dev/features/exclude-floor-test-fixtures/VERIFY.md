# VERIFY — exclude-floor-test-fixtures

- verdict (FLOOR, `check-verify.mjs` exit 0): **PASS** — `test` (1045), `validate`, `lint`,
  `format:check`, `lint:md`, `typecheck` all exit 0. `count-verifiers.mjs` → 0 registered.

## What this does and does not guarantee

Guaranteed: the six gates passed, and the exclusion is pinned on both sides in both layouts, with a
near-miss (`my-test-fixtures.mjs`) proving it is a segment and not a substring.

The case that matters most is the **anchor**: a clone whose floor sits under an ancestor directory
named `test-fixtures`. `cpSync` calls its filter for the source ROOT too, so an unanchored
absolute-path match returns false there and copies NOTHING — an install that silently ships no floor
at all. That test was verified to fail against an unanchored predicate.

**Not** guaranteed: that existing installs are cleaned up. `update` never deletes, so the files
already on disk stay and simply drop out of the tracked set. No deletion path was added, and
`status` gained no cleanup — it stays strictly read-only.
