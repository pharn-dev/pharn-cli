# PLAN — README's network-guard claim, split to match the code

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `README.md:148` sells ONE set of network caps over ALL remote input. Three fetch call sites carry three different cap sets. Split the claim per fetch class so it agrees with `THREAT-MODEL.md` §3, and point at that table as the canonical account.
- layer(s): `docs` (root `README.md`) + `CHANGELOG.md`
- constitution_refs: [P0, P4, P6, P7]

## The finding (audit P-3, MED, Dim G)

> `README.md:148` claims all remote input is "fetched with `redirect: 'error'`, an 8s timeout, and a
> 256KB body cap". True only of `skills-version.ts:29-30`; the tarball uses 60 s / 32 MB
> (`repo.ts:13,18`).

This is a **P0 violation in prose**: a guarantee stated wider than the floor operation that backs it.
P0's own text names the network guard (`redirect: 'error'` + timeout + body cap) as a floor primitive,
so overstating its reach is overstating the floor — the exact disease P0 exists to forbid.

## Discovery (P6 — every line below read from disk THIS run, not from memory)

`grep -rn "fetch(" src` returns **five** matching lines, of which `src/lib/skills-version.ts:199` and
`:264` are prose comments — leaving **exactly three** real call sites. (Stated at the resolution the
command actually produced: a plan whose whole subject is "a document claimed more than the code
supports" does not get to round its own evidence.) Their guards, read from source:

| # | call site | `redirect` | timeout | body cap | source |
| --- | --- | --- | --- | --- | --- |
| 1 | `fetchRemoteSkillsVersion` | `'error'` | **8 s** | **256 KB**, counted in wire bytes while streaming | `src/lib/skills-version.ts:29,30,211-212` |
| 2 | `fetchCommitSha` | `'error'` | **8 s** | **none** — unbounded `res.json()` | `src/lib/repo.ts:10,227-228,236` |
| 3 | `downloadArchive` | `'error'` | **60 s** | **32 MB** compressed, counted as it streams | `src/lib/repo.ts:13,18,184-185,201` |

Plus the extractor, downstream of #3: `MAX_EXTRACTED_BYTES = 128 MB` and `MAX_ENTRIES = 20 000`
(`src/lib/repo.ts:19,20`), enforced in `src/lib/tar-extract.ts:194,256,262` — the gunzip
`maxOutputLength` and the two per-entry running counts.

**So the README's sentence is wrong in two directions, not one.** The audit named the tarball. It did
not name #2: the commit-SHA resolve has `redirect: 'error'` + 8 s but **no body cap at all**, so the
"256KB body cap" over-claims there too. Only `redirect: 'error'` is genuinely universal.

### Who else states this, and who is already right

- **`THREAT-MODEL.md:143-145`** — a three-row table, one row per call site, **correct on all three**,
  including the explicit `(JSON body; no separate cap)` on the commit-SHA row. §2:79-85 adds the
  framing: the floor applies to the clone too, and the clone's timeout is *separately sized*.
- **`docs/contributing.md:94`** — states the 8 s / 256 KB pair but **scopes it to `lib/skills-version.ts`
  by name**, and covers the tarball's caps separately at :104-107. Already correct; not an outlier.
- **`CONSTITUTION.md:64`** — carries the SAME unscoped over-claim as the README. **Out of scope and
  deliberately untouched**: it is human-only, write-protected at the floor by
  `protect-trusted-paths.cjs`, and P0 forbids an agent auto-fixing a constitution violation. Surfaced
  to the human instead — see `## Carried forward`.
- **`docs/troubleshooting.md:124`** — "A request that takes longer than 8 seconds is aborted", in a
  section whose example and whose enumerated four failures are all `SKILLS_VERSION`. Borderline, not
  this finding, **not touched**. Surfaced below.
- **`SECURITY.md`** — a sibling PR owns the same class of drift there. **Not touched, not read for
  edits.**

So the README is the outlier the audit says it is, and `THREAT-MODEL.md` is the account it must
converge on — not a fourth phrasing.

## Files

- `README.md` — split the one Security sentence into: what is validated; the per-fetch-class caps; the SECURITY.md pointer — layer `docs`
- `CHANGELOG.md` — one entry under the existing `## [Unreleased]` → `### Fixed` — layer `docs`

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the audit finding is consumed as **data**; its numbers were
  re-derived from source rather than trusted, and where it under-reported (call site #2) the source
  won. Cited, not restated (P4).

## Evals to write (P1)

**None, and the reason is structural, not an exemption.** P1 binds *behavior* — "no behavior ships
without a vitest test". This increment changes **zero** bytes under `src/`; `git diff --stat src/` is
empty by construction. There is no behavior to pin, and no existing test asserts README prose
(`grep -rn "README" tests/` → no security/cap assertion), so nothing is being left unpinned that was
pinned before.

What *does* gate this increment, deterministically:

- `npm run lint:md` — markdownlint over `*.md`, README included (`.markdownlint-cli2.jsonc` ignores
  only `node_modules`, `dist`, `coverage`, `CHANGELOG.md`, `**/*.updated.*`).
- `npm run format:check` — prettier.
- The full `npm run check` + `node .dev/floor/validate.mjs .`, which must stay GREEN — a docs-only
  change that reddens any gate is a real failure, not noise.

The honest limit: **no automated check compares these README numbers to the constants in `src/lib/`.**
Correctness here rests on the read recorded in the Discovery table above and on human review. That is
stated, not hidden (P0) — see the guarantee audit.

## Guarantee audit (P0)

| claim the increment makes | floor or advisory |
| --- | --- |
| "every `fetch` uses `redirect: 'error'`" | **FLOOR** — `redirect: 'error'` is a literal at all three call sites (`repo.ts:185,228`, `skills-version.ts:212`); `grep -rn "fetch(" src` proves the set is closed at three |
| the per-call-site timeout / cap numbers | **FLOOR at runtime** (each is a named constant enforced by an `AbortController` or a running byte count) — but the README *stating* them is **ADVISORY**: nothing tests the prose against the constants |
| "the README now agrees with `THREAT-MODEL.md`" | **ADVISORY** — a human reading two files. No checker compares them |
| the tarball's 128 MB / 20 000 extractor caps | **FLOOR** — `gunzipSync maxOutputLength` + two running counts that throw (`tar-extract.ts:194,256,262`) |

**The increment's whole point is a P0 correction, so it must not commit the same sin.** Nothing here is
labeled "guaranteed" beyond what the constants enforce, and the un-tested doc↔code coupling is named
above rather than implied away.

## Trust audit (P2)

The audit finding is **untrusted free-text input** to this run. It was treated as data: every number it
asserted was re-derived from `src/` before use, and it was **wrong by omission** on call site #2 — the
source won, which is the point of re-deriving. No taint reaches an output: the README text is written
from the Discovery table, not quoted from the finding.

## Determinism audit (P5)

One branch: *does the source agree with the audit?* Decided by a membership test over
`grep -rn "fetch(" src` (three sites, enumerated) and the literal constants at those lines — not by
judgment. It did not fully agree, and the disagreement is recorded rather than smoothed over.

## Scope discipline (P7)

Deliberately NOT in this increment, each with its reason:

- `SECURITY.md` — sibling PR owns it.
- `CONSTITUTION.md:64` — human-only, floor-write-protected; P0 forbids an agent auto-fixing a
  constitution violation.
- `docs/troubleshooting.md:124` — different claim, different section, borderline; widening scope to it
  would make this PR the "fix every instance" PR the human did not ask for.
- Any `src/` change — the code is **correct**; only the sentence about it was wrong.
- A test coupling doc prose to the `src/lib` constants — a real idea, but speculative here (P7) and far
  outside a minimal doc fix. Recorded as an open question, not built.

## Open questions (HALT)

**None.** Nothing about this increment is unresolved: the files, the wording, and the exclusions are all
determined, and the approving human's scope statement settled every boundary question in advance —
"Scope: `README.md` only (plus the CHANGELOG entry)" and "do not touch SECURITY.md".

This section is deliberately empty rather than absent, and it was **not** empty in the first draft. It
held three settled, out-of-scope observations, which `/pharn-dev-grill` flagged as its one blocking finding
(`GRILL.md`, P6): `/pharn-dev-build` Step 1.1 HALTs on a populated `## Open questions (HALT)` by
**section presence**, so filing already-answered items under a heading reserved for blockers would have
stopped the build over questions nobody was actually asking. `PLAN.md` is outside build's writes-scope
(parsed from `## Files`), so the correction had to happen here or nowhere. The three observations were
not discarded — they moved to `## Carried forward`, below, which is a report, not a gate.

## Carried forward (for the human at the post-review gate — NOT blockers)

1. **`CONSTITUTION.md:64` carries the identical over-claim** — "Remote fetches use `redirect: 'error'`,
   an 8s timeout, and a 256KB body cap" — in the one document that `CONSTITUTION.md:24` says wins every
   conflict. **Agent-unfixable by construction**: human-only, floor-write-protected by
   `protect-trusted-paths.cjs`, and P0 forbids an agent auto-fixing a constitution violation. Escalating
   it *instead of* acting on it is what P0 prescribes. Consequence to weigh: this PR leaves the README
   subordinate-but-right and the governing document authoritative-but-wrong.
2. **`docs/troubleshooting.md:124`** — "A request that takes longer than 8 seconds is aborted" reads as
   universal but sits in a section whose example and whose four enumerated failures are all
   `SKILLS_VERSION`. Borderline; a follow-up call, not this PR's.
3. **Nothing couples doc prose to the `src/lib` constants**, and that absence is the mechanism that let
   P-3 exist. Recorded as a standing repo property; building a checker for it here would be speculative
   (P7).

Reported so the increment is read as closing **one** instance of the drift class — not the class.
