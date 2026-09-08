# PLAN — install upstream's `features/README.md`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Add upstream's root `features/README.md` — the product-loop boundary contract that 7 of the 10 installed product commands cite by name — to the fixed set an archetype install copies, in the writer and its read-only mirror together.
- layer(s): `src/lib` (one constant + two lockstep call sites), `tests`, `docs`
- constitution_refs: [P1, P2, P3, P4, P7]

## Discovery (P6 — read live this run)

- `src/lib/install-capabilities.ts:156-164` — the trusted-docs loop (`existsSync && !isSymlink`, `safeJoin` both sides, `{ force: true }`); `:32-36` — the header enumerating the copy set.
- `src/lib/install-manifest.ts:114-121` — the mirror's stricter posture (`findSymlinkComponent` skip, then `lstatSync(...)?.isFile()`); `:59-64` — its own enumeration.
- Upstream a local `pharn-dev/pharn-oss` checkout at `2e183e6`: `features/README.md` EXISTS at the repo root of a `pharn`-layout tree — so the path is layout-invariant, like `.claude/*`.
- **A stale comment found live:** `src/lib/install-capabilities.ts:157-158` still says the pharn docs set drops THREAT-MODEL/LIMITS. That became false in the previous increment (`d7c8f52`), which missed this one comment. It is in this increment's `## Files`, so it is corrected here rather than left to rot (P4).

## Files

- `src/lib/constants.ts` — `FEATURES_README = 'features/README.md'`, layout-invariant, with its failure mode named — layer `lib`
- `src/lib/install-capabilities.ts` — copy it after the docs loop, same posture; correct the header enumeration AND the stale pharn-docs comment — layer `lib`
- `src/lib/install-manifest.ts` — mirror it after the docs loop, manifest posture; correct the header enumeration — layer `lib`
- `src/lib/install-records.ts` — `buildRecords` must treat an UNSTATABLE dest like an absent one (ENOTDIR from a component below a regular file), so a path the copy skipped is not recorded — layer `lib`
- `tests/install-records.test.ts` — that skip — layer `tests`
- `tests/install-capabilities.test.ts` — fixtures in both layouts; lands at the project root in both; symlinked copy refused — layer `tests`
- `tests/install-manifest.test.ts` — fixtures in both layouts; key present in both; the P7 omission — layer `tests`
- `docs/commands/init.md`, `docs/commands/status.md` — the copied-set enumerations — layer `docs`
- `CLAUDE.md` — the two fixed-product-surface enumerations — layer `docs`
- `CHANGELOG.md` — user-visible, including the existing-install window — layer `docs`

## Contracts satisfied

- The **mirror invariant** (`tests/install-manifest.test.ts` "manifest keys ∪ settings.json == files actually written"): the two call sites are added in lockstep, so the existing pin proves they agree rather than a new test asserting it.

## Evals to write (P1)

- flat install: `features/README.md` at the project root, with upstream's bytes.
- pharn install: the same path at the project root (layout-invariant — NOT under `pharn/`).
- symlinked `features/README.md` in the clone → not copied, not expected.
- clone WITHOUT the file → installs cleanly, manifest omits the key (P7).
- manifest keys contain it in both layouts; the existing mirror + update-writer pins pass unchanged.

## Guarantee audit (P0)

- "the cited boundary contract is installed" → **conditional on upstream shipping it**; floor is the existence guard on both sides, pinned by the P7 case.
- "the writer and the mirror cannot disagree" → **floor: the existing mirror pin**, which fails loudly if only one side is edited.
- "the file is symlink-refused and path-contained like every other copied surface" → **floor: `isSymlink` / `findSymlinkComponent` + `safeJoin`**, pinned by the new symlink case.
- "existing installs receive the file" → **NOT CLAIMED.** A CLI-side install-set change does not move upstream's `SKILLS_VERSION`, and `update` early-returns "Already up to date" at an equal version. `status` will report it `missing` (and `--strict` exits 1) until the next upstream version bump or a `pharn update --force`. Named in the CHANGELOG; NOT worked around by letting a restore-only plan through the version gate, which would be a change to `update`'s contract.

## Trust audit (P2)

The clone is untrusted. `FEATURES_README` is a CLI-owned constant, never a value read from the clone. Both reads are `safeJoin`-contained; the writer refuses a symlink at the path, the mirror refuses a symlinked component anywhere below the repo root. Contents are copied verbatim, never parsed or executed.

## Determinism audit (P5)

No new branch beyond the same existence/symlink membership tests the trusted docs already use.

## Out of scope (P7)

- Letting a restore-only plan through `update`'s same-version early-return.
- Adding `features/README.md` to `protect-trusted-paths.cjs`'s `DEFAULT_PROTECTED`, or calling it a "trusted doc" anywhere — it is not write-protected, and the directory it describes is one the user's own agent writes into.
- The upstream confirmation that `features/README.md` is intended as installed product surface (its own text is user-addressed; raising it, not negotiating it).

## Open questions (HALT)

- None. The upstream file was verified present this run.
