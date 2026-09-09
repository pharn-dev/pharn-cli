# PLAN — retire the present-tense `degit` claims

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Reword the six remaining sites that describe pharn's fetch as a live `degit` clone so
  each states what the code actually does now — one GitHub REST commit resolve, then a direct
  `codeload` tarball download extracted by the in-repo ustar reader — without losing the trust
  rationale those comments carry.
- layer(s): pharn-core (`src/lib/*` comments) + user-facing docs (`docs/roadmap.md`) — ARCHITECTURE.md §4
- constitution_refs: [P2, P4, P0, P7]

## Why this is an increment at all

`degit` is gone. Verified **live this run**, not from memory:

- `package.json` `dependencies` = `@clack/prompts`, `minimist`, `picocolors`. Three. No `degit`.
- `grep -rn 'child_process|execSync|spawnSync|spawn('` over `src/` → **no matches**. No `git` binary.
- `src/lib/repo.ts` `fetchRepo`: ONE `GET api.github.com/repos/pharn-dev/pharn-oss/commits/main`
  resolve → `assertSafeString(rawSha, 'commit SHA', COMMIT_RE)` → `downloadArchive(ref)` fetches
  `https://codeload.github.com/pharn-dev/pharn-oss/tar.gz/<ref>` with `redirect: 'error'`, a 60 s
  `AbortController` timeout, and a **streamed** 32 MB cap counted chunk-by-chunk (codeload sends no
  `content-length`); the buffer goes to `extractTarGz` with `maxEntries: 20_000` and
  `maxTotalBytes: 128 MB`. Fresh `mkdtempSync` temp dir per fetch; **no tarball cache**.

So the six sites below are false in the present tense. That matters twice over:

- **P4** — `docs/roadmap.md:11` is user-facing and *contradicts the code*, which P4 names as a
  violation outright. It also names the wrong mechanism to anyone reading the roadmap to understand
  what `init` does.
- **P2 / comments-as-spec** — the four `src/lib/*` trust comments are the written record of *why* a
  path is untrusted and *what* guards it. A reader auditing `dest-drift.ts` or `symlink-guard.ts`
  today is pointed at a dependency that no longer exists, and away from `lib/tar-extract.ts` — the
  hand-written parser that actually consumes attacker-controlled bytes. This is the same defect the
  Unreleased `SECURITY.md` entry already fixed one document at a time; these are the sites it missed.

**Therefore each site is REWORDED, never merely stripped of the word.** Deleting "degit" would leave
a true-but-empty sentence and lose the reduction (P0: point at the deterministic check).

## Files

- `src/lib/constants.ts` — reword the `REPO` header comment's fetch mechanism — layer pharn-core
- `src/lib/validate.ts` — reword the `COMMIT_RE` comment: the SHA's *form* and its two *sinks* — layer pharn-core
- `src/lib/dest-drift.ts` — reword the `Trust (P2)` line naming `repoDir`'s provenance — layer pharn-core
- `src/lib/symlink-guard.ts` — reword the `Trust (P2)` line naming what an UNTRUSTED base is — layer pharn-core
- `docs/roadmap.md` — reword the shipped-capability row for the fetch — layer docs (user-facing)
- `tests/validate.test.ts` — realign the `COMMIT_RE` spec-comment with its source (AMENDMENT 1) — layer tests
- `tests/init.test.ts` — past-tense the proxy-notice header/rationale + the cache line (AMENDMENT 1) — layer tests
- `CHANGELOG.md` — ONE entry appended to the existing `### Fixed` under `## [Unreleased]` — layer docs

Nine sites in seven source/doc/test files + the changelog. **No behavior, no test expectation, no
public API, no exported identifier changes.** Every edit is inside a comment or a Markdown table row.

## The six replacements (exact, planned before build)

1. `src/lib/constants.ts:2` — "The CLI **degit-clones** the whole repo at a pinned SHA" →
   "The CLI downloads the whole repo as a **`codeload` tarball** at a pinned SHA and extracts it into
   a temp dir (`lib/repo.ts`, `lib/tar-extract.ts`)". Keeps "whole repo at a pinned SHA" — still true.
2. `src/lib/validate.ts:19` — "(the **degit/GitHub** form)" → "(git's canonical form, as GitHub's API
   returns it)". The 40-lowercase-hex shape was never degit's; attributing it to a removed dependency
   is the confusing part.
3. `src/lib/validate.ts:21` — "before it is used as a **degit ref**" → "before it becomes the last
   segment of the `codeload` tarball URL or is recorded as `pharn.config.json` `commit`". This names
   **both sinks**, matching `repo.ts`'s own boundary comment ("the URL below + the three
   config-assembly writers") — so the comment now says what the one guard is guarding.
4. `src/lib/dest-drift.ts:56` — "`repoDir` is an untrusted **degit clone**" → "`repoDir` is an
   untrusted tree — a `codeload` tarball extracted into a temp dir". Untrustedness is preserved and
   its *source* (remote bytes) is now stated rather than delegated to a dependency's name.
5. `src/lib/symlink-guard.ts:11` — "a base may be UNTRUSTED (**a degit clone's temp dir**)" → "a base
   may be UNTRUSTED (the temp dir a fetched `codeload` tarball was extracted into)". Note the word
   **clone** elsewhere in this file (and in `repo.ts`'s own `fetchRepo` doc) is *not* stale — pharn
   still calls the fetched tree a clone. Only `degit` clone is. Nothing else is touched.
6. `docs/roadmap.md:11` — "**Degit-clone** `pharn-dev/pharn-oss` (SHA-pinned) and copy …" → "Fetch
   `pharn-dev/pharn-oss` as a SHA-pinned `codeload` tarball (no `git` binary, no cache) and copy …".
   Stays a one-line table cell; keeps the `Shipped` status, which is correct — the capability shipped,
   only its named mechanism was wrong.

## Explicitly OUT of scope — verified correct as written, must NOT be "fixed"

Each was read this run and is **past tense or deliberately historical**:

- `src/lib/tar-extract.ts:12,17` — "the degit pin **existed** to manage"; "STRICTER THAN WHAT IT
  **REPLACES**. degit **passed** neither `strict` nor `onwarn`". A load-bearing comparison against
  what was replaced. (A sibling PR also owns this file.)
- `src/lib/proxy-env.ts:21,24,75` — inside a block literally headed `HISTORY, because the shape of
  this module still reflects it` and containing "With degit **retired**".
- `docs/troubleshooting.md` — a deliberate *migration* section telling users how to reclaim a
  leftover cache. (Sibling PR.)
- `LIMITS.md:113` ("the **previous** clone path went through degit"), `THREAT-MODEL.md:68` ("the
  **previous** implementation delegated all of it to degit"). Both past tense.

## Reported, never edited (P2 / fix #2)

- `CONSTITUTION.md:21` and `:60` carry present-tense `degit` claims — and are stale on **two further**
  counts each (the removed `manifest.json` / `module.json` module model, and a `safeJoin` citation to
  `lib/install-modules.ts`, a **deleted** file; `safeJoin` lives in `lib/validate.ts`). This file is
  `editable_by: human only` and write-protected by `.claude/hooks/protect-trusted-paths.cjs`. It is
  **surfaced for a human**, never agent-edited, and is a larger finding than this increment.
- `tests/validate.test.ts:102` mirrors site 3 **verbatim** ("before it is used as a degit ref or
  written to pharn.config.json `commit`"), and `tests/init.test.ts:308-313` / `:396` describe the
  proxy notice's *old* degit wiring in the present tense ("degit reads process.env.https_proxy
  ITSELF", "no `~/.degit` tarball is paid for"). These are genuine stale sites the finding did not
  list. They are **outside this increment's six** and are reported rather than silently absorbed —
  growing the plan is the human's call, not the builder's (P7).

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — not ingested here; this increment emits no finding object.
- No inter-layer contract (`ARCHITECTURE.md §5`) changes: no signature, export, or file boundary moves.

## Evals to write (P1)

**None, and that is the honest answer, not an omission.** P1 binds *behavior* ("no behavior ships
without at least one vitest test"). This increment ships **zero** behavior: every hunk is a `//`
comment body or a Markdown table cell. The existing suite is the guard that this stays true — if any
hunk accidentally altered a token outside a comment, `npm run typecheck` and `npm test` go red.

The regression evidence is therefore **the unchanged suite**: `npm run check` GREEN before and after,
and `git diff` showing every changed line begins with `//`/` *` or lives in a Markdown table.

Considered and **rejected as speculative (P7)**: a static test asserting no `src/**` file mentions
`degit`. It cannot be written honestly — `tar-extract.ts` and `proxy-env.ts` *must* keep saying
`degit`, and "present tense vs past tense" is not a deterministic membership test (P5). A regex that
banned the word would force a false edit to two correct files; one that tried to detect tense would be
a classifier driving a branch, which P5 forbids.

## Guarantee audit (P0)

- "the six sites now describe the fetch mechanism the code implements" → **advisory.** It is prose
  accuracy; no floor primitive can verify a sentence is true of the code. Backstop: the claims are
  each traceable to a line of `src/lib/repo.ts` cited in this plan, and a human reads the diff.
- "no behavior changed" → **floor: enum/regex + the existing suite.** `npm run typecheck` (tsc) and
  `npm test` (vitest) are deterministic exit codes; a comment-only diff cannot flip them. Additionally
  `.dev/floor/validate.mjs` must exit 0 (`/pharn-dev-build`'s verdict) and `check-regress.mjs` must
  report `no-regressions` (a pass→fail exit-code comparison at baseline vs HEAD).
- "`degit` is absent from `dependencies` / no `git` binary is spawned" → **floor: regex over live
  files**, re-run this session (`package.json` read; `grep` over `src/`). Not asserted from memory.
- "the changelog is not restructured" → **advisory**, backstopped by the diff being a pure insertion
  into an existing `### Fixed` block (no heading added, renamed, or reordered).

## Trust audit (P2)

No untrusted artifact is ingested by this increment — it reads and rewrites only repo-local trusted
source. There is no new taint path.

What the increment *changes* is the **written trust map**: two of the four comments (`dest-drift.ts`,
`symlink-guard.ts`) are the P2 rationale for their guards. Both rewordings **preserve the trust
classification** (`repoDir` / a base stays UNTRUSTED) and only re-source it — from "a dependency
cloned it" to "these are remote bytes we downloaded and unpacked ourselves". The guards themselves
(`safeJoin` lexical containment, `findSymlinkComponent` physical containment) are untouched, so the
floor behind the prose is unchanged.

## Determinism audit (P5)

No branch is added or altered. The only membership tests in play are the pre-existing ones the diff
does not reach (`COMMIT_RE`, `CAPABILITY_NAME_RE`, `safeJoin`).

## AMENDMENT 1 — two test-file mirrors folded in (human-approved scope growth)

The plan originally stopped at six sites and **reported** the stale mirrors in `tests/` rather than
absorbing them (P7 — growing past the approved scope is the human's call). The human then approved
growing it, on a reason the plan agrees with and had itself raised:

> `tests/validate.test.ts:101` is a verbatim mirror of `validate.ts:21`, so the moment this lands the
> test's comment contradicts the source line it exists to pin. Shipping that is strictly worse than
> leaving both stale.

That makes site 7 a defect **this increment creates**, not a pre-existing one — which is why it
belongs in the same change rather than a follow-up. Sites 8 and 9 are the same P-11 defect
(present-tense `degit` claims) in the other file the survey turned up.

- **Site 7 — `tests/validate.test.ts:101`** — "before it is used as a **degit ref** or written to
  `pharn.config.json` `commit`" → the sink clause is made **verbatim identical** to replacement 3 in
  `src/lib/validate.ts` ("before that value becomes the final segment of the codeload tarball URL or
  is recorded as `pharn.config.json` `commit`"). The mirror is deliberate — this comment's job is to
  pin the source's contract, so it must read as the *same claim*, not a paraphrase. That is also why
  the verb moves from "written to" to the source's "recorded as": an exact mirror is diff-checkable
  by eye, a paraphrase is not.
- **Site 8 — `tests/init.test.ts:308-314`** — the section header `--- the degit proxy notice ---`
  (the notice is no longer degit's) and its present-tense rationale ("degit **reads**
  process.env.https_proxy ITSELF … **clones** DIRECTLY on POSIX … **is interposed**"). Reworded to
  past tense for the history, matching how `tests/proxy-env.test.ts:11-12` and
  `tests/init.test.ts:350` already do it correctly.
- **Site 9 — `tests/init.test.ts:396`** — "no `~/.degit` tarball is paid for on the way to doing
  nothing". Present tense and false on a second count: there is no tarball **cache** at all now
  (`fetchRepo` `mkdtemp`s per call and keeps nothing), so the sentence names a file that can never
  exist. This site was **found by the survey, not supplied** — the human's message named only sites 7
  and 8 and asked whether the two files held others.

**Two facts site 8 must preserve, verified against the code this run rather than restated:**

1. `detectProxyNotice` matches **only the `https_proxy` NAME, in any letter-case** —
   `proxyVariantKeys` filters `key.toLowerCase() === LOWER` where `LOWER = 'https_proxy'`
   (`src/lib/proxy-env.ts:32,61`), so `https_proxy`, `HTTPS_PROXY`, `Https_Proxy` and `HTTPS_proxy`
   all match, pinned by `tests/proxy-env.test.ts`'s `it.each` "every spelling is equally unread";
   `HTTP_PROXY` and `NO_PROXY` are ignored. **Note this is NOT "only the lowercase spellings"** — the
   match is case-insensitive, and writing the narrower claim would have re-introduced a false
   comment while fixing one.
2. These cases pin the **WIRING** (that `init` warns, and warns BEFORE the fetch); the truth table
   itself lives in `tests/proxy-env.test.ts`.

**Deliberately still NOT touched in these two files** — both correct as written:
`tests/init.test.ts:350` ("the old notice **had to** distinguish a spelling degit **read** from one
it **did not**" — past tense) and `tests/init.test.ts:366`
(`expect(warned).not.toContain('degit')` — an assertion pinning that the warning text does not
mention degit, which is load-bearing and must stay).

`CONSTITUTION.md:21,60` remains out of scope and escalated to the human: hook-protected, human-only,
and stale on the removed module model as well.

## Open questions (HALT)

- **None blocking.** The six sites, their replacements, and the out-of-scope set were each resolved
  against live state this run.
- One decision **already made by the human and recorded here rather than re-asked**: this plan is
  capped at the six sites. The additional stale sites found during discovery
  (`CONSTITUTION.md:21,60`; `tests/validate.test.ts:102`; `tests/init.test.ts:308-313,396`) are
  **reported, not built** — growing past six is a human call.
