# GRILL — install-pharn-core (ADVISORY)

Plan under interrogation: `.dev/features/install-pharn-core/PLAN.md` (`trust: untrusted` to this
stage). **Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash`. No drift; `/pharn-dev-build`'s fix #4 gate is where drift would actually block.

Registered grillers (deterministic membership, `node .dev/floor/count-grillers.mjs .`):
`{"registered":0,"grillers":[]}` — **zero**. This is the CLI repo; it ships no `role: griller`
capability, so the pluggable slot contributed nothing and only the inline Step-2 axes ran. Stated,
not papered over (P7).

Contracts read this run to ground the interrogation: `pharn-contracts/finding-shape.md`,
`pharn-contracts/eval-format.md`, `pharn-contracts/seam-config.md`.

---

## Findings

### Axis: P0 — guarantee-audit completeness

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/install-pharn-core/PLAN.md:113'
  problem: 'The claim "flat installs are unaffected" is labelled floor, but its reduction rests on a fact about the UPSTREAM repo (that no flat clone ships a root pharn-core/) rather than on a deterministic operation the CLI performs — the floor part is only "existsSync decides the branch".'
  evidence: '"flat installs are unaffected" → **floor**: `existsSync` on `paths.core` is false for every flat clone (upstream ships no root `pharn-core/`)'
```

The branch **is** floor (a filesystem membership test with a no-op else). What is not floor is the
_outcome_ "flat is unaffected": that is contingent on remote content verified once, at plan time. If
upstream ever adds a root `pharn-core/`, flat installs begin copying it — correct behaviour, but not
what the sentence promises. Split the claim: the branch is floor, the flat-is-unaffected outcome is
advisory-contingent-on-upstream.

### Axis: P1 — eval coverage

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: blocking
  file: '.dev/features/install-pharn-core/PLAN.md:92'
  problem: 'The plan asserts `pharn update` is the remediation for an existing install missing pharn/pharn-core, but src/commands/update.ts:134-138 early-returns "Already up to date" whenever config.skillsVersion === latest and --force is absent, so the exact population that has the gap (installed at the current skills version with the pre-fix CLI) can never restore the directory without --force.'
  evidence: '`update` against a pharn clone: project missing `pharn/pharn-core/**` → files classify `missing → restore`, written, exit 0'
```

This is the highest-value finding in the run and it is a **real, verified** behaviour, not a
suspicion — read live this run:

```ts
// src/commands/update.ts:134
const current = config.skillsVersion === latest;
if (current && !force) {
  outro(`Already up to date (skills v${config.skillsVersion}).`);
  return;
}
```

Concretely: a user installs today against upstream `SKILLS_VERSION` 2.8.0 with the pre-fix CLI, so
`pharn.config.json` records `skillsVersion: "2.8.0"` and no core dir lands. They upgrade the CLI,
`pharn status --strict` now exits **1** (the new manifest entry reports the files missing), and
`pharn update` answers **"Already up to date"** and writes nothing. Their only route is
`pharn update --force`, which also overwrites every locally-modified file (backed up, but still not
the surgical fix). The planned `update` test would pass while missing this, because the fixture
bumps the version (`1.0.0 → 1.1.0`).

The plan's own consequence note inherits the same defect:

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: '.dev/features/install-pharn-core/PLAN.md:140'
  problem: 'The "consequences worth naming" section tells the reader that `update` fixes the new drift at exit 0, which is true only when the skills version differs; no doc line is planned to tell a same-version user that --force (or re-init) is their only route.'
  evidence: '`update` classifies those files `missing → restore` and fixes it at exit 0. Flat installs see no change.'
```

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/install-pharn-core/PLAN.md:92'
  problem: 'No planned test pins the status/drift side of the change, even though "status drift coverage" is the headline benefit of the manifest entry and the originating finding names `status --strict` exiting 1 as an acceptance criterion; tests/diff.test.ts already has a pharn-layout scaffold that would carry it.'
  evidence: 'manifest ⟷ writer mirror (pharn layout) stays exactly equal with the new surface present'
```

The mirror tests prove the manifest and the writer agree. They do **not** prove that
`diffInstalledCapabilities` reports a deleted `pharn/pharn-core/**` as `missing` — that is a
separate consumer, and it is the one the acceptance criterion names.

### Axis: P2 — trust propagation

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: important
  file: '.dev/features/install-pharn-core/PLAN.md:101'
  problem: 'The writer guards only the FINAL path component with isSymlink, while the manifest mirror uses findSymlinkComponent, which walks every component — so a clone whose pharn/ ANCESTOR is a symlink is copied by installCapabilities but skipped by collectExpectedInstallPaths, and the plan adds a fourth directory to that pre-existing asymmetry without naming it.'
  evidence: '"a symlinked core root is never materialized" → **floor**: `existsSync(from) && !isSymlink(from)` guard at the copy root'
```

Verified by reading both sides this run: `install-capabilities.ts:61` is
`lstatSync(p).isSymbolicLink()` on the leaf only, whereas `install-manifest.ts:86` calls
`findSymlinkComponent(repoDir, relDir)`. The manifest side already has tests for a symlinked
*ancestor* (`tests/install-manifest.test.ts` — "a symlinked ANCESTOR of the floor dir contributes
nothing"); the writer side has none, and no fixture plants a symlinked `pharn/`.

This is **pre-existing** and affects `contracts`, `floor`, and `docs` identically — it is not
introduced here, and fixing it is a different axis of change (P3) that would belong in its own
increment. The finding is that the plan should **say so** rather than claim a containment level the
writer does not have. The planned symlinked-`pharn-core`-**root** test is still correct and worth
having; it just does not cover the ancestor case.

### Axis: P7 — honest scope / smallest increment

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/install-pharn-core/PLAN.md:57'
  problem: 'One entry in the authorized `## Files` list is conditional ("only if the added surface changes an asserted conflict list"), which reads as an undecided scope item rather than a planned change.'
  evidence: '`tests/overwrite-check.test.ts` — extend its `scaffoldRepoPharn` only if the added surface changes an asserted conflict list'
```

Harmless in practice — the writes-scope setter authorizes a path without requiring a write — but the
build should resolve it by running the suite and touching the file only if it actually goes red.

### Axes with no findings

- **P3 (one axis of change / no sibling imports).** Each touched file changes for its single
  existing reason: `constants.ts` gains source paths, `layout.ts` gains a resolved field,
  `install-capabilities.ts` gains a copy block, `install-manifest.ts` gains a mirror line. No leaf
  imports a sibling leaf; `layout.ts` remains the single resolver both sides read.
- **P5 (determinism).** The one new branch is `existsSync && !isSymlink` — a membership test whose
  else branch is a no-op, not a guess. `detectLayout`'s marker is deliberately unchanged
  (`pharn/pharn-contracts`), so the new surface cannot influence layout classification.

---

## Summary

The increment is correctly shaped and genuinely small: it mirrors the `pharn-contracts` pattern
across four files and pins it with the tests that already exist for that pattern. Its trust posture
is inherited wholesale from a path that is already reviewed and tested.

One concern is materially larger than the rest. **The plan's remediation story is wrong for the
users who actually have the gap.** `pharn update`'s same-version early-return means the drift this
change makes visible cannot be repaired by the command the plan (and the docs it plans to write)
points at, unless the user reaches for `--force` and accepts its blast radius. Nothing about that
invalidates shipping the install surface — fresh installs and version-bump updates are fixed, which
is the bulk of the value — but it should be a **conscious, documented** decision rather than an
unnoticed one. The two coherent responses are: (a) keep the increment small and state the `--force`
caveat in `docs/commands/update.md` + `docs/commands/status.md`, filing the "restore missing manifest
files even at the same version" behaviour as its own increment; or (b) widen scope now to make
`update` skip its early-return when the manifest reports missing files — a change to `update`'s
control flow that the plan explicitly promised not to restructure.

Two smaller items are worth folding in cheaply: a `tests/diff.test.ts` case pinning that a deleted
`pharn/pharn-core/**` shows up as `missing` (the acceptance criterion the plan's eval list omits),
and honest re-labelling of the two overstated guarantee reductions (flat-unaffected; symlink
containment depth).

ADVISORY VERDICT: 6 concerns raised (1 blocking-severity, 4 important, 1 minor) — for the human to
weigh before `/pharn-dev-build`. This log **gates nothing**: no finding here blocks the build, every
severity above is an LLM assignment (advisory, fix #3), and the deterministic backstops remain
`/pharn-dev-build`'s spec-hash gate and `.dev/floor/validate.mjs`.
