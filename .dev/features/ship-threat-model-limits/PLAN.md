# PLAN — ship THREAT-MODEL.md and LIMITS.md in the pharn layout

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Add `pharn/THREAT-MODEL.md` and `pharn/LIMITS.md` to `PHARN_TRUSTED_DOCS` so a `pharn`-layout install ships the two docs its own product commands, floor checkers and contracts already cite — and pin, by test, that a clone predating those files still installs cleanly.
- layer(s): `src/lib` (one constant + two comments), `tests`, `docs`
- constitution_refs: [P0, P1, P4, P7]

## Discovery (P6 — read live this run)

- `src/lib/constants.ts:33-40` — flat `TRUSTED_DOCS` is four entries; `:47-50` — a comment asserts the pharn set drops THREAT-MODEL/LIMITS "(they stay dev-only)"; `:56-59` — `PHARN_TRUSTED_DOCS` is two entries.
- `src/lib/layout.ts:48-49` — the `docs` field comment repeats the claim; `:65` — `layoutPaths('pharn')` returns the two-entry set.
- Consumers, verified not re-implemented: the installer iterates `paths.docs` with `existsSync(from) && !isSymlink(from)`; `collectExpectedInstallPaths` adds a doc only when `findSymlinkComponent(...) === null` and `lstatSync(...)?.isFile()`; `diff.ts` derives from that manifest. One constant reaches install, overwrite-check, `status` and `update`'s plan.
- **Upstream state, read live this run:** `/Users/pgalarowicz/Projects/pharn-oss` at `2e183e6` has `pharn/CONSTITUTION.md` and `pharn/ARCHITECTURE.md` but **NO** `pharn/THREAT-MODEL.md` / `pharn/LIMITS.md` (only root copies). So the two new entries name files that do not exist upstream **yet** — which is exactly why the existence-guard pin below is the load-bearing part of this increment, not an afterthought.

## Files

- `src/lib/constants.ts` — four-entry `PHARN_TRUSTED_DOCS`; the comment above it says what is true now — layer `lib`
- `src/lib/layout.ts` — the `docs` field comment no longer claims the pharn set drops the two — layer `lib`
- `tests/layout.test.ts` — the pharn `docs` case renamed and updated to the four-entry set; the flat case untouched — layer `tests`
- `tests/install-manifest.test.ts` — the pharn mirror fixture writes both docs and the manifest contains them; the `not.toContain` guards become **path-anchored** so a ROOT leak is still caught — layer `tests`
- `tests/install-capabilities.test.ts` — the two docs land under `pharn/` and are still absent at the project root; plus the P7 skip and the symlink guard — layer `tests`
- `docs/getting-started.md` — the "what init writes" table names the trusted-doc set at each layout — layer `docs`
- `CHANGELOG.md` — user-visible: a fresh `pharn init` writes two more files and `status` compares them — layer `docs`

## Contracts satisfied

- The **mirror** (`src/lib/layout.ts:17-29`): a clone-relative path IS its project-relative path, contents never rewritten. Listing `pharn/THREAT-MODEL.md` is therefore a statement about where upstream must place the file — cited, not restated.

## Evals to write (P1)

- `layoutPaths('pharn').docs` is the four-entry set; `layoutPaths('flat').docs` is unchanged.
- pharn-layout install: both docs land at `pharn/THREAT-MODEL.md` / `pharn/LIMITS.md` and NOT at the project root.
- pharn-layout manifest: both keys present; no root-anchored `THREAT-MODEL.md` / `LIMITS.md` key.
- **P7 skip (the load-bearing one):** a pharn clone LACKING both docs installs without throwing, and `collectExpectedInstallPaths` omits both — so `status` reports no `missing` and `update` restores nothing.
- Symlink guard: a symlinked `pharn/LIMITS.md` in the clone is neither copied nor expected.

## Guarantee audit (P0)

- "a pharn install ships the four trusted docs" → **conditional, and the condition is the floor**: the installer copies only `existsSync && !isSymlink`, the manifest adds only `lstat().isFile() && no symlinked component`. The honest claim is "ships them **when upstream provides them**" — pinned by the P7 skip test, which is what makes landing this before the upstream half a no-op rather than a break.
- "one docs list, four consumers, they cannot disagree" → **floor: the existing manifest⟷installer mirror tests**, which now cover the two added paths.
- "the added docs are contained + symlink-guarded like the others" → **floor: `safeJoin` + `isSymlink`/`findSymlinkComponent`**, unchanged; pinned by the new symlink case.
- "the dangling citations in the installed commands are fixed" → **NOT CLAIMED by this increment.** The citations and the doc CONTENT are upstream. This change makes the CLI able to ship them; it does not make them exist.

## Trust audit (P2)

The clone is untrusted; the two added paths are read exactly like the existing docs — `safeJoin`-contained, `lstat`-checked, symlink-refused, contents copied verbatim and never parsed. No new taint path: the doc names are CLI-owned constants, not values read from the clone.

## Determinism audit (P5)

No new branch. The added entries flow through the same `existsSync` / `lstat().isFile()` membership tests the existing docs use. `detectLayout` still keys on `pharn/pharn-contracts` and is untouched — a doc must never become the layout marker.

## Out of scope (P7)

- The upstream half entirely: authoring `pharn/THREAT-MODEL.md` / `pharn/LIMITS.md`, repointing the command/floor/contract citations, and the `protect-trusted-paths.cjs` `DEFAULT_PROTECTED` root-anchoring. Filed as an upstream task; the spec states the order is safe either way.
- The `flat`-layout hook hole (root `CONSTITUTION.md`/`ARCHITECTURE.md` unprotected) — an upstream decision, deliberately not smuggled in.
- The flat `TRUSTED_DOCS` set, the `detectLayout` marker, `.claude/settings.json` handling.
- Restructuring the `getting-started.md` / `README.md` "What you get" tables — only the trusted-doc row is corrected; the wholesale rewrite is a later increment that is told to preserve whatever row is left here.
- pharn-cli's OWN root `THREAT-MODEL.md` / `LIMITS.md` — this repo's dev docs, unrelated to what gets installed.

## Open questions (HALT)

- None blocking. One decision is recorded rather than asked: the constant is added **before** upstream ships the files, because the spec authorizes it and the existence guards make it inert until they exist. The consequence — the promise currently names files that do not exist — is stated in the changelog rather than hidden.
