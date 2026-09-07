# REVIEW — install-pharn-core

**Step 1, floor first (P0):** `node .dev/floor/validate.mjs .` → exit `0` (GREEN). The increment was
entitled to reach review. Everything below the floor line is **advisory**.

Increment under review (`trust: untrusted`): 10 files, +255/−9 — `src/lib/{constants,layout,
install-capabilities,install-manifest}.ts`, `src/types.ts`, and five test files. Docs changes reviewed
alongside.

---

## Floor-gate findings (verdict comes from content the floor can check)

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: blocking
  file: 'src/lib/install-capabilities.ts:61'
  problem: 'A clone whose `pharn/` ANCESTOR is a symlink is copied wholesale by installCapabilities — including the new pharn-core block — while collectExpectedInstallPaths enumerates nothing under it, so files sourced from OUTSIDE the clone land in the user project and are then invisible to status, update, and the records seed.'
  evidence: 'const isSymlink = (p: string): boolean => lstatSync(p).isSymbolicLink();'
```

**Verified this run, not inferred.** A probe built the `pharn/` tree outside a fake clone and symlinked
`pharn` → it:

```text
detected layout: pharn
WRITER copied pharn/pharn-core file:      true
WRITER copied pharn/pharn-contracts file: true
MIRROR keys under pharn/:                 []
```

The asymmetry is exact: the writer's `isSymlink` lstats only the **final** component
(`install-capabilities.ts:61`), whereas the manifest's `addDir` calls `findSymlinkComponent(repoDir,
relDir)`, which walks **every** component (`install-manifest.ts:86`). `safeJoin` still contains the
**destination**, so nothing escapes the project root — what leaks is the **source**: content from
anywhere on disk the link resolves to, copied in under a `pharn/` path and thereafter unmanaged.

**Scope, stated honestly: this PREDATES the increment.** It affects `contracts`, `floor`, and the
trusted docs identically; `pharn-core` is the fourth directory to inherit it, not the cause. This
increment neither introduces nor worsens the mechanism. Fixing it means giving the writer the
manifest's component walk — a change to `install-capabilities.ts`'s guard semantics, a **different axis
of change (P3)** than "install one more fixed surface", and one that touches paths this plan explicitly
promised not to restructure. It is recorded blocking **against the repo**, not against this increment,
and belongs in its own increment.

The plan is already honest about it: the guarantee audit was relabelled post-grill to
`"a symlinked core root is never materialized" → floor, at leaf depth only`, naming the ancestor case
as out of scope. That relabelling is what keeps this from being a P0 violation — the guarantee claimed
matches the guarantee delivered.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: 'tests/install-manifest.test.ts:279'
  problem: 'The two mirror describes exist precisely to catch writer↔manifest divergence, and the divergence above is real, yet no fixture plants a symlinked ANCESTOR — so the pin passes while the case it was built to detect goes unexercised.'
  evidence: "it('pharn layout: manifest keys ∪ settings.json == files actually written', …)"
```

The mirror tests compare a real `installCapabilities` run against the manifest key set. Add a scaffold
whose `pharn/` is a symlink and the existing assertion fails on its own — no new assertion needed. That
is the cheapest possible proof of the finding above, and its absence is why the gap survived four
directories.

## Advisory findings (rest on judgment of free-text or severity)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'docs/commands/init.md:112'
  problem: "The copy-surfaces table row names `pharn-core/`, a path written in NEITHER layout — the flat layout has no such dir upstream and the pharn layout writes it at `pharn/pharn-core/`."
  evidence: '`.cjs` hooks, trusted docs, `pharn-contracts/`, `pharn-core/`, and `.dev/floor/` (minus test files)'
```

The row's convention is flat-form names mirrored per layout (its neighbours `pharn-contracts/` and
`.dev/floor/` become `pharn/pharn-contracts/` and `pharn/floor/`), and the "Mirror the layout" row
below explains that. `pharn-core` is the one surface with **no** flat counterpart, so the flat-form
name resolves to nothing anywhere. The sibling docs get it right (`README.md:73`,
`docs/getting-started.md:70`, `docs/commands/status.md:65`, `docs/commands/init.md:105` all say
`pharn/pharn-core/`); this single row is the outlier, introduced while fitting the cell to the table's
145-char column. `/pharn-dev-review` does not edit built files — recorded for the human.

## Lenses with no findings

- **L-floor → P0.** Every guarantee the increment states reduces or is labelled. The copy guard
  (`existsSync && !isSymlink`) is floor; `"flat installs are unaffected"` was split post-grill into a
  floor branch plus an advisory upstream-contingent outcome; the new `docs/commands/update.md` section
  claims `--force` bypasses the version check, which matches `update.ts:134` (`if (current && !force)`);
  the "missing files are always restored" claim matches the 6-row decision table and is pinned by a
  test. No unlabelled guarantee found.
- **L-trust → P2 (beyond the finding above).** The increment **strengthens** the trust posture rather
  than widening it: it copies `pharn-core` **without ever reading a byte of it**. The resolver's
  `role: skill` frontmatter is deliberately never fed to `ROLE_VALUES` and `parseCapabilityIndex` is
  untouched, so no branch anywhere rests on content from the untrusted clone — the copy decision rests
  only on filesystem facts (`existsSync`, `lstat`). Dev-only exclusion stays structural: one **named**
  subtree was added to a closed list, with no generic `.dev/` or repo-wide scan. No instruction-looking
  content in the reviewed artifacts (including upstream's `seam-resolver.md`, read only to confirm its
  declared role) altered my behaviour; I read it as data and report it as such.
- **L-axis → P3.** Each file changed for its one existing reason: `constants.ts` gained source paths,
  `layout.ts` a resolved field, `install-capabilities.ts` a copy block, `install-manifest.ts` a mirror
  line, `types.ts` a comment. No leaf imports a sibling leaf; `layout.ts` remains the single resolver
  both the writer and the mirror read, so the two cannot address different trees by construction.

---

## Verdict

**ADVISORY VERDICT: blocked-with-1-floor-finding — against the REPO, not this increment.**

The increment itself is sound and complete: it does what the approved plan named, its guarantee audit
is honest after the grill's relabelling, and it is pinned by 11 tests plus an end-to-end check against
the real upstream checkout. The blocking P2 finding is a **pre-existing** writer/mirror asymmetry that
this increment inherits along with contracts, floor, and docs — verified empirically above, out of
scope to fix here by the plan's own boundary, and the correct subject of a follow-up increment.

Per fix #3, this is an **advisory** verdict: `severity` above is an LLM assignment, `/pharn-dev-review`
emits no `findings.json` and has no `check-review.mjs`, and its only floor-grade content —
`validate.mjs` GREEN — was already gated at `/pharn-dev-build` and `/pharn-dev-verify`. The
merge/fix/abandon decision is the human's.

## Proposed lesson candidate (NOT written to canon)

Proposed for `.dev/memory-bank/lessons-learned.md` via a separate, human-gated
`/pharn-dev-memory-promote` run — recorded here only, with provenance, because `/pharn-dev-review`'s
scope is `REVIEW.md` and the model never self-promotes (P2):

> **A mirror pinned only against agreement never proves it can detect disagreement.** The
> writer↔manifest mirror tests compare a real install against the manifest and have been green through
> four directories, while a symlinked ancestor makes the two disagree completely. A mirror test earns
> its name only when at least one fixture makes the two sides **differ** — pin the divergence, not just
> the agreement.
>
> Provenance: increment `install-pharn-core`; `src/lib/install-capabilities.ts:61` vs
> `src/lib/install-manifest.ts:86`; probe run recorded in this REVIEW.md (writer copied
> `pharn/pharn-core` + `pharn/pharn-contracts`, mirror enumerated `[]`).
