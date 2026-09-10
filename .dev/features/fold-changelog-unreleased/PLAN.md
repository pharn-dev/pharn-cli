# PLAN — fold `[Unreleased]` into `[0.4.0]` and put `CHANGELOG.md` under `lint:md`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Fold `CHANGELOG.md`'s 1060-line `[Unreleased]` section into the already-present
  `## [0.4.0]` section (redated `2026-09-10`), consolidate the 17 duplicate subsections into
  Keep a Changelog order, add the missing `[0.4.0]:` link definition, repoint `[Unreleased]` at
  `compare/v0.4.0...HEAD` as an empty scaffold, and drop `CHANGELOG.md` from
  `.markdownlint-cli2.jsonc`'s `ignores` so `npm run lint:md` actually covers it.
- layer(s): repo-meta — release documentation + a lint config. This increment touches **no** layer of
  the `ARCHITECTURE.md §4` capability tree, no `src/**`, no `tests/**`, and no `pharn-contracts`
  schema. Stated so the layer field is honest rather than forced (P7).
- constitution_refs: [P4, P5, P7]

## The finding (P-6, last of the adversarial audit)

`## [0.4.0] — 2026-08-07` exists in `CHANGELOG.md`; `git tag` has **no** `v0.4.0`; and there is **no
`[0.4.0]:` link definition** at the foot of the file — so the heading renders as a **dangling
reference link**. Meanwhile `.markdownlint-cli2.jsonc` lists `CHANGELOG.md` in `ignores`, so
`npm run lint:md` lints **0 files** for it and the defect was invisible to every gate.

Verified live this run (P6 — not asserted from memory), at `origin/main` `5fd0714`:

- `CHANGELOG.md` is **1312** lines. `[Unreleased]` spans **L8–L1067**; `## [0.4.0] — 2026-08-07` is at
  **L1068**; link definitions occupy **L1307–L1312**.
- `git tag` → `0.3.1`, `v0.3.0`, `v0.3.2`. **No `v0.4.0`.**
- `grep -n '^\[' CHANGELOG.md` → link defs for `Unreleased`, `0.3.2`, `0.3.1`, `0.3.0`, `0.2.0`,
  `0.1.0`. **No `[0.4.0]:`** — the dangling reference is real.
- `package.json` `version` is **already `0.4.0`** → this increment must **not** bump it.
- With `CHANGELOG.md` removed from `ignores`, `markdownlint-cli2` reports **exactly 21 issues**:
  **11× MD024** (`no-duplicate-heading`, `siblings_only: true`) at L69/309/374/606/714/728/773/789/
  955/980/997, and **10× MD049** (`emphasis-style`, expected underscore) on **5 lines**:
  L86 (×2), L162 (×2), L195 (×2), L196 (×2), L301 (×2). Every one is **inside `[Unreleased]`** —
  everything at or below L1068 is already clean.

## Files

- `CHANGELOG.md` — fold `[Unreleased]` (L8–L1067) into the existing `## [0.4.0]` (L1068–L1117),
  redate it `2026-09-10`, consolidate to Keep a Changelog order, leave `[Unreleased]` an empty
  scaffold, fix the 10 MD049 characters, and add the `[0.4.0]:` link definition — layer repo-meta
- `.markdownlint-cli2.jsonc` — remove `"CHANGELOG.md"` from `ignores` so `lint:md` covers it — layer
  repo-meta

Nothing else is touched. In particular: **no `package.json` bump** (already `0.4.0`), no git tag, no
`docs/RELEASING.md` edit (its step 2 already prescribes exactly this fold — cite, don't restate, P4).

## The fold, stated as a mechanical rule (P5 — deterministic, not a judgment call)

The transform is a **pure block move plus a heading relabel**. It is executed by a one-shot script so
that no prose is retyped, and then proved lossless (below), rather than eyeballed.

1. Split the file at column-0 headings into: header (L1–L7), the `[Unreleased]` span, the `[0.4.0]`
   span, and the tail (`[0.3.2]` onward + the link definitions). **This parse is unambiguous**:
   `awk` over the file finds **zero** column-0 code fences (the only two fences, L1054/L1058, are
   indented two spaces and contain no column-0 line), so `^## ` / `^### ` can only be a real heading.
2. Within those two spans, cut each `### <Kind>` subsection into `(kind, body)`, where *body* is
   every line after the heading up to the next column-0 `###`/`##`.
3. Map `Docs → Changed` (see "Decisions" below). Every other kind maps to itself.
4. Emit one `### <Kind>` per kind under a single `## [0.4.0] — 2026-09-10`, in Keep a Changelog order
   — **Added / Changed / Deprecated / Removed / Fixed / Security** — omitting any kind that ends up
   empty (`Deprecated` will be empty and is omitted).
5. **Within** a merged kind, bodies are concatenated in **original file order**. That is a
   deterministic rule, not a preference: it preserves the file's existing newest-first convention,
   because `[Unreleased]` sits above `[0.4.0]`. No entry is reordered relative to any other entry of
   the same kind.
6. Only inter-subsection blank runs are normalized (to exactly one blank line before a heading).
   No non-blank line is touched by the move.

**Subsection census to be folded** (17 from `[Unreleased]` + 3 from `[0.4.0]`), in file order:
`Changed`(L10) `Added`(L40) `Changed`(L69) `Fixed`(L96) `Changed`(L309) `Removed`(L364) `Fixed`(L374)
`Security`(L492) `Added`(L606) `Security`(L714) `Changed`(L728) `Docs`(L741) `Removed`(L773)
`Fixed`(L789) `Added`(L955) `Changed`(L980) `Fixed`(L997) — then `[0.4.0]`'s `Changed`(L1070)
`Added`(L1093) `Fixed`(L1102).

## Link definitions (the actual P-6 fix)

`[Unreleased]` is repointed and the missing `[0.4.0]` definition is added; every other line is left
byte-identical:

```text
[Unreleased]: https://github.com/pharn-dev/pharn-cli/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.2...v0.4.0
[0.3.2]: …unchanged…
```

`v0.4.0` does not exist as a tag **yet** — the release that creates it is a separate, human-driven
step (`docs/RELEASING.md` step 4), and this PR deliberately does not cut it. That is the same
forward-reference every `[Unreleased]: …compare/vX...HEAD` line already carries, and it resolves when
the Release is published.

## The 10 MD049 characters (the only prose bytes that change)

Five lines carry `*emphasis*` where `MD049` wants `_emphasis_`. They are rewritten
`*` → `_`, two spans per line, ten characters total — **no word changes**:

- L86 `*between*` · L162 `*correct about the old parser*` · L195 `*break*` · L196 `*holds*` ·
  L301 `*same words*`

## Decisions taken (recorded so a reader knows they were decided, not overlooked)

- **`### Docs` folds into `### Changed`, heading dropped.** The file's own header declares it follows
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), whose section vocabulary is
  Added/Changed/Deprecated/Removed/Fixed/Security — `Docs` is not one of them, and P-6 exists to make
  the file conform. Human call; noted in the PR body.
- **`[Unreleased]` stays as an empty scaffold** (heading + link def), so the next PR has somewhere to
  append.
- **Never run `prettier --write` on `CHANGELOG.md`.** Verified live: `format:check` globs only
  `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts` — **no** style gate governs `CHANGELOG.md`, and
  `npx prettier --check CHANGELOG.md` reports the file as unformatted, i.e. prettier would rewrap
  ~1000 lines of release notes wholesale and destroy the no-loss proof. Out of scope, deliberately.

## Evals to write (P1)

This increment adds **no behavior** — no `src/**` change, no capability, no `rule_id` — so P1's
"every behavior gets a vitest test" has nothing to attach to, and inventing a test that asserts the
byte-content of a changelog would be a speculative addition (P7). What replaces it is a
**verification obligation discharged in this PR's report**, which is stronger than an assertion
because it is a whole-file conservation proof:

- **Phase A — MD049 in isolation.** `git diff -U0 CHANGELOG.md` must show **exactly 5** changed
  lines, and `git diff --word-diff=porcelain` must show **only** `*`↔`_`. Staged separately from the
  move so the witness is clean.
- **Phase B — the fold as a pure block move.** Extract every **non-heading, non-blank** line from the
  old `[Unreleased]` + old `[0.4.0]` spans, and from the new `[0.4.0]` span; `sort | shasum -a 256`
  both. **The two hashes must be identical.** Per-kind `^- ` bullet counts pre/post must also
  balance.
- **Gate.** `npm run lint:md` must end **GREEN with `CHANGELOG.md` in scope** — 21 → 0.
- **Regression.** `npm run check` (format:check, lint, lint:md, typecheck, test) stays green.

**If Phase B's hashes differ by even one line, the build STOPS and is handed to the human** — it is
not reconciled by the agent (P6: halt on ambiguity, never proceed on assumption).

## Guarantee audit (P0)

- **"no changelog prose was lost or altered by the fold"** → **floor: content-hash.** Reduces to a
  `sha256` equality over the sorted multiset of non-heading, non-blank lines before and after
  (Phase B). This is a real deterministic check, not an eyeball of the diff.
- **"only 10 characters of prose changed, and only `*`→`_`"** → **floor: content-hash / diff.**
  `git diff -U0` line count + `--word-diff=porcelain` over an isolated commit.
- **"`CHANGELOG.md` is actually linted from now on"** → **floor: enum/exit-code.** `lint:md` exits 0
  **and** its `Linting: N files` line includes the file; the `ignores` array no longer contains it.
  Both are observable, not asserted.
- **"the `[0.4.0]` reference link is no longer dangling"** → **floor: enum-regex.** `grep '^\[0\.4\.0\]:'`
  matches, and every `## [X]` heading has a corresponding `[X]:` definition.
- **"the folded section is the *right* set of release notes for 0.4.0"** → **advisory.** Whether
  these ~72 entries belong under `0.4.0` rather than split across two versions is an editorial
  judgment no floor operation can settle. It is the human's call at GATE 2. Labeled, not sold.
- **"`v0.4.0` will exist"** → **advisory / out of scope.** Cutting the tag is a human release step;
  this PR does not do it and does not claim it.

## Trust audit (P2)

Not applicable — this increment ingests **no** untrusted artifact. It reads and rewrites two files
already in the repo; there is no fetch, no clone, no network call, and no new taint edge.

## Determinism audit (P5)

- Section splitting is a **membership test** on column-0 `^## ` / `^### ` (proved unambiguous: zero
  column-0 fences).
- `Docs → Changed` is a **fixed map**, not a classification.
- Output ordering is the **fixed Keep a Changelog enum**, with within-kind order pinned to original
  file order — no heuristic, no re-ranking.
- The no-loss check is a **hash equality**, and its fallback is **STOP and hand to the human**, never
  an agent reconciliation.

## Open questions (HALT)

- None. The two judgment calls this increment could have raised — where `### Docs` goes, and whether
  `[Unreleased]` survives as a scaffold — were **already decided by the human** before this plan was
  written (see "Decisions taken"), and GATE 1 for this increment was approved as "go ahead with P-6".
