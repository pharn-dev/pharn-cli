# PLAN — features/README.md → pharn/features/README.md (layout-dependent resolution)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Make the product-loop boundary contract (`features/README.md`) LAYOUT-DEPENDENT so a `pharn`-layout install writes it to `pharn/features/README.md`, with an ordered clone probe that keeps a pre-relocation clone working; ship as 0.5.0.
- layer(s): `lib/` (constants, layout, install-capabilities, install-manifest) + `commands/` (update advisory) + `docs/` — ARCHITECTURE.md §4
- constitution_refs: [P0, P1, P2, P4, P5, P6, P7]

## Discovery (P6 — read live, this run)

> **⚠ THE TREE MOVED DURING THIS PLAN, AND IS NOW RED.** Between the first read and this line, a
> writer outside this session applied a **partial, non-conformant** version of C1–C4 to four files.
> Re-verified live (P6), `git status`: `src/lib/constants.ts`, `src/lib/layout.ts`,
> `src/lib/install-capabilities.ts`, `src/lib/install-manifest.ts` modified; `main` still at `9008669`.
>
> What that writer left:
>
> - **C1 applied, over-trimmed.** The 15-line comment block became 4 lines. The "cited by name from 7
>   of 10 commands" list, the `DEFAULT_PROTECTED` rationale, and any pointer to a resolver are gone.
>   `PHARN_FEATURES_README` was added correctly.
> - **C2a applied, undocumented.** `LayoutPaths.featuresReadme` exists in both branches with **no doc
>   comment** — so the one field whose whole purpose is to make a relocation visible carries no
>   explanation of why it is layout-dependent or which consumers must not read it directly.
> - **C2b NOT applied.** `resolveFeaturesReadme` exists nowhere in `src/` or `tests/`. Both readers use
>   `paths.featuresReadme` **directly** — the "if you skip C2b" branch, which makes the pharn-oss merge
>   a hard prerequisite of publishing the CLI.
> - **C3/C4 applied at the call sites only.** The now-false comments were left verbatim:
>   `install-capabilities.ts:222` still reads "root in BOTH layouts, like .claude/*", and
>   `install-manifest.ts:182` still reads "Root in BOTH layouts, like .claude/*". The file-header
>   summary (39), the `destAcceptsWrite` JSDoc (318) and the `collectExpectedInstallPaths` JSDoc (77)
>   are untouched. **The code and its comments now contradict each other (P4).**
> - **`src/lib/install-capabilities.ts` lost its trailing newline.**
> - **Nothing else.** Tests, docs, `package.json`, `CHANGELOG.md` untouched.
>
> **Measured verdicts on that tree, this run:**
>
> - `npm run check` → **EXIT 1**, RED at `format:check`: `[warn] src/lib/install-capabilities.ts`
>   (the missing final newline). `&&`-chained, so lint / lint:md / typecheck / test never ran.
> - `npx vitest run` over the three affected files → **2 failed | 84 passed**:
>   - `install-capabilities.test.ts:809` — `ENOENT … /proj/features/README.md` (the pharn-layout ROOT pin)
>   - `install-manifest.test.ts:250` — `expected [ …(16) ] to include 'features/README.md'`
>
>   Both are the *old* assertions correctly reporting the *new* behaviour — the tests doing their job.
> - Regress baseline, captured **before** the tree moved: `npm run check` at `9008669` clean → **EXIT 0**.
>
> This plan is therefore written against the corrected premise: **this increment finishes and corrects a
> partial change already in the working tree**; it does not start from clean. Open question 6 asks how
> to treat what that writer left.

Verified in **pharn-cli** (`/Users/pgalarowicz/Projects/pharn-cli`, `main` @ `9008669`, tree clean, `npm run check` **exit 0** baseline):

- `src/lib/constants.ts:132` — `FEATURES_README = 'features/README.md'`, with a comment block (117–131) asserting layout-invariance and naming the silent-skip failure mode.
- `src/lib/layout.ts` — `LayoutPaths` has NO features field; `detectLayout` (77–79) keys on `pharn/pharn-contracts`; `layoutPaths` (84–107) is pure.
- `src/lib/install-capabilities.ts:222–260` — the writer, guarded by `findSymlinkComponent` (source) + `isSymlink` (leaf) + `destAcceptsWrite` (dest walk), in that short-circuit order.
- `src/lib/install-manifest.ts:182–191` — the manifest entry (lstat + component walk), inside `collectExpectedInstallPaths(repoDir, capabilities, layout)`.
- Manifest consumers, all passing a **clone** `repoDir`: `lib/diff.ts:53` (status), `commands/update.ts` (writes), `steps/install-archetype.ts:117` + `steps/overwrite-check.ts` (init prompt).
- `src/commands/update.ts:567–568` computes `abandonedLayout`; `640–656` renders the two migration advisories; `applyUpdate` holds the pre-update `records` baseline at `457`.
- `src/lib/update-decision.ts:182–185` — `nextRecords` is keyed **by the manifest**, so the old `features/README.md` record is pruned on ANY post-relocation run, written or skipped.
- `src/lib/min-cli-gate.ts` + `MIN_CLI_FILE` — the MIN_CLI handshake ALREADY EXISTS in this CLI at 0.4.0.
- `src/lib/repo.ts:140–148` — every run resolves `refs/heads/<REPO_BRANCH>` and fetches that SHA. **A released CLI cannot be pointed at an older SHA.**

Settled by the human at GATE 1: **treat pharn-oss as fully done and merged.** Consistent with what was read live in **pharn-oss** (`/Users/pgalarowicz/Projects/pharn-oss`, `main`, 89 staged/uncommitted changes):

- `SKILLS_VERSION` = **5.0.0**; `MIN_CLI` = **0.5.0** (present, one line).
- `features/README.md` → `pharn/features/README.md` (staged rename); no root `features/` remains.
- `.claude/hooks/enforce-writes-scope.cjs:123` — `INSTALL_SAFE_SET = ["pharn/features/**"]`.

**Two brief premises are corrected by that discovery, and the plan is built on the corrected ones:**

1. The brief says A1–A4 "are the ones to check first — `enforce-writes-scope.cjs:118` still reads `["features/**"]`". **It does not.** The whole pharn-oss counterpart (relocation + `SKILLS_VERSION` 5.0.0 + `MIN_CLI` 0.5.0 + `INSTALL_SAFE_SET`) is already applied there, uncommitted. Nothing in group A is in this increment's scope (different repo).
2. The brief justifies C2b partly with "any user who pins an older pharn-oss SHA". **That user does not exist** — `repo.ts` always resolves `main` HEAD. C2b's real and only value is the **release-ordering window** (CLI 0.5.0 published before pharn-oss merges). It is still worth taking: ~6 lines, removes an ordering constraint between two repos, and mirrors `detectLayout`'s shape exactly.

## Files

- `src/lib/constants.ts` — add `PHARN_FEATURES_README`; replace the two now-false comment paragraphs (layout-invariance claim + silent-skip failure mode) — layer `lib/`
- `src/lib/layout.ts` — add `LayoutPaths.featuresReadme` (both branches) + `resolveFeaturesReadme(repoDir, layout)`, the ordered clone probe — layer `lib/`
- `src/lib/install-capabilities.ts` — resolve once via `resolveFeaturesReadme(repoDir, paths.layout)`; use it in all four guard positions + both `safeJoin`s; fix the section header (222), the file-header summary (39) and the `destAcceptsWrite` JSDoc (318) — layer `lib/`
- `src/lib/install-manifest.ts` — same resolution against the same `repoDir`; fix the block comment (182) and the `collectExpectedInstallPaths` JSDoc (77) — layer `lib/`
- `src/commands/update.ts` — third migration advisory, fired off a records-store membership test — layer `commands/`
- `tests/install-capabilities.test.ts` — invert the ROOT pin to a `pharn/` pin; re-path the pharn scaffold; add the C2b window regression — layer `tests/`
- `tests/install-manifest.test.ts` — re-path the pharn scaffold + swap the two key assertions — layer `tests/`
- `tests/docs-install-tables.test.ts` — `REQUIRED` takes `pharn.featuresReadme`; drop the unused `FEATURES_README` import; add `flat.featuresReadme` to `FORBIDDEN_LEADS` — layer `tests/`
- `tests/install-records.test.ts` — cosmetic path update in the ENOTDIR test (optional; not bound to the constant) — layer `tests/`
- `README.md` — install-table row → `pharn/features/README.md`; artifact-dir prose (154); **write-guard default (176) → `pharn/features/**` and `.pharn/**`** — layer `docs/`
- `docs/getting-started.md` — lines 22, 65, 85 (gated by `docs-install-tables.test.ts`) — layer `docs/`
- `docs/README.md` — lines 3, 5 (drop from the "stays at the project root" list) **and line 7 (`0.4.0` → `0.5.0`)** — layer `docs/`
- `docs/commands/init.md` — 131 (write-target list) + 138 (copy-surfaces table) — layer `docs/`
- `docs/commands/status.md` — 78 (copied-verbatim list) — layer `docs/`
- `docs/troubleshooting.md` — 142 (install-surface list) — layer `docs/`
- `docs/roadmap.md` — 12 (shipped-scope row) — layer `docs/`
- `CLAUDE.md` — 54, 56 (drop "root", name the resolver) — layer `docs/`
- `package.json` + `package-lock.json` — `0.4.0` → `0.5.0` — layer `meta`
- `CHANGELOG.md` — the 0.5.0/[Unreleased] entry — layer `docs/`

## Contracts satisfied

- None in `pharn-contracts` — this increment adds no finding shape and no inter-stage artifact. It changes an install-surface path resolution only. (P4: cited, not restated.)

## Evals to write (P1)

This repo's spec is `tests/*.test.ts`, not capability evals. Every behaviour below gets a demonstrating test:

- pharn layout, post-relocation clone → installs `pharn/features/README.md`; root `features/README.md` absent (inverted from the current ROOT pin at `tests/install-capabilities.test.ts:807`)
- **pharn layout, PRE-relocation clone (root file only, no `pharn/features/`) → still installs at the ROOT** ← this is C2b's window; the test IS the guarantee
- flat layout → unchanged, root path (existing test at 298 stays)
- manifest key follows the same resolution in both layouts, and the writer and the manifest agree on one clone (`install-manifest.test.ts:250–251` swapped)
- the existing P7-absent / symlinked-leaf / symlinked-PARENT / symlinked-DEST / ENOTDIR cases keep their guards at whichever path their fixture builds
- `docs-install-tables.test.ts` requires `pharn/features/README.md` in both install tables and now REFUSES a row leading with the flat `features/README.md`
- `update`'s third advisory fires when the pre-update records store holds the old key and the resolved path differs; does not fire otherwise

## Guarantee audit (P0)

- "a `pharn`-layout install writes the boundary contract under `pharn/`" → **floor**: `layoutPaths` enum branch (`layout === 'pharn'`), pinned by a vitest assertion (P1)
- "the writer and the manifest never disagree about where the file is" → **floor**: both call `resolveFeaturesReadme` with the SAME `repoDir`, pinned by a test asserting the manifest key equals the installed path over one clone. *Honest limit:* the shared call is a convention the test pins, not a type-level impossibility — a future third reader could still bypass it. Labeled here rather than sold as structural.
- "a pre-relocation clone still gets the file" → **floor**: `existsSync` membership + a safe legacy `else` (P5), pinned by the window test
- "nothing escapes the project root / the clone" → **floor, UNCHANGED**: `safeJoin` (lexical) + `findSymlinkComponent` (physical) + `destAcceptsWrite`. This increment moves the *string* those guards are applied to and moves NONE of the guards. The two measured-escape rationale paragraphs (`install-capabilities.ts:230–239`) are preserved verbatim.
- "a user updating across the relocation is told their old artifacts are unmanaged" → **advisory** (a `log.warn`; the floor does nothing about it). The *firing condition* is floor (a records-key membership test), the *message* is advice.
- "MIN_CLI refuses a ≤0.4.0 CLI against the post-relocation clone" → **floor**, and it is `min-cli-gate.ts`'s, already shipped in 0.4.0. This increment adds nothing to it and must not claim credit for it.
- "the docs name the right paths" → **floor for the PATH SET only** (`docs-install-tables.test.ts` over README.md + getting-started.md). The other six doc files are **advisory** — ungated prose, corrected by hand.
- **NOT guaranteed, stated plainly (P7):** the file stays OPTIONAL. A clone carrying neither path is still a silent no-op in both readers. C2b narrows the silent-skip window to "upstream ships it at neither path"; it does not close it. Claiming otherwise would be the P0 disease.

## Trust audit (P2)

- **Input:** the fetched pharn-oss tarball (untrusted). **What changes:** the relative path string the copy is built from is now chosen by `resolveFeaturesReadme` — a two-way branch over a constant and one `existsSync`, with **no value read from the clone's contents**. Taint does not enter the branch: the clone can only make `existsSync` true or false, and both outcomes yield one of two **hard-coded** constants.
- **Propagation, unchanged:** the chosen constant reaches `safeJoin` (lexical containment), `findSymlinkComponent` on both the clone and the project (physical containment), and `isSymlink` on the leaf, before any `cpSync`. Contents are copied verbatim, never parsed or executed.
- **New exposure:** the probe adds one `existsSync` against `safeJoin(repoDir, 'pharn/features/README.md')` — a contained, non-following existence test on a path the installer already reads. No new fetch, no new parse, no new write.

## Determinism audit (P5)

- `layoutPaths` — existing enum branch, no new fallback.
- `resolveFeaturesReadme` — ordered membership test (`layout === 'pharn'` ∧ `!existsSync(preferred)`), `else` = the safe legacy constant. Mirrors `detectLayout`. Never a guess, never an LLM.
- The `update` advisory — `records !== null && FEATURES_README in records && featuresRel !== FEATURES_README`. A membership test over the pre-update store, not a heuristic about "did the layout move". Deliberately **not** guarded on `written.length > 0` (unlike `abandonedLayout`): `nextRecords` is keyed by the manifest (`update-decision.ts:182–185`), so the old key is dropped even on a fully-skipped run — the "no longer managed" statement is true either way. No baseline → no advisory (honest silence, not a guess).

## Decisions (resolved at GATE 1)

1. **Partial change already in the tree → KEEP AND FINISH.** Preserve the four applied call-site edits; restore the rationale C1/C2a deleted; correct the three comments that now contradict the code (`install-capabilities.ts:222`, `install-manifest.ts:182`, plus the `:39` header, the `destAcceptsWrite` JSDoc at `:318` and the `collectExpectedInstallPaths` JSDoc at `:77`); restore the trailing newline on `install-capabilities.ts`.
2. **C2b → IN.** `resolveFeaturesReadme(repoDir, layout)` is added and both readers call it with the same `repoDir`.
3. **Delivery → leave applied, run the full chain.** No hand-over copies for this increment. Build writes the files; regress / verify / review gate on the tree; the run stops at GATE 2. Nothing is pushed, merged, or sealed.
4. **C5 → the records-membership form.** Fire on `records !== null && FEATURES_README in records && featuresRel !== FEATURES_README`.
5. **`FORBIDDEN_LEADS` → gains `flat.featuresReadme`.**
6. **`docs/README.md:7` → `0.4.0` becomes `0.5.0`** (added to C7; it is ungated prose the brief's table missed).
7. **Publish/merge ordering → moot.** pharn-oss is done, so there is no window to sequence around.

## Honest scope of C2b, restated (P0/P7)

Because pharn-oss is already merged, the release-ordering window C2b was proposed to close **is not
reachable today**. C2b is kept as a deliberate, human-chosen defensive branch, and this plan does
**not** claim it closes a live gap. What it does buy, stated plainly:

- a CLI 0.5.0 run against any upstream tree that still carries the root path (a fork, a revert, a
  local checkout used for `build:install-local`) installs the boundary contract instead of skipping it;
- it removes the coupling between this repo's release and upstream's branch state permanently, rather
  than for one release.

It does **not** make the file non-optional: a clone carrying it at neither path is still a silent
no-op in both readers, exactly as before. Claiming otherwise would be the P0 disease.
