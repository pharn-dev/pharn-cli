# REVIEW — install-upstream-license (ADVISORY, except where marked FLOOR)

Floor first (P0): `validate.mjs` → **exit 0 (GREEN)**.

## L-floor → P0

| claim | reduction |
| --- | --- |
| a published initialized repo carries the Apache-2.0 grant | **conditional on upstream shipping `LICENSE`**; floor is the existence guard |
| the user's own root `LICENSE` is never touched | **floor: the destination is a different path by construction** + a test proven to fail against the identity mapping |
| writer and mirror agree | **floor: the existing mirror pin**, meaningful only because the scaffolds now carry a `LICENSE` |
| the repo is license-compliant in general | **NOT CLAIMED** — no `NOTICE`, no per-file headers; contents are copied verbatim and never rewritten |
| existing installs receive it | **NOT CLAIMED** — the same-version early-return window, named in the CHANGELOG |

## L-eval → P1

Nine cases. The data-loss regression is the one the increment exists to prevent, and it was made
non-tautological on purpose: the project's `LICENSE` and upstream's carry **different bytes**, so
byte-identity after `init` is a real assertion rather than one that would pass whichever file won.
The manifest cases assert the **mapping** (`map.get('PHARN-LICENSE') === join(repo, 'LICENSE')`) and
that no root `LICENSE` key exists — presence alone would not have distinguished the mapped entry from
the trap.

## L-trust → P2

`from`/`to` are fixed per-layout constants, never derived from clone contents. The writer refuses a
symlinked source; the manifest's component walk covers the leaf too (for a root-level rel the walk's
only component IS the leaf — checked by reading the walk, not assumed), and the symlink test asserts
the manifest omits the key. That agreement matters more than usual here: a manifest entry the
installer never writes is phantom drift AND, since the map drives `update`'s writes, would copy one in.

## L-axis → P3

`LayoutPaths` is the one place that knows the two layouts, which is where the mapping belongs; the
copy site and the mirror consume it. No new module, no command→command edge.

## Findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "src/lib/layout.ts:24"
  problem: "This is the first source≠dest mapping, so the header's path-identity sentence became a rule with an exception — three files asserted that identity as a conclusion, and a fourth site (`install-manifest.ts:234`) still says a path 'addresses the clone source and the project destination at once' without naming a scope."
  evidence: "so a layout's source-relative-to-clone path IS its dest-relative-to-project path"

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "src/lib/layout.ts:61"
  problem: "The flat destination `PHARN-LICENSE` is a root-level file with a name pharn invented, so it is the one installed artifact whose path exists purely to avoid a collision rather than to mirror upstream."
  evidence: "license: { from: string; to: string };"
```

**On finding 1:** the three unconditional assertions were found by grepping for the claim rather than
recalled, and all three are amended. The fourth site is `capabilityCloneFiles`, whose sentence is
scoped to CAPABILITY directories — those remain identity-mapped, so it is still true and was
deliberately left alone. Recorded so "we only changed three" is a measurement, not an oversight.

**On finding 2:** accepted. The alternative is upstream shipping the license inside the mirrored tree
(`pharn/LICENSE`), which would let the pharn layout drop the mapping entirely and become an ordinary
identity-mapped entry; flat is the legacy branch and upstream produces only the pharn layout today.
Raised upstream, not blocking.

## Gate split (fix #3)

- **Floor-gate (blocking):** `validate` 0, `npm run check` green, `check-verify` **PASS**,
  `check-regress` **`no-regressions`**. All GREEN.
- **Advisory:** the two findings above.
