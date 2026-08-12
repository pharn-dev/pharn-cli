# PLAN — trust-map-records-era

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Correct three now-false claims in the two hook-guarded governance docs (`LIMITS.md §1b`, `§1d`; `THREAT-MODEL.md §4c`) so the trust map matches the records era, as in-place section-body rewrites with no renumbering.
- layer(s): trusted governance docs (not a `src/` layer — `ARCHITECTURE.md §4` does not govern prose)
- constitution_refs: [P0, P2, P4, P6, P7]

## Files

- `LIMITS.md` — rewrite §1b's hash clause + §1d's **header text and body** (identifier `1d.` unchanged) — layer: trusted doc
- `THREAT-MODEL.md` — rewrite §4c's body — layer: trusted doc
- `CHANGELOG.md` — one line under Unreleased, `Docs` — layer: user-facing record
- `docs/reference/pharn-records.md` — reverse cross-link line back to `THREAT-MODEL §4c` / `LIMITS §1b` — layer: reference doc
- `LIMITS.UPDATED.md` — full corrected `LIMITS.md` (§1b + §1d applied), for a human to move into place — layer: handoff artifact
- `THREAT-MODEL.UPDATED.md` — full corrected `THREAT-MODEL.md` (§4c applied), for a human to move into place — layer: handoff artifact
- `.dev/features/trust-map-records-era/PLAN.md` — this plan — layer: loop artifact
- `.dev/features/trust-map-records-era/GRILL.md` — grill log — layer: loop artifact
- `.dev/features/trust-map-records-era/SHIP.md` — ship roll-up — layer: loop artifact
- `.dev/features/trust-map-records-era/REGRESSION.md` — regression render — layer: loop artifact
- `.dev/features/trust-map-records-era/regression-report.json` — machine regression report — layer: loop artifact
- `.dev/features/trust-map-records-era/VERIFY.md` — verify render — layer: loop artifact
- `.dev/features/trust-map-records-era/verify-report.json` — machine verify report — layer: loop artifact
- `.dev/features/trust-map-records-era/REVIEW.md` — review log — layer: loop artifact

**Not touched:** `CONSTITUTION.md`, `ARCHITECTURE.md`, any `src/**`, any `tests/**`, any `.dev/floor/**`.

### Why the two handoff files exist (added mid-run)

`protect-trusted-paths.cjs` denies agent writes to `LIMITS.md` / `THREAT-MODEL.md` unconditionally
(`DEFAULT_PROTECTED`, `:58`; `PHARN_PROTECTED` composes by **addition only**, `:63`). The corrected
content is therefore delivered as **side-by-side files a human moves into place** — the hook's own
sanctioned path, with **no bypass**. The human applies them with:

```bash
mv LIMITS.UPDATED.md LIMITS.md && mv THREAT-MODEL.UPDATED.md THREAT-MODEL.md
```

## Contracts satisfied

- No `pharn-contracts` contract is implicated — this increment ships prose only, no finding shape, no
  capability, no rule_id. Cited, not restated (P4).

## Evals to write (P1)

- **None, and this is the honest reduction, not an exemption.** P1 binds *behavior*; this increment
  changes zero behavior — no `src/`, no `tests/`, no `.dev/floor/` file is touched. The verification of
  record for prose is the **anchor table** below plus the standing gates (`lint:md`, `check`), which
  must stay green *untouched*. Claiming an eval here would be inventing a floor that does not exist (P0).

---

## Discovery — live state, read this run (P6)

### D1. Base is NOT latest `main` — decision required (Q4)

```
current branch : feat/remove-prunes-records @ 4b8a0be
main           : 21db522
git branch --contains 4b8a0be --all
  → feat/remove-prunes-records
  → remotes/origin/feat/remove-prunes-records      # NOT main
```

The build prompt asserts "base: latest `main` (verified at `21db522`)". Live state: we are **one commit
ahead of `main`**, and that commit **is L1** ("prune removed capability entries from
`pharn.records.json`"). L1 is **pushed but unmerged**. This is exactly the L1-merge question the prompt
asks to resolve — resolved: **not merged**.

### D2. The three quoted passages match verbatim ✅

| # | File:line | Quoted claim (verbatim on disk) |
| --- | --- | --- |
| 1 | `LIMITS.md:61-62` | "To reconstruct what a module contributed, `update`/`remove`/`status` read the manifest from `@main` HEAD (not the pinned `commit`)." |
| 2 | `THREAT-MODEL.md:115-117` | "**4c. No stored content-hash of installed files.** `status`/`diff` re-derive the expected byte set **live** against `@main`, not against a per-file hash pinned in `pharn.config.json`." |
| 3 | `LIMITS.md:35-36` | "it stores **no signature and no per-file content-hash**" |

No one got here first. HALT condition #1 not triggered.

### D3. `remove` is offline — confirmed, with a line-number correction

`grep -n "fetch\|manifest\|degit\|http" src/commands/remove.ts` → **3 hits, all comments, zero network**:

- `:36` "The legacy module/skill removal (which read the manifest)"
- `:99` "them via its manifest."
- `:193` "Without a manifest we list"

**Correction to the build prompt:** it cited `:30` and `:117` and claimed *two* hits. Live file has
**three** at `:36`/`:99`/`:193`. Content matches; line numbers drifted. The anchor table uses live lines.

Addressing confirmed offline + config-derived: `remove.ts:12` imports `configLayout, layoutPaths`;
`:212` and `:307` both compute `layoutPaths(configLayout(config))`.

### D4. §1d and §4c have **zero** live inbound citers ✅

`grep -rn "§1d\|§4c" src tests .dev .claude docs *.md` → the only hits are **historical build artifacts**
(`.dev/features/commands-off-manifest/PLAN.md:118,:200`; `.dev/features/update-drift-safe/PLAN.md:284`,
`REVIEW.md:128`) — prior plans/reviews, not live citers. **No `src/`, test, floor checker, hook, or
`docs/` file cites either section.** The two sections being rewritten are the two least-cited in the file.

### D5. Citation inventory — reproduces, with an arithmetic correction

`LIMITS.md §3b` — **8 live citation sites** (the prompt said "seven"; its own parenthetical enumerates
5+1+1+1 = 8, plus the test title = 9 lines. The *set* reproduces exactly; the count in the prose does not):

```
src/lib/repo.ts:16, :33, :49, :54, :78    (×5 — :78 cites §1b/§3b jointly)
src/lib/validate.ts:34
src/commands/add.ts:393
src/commands/init.ts:93
tests/repo.test.ts:52                      (test TITLE — a string, not an assertion)
```

`LIMITS.md §1b` — **exactly 2**, as claimed: `src/lib/repo.ts:35`, `src/lib/repo.ts:78`.

`THREAT-MODEL §2/§3/§5` — reproduces: `check-seam-config.mjs:23` (§2), `check-structural.mjs:13-14`
(LIMITS §2 + TM §5), `check-provenance.mjs:10` (§3), `test-fixtures/case-injection-comment.md:8` (§2).
`.dev/floor/README.md:64` (LIMITS §2 + TM §5). **One citer the prompt's inventory omits:**
`src/lib/resolve-capabilities.ts:18` cites `THREAT-MODEL.md` (unnumbered).

**Consequence:** §1b's rewrite must keep `repo.ts:35`/`:78`'s cited meaning intact — both cite §1b for
"provenance, not cryptographic." The planned rewrite *sharpens* that meaning and does not move it. ✅

### D6. The four filename tests are payload-pins — confirmed, not re-panicked

Every reference is a **path**, never content:
`install-capabilities.test.ts:59-60,:373-374` write 1-byte bodies (`'T'`/`'L'`);
`:415-416` and `install-manifest.test.ts:199-200` assert **`not.toContain` / `existsSync === false`**;
`layout.test.ts:45-46` and `install-manifest.test.ts:127-128` list them in an expected **path set**;
`overwrite-check.test.ts:36-37` writes empty files. **Zero content assertions ⇒ content-only rewrites
imply zero test churn.** ✅

### D7. Neither file mentions `pharn.records.json` anywhere

`grep -n "records" LIMITS.md THREAT-MODEL.md` → 2 hits, both the ordinary verb ("pharn **records** a
`commit` SHA", "the `commit` **records** which ref"). **The records era is entirely absent from the trust
map.** That is the finding, measured.

### D8. Anchors for the new text — all verified live

| Anchor | Live content |
| --- | --- |
| `src/commands/update.ts:452` | `'  Removed capabilities' files are left on disk — pharn update never deletes.'` |
| `src/lib/merge-capabilities.ts:79` | reason enum `'added' \| 'dropped-unselected' \| 'dropped-gone' \| 'kept-manual'` |
| `src/lib/merge-capabilities.ts:161,:181,:201,:210` | the four `changes.push({...reason})` sites |
| `src/lib/apply-update.ts:44` | `export function readDiskState(projectRoot, rel): DiskState` |
| `src/lib/diff.ts:79` | `const state = readDiskState(baseDir, rel);` — status's project side |
| `src/lib/update-decision.ts:60` (row 1) | `missing \| any \| — \| WRITE restored` |
| `src/lib/update-decision.ts:64` (row 5) | `present \| available \| no record \| SKIP unrecorded` |
| `src/lib/update-decision.ts:65` (row 6) | `present \| unavailable \| — \| SKIP unverif.` |
| `src/lib/update-decision.ts:67-71` | row 2 precedence — "a file already byte-identical to upstream is never a skip — even with no records… a degraded install partially heals" |
| `docs/reference/pharn-records.md:38` | "Hashes are taken from the **written file**, never from the upstream source" |
| `src/commands/remove.ts:117,:227,:312` | `pruneCapabilityRecords` — **on this branch only** (D1) |

### D9. Staleness sweep — both files read end-to-end, every claim classified

**`LIMITS.md`**

| § | Claim | Class |
| --- | --- | --- |
| §1a | placement-not-content; floor bounds where files land | **true** |
| §1a | "A `module.json` with perfectly safe paths…" | **stale** — `module.json` subsystem deleted; the *point* survives, the example artifact does not → **ticket** |
| §1b | "commit SHA (best-effort via GitHub API)", "mutable remote via degit" | **true** |
| §1b | "no signature and **no per-file content-hash**" | **STALE — in scope (rewrite #3)** |
| §1b | struck-claim / true-statement / backstop | **true** (untouched) |
| §1c | "`modules[]` / `installedSkills[]` record what a run intended" | **shifted** — archetype configs record `archetypes[]`/`capabilities[]`; the legacy fields load but are not the primary record → **ticket** |
| §1c | "not re-verified against the filesystem except when `status` runs" | **shifted** — `update` now re-verifies **per file** against `pharn.records.json` (`update-decision.ts`) → **ticket** (near-neighbour of §4c; see HALT note) |
| §1d | header + body: manifest, `remove` resolves against `@main` | **STALE — in scope (rewrite #1)** |
| §2 | the one residual | **true** |
| §3a | "`init`/`add`/`update` require a network"; no offline path | **true** (correctly omits `remove`; `status --no-drift` narrows but does not falsify) |
| §3b | GitHub rate limits, `commit` may be absent, advisory never a gate | **true** (the 8-site anchor) |
| §3c | "**Modules** are fetched from one configured repo" | **stale (wording)** — capabilities, not modules; single-source point holds → **ticket** |
| §3d | Claude Code only; Codex/Cursor Coming soon | **true** |
| §4 | "known threats (`THREAT-MODEL.md §2–§4`) closed or labeled" | **true** |

**`THREAT-MODEL.md`**

| § | Claim | Class |
| --- | --- | --- |
| §1 | Surfaces A / B / B′ | **true** |
| §2 preamble | "There is **no** `manifest.json`, **no** per-module `module.json`, **no** wizard block" | **true** — already updated; proof the file was partially maintained |
| §2 #1–#5 | the concrete attack surface | **true** |
| §2 #6 | "`status`/`update`/`diff` resolve against `@main` HEAD" | **true** — **already correctly omits `remove`**. The file contradicts `LIMITS §1d` today; rewrite #1 resolves the contradiction *toward* this line |
| §3 table | all rows; `collectExpectedInstallPaths` verified live (`install-manifest.ts:95`) | **true** |
| §3.1 | config-write sink; three network-derived fields validated at ingest | **true** |
| §4a | provenance, not verification | **true** |
| §4b | no pharn-imposed bounds on the `degit` clone | **true** — and *understated*; see S3 (Q2) |
| §4c | "No stored content-hash of installed files" | **STALE — in scope (rewrite #2)** |
| §5 | the one residual | **true** |

**Ticket candidates (deliverable, NOT a work order — out of scope this increment):**
T1 §1a `module.json` example · T2 §1c legacy field names · T3 §1c "only `status` re-verifies" ·
T4 §3c "modules" wording. See the HALT note on T3.

---

## Guarantee audit (P0)

| Claim the increment makes | Reduction |
| --- | --- |
| "the three quoted passages were false" | **floor-adjacent**: each falsifier is a live `file:line` in the anchor table, openable by a reviewer |
| "the new text is true" | **advisory** — prose has no gauntlet. The anchor table is the honest substitute, explicitly labeled as such, not sold as a floor |
| "no § header changed" | **floor: grep** — `git diff main -- LIMITS.md THREAT-MODEL.md \| grep -E '^[-+]#{2,3} ' \| wc -l` → 0 (**conditional on Q1 = A**) |
| "no test churn" | **floor: `npm run check`** exit 0 with zero test files modified |
| "markdown well-formed" | **floor: `npm run lint:md`** exit 0 |
| "only whitelisted files written" | **floor: hook** — `set-writes-scope.cjs` + `enforce-writes-scope.cjs` + `protect-trusted-paths.cjs` |

**No guarantee is claimed for prose correctness.** Stating otherwise would be the disease (P0).

## Trust audit (P2) — CORRECTED after grill F1

This increment ingests **no untrusted artifact**. It reads only repo-local trusted docs and `src/`.
No taint propagates.

**Blast radius, corrected.** `TRUSTED_DOCS` (`src/lib/constants.ts:29-34`) names the docs
`installCapabilities` copies **out of `repoDir` — the degit clone of pharn-oss** — into a user's project.
This repository's own `LIMITS.md` / `THREAT-MODEL.md` are **its** governance docs and are **never** the
installed bytes; `constants.ts:48-50` states they "stay dev-only," and the `pharn/` layout drops them
entirely (`layout.ts:42`, `install-capabilities.ts:158`). **Editing them changes zero user-installed
bytes.** The payload-pin tests (D6) confirm this by construction: they write **fake** docs into a **fake
repo dir**, because the source is the clone.

The `CHANGELOG.md` line therefore rests on a **different** justification: these two files are the
project's **published** trust map — read on GitHub and shipped in the npm tarball — so a correction to
them is user-facing (P4/P7), even though nothing is copied into a consumer's `.claude/`.

The one enforcement adjacency that does hold: both files are in `protect-trusted-paths.cjs`
`DEFAULT_PROTECTED` (`:58`), so every write must go through the declared writes-scope.

## Determinism audit (P5)

Every branch in this increment is a membership test or ends in "ask": the L1 phrasing branches on
`git branch --contains` output (D1, a set-membership test, **not** a guess); the header question, the S3
question, and the cross-link question all end in **ask** (below), never in an invented answer.

---

## Open questions (HALT) — ALL RESOLVED at HALT 1

### Q1 — `§1d`'s header was itself one of the false claims → **RESOLVED: fix the header text**

`LIMITS.md:59` read `### 1d. \`update\` / \`remove\` resolve against \`@main\`, not the pinned commit`.
The body rewrite makes `remove` offline, so the title contradicted its own section — inside the repo's
honesty document. **Decision:** rewrite the title, keep the identifier `1d.` byte-identical:

```
### 1d. `update` / `status` resolve against `@main`; `remove` resolves offline
```

Justified by D4: §1d has **zero live inbound citers**, and the `1d.` identifier — the actual API — is
unchanged. **Consequence:** the build prompt's Phase C check `^[-+]#{2,3} ` → 0 is **superseded**; the
correct invariant is *"no § **identifier** changed."* Phase C amends to:

```bash
git diff main -- LIMITS.md THREAT-MODEL.md | grep -E '^[-+]#{2,3} ' # expect exactly 2 lines: 1d's -/+
git diff main -- LIMITS.md THREAT-MODEL.md | grep -oE '^[-+]#{2,3} +[0-9]+[a-z]?\.' | sort -u # → 1d. only
```

### Q2 — S3 → **RESOLVED: dropped. Its premises did not survive verification.**

Measured against `degit@3.6.5` live: the cache path is `~/Library/Caches/degit` / `$XDG_CACHE_HOME`,
**not `~/.degit`** (false as stated); `git ls-remote` is a **fallback** behind pure-JS `listServerRefs` /
`getRemoteInfo2` (shifted, not primary); no `https_proxy`/`HTTPS_PROXY` string exists in the bundle and
`repo.ts` passes no `proxy` option (false as stated); the node-tar guards were **not located**
(unverified). Only the tar→`git clone` fallback verified — and it **relocates**: degit `warn`s at all
three sites, but `src/lib/repo.ts:58-62` registers **no listener**, so the silence is pharn's.

Writing any of it would have put unverified claims into the honesty document — the exact defect this
increment repairs (P0/P6). **→ ticket T5.**

### Q3 — reverse cross-link → **RESOLVED: yes.** `docs/reference/pharn-records.md` gains one line back to `THREAT-MODEL §4c` / `LIMITS §1b`, and enters the Phase B whitelist.

### Q4 — base → **RESOLVED, then AMENDED mid-run: branch from `main`; phrase the prune as SHIPPED.**

**Original resolution (now superseded):** L1 was unmerged (D1 @ `main` = `21db522`), so §1d's `remove`
sentence was to say the records entries "remain until the next `update` rewrites the store."

**Amendment — live state changed during this run (P6).** `main` fast-forwarded to `3645fdf`
(`git reflog show main` → `pull --tags origin main: Fast-forward`): **L1 merged as PR #92**,
2026-08-12 15:08. `git show main:src/commands/remove.ts | grep -c pruneCapabilityRecords` → **3**.
D1's finding was true when measured and is now stale — exactly the drift P6 exists to catch.

**Human re-approved the revised phrasing at the amendment halt.** §1d's `remove` sentence now states the
prune as **shipped**, anchored at `src/commands/remove.ts:117`, `:227`, `:312`. The base branch
`docs/trust-map-records-era` is cut from `main` @ `3645fdf`.

### Grill findings folded into the text before writing (advisory, `GRILL.md`)

- **F1 (blocking, P2)** — the Trust audit below is **wrong**: `TRUSTED_DOCS` (`constants.ts:29-34`) is the
  set copied **out of the pharn-oss clone**, and `constants.ts:48-50` says these two files "stay
  dev-only". Editing this repo's copies changes **zero** user-installed bytes. The `CHANGELOG.md` line
  stands on a different footing — these are the project's **published** trust map (read on GitHub/npm) —
  not on shipped bytes. **Trust audit corrected below.**
- **F2 (important, P6)** — open question for the human, does **not** block this PR: whether pharn-oss's
  own `LIMITS.md`/`THREAT-MODEL.md` carry the same three false claims. Not answerable from this repo.
  → **ticket T6.**
- **F3 (important, P0)** — drop "deletes **exactly** what the recorded layout says that capability owns —
  and nothing it never recorded." `deleteCapabilityDir` (`remove.ts:72-77`) removes the **whole
  directory**, user-added files included, and does not consult records to decide what to delete.
- **F4 (minor, P0)** — drop the unanchored historical aside ("no longer crash or masquerade"); state
  `readDiskState`'s present behavior only.
- **F5 (important, P5)** — re-anchor the store-rewrite claim from `remove.ts:99` (a comment still using
  the deleted "manifest" vocabulary) to `src/commands/update.ts:325`. Moot for §1d after the Q4
  amendment, retained as the anchor discipline it demonstrates.

---

## Ticket list (deliverable, NOT a work order)

- **T1** — `LIMITS §1a`'s `module.json` example (subsystem deleted; the point survives)
- **T2** — `LIMITS §1c`'s legacy field names (`modules[]`/`installedSkills[]` vs `archetypes[]`/`capabilities[]`)
- **T3** — `LIMITS §1c` "not re-verified against the filesystem except when `status` runs" — **now false**;
  `update` re-verifies per file. Nearest neighbour to §4c; deliberately left out to keep this PR to
  claims with zero interpretive slack
- **T4** — `LIMITS §3c` "**Modules** are fetched from one configured repo" (wording)
- **T5** — S3, the degit fetch-boundary facts — needs its own verification pass (Q2)
</content>
</invoke>
