# REVIEW — install-features-readme (ADVISORY, except where marked FLOOR)

Floor first (P0): `validate.mjs` → **exit 0 (GREEN)**.

## L-floor → P0

| claim | reduction |
| --- | --- |
| the cited boundary contract is installed | **conditional on upstream shipping it**; floor is the existence guard on both sides, pinned by the P7 case |
| writer and mirror cannot disagree | **floor: the existing mirror pin** ("manifest keys ∪ settings.json == files actually written"), which passed unchanged — that is the proof the two sides were edited in lockstep |
| nothing outside the clone can be copied through this path | **floor: `findSymlinkComponent` + `safeJoin`**, pinned by a test proven to fail without the guard |
| existing installs receive the file | **NOT CLAIMED** — the same-version early-return window is named, not worked around |

## L-eval → P1

Five new cases. The one that matters most was not in the plan and came out of measuring rather than
reasoning: **a symlinked `features/` PARENT**. `features/README.md` is the first root-relative file
the install copies that has an intermediate directory, so the leaf-only `isSymlink` guard the trusted
docs use is newly insufficient. Measured on this Node: `existsSync` is true, `lstat(leaf).isSymbolicLink()`
is **false**, and `cpSync` copies the pointed-to bytes straight through — bytes from outside the clone
into the user's project. `safeJoin` cannot catch it (lexical; it never resolves a link). The writer now
runs the same component walk the manifest already ran, and the test was verified to FAIL with only that
guard removed (not by stashing the whole file, which would have made it pass vacuously).

## L-trust → P2

`FEATURES_README` is a CLI-owned constant, never read from the clone. Both reads are `safeJoin`-contained
and now use the SAME physical symlink posture on both sides. Contents copied verbatim, never parsed.

## L-axis → P3

One constant, two lockstep call sites, one new `lib`→`lib` import (`symlink-guard.ts`, already the
shared physical walk). No command→command edge.

## Findings

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "src/lib/install-capabilities.ts:157"
  problem: "The trusted-docs loop still uses the leaf-only `isSymlink` check, which is sound only because every trusted doc's parent is the clone root itself — a fact nothing in the code states, so a future doc at a nested path would silently reopen the hole this increment just closed for features/README.md."
  evidence: "for (const doc of paths.docs) { const from = safeJoin(repoDir, doc); if (existsSync(from) && !isSymlink(from)) {"

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "src/lib/constants.ts"
  problem: "The constant documents its failure mode as 'quietly not installed' if upstream relocates the file, which is honest but means a relocation would be invisible — no warning, and `status` would simply stop reporting it."
  evidence: "Failure mode if upstream ever relocates it under `pharn/`: both readers are existence-guarded, so it is QUIETLY NOT INSTALLED — no error, no warning."
```

**On finding 1:** deliberately not fixed here. Extending the component walk to the trusted-docs loop
is a change to a path this increment does not touch, and it is currently unreachable (all four docs
sit directly under the clone root or under `pharn/`, whose own component the walk would check). It is
recorded so the next person adding a nested doc sees it, rather than being left as tribal knowledge.

**On finding 2:** accepted — it matches how every other optional upstream surface behaves
(`pharn-core`, `MIN_CLI`), and turning a missing optional file into a warning is a product decision
about the whole class, not about this one file.

## Gate split (fix #3)

- **Floor-gate (blocking):** `validate` 0, `npm run check` green, `check-verify` **PASS**,
  `check-regress` **`no-regressions`**. All GREEN.
- **Advisory:** the two findings above.
