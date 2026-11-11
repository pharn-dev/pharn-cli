# PLAN — vendored-validator-refresh (re-vendor pharn-oss's validator and port its 7.3.0 frontmatter rules)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: refresh `tests/fixtures/pharn-oss/validate.mjs` to pharn-oss `main` @ `3afbb125`
  (vendoring the `capability-files-core.mjs` it now imports and reusing #354's `frontmatter-core.mjs`),
  make `tests/capability-index.test.ts` build `parseFrontmatter` through `frontmatter-core.mjs`, port the
  rule changes into `src/lib/capability-index.ts`, and release it as 0.18.2.
- layer(s): the CLI itself (`src/lib`), tests + vendored test fixtures, contributor docs, release metadata
- constitution_refs: [P0, P1, P2, P4, P5, P6, P7]

## Why (P7 — a real need, verified this run)

- pharn-oss `main` @ `3afbb125` (SKILLS_VERSION 7.7.1; fetched this run). `pharn/floor/validate.mjs`
  last changed in `73a2bfc7` (2026-11-03, "family-grammar-crlf", pharn-oss 7.3.0). The vendored copy is
  pharn-oss `44b12e8` (6.62.0), pinned `6049e18f…`.
- Upstream's `parseFrontmatter(rawText)` now delegates to `frontmatter-core.mjs`
  (`looseFrontmatter` / `looseValue` / `stripBom`). Three reading changes vs the vendored copy:
  1. **One leading U+FEFF is stripped** before the fence test. A BOM'd capability is now a capability
     upstream; the CLI still refuses it (reads no fence) and reports it as unknown, so a lens
     pharn-oss's CI passes would be skipped — the exact failure this port exists to prevent.
  2. **Lines split on `\r?\n`**, so a CRLF capability reads all its keys. The CLI already drops one
     trailing CR per `\n`-split line, which is the same reading; the CLI's documented "more lenient on
     CRLF" difference stops being a difference.
  3. **A displaced fence** (only whitespace / `\p{Cf}` characters before `---`: a blank line, a space,
     U+200B, a second BOM) is read and flagged `displaced`; validate REDs a role-bearing one
     (`P6/frontmatter-offset`, blocking). The CLI refuses these today ("missing a fence"), so the
     VERDICT already matches; only the reason differs.
- Upstream's other 7.3.0 changes (git-aware capability walk, symlinked-dir finding, zero-capabilities
  INCONCLUSIVE, `.run`/`.backup` excludes, flush-safe exits) concern how validate enumerates files and
  ends its process; the CLI enumerates `<subtree>/<name>/<name>.md` itself and already skips symlinked
  directories. No port needed.

## Discovery — verified this run (P6)

- Diff vendored vs `origin/main:pharn/floor/validate.mjs` read in full. `ROLE_ENUM`, `APPLIES_ENUM`
  and CHECK 4b's line (`  const applies = Array.isArray(fm.applies) ? …`) are unchanged in text and
  still match the test's extraction regexes. `parseFrontmatter`'s signature changed to `(rawText)`, so
  the extraction regex (`\(text\)`) no longer matches and must follow it.
- Imports: `validate.mjs` → `./frontmatter-core.mjs`, `./capability-files-core.mjs`;
  `capability-files-core.mjs` → node builtins only; `frontmatter-core.mjs` → none.
- `frontmatter-core.mjs` on PR #354's branch (sha256 `e883dbe7…`) is byte-identical to `origin/main`'s —
  reused, one copy. This branch is cut from #354 (`fix/models-triage-stage`, not merged).
- Probe: the three upstream files in one directory, `node validate.mjs <empty dir>` →
  `FLOOR: GREEN — 0 capabilities checked`, exit 0. New sha256s: `validate.mjs` `361eff5e…`,
  `capability-files-core.mjs` `bcfb4349…`.
- Equivalence check for change 2: splitting on `\n` and dropping one trailing CR per piece equals
  `split(/\r?\n/)` on a trimmed block (a piece ending in CR can only come from `\r\n`; the block's own
  trailing CR is trimmed). Switching to the literal split changes no verdict.
- `release-consistency`: compare links may name only `KNOWN_TAGS` + the version being released.
  `v0.18.1` (#354) is not tagged yet, so a `[0.18.2]` link `v0.18.1...v0.18.2` needs it listed.
- No user doc describes the BOM / CRLF / fence details; `CLAUDE.md` (the "only deliberate difference …
  more lenient on CRLF" sentence) and `docs/contributing.md` (refresh procedure) do.

## Files

- `tests/fixtures/pharn-oss/validate.mjs` — replaced byte-for-byte from pharn-oss `origin/main` @
  `3afbb125` — layer: vendored test fixture
- `tests/fixtures/pharn-oss/capability-files-core.mjs` — NEW, byte-for-byte from the same commit (the
  validator's second sibling import) — layer: vendored test fixture
- `tests/capability-index.test.ts` — re-pin `UPSTREAM_VALIDATOR_SHA256` + commit / SKILLS_VERSION
  comment; sha256 pins for both siblings; build `parseFrontmatter` with `looseFrontmatter` /
  `looseValue` / `stripBom` injected from the vendored `frontmatter-core.mjs`; upstream's verdict also
  refuses a `displaced` role-bearing block (that rule pinned by a source assertion on the
  `P6/frontmatter-offset` finding); the CRLF case becomes "agrees with upstream"; new fence shapes
  (CRLF, BOM + CRLF, a double BOM, a U+200B lead, a tab lead); a displaced fence is reported with the
  offset reason; a load test runs the vendored validator on an empty dir (exit 0, GREEN) so a missing
  sibling fails — layer: tests
- `src/lib/capability-index.ts` — strip exactly one leading U+FEFF; detect upstream's displaced lead
  (`/^[\s\p{Cf}]+(?=---)/u`) and refuse it with upstream's reason; split the block on `/\r?\n/`; update
  the header comments that describe upstream's rule — layer: CLI lib
- `CLAUDE.md` — the capability-index sentence: BOM strip + CRLF split are upstream's now (no
  difference left), a displaced fence is refused as upstream REDs it — layer: docs
- `docs/contributing.md` — validator refresh steps name the sibling imports and their pins, and that
  the extraction follows `parseFrontmatter` into `frontmatter-core.mjs` — layer: docs
- `CHANGELOG.md` — `## [0.18.2] — 2026-11-11` / `### Fixed` + compare links — layer: release
- `tests/release-consistency.test.ts` — add `v0.18.1` to `KNOWN_TAGS` (see open question 2) — layer: tests
- `package.json`, `package-lock.json` — `npm version --no-git-tag-version 0.18.2` — layer: release

## Contracts satisfied

- `pharn-contracts` — none touched. This is the refresh procedure in `docs/contributing.md`
  ("pharn-oss's capability frontmatter rules — a pinned copy"), steps 1–3.

## Evals to write (P1)

- pin: vendored `validate.mjs`, `frontmatter-core.mjs`, `capability-files-core.mjs` match their sha256s.
- load: `node tests/fixtures/pharn-oss/validate.mjs <empty tmp dir>` → exit 0, stdout `FLOOR: GREEN`.
- fence differential (existing `SHAPES`, run against the NEW upstream parser): `a byte-order mark before
  the fence` → both accept (fails today: CLI refuses); blank-line / space leads → both refuse.
- new shapes: CRLF, BOM + CRLF → both accept; double BOM, U+200B lead, tab lead → both refuse.
- CRLF: upstream accepts and the CLI accepts (replaces "more lenient than upstream").
- displaced reason: a blank-line-led capability is `unknown` with a reason naming the fence offset;
  a frontmatter-less file keeps the "missing a fence" reason.
- value corpus (existing `ROWS`): unchanged verdicts through the new parser (`a CR inside a line`
  stays refused on both sides).

## Guarantee audit (P0)

- "a capability pharn-oss's CI passes is not skipped for its fence or values" → floor: the
  differential test against the sha256-pinned vendored validator, for the pinned commit only. The copy
  can lag live upstream until the next refresh — the existing named residual, unchanged.
- "a displaced role-bearing capability is refused" → floor: regex membership (`DISPLACED` lead) +
  the per-capability skip path; held to upstream by the source assertion and the shape rows.
- "the vendored set loads" → floor: the load test (exit code), for the pinned files.

## Trust audit (P2)

- Capability markdown stays untrusted. Accepting a BOM'd file widens what is READ, never what is
  trusted: the two fields still go through `assertRole` / `assertAppliesToken`, and the directory name
  through `CAPABILITY_NAME_RE` before any join. The displaced reason is a fixed string; no upstream
  text is added to the `unknown` reason.
- The vendored `.mjs` files are test fixtures, executed only by the test suite (as the models checker
  already is); never shipped, never run by the CLI. Byte pins catch an edit.

## Determinism audit (P5)

- BOM strip: an anchored single-character test. Displaced: an anchored regex membership test. Line
  split: a fixed regex. No classification.

## Out of scope (named, not done)

- validate's other 7.3.0 rules (file enumeration, symlinked dirs, zero-capabilities INCONCLUSIVE) — the
  CLI does not enumerate the way validate does; nothing to port (see Why).
- A shared constant for `frontmatter-core.mjs`'s sha256 across the two parity tests: each test pins
  the files it runs, as today.

## Open questions (HALT)

- None open. Resolved by the maintainer at GATE 1, 2026-11-11: (1) port upstream's displaced-fence
  detection with its reason; (2) open the PR stacked on `fix/models-triage-stage`, with `v0.18.1` in
  `KNOWN_TAGS`, and rebase onto `main` after #354 lands.

## Approval

- Approved as written by the maintainer at GATE 1, 2026-11-11.
