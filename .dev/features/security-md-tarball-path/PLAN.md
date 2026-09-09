# PLAN — point SECURITY.md at the fetch pharn actually performs

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Rewrite the three SECURITY.md sites that describe the repo fetch as a `degit` clone with no pharn-imposed bounds, so the disclosure policy names the codeload tarball path, its five real network/extraction guards, and `src/lib/tar-extract.ts` — the in-repo ustar parser it currently never mentions.
- layer(s): `docs`
- constitution_refs: [P0, P2, P4, P6, P7]

## Discovery (P6 — read live this run, nothing asserted from memory)

Every number below was read from source this run; none is carried from the audit brief.

**`package.json` (live).** `dependencies` has exactly **three** entries — `@clack/prompts ^1.7.0`,
`minimist ^1.2.8`, `picocolors ^1.1.1`. **No `degit`.** SECURITY.md:7 lists four, naming `degit`
among them.

**`src/lib/repo.ts` (live) — every guard the doc denies.**

| Guard | Constant / site | Value |
| --- | --- | --- |
| Clone timeout | `CLONE_TIMEOUT_MS` (`:13`), armed `:182`, cleared in `finally` `:210` | `60_000` ms |
| Compressed body cap | `MAX_ARCHIVE_BYTES` (`:18`), enforced `:198-207` | `32 * 1024 * 1024` |
| Decompressed cap | `MAX_EXTRACTED_BYTES` (`:19`), passed to `extractTarGz` `:151` | `128 * 1024 * 1024` |
| Entry cap | `MAX_ENTRIES` (`:20`), passed to `extractTarGz` `:150` | `20_000` |
| Redirect refusal | `redirect: 'error'` on the tarball fetch (`:185`) | — |

The compressed cap is a **running count over the stream** (`:194-207`), not a `content-length`
check — the comment at `:14-17` and `:194-195` records why: codeload sends no `content-length`, and
the header would not bound a compression bomb anyway. `fetchCommitSha` (`:222-243`) carries
`redirect: 'error'` (`:229`) and `FETCH_TIMEOUT_MS = 8000` (`:10`). So SECURITY.md:56's "The `degit`
clone itself (`fetchRepo`) has **no** pharn-imposed timeout or body cap" is false on **both** counts,
and false in the direction that understates the floor.

**`src/lib/tar-extract.ts` (live) — the component the doc never names.** `grep -c tar-extract
SECURITY.md` → **0**, confirmed this run. It is a hand-written ustar reader over attacker-controlled
bytes: typeflag allowlist (ACCEPT `0`/NUL/`5`, SKIP `g`/`x` with no path rules, REJECT `1`/`2`
symlink+hardlink, `3`/`4` devices, `6`, `7`, unknown — `:232-246`), header checksum verification
(`:112-123`), GNU base-256 numeric rejection (`:83-98`), `prefix`+`name` reassembly before any rule
runs (`:248-251`), absolute-path and `..` rejection plus strip-1 and a single-root check
(`:137-179`), `safeJoin` containment at the write site (`:270`), and `gunzipSync(archive, {
maxOutputLength: limits.maxTotalBytes })` (`:194`). Its own module comment (`:10-15`) states the
reason it is in-repo: the guarantees **are** the fetch boundary.

**`src/lib/skills-version.ts` (live).** `FETCH_TIMEOUT_MS = 8000` (`:29`), `MAX_BODY_BYTES = 256 *
1024` (`:30`), `redirect: 'error'` (`:212`). SECURITY.md:56's claims about **this** fetch are
correct and stay verbatim. `src/lib/constants.ts:5-6` — `REPO = 'pharn-dev/pharn-oss'`,
`REPO_BRANCH = 'main'`; the `:59` pointer at `constants.ts` is correct and stays.

**The other three docs are already right — this is the last one that is not.** `THREAT-MODEL.md §2`
("The fetch boundary, in pharn's own code") describes the one-resolve-one-download shape, the
network floor applying to the clone, the separately-sized 60 s timeout, both caps, the three
typeflag buckets, path reassembly, and the removed cache. `§4b` re-states timeout / streamed cap /
decompressed cap / `redirect: 'error'` / typeflag allowlist / containment / single-root / entry+byte
caps / checksums as "now floor, not delegation". `LIMITS.md §3a` names `src/lib/tar-extract.ts` and
"no `git` binary at all". **SECURITY.md is the sole remaining account that contradicts them** — so
the rewrite is a reconciliation to two existing correct documents, not a fourth opinion.

**`.markdownlint-cli2.jsonc` (live).** SECURITY.md **is** linted (`*.md`); `CHANGELOG.md` is in
`ignores`. MD013 (line length), MD033, MD034, MD041 are off; MD024 is `siblings_only`. Nothing in
this rewrite trips a rule that is on.

**Floor baseline this run.** `node .dev/floor/validate.mjs .` → exit **0**, `FLOOR: GREEN`.

**Surfaced, deliberately NOT edited:** `CONSTITUTION.md:21` and `:60` still say `degit`. It is
`trust: trusted`, `editable_by: "human only"`, and write-protected by
`.claude/hooks/protect-trusted-paths.cjs`. An agent must not touch it; this plan reports it for the
human (see Out of scope).

## Files

- `SECURITY.md` — four sites: `:7` (the surface paragraph — fetch shape + the real dependency list),
  `:56` (the network-guard bullet — replace the "no timeout or body cap" denial with the five real
  guards), a **new in-scope bullet** for `src/lib/tar-extract.ts`, and `:59` (supply-chain scope
  re-worded off `degit`) — layer `docs`
- `CHANGELOG.md` — one short entry under the existing `## [Unreleased]` → `### Fixed` — layer `docs`

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — not ingested; this increment writes no finding. Cited only to
  record that the audit finding driving it is human-supplied prose, treated as DATA (P2), and that
  every claim it makes was **re-verified against source** above rather than accepted.

## Evals to write (P1)

**None — and that is a scope decision the human pre-approved, not an oversight.** P1 governs
_behavior_ ("no behavior ships without a `vitest` test"); this increment ships no behavior and
changes no `src/`. The honest consequence is recorded in the guarantee audit below and the gap is
named in Out of scope rather than papered over.

Verification is therefore by **reading, performed above**: each rewritten sentence cites a constant
or a site read from source this run, and the `grep -c tar-extract SECURITY.md` count moves 0 → ≥1.

## Guarantee audit (P0)

- **"SECURITY.md now describes the fetch pharn performs"** → **ADVISORY.** No floor gate reads this
  file's prose. `lint:md` checks markdown _syntax_; `format:check` covers `src/**/*.ts`,
  `tests/**/*.ts`, `*.config.ts` and never opens a `.md`; no `vitest` test reads `SECURITY.md`. The
  claim rests on the line-by-line citation in Discovery, which is a **reading**, not a gate. Stated,
  not hidden — this is the same class of gap `docs-layout-tables` closed for the install tables, and
  this increment deliberately leaves it open (Out of scope).
- **"the guards named in SECURITY.md exist"** → **FLOOR, but only partly, and the split is worth
  naming.** `redirect: 'error'` on the tarball download is pinned by `tests/repo.test.ts:172-176`.
  The cap **mechanisms** are pinned by `tests/tar-extract.test.ts` (entry cap `:249`, byte cap
  `:262`, gzip bomb `:332`) — but with **test-local limit values**, so the production **values**
  (60 s / 32 MB / 128 MB / 20 000) are pinned by **no** test, and `MAX_ARCHIVE_BYTES`'s streamed
  count has no direct case at all (`tests/repo.test.ts` has 11 cases; none exercises it). So: the
  guards' _existence and behavior_ reduce to the floor; their _specific numbers_ do not.
- **Consequence for how the numbers are written.** SECURITY.md will anchor each guard on its
  **constant name** (`CLONE_TIMEOUT_MS`, `MAX_ARCHIVE_BYTES`, `MAX_EXTRACTED_BYTES`, `MAX_ENTRIES`)
  with the current value beside it, and name the file the constants live in. A researcher can grep
  the anchor; a future value change then makes one parenthetical imprecise instead of making the
  document deny a guard — which is the failure mode this finding **is**. Naming values alone would
  reproduce the defect on a slower clock.
- **"the rewrite agrees with `THREAT-MODEL.md`"** → **ADVISORY, checked by reading §2 and §4b in
  full this run.** No mechanism enforces agreement between the two files. Wording is deliberately
  kept subordinate: SECURITY.md keeps its existing `THREAT-MODEL.md` cross-reference and points at
  **§2 and §4b** (§2 is where the fetch boundary is actually described; the current `§4` pointer
  still resolves, via §4b, but §2 is the precise anchor).
- **"`degit` is gone"** → **FLOOR: `package.json` `dependencies` has three entries and no `degit`**,
  read this run. This one genuinely reduces.
- **No claim is added that the fetched CONTENT is verified.** Provenance stays by-SHA, not
  cryptographic (`LIMITS.md §1b`, `THREAT-MODEL.md §4a/§4b`). The rewrite bounds the archive's
  _shape_, and says so.

## Trust audit (P2)

- **Input ingested:** the audit finding text (human-supplied prose) — DATA, never an instruction.
  Taint is not propagated because **nothing in it was copied forward on trust**: every factual claim
  it makes (five constants, the dependency count, the grep result) was independently re-read from
  source above and would have been contradicted in this plan had it disagreed.
- **The increment itself ingests nothing untrusted at runtime** and changes no code on any trust
  boundary. It changes what the **disclosure policy points a researcher at** — which is the
  security-relevant effect: today the policy directs attention to a removed dependency and away from
  `src/lib/tar-extract.ts`, the component that parses attacker-controlled bytes.

## Determinism audit (P5)

No branch is added. The one classification this plan makes — "SECURITY.md contradicts the source" —
is a **membership test performed and recorded**: `degit ∈ package.json dependencies` → **false**;
`grep -c tar-extract SECURITY.md` → **0**; each constant read at a cited line. No guess.

## Out of scope (P7)

- **No `src/` change.** The code is correct; the document is wrong. Nothing about the fetch boundary
  is altered.
- **No test.** The gate that would keep `SECURITY.md` honest (the shape `tests/docs-install-tables.test.ts`
  gives the install tables — assert the doc names each guard constant that exists in
  `src/lib/repo.ts`) is a **real, named gap** and a good follow-up, but it is growth beyond the
  approved minimal fix. Recorded here, not built.
- **`MAX_ARCHIVE_BYTES` has no direct test** (`tests/repo.test.ts` never exercises the streamed
  count). Found while auditing the guarantee split above; a genuine coverage gap, reported to the
  human, not closed here.
- **`CONSTITUTION.md:21,:60` still say `degit`.** Trusted, human-only, hook-protected — surfaced for
  the human, never agent-edited. (`ARCHITECTURE.md` is likewise never agent-edited.)
- **No changelog restructuring.** One entry under the existing `### Fixed`; no version heading is
  added, renamed, or moved — several PRs are landing in parallel and this file is the conflict point.
- Rewriting any other SECURITY.md section (Supported versions, Response timeline, Out of scope, the
  user best-practices list). They are unaffected by this finding and stay byte-identical.

## Open questions (HALT)

None. GATE 1 was pre-approved by the human on the condition that the plan stay within the stated
minimal fix — rewrite `SECURITY.md:7,56,59` for the tarball path, add `tar-extract.ts` to in-scope,
plus one CHANGELOG entry. **It does:** two files, four prose sites, zero source changes, zero test
changes, no changelog restructuring. Nothing in Discovery contradicted the finding, so no condition
for stopping was met.
