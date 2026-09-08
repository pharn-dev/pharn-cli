# REVIEW — exclude-floor-test-fixtures (ADVISORY, except where marked FLOOR)

Floor first (P0): `validate.mjs` → **exit 0 (GREEN)**.

## L-floor → P0

| claim | reduction |
| --- | --- |
| no floor test apparatus reaches a user project | **floor: fixed-name segment membership**, applied to the SAME floor-relative string on both sides; pinned in both layouts |
| writer and mirror cannot disagree | **floor: the existing mirror pin — but only now.** The scaffolds previously contained no fixture, so the pin would have passed vacuously. A separate case asserts the scaffolds DO contain one, so a future scaffold edit fails loudly instead of quieting the pin |
| an ancestor named `test-fixtures` cannot prune the floor | **floor: test**, verified to fail against an unanchored predicate |
| existing installs are cleaned up | **NOT CLAIMED** — `update` never deletes; no deletion path added |

The anchoring detail is the whole increment. `cpSync` hands its filter an absolute path *and calls it
for the source root*, so `false` at the root copies nothing — an install that silently ships no floor
while every other assertion in the suite stays green. Because the repo's scaffolds live under
`mkdtempSync(join(tmpdir(), 'pharn-test-'))`, no existing test could ever have produced a matching
path component. That is why the anchor test constructs the ancestor explicitly.

## L-eval → P1

Seven cases. Two are guards against the tests themselves being hollow: the non-vacuity assertion on
the mirror scaffolds, and the `my-test-fixtures.mjs` near-miss that separates a segment match from a
substring match. Both the anchor case and the exclusion were verified against deliberately broken
source.

## L-trust → P2

The new predicate only ever REMOVES paths from a set that is already `safeJoin`-contained and
symlink-guarded, so it cannot let a name skip containment. `noSymlinks`, `isSymlink(floorFrom)`, and
the manifest's `findSymlinkComponent` root guard are untouched.

## L-axis → P3

One constant, two predicates, one new `node:path` import. No consumer edited, no new module.

## Findings

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "src/lib/install-capabilities.ts"
  problem: "The exclusion is filter-shaped rather than structural: upstream mixes runtime checkers and test apparatus in one directory, so the CLI has to know a magic directory name, and a rename upstream silently reintroduces the leak with nothing to catch it."
  evidence: "export const FLOOR_TEST_FIXTURES_DIR = 'test-fixtures';"

- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "src/lib/install-manifest.ts"
  problem: "The mirror's predicate is kept deliberately no WIDER than the writer's — neither matches a nested `floor/<x>/test-fixtures/` — but nothing tests that they agree on such a path, so the two could drift there unnoticed."
  evidence: "Kept exactly as wide as the writer's, no wider"
```

**On finding 1:** correct, and it is the reason the upstream note in the spec exists (a dedicated
`__tests__/` or a fixtures sibling outside the shipped dir would make the boundary structural). Not
actionable in pharn-cli alone, and the CLI-side exclusion is complete and stays correct if upstream
later relocates the directory.

**On finding 2:** deliberate. Both sides are the same two-branch expression on the same string, so
their equivalence is readable rather than argued; adding a nested-path case would pin a shape neither
side supports and that upstream does not produce. Recorded so the choice is visible.

## Gate split (fix #3)

- **Floor-gate (blocking):** `validate` 0, `npm run check` green, `check-verify` **PASS**,
  `check-regress` **`no-regressions`**. All GREEN.
- **Advisory:** the two findings above.
