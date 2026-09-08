# REVIEW — ship-threat-model-limits (ADVISORY, except where marked FLOOR)

Floor first (P0): `validate.mjs` → **exit 0 (GREEN)** at HEAD.

## L-floor → P0

| claim | reduction |
| --- | --- |
| a pharn install ships all four trusted docs | **conditional; the condition IS the floor** — `existsSync && !isSymlink` at the installer, `lstat().isFile() && no symlinked component` at the manifest. Pinned by the P7 test |
| one docs list, four consumers, they cannot disagree | **floor: the existing manifest⟷installer mirror tests**, which now traverse the two added paths |
| the added docs are symlink-refused like the others | **floor: `isSymlink` / `findSymlinkComponent`** + the new symlink case |
| the dangling citations in the installed commands are fixed | **NOT CLAIMED** — content and hook anchoring are upstream |

The honest shape of this increment is that it is a **promise about a path**, not a delivery of a
file. `PHARN_TRUSTED_DOCS` naming `pharn/THREAT-MODEL.md` says "if upstream puts a file there, we
install it." Upstream at `2e183e6` does not yet, so nothing about any current install changes today.
That is stated in the changelog and pinned by the P7 test rather than left for a user to discover
when `pharn status` says nothing new.

## L-eval → P1

Six cases touched or added. The two that carry the weight are new:

- the **P7 skip** — a clone lacking both docs installs without throwing AND the manifest omits both
  keys. The second half is the load-bearing assertion, because `status`'s `missing` bucket is derived
  from that map: omission from the map *is* "not reported missing", so the test pins the mechanism
  rather than the symptom.
- the **symlink guard** — a symlinked `pharn/LIMITS.md` is neither copied nor expected, while its
  real sibling in the same directory still is.

The pharn fixture now writes DIFFERENT bytes into `pharn/THREAT-MODEL.md` (`TM`) and the dev repo's
root `THREAT-MODEL.md` (`T`), and the install test asserts on content — so a test cannot pass because
the two copies are indistinguishable. The `not.toContain` guards in the manifest test are
path-anchored for the same reason: a bare basename check would have failed on the `pharn/`-prefixed
key it is meant to allow, and would have stopped catching a root leak.

## L-trust → P2

The clone is untrusted. The two added paths are read exactly like the existing docs —
`safeJoin`-contained, `lstat`-checked, symlink-refused, contents copied verbatim and never parsed. No
new taint path: the doc names are CLI-owned constants, not values read from the clone.

## L-axis → P3

One constant and two comments; no new import, no new module, no consumer edited. `detectLayout` still
keys on `pharn/pharn-contracts` — a doc must never become the layout marker, and none did.

## Findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "src/lib/constants.ts:56"
  problem: "The CLI now names two upstream paths that do not exist in pharn-dev/pharn-oss at 2e183e6, so between this merge and the upstream one the constant documents a location rather than a fact — inert by construction, but a reader of constants.ts alone cannot tell which state they are in."
  evidence: "export const PHARN_TRUSTED_DOCS = ['pharn/CONSTITUTION.md', 'pharn/ARCHITECTURE.md', 'pharn/THREAT-MODEL.md', 'pharn/LIMITS.md'];"

- type: FINDING
  rule_id: "P7"
  severity: important
  file: "docs/getting-started.md:71"
  problem: "The install table now lists four trusted docs as things the user gets, qualified only by 'if the fetched version ships it' — a reader installing today gets two of the four and has to infer which."
  evidence: "The four trusted spec docs, copied verbatim — at the project root in the flat layout, or under `pharn/`. Each is copied only if the fetched version ships it"

- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "docs/getting-started.md:63"
  problem: "The whole table's pipes were realigned to satisfy MD060 after the longer row was added, so the diff touches every row of a table a later increment is scheduled to rewrite."
  evidence: "| Artifact | Description |"
```

**On findings 1 and 2:** both are the same fact seen from two files, and both were **accepted
deliberately** rather than fixed. The alternative — hold the CLI change until upstream lands — was
rejected because the spec establishes the order is safe either way and the existence guards make it
so; the mitigation is that the CHANGELOG states plainly that upstream does not ship them yet and no
current install changes. The residual is that `constants.ts` and the install table each read slightly
ahead of reality for as long as the upstream half is outstanding. Named, not hidden.

**On finding 3:** realignment was forced by `lint:md` MD060, not chosen. The later table rewrite is
told to take the current state from disk, so the churn costs that increment nothing.

## Gate split (fix #3)

- **Floor-gate (blocking):** `validate` 0, `npm run check` green, `check-verify` **PASS**,
  `check-regress` **`no-regressions`**. All GREEN.
- **Advisory (never blocking):** the three findings above.
