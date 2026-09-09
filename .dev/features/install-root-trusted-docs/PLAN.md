# PLAN — install the two trusted docs upstream keeps at the ROOT, and report what actually landed

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Correct `PHARN_TRUSTED_DOCS` so the pharn layout sources `THREAT-MODEL.md` and `LIMITS.md` from — and installs them to — the **project root**, where upstream keeps them and where every citation resolves; and make the install outro report the trusted docs it actually wrote instead of an unconditional `docs written` line.
- layer(s): `src/lib` (constants + writer + mirror), `src/steps` (apply/outro), `tests`, `docs`
- constitution_refs: [P1, P2, P4, P5, P7]

## Discovery (P6 — read live this run)

Live upstream `pharn-dev/pharn-oss@main` (codeload tarball fetched and extracted this run, `SKILLS_VERSION` 3.0.1, `detectLayout` → **pharn**):

- Repo **root** holds `THREAT-MODEL.md`, `LIMITS.md` (and `LICENSE`, `README.md`, `SECURITY.md`, `SKILLS_VERSION`). `pharn/` holds **only** `ARCHITECTURE.md`, `CONSTITUTION.md` + the five dirs.
- **`pharn/THREAT-MODEL.md` and `pharn/LIMITS.md` have never existed.** `GET /repos/pharn-dev/pharn-oss/commits?path=pharn/THREAT-MODEL.md` → `[]`; same for `pharn/LIMITS.md`. The two `PHARN_TRUSTED_DOCS` entries (`src/lib/constants.ts:92-97`) were dead on arrival.
- Ran the real `collectExpectedInstallPaths` against that clone (all four archetypes, 35 capabilities): **456 expected files**; the docs in the set are exactly `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`, `pharn/LICENSE`. Both audit-named docs **absent** — the lstat at `install-manifest.ts:162-165` and the `existsSync` at `install-capabilities.ts:182-187` both drop them silently.
- **108 of those 456 installed files cite the two docs** — the audit's number reproduces exactly.

### The destination evidence (this is what the human is approving)

Occurrence counts of every spelling, measured **inside the 456-file install set**:

| doc                | bare (root-relative) | `pharn/`-prefixed | other                    |
| ------------------ | -------------------- | ----------------- | ------------------------ |
| `THREAT-MODEL.md`  | **118**              | **0**             | 1 (`docs/THREAT-MODEL.md`) |
| `LIMITS.md`        | **68**               | **0**             | 0                        |
| `ARCHITECTURE.md`  | 6                    | **239**           | 1 (`docs/…`)             |
| `CONSTITUTION.md`  | 3                    | **54**            | 0                        |

Zero of the 186 citations are markdown links (`grep '](…)'` → no hits); all are backticked prose paths — the form an agent resolves against the **project root**. The contrast is the whole answer: upstream cites the two docs it **relocated** under `pharn/` **with the prefix** (97.5% / 94.7%), and the two it **kept at root** **bare** (100%). The citation spelling tracks the real location per doc, so the mirror ("a layout's source-relative-to-clone path IS its dest-relative-to-project path", `layout.ts:20-25`) already gives the answer: **root → root, identity-mapped.**

Second, independent confirmation — upstream's `.claude/hooks/protect-trusted-paths.cjs`, a file **this CLI installs**, declares `DEFAULT_PROTECTED = ["pharn/CONSTITUTION.md", "pharn/ARCHITECTURE.md", "THREAT-MODEL.md", "LIMITS.md"]` (`:144-150`) and its own comment at `:75` calls the last two "Root-level entries". Today `init` ships a floor hook guarding two paths the same `init` never writes.

Third: the **flat** layout (`TRUSTED_DOCS`) already installs all four at the root and already works. Making the pharn layout its equivalent means matching upstream **per doc**, not moving all four under one prefix.

**Therefore no source≠dest mapping is needed.** The audit's suggested fix ("copy from the clone root when absent under `pharn/`") would leave all 186 bare citations still unresolvable if the dest stayed `pharn/…`, and its "when absent" fallback would be a second candidate source for one dest — a guess where a membership test suffices (P5) and a speculative branch for a shape upstream has never shipped (P7).

### Why the existing tests did not catch it (P1, the real root cause)

`tests/install-manifest.test.ts:87-90` and `tests/install-capabilities.test.ts:647-648` scaffold a fake clone containing `pharn/THREAT-MODEL.md` / `pharn/LIMITS.md` — **a shape upstream has never shipped** — and then write the real root copies labelled `// dev-only, stay at root, must NOT be part of a pharn install` (`install-manifest.test.ts:103-105`), asserting `expect(k).not.toContain('THREAT-MODEL.md')` (`:240-241`). `install-capabilities.test.ts:748` goes further: _"A pharn install must take the pharn/ copies and leave these behind."_ The spec encodes the inverse of upstream. The `manifest ⟷ installCapabilities` mirror pin (`install-manifest.test.ts:455`) passes because **both sides drop the same two entries** — a mirror can only catch writer/mirror disagreement, never a wrong source path. Fixing the fixtures to mirror the measured upstream shape is the substance of this increment, not incidental churn.

## Files

- `src/lib/constants.ts` — `PHARN_TRUSTED_DOCS` last two entries become `'THREAT-MODEL.md'`, `'LIMITS.md'` (root, identity-mapped); the block comment above it, which currently asserts the pharn install "ships THREAT-MODEL.md and LIMITS.md too" under `pharn/`, is rewritten to state the measured per-doc placement. It is a comment **this change makes untrue**, so it is in scope; the P-11/P-12 comment findings are untouched — layer `lib`
- `src/lib/install-capabilities.ts` — the docs loop (`:180-187`) is unchanged in shape but now collects each copied dest into a `docs: string[]`, returned on `InstallCapabilitiesResult`; the "the SAME four in both layouts; only the prefix differs" comment is corrected to the mixed-prefix truth — layer `lib`
- `src/lib/install-manifest.ts` — **no logic change**; only the `// Trusted docs (flat: root files; pharn: CONSTITUTION + ARCHITECTURE under pharn/)` comment at `:161`, which my change makes untrue — layer `lib`
- `src/steps/install-archetype.ts` — split the unconditional line `:119` into `commands + hooks written → .claude/` plus a docs line derived from `result.docs`; `log.warn` naming any expected doc the clone did not ship — layer `steps`
- `tests/layout.test.ts` — `layoutPaths('pharn').docs` pinned to the mixed-prefix list, with the reason (citation spelling) in the comment; the flat expectation is unchanged (P7) — layer `tests`
- `tests/install-capabilities.test.ts` — the pharn scaffold mirrors **real** upstream (`pharn/CONSTITUTION.md` + `pharn/ARCHITECTURE.md`; `THREAT-MODEL.md` + `LIMITS.md` at root only, distinct bytes); the `leaves nothing flat at the project root` case is corrected to allow exactly those two; the P7 "clone predates the docs" case now removes the **root** copies; the symlink case now targets the root doc; new assertions that the docs list returned names what landed — layer `tests`
- `tests/install-manifest.test.ts` — same fixture correction; `expect(k).toContain('THREAT-MODEL.md')` / `'LIMITS.md'` and `not.toContain('pharn/THREAT-MODEL.md')`; the mirror pin re-run over the corrected scaffold — layer `tests`
- `tests/init-archetype.test.ts` — new outro pins via the existing `outroBody()` helper: the docs line names the docs written; a clone missing one warns and the outro does not claim it — layer `tests`
- `docs/getting-started.md` — the "What you get" table gains the two root docs; the paragraph at `:83-87` that today explains the drop as intended ("a `pharn` install lands the two in the table") becomes false and is rewritten (P4) — layer `docs`
- `README.md` — **amendment, added at build time (see below)**; the same table row + the same false paragraph, which `tests/docs-install-tables.test.ts` requires to stay byte-identical to `docs/getting-started.md`'s — layer `docs`
- `CHANGELOG.md` — `### Fixed`, user-visible: what was missing, that 108 installed files cited it, and that **existing installs do not self-heal** inside the same-`skillsVersion` window (`pharn update --force`, or `pharn init` again) — layer `docs`

### Build-time amendment — `README.md` (recorded, not silently taken)

The floor forced it, and the forcing is the good kind. `tests/docs-install-tables.test.ts` derives its
`REQUIRED` set from **`layoutPaths('pharn').docs`** — the very constant this increment corrects — and
asserts that both `README.md` and `docs/getting-started.md` name every path an install writes, with
**identical Artifact columns**. So the moment `THREAT-MODEL.md` / `LIMITS.md` entered the resolved doc
set, `npm run check` went red on `README.md never names \`THREAT-MODEL.md\``. There is no in-scope way
to make it green: the gate reads the constant, not the plan.

`README.md` also carries the same false sentence `docs/getting-started.md` does ("The trusted-doc set
also names `pharn/THREAT-MODEL.md` and `pharn/LIMITS.md`"), so this is one defect in two files, not
scope creep. It was originally excluded only because a sibling PR was editing it; that PR (#158) has
since merged and this branch is rebased onto it, so the conflict reason is gone. Recorded here and
re-scoped via `set-writes-scope.cjs --from-plan` rather than worked around — the hook is never bypassed.

## Evals to write (P1)

- `layoutPaths('pharn').docs` → `['pharn/CONSTITUTION.md','pharn/ARCHITECTURE.md','THREAT-MODEL.md','LIMITS.md']`; `layoutPaths('flat').docs` unchanged (P7).
- pharn install from an upstream-shaped clone → `THREAT-MODEL.md` and `LIMITS.md` exist at the **project root** with the **clone-root bytes** (distinct fixture bytes, so the pass cannot come from indistinguishable content).
- pharn install → no `pharn/THREAT-MODEL.md`, no `pharn/LIMITS.md` (the dead path is not resurrected).
- `collectExpectedInstallPaths` (pharn) contains `THREAT-MODEL.md` + `LIMITS.md`, not the `pharn/`-prefixed keys → `status` compares them and `update` restores them.
- the `manifest ⟷ installCapabilities` mirror still holds on the corrected scaffold (both layouts).
- a clone shipping **no** root `THREAT-MODEL.md` installs cleanly, expects nothing (P7), **and warns** — the silence is what the finding is about.
- a **symlinked** root `THREAT-MODEL.md` in the clone is neither copied nor expected (P2, unchanged posture).
- outro: names the 4 docs written; with one absent, names 3 and `log.warn`s the missing one; the string `docs written` never appears when zero landed.

## Guarantee audit (P0)

- "the 186 citations in installed files now resolve" → **advisory.** The floor is only "the files exist at the project root". Nothing parses the citing files or verifies a reference; the destination is justified by the measured spelling table above, which is evidence, not a check. Stated as advisory in the CHANGELOG.
- "the two docs are installed" → **floor: existence guard + the mirror pin.** Conditional on the clone shipping them at the root — a clone that does not gets no doc, no crash (P7).
- "writer and mirror agree on the doc set" → **floor: the existing `manifest ⟷ installCapabilities` mirror test**, which becomes meaningful only once the scaffold matches upstream.
- "the outro reports what was written" → **floor: derived from the writer's own return value**, not recomputed. A doc that failed its existence guard cannot appear in the list by construction.
- "the outro warns when a doc is missing" → **floor: set difference against `layoutPaths(layout).docs`** — an integer/membership comparison, not a judgment.
- "the user's own root files are not silently overwritten" → **floor: `conflictingWriteTargets`**, which now includes the two root docs, so `confirmWriteTargets` lists them and defaults to No. This is the same posture flat installs have always had for these names.
- "existing installs receive the docs" → **NOT CLAIMED.** `update` early-returns on an unchanged `skillsVersion`; the CHANGELOG names `--force` / re-`init` rather than working around it.

## Trust audit (P2)

- **Input:** the untrusted pharn-oss clone. The two new sources are clone-root files. Every read stays `safeJoin`-contained; contents are copied verbatim and never parsed or executed. Symlink posture is unchanged — the writer's leaf `isSymlink` and the manifest's `findSymlinkComponent` both still apply, and a root-level path has **no intermediate component**, so the leaf check is sufficient on the source side for exactly these two entries.
- **Destination:** measured on node v24.13.1 this run — `cpSync(src, dest, { force: true })` onto a **symlinked destination leaf** **replaces the link** (the outside target's bytes were unchanged; the link became a regular file). So the two new root writes cannot write through a link, and no `destAcceptsWrite` walk is warranted (the `features/README.md` case needed one only because of its intermediate directory). Additionally `existsSync` is true for a symlinked leaf, so such a dest is already listed by the pre-install overwrite prompt.
- **Taint:** the docs list returned to the outro contains only paths the CLI itself composed from `PHARN_TRUSTED_DOCS` — no clone-derived string reaches the rendered output.

## Determinism audit (P5)

- One membership test per doc (`lstat().isFile()`), no fallback probe, no second candidate source. The rejected "when absent under `pharn/`" alternative would have introduced exactly the guess this principle forbids.
- The outro's missing-docs set is a set difference over two CLI-owned string arrays.

## Explicitly OUT of scope (recorded, not fixed)

- **The writer/mirror symlink divergence on the `pharn/`-prefixed docs.** `install-capabilities.ts:184` checks only the **leaf** (`isSymlink`), while `install-manifest.ts:163` walks every component. For `pharn/CONSTITUTION.md` a symlinked `pharn/` component makes the writer copy bytes from outside the clone while the mirror omits the path — the identical class of hole the `features/README.md` comment documents at `:208-216`. **Pre-existing and untouched by this change** (root-level entries have no intermediate component), so it is reported here rather than folded in. Recommend a separate finding.
- The other silent upstream-path no-ops the audit counts (`MIN_CLI`, `pharn-core`, `features/README.md`, `LICENSE`, `settings.json`, …). Only the docs surface is reported by the outro in this increment.
- `SECURITY.md`, `README.md`, `.github/workflows/ci.yml` — sibling PRs. Stale-comment findings P-11 / P-12 — later PRs; only comments **this change falsifies** are edited.

## Open questions (HALT)

1. **Destination** — confirm root-relative `THREAT-MODEL.md` / `LIMITS.md` in the pharn layout (identity mirror), rather than a mapped `pharn/…` dest or a `PHARN-`-prefixed dest of the `PHARN-LICENSE` kind. The `LICENSE` precedent does **not** transfer: `LICENSE` is a root file the user owns that nothing cites by path, whereas these two are PHARN-specific names cited 186 times bare and protected bare by the hook this CLI installs. The residual cost is that a project with its own root `LIMITS.md` now sees it in the overwrite prompt (default No) — the posture flat installs already have.
2. **`docs/getting-started.md` scope addition** — not in the task's file list, but its `:83-87` paragraph documents the current drop as intentional and becomes false (P4). Include, or leave to a docs PR?
3. **Outro shape** — proposed: `✔ PHARN commands + hooks written → .claude/` then `✔ 4 trusted docs written → pharn/CONSTITUTION.md, pharn/ARCHITECTURE.md, THREAT-MODEL.md, LIMITS.md`, plus a `log.warn` naming any expected doc the clone did not ship. Accept, or prefer a bare count without the path list?
