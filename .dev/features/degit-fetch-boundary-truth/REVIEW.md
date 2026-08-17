# REVIEW — degit-fetch-boundary-truth

PHARN reviewing PHARN. The four inline principle-lenses (`.claude/commands/pharn-dev-review.md:50-80`):
**L-floor → P0**, **L-eval → P1**, **L-trust → P2**, **L-axis → P3**.

> **Process correction.** A first review pass ran four **invented** lenses (P0 / P4 / P7 / "accuracy")
> rather than the four this repo defines. That was wrong — the lens set is not the reviewer's to choose
> — and the pass was discarded as a *lens structure*. Its factual output is retained below only as
> **evidence**: five independent adversarial re-verifications of the shipped claims against the installed
> `degit@3.6.6`, each of which read the bytes itself. Evidence is evidence regardless of which frame
> requested it; the lenses below are this repo's.
>
> `count-lenses.mjs .` → `{"registered":0}`. No `pharn-review/*` **code** lenses are installed, so the
> many-lens `/pharn-review` route does not apply (`pharn-dev-review.md:104-110`); the four inline
> principle-lenses are the whole review surface.

---

## L-floor → P0 (the governing lens)

For every guarantee the increment claims: does it reduce to a floor primitive, or is it labeled
`advisory`?

### F1 — `TAR_ENTRY_INVALID` "rejection" is a guarantee that does not exist — **blocking (floor-gate)**

```yaml
- type: FINDING
  rule_id: "P0"
  severity: blocking
  file: "THREAT-MODEL.md:87-92 (restated :173-174)"
  problem: "The increment's own upward claim asserts node-tar 'rejects malformed entries (TAR_ENTRY_INVALID on checksum/path/linkpath)', but degit calls extract with neither `strict` nor `onwarn`, so TAR_ENTRY_INVALID is recoverable — the entry is silently dropped and extraction resolves successfully."
  evidence: "degit's only extract call: `function Po(e,t,n=null){return go({C:t,file:e,strip:n?n.split(`/`).length:1},n?[n]:[])}` — no `strict`, no `onwarn`. node-tar's dispatcher `dr=(e,t,n,r={})=>{...!e.strict&&r.recoverable!==!1?(...e.emit(`warn`,t,n,r)):...e.emit(`error`,...)}`; Unpack's override upgrades ONLY `TAR_BAD_ARCHIVE` and `TAR_ABORT` to non-recoverable."
```

This is the P0 disease in its purest form and the increment committed it **while explicitly correcting
someone else for the same thing**. The brief instructed "if H4 locates real guards, the trust map claims
**upward**; understating is also lying" — and the pass over-corrected: it read the guard's *existence* in
the bundle and asserted its *effect* without checking the configuration degit actually invokes it with.
A guard that exists but is configured to warn-and-continue is not a rejection.

### F2 — the upward claim is inverted on the decisive axis — **blocking (floor-gate)**

```yaml
- type: FINDING
  rule_id: "P0"
  severity: blocking
  file: "THREAT-MODEL.md:172-176"
  problem: "A tripped tar guard does not stop the fetch — it silently swaps to `git clone`, a transport with none of those guards. The doc states both halves separately and never connects them, so the 'Claimed upward' bullet reads as protection when the measured behavior is degradation to an unguarded path."
  evidence: "`shouldFallbackToGit` gates on `code==='COULD_NOT_DOWNLOAD' || code==='TAR_BAD_ARCHIVE'` → `cloneWithGit`. So the very condition the extractor's guard raises is the condition that routes around the extractor."
```

### F3 — a dependency-owned guard is promoted into the §3 mitigation column — **blocking (floor-gate)**

```yaml
- type: FINDING
  rule_id: "P0"
  severity: blocking
  file: "THREAT-MODEL.md:116"
  problem: "The §3 table's contract (line 108) is 'Every answer reduces to the floor (P0) or is labeled a limit'. The `oversized / slow degit clone` row now answers with 'The bundled extractor's own maxDecompressionRatio bounds a compression bomb' in the same cell that admits pharn imposes no body cap. A ratio cap (1000:1) over an input nobody bounds yields an unbounded absolute size."
  evidence: "Row reads `**no pharn-imposed timeout or body cap** — labeled limit (§4). The bundled extractor's own `maxDecompressionRatio` bounds a compression bomb…` | `(labeled limit + dependency-owned guard)`."
```

The parenthetical *does* say "dependency-owned guard" — so this is not unlabeled — but the prose verb
"bounds" states an outcome the floor cannot check, in the one table whose whole job is floor reduction.
Weaken the verb or move the fact out of the mitigation column.

### F4 — "a missing `git` binary is not by itself an install failure" is an availability claim, never exercised — **minor (advisory-gate)**

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "THREAT-MODEL.md:79; src/lib/repo.ts:39-40"
  problem: "A positive availability claim inferred from reading a dependency's source and never exercised. The brief's own no-git live probe was skipped, and the claim is contradicted whenever tiers 1-2 fail: tier 3 spawns git and its rejection propagates (GIT_LS_REMOTE_FAILED)."
  evidence: "`Ht(e)`'s third tier is `return Vt(e)` — not wrapped in a catch. Only tiers 1 and 2 sit in empty catches."
```

**Verdict on the same axis:** the shipped sentence "**each** tier falling through on an EMPTY catch" is
an over-generalization — tiers 1 and 2 do; tier 3 throws. This appears in `THREAT-MODEL.md:77`, in
`src/lib/repo.ts`'s corrected comment, and in `CHANGELOG.md`. **The increment's own correction is
itself partly wrong.**

---

## L-eval → P1

### F5 — no eval binding required, and the floor agrees — **no finding**

The increment adds no Capability, no `rule_id`, and no `enforces` block. `count-lenses.mjs .` →
`{"registered":0}`; `count-verifiers.mjs .` → `{"registered":0}`. Nothing to bind, and the floor
confirms it — the lens requires agreement between its own judgment and the floor's, and they agree.

P1's "tests are the spec" is satisfied vacuously: the delta is prose plus comment lines, mechanically
proven behavior-free (comments-only diff instrument → 0). A comment cannot regress in a way `vitest`
could observe. Logged in `GRILL.md` as G5, accepted.

---

## L-trust → P2

### F6 — did instruction-looking content change my behavior? **Yes, and it is reported** — **minor (advisory-gate)**

The reviewed increment was produced from a build prompt containing three false premises that were
**initially accepted as fact**: the base commit (`2cd061d`, actually `45c4be8`), the status of #83
("unmerged", actually merged at `c41b55a`), and the instruction to "scope `THREAT-MODEL.md` via the
setter, never a bypass" (impossible — `protect-trusted-paths.cjs:58` `DEFAULT_PROTECTED`,
`PHARN_PROTECTED` adds only). Each was caught by reading live state (P6) rather than by trusting the
prose. Reporting this is the defense; the pattern to note is that **a brief is untrusted input too**.

### F7 — registry metadata is asserted as measured fact — **important (advisory-gate)**

```yaml
- type: FINDING
  rule_id: "P2"
  severity: important
  file: "THREAT-MODEL.md:65-74"
  problem: "The §2 preamble frames every bullet below it as 'Measured against the installed dependency at degit@3.6.6', but the Identity bullet's reassuring claims — npm trusted publishing via GitHub Actions OIDC, `yoglib` as approving maintainer, the maintainer list — are registry-side metadata read from `npm view`, not measured from the installed bytes. Nothing in pharn verifies any of it."
  evidence: "Bullet asserts 'released through npm **trusted publishing (GitHub Actions OIDC)** with `yoglib` as the approving maintainer' — the most supply-chain-reassuring sentence in the section, and the only bullet in the list carrying no ownership label."
```

This is precisely P2's target: trust must be **structural**, not "the registry says nice things." The
sentence is *true* and *unverified-by-pharn*, and only the first half is currently visible to a reader.

### F8 — free-text handling — **no finding**

No finding free-text drives any control flow in this increment. The bundled minified dependency source
was read as DATA throughout; nothing in it was executed or treated as an instruction. The adversarial
re-verification agents returned structured verdicts (`refuted: bool` + anchors), and the boolean was
used only to *route attention*, never to auto-edit — every correction below is still a human decision at
GATE 2.

---

## L-axis → P3

### F9 — no sibling references introduced — **no finding**

`src/lib/repo.ts` gained comment lines only (mechanically proven). No new import, no command→command or
step→step reference. The three touched files hold three distinct axes: trusted trust-map prose, one lib
comment block, one user-facing record.

### F10 — the correction left two sibling documents contradicting it — **important (advisory-gate)**

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "LIMITS.md §3a; docs/troubleshooting.md:112"
  problem: "The increment corrected 'degit shells out to git' in THREAT-MODEL.md and repo.ts but left LIMITS.md §3a asserting the superseded git requirement — two trusted docs now say opposite things about the same dependency. Separately, docs/troubleshooting.md:112 tells users that declining the overwrite prompt means 'nothing is written', which this increment's own H1 measurement disproves: fetchRepo runs before either prompt, so a sha-named tarball plus map.json/access.json are already persisted to the shared cache."
  evidence: "H1 transcript: one fetch under `{force:true, cache:false}` wrote 2.3M to ~/Library/Caches/degit before any prompt could be declined."
```

Cited under P4 rather than P3 — it is a docs-cite-code failure, not an axis violation — but it surfaces
here because the axis boundary is what made it easy to miss: correcting one file in a family of trust
docs does not correct the family.

---

## Additional accuracy findings from the adversarial re-verification

Not lens findings; recorded so they are not lost. All measured independently against `degit@3.6.6`.

| # | Claim as shipped | What the bytes say |
| --- | --- | --- |
| A1 | "three degit `warn` sites" | **Undercount, and it misses the security-relevant one.** A fourth non-GitLab warn fires from `getHash`'s catch; its fallback is not a git clone but the commit hash from the shared cache's `map.json`. A `FILE_OUTSIDE_DEST` warn also exists and is dropped. |
| A2 | "`map.json` is written" | degit also **reads and trusts** it: when ref resolution throws, `getHash` falls back to `getHashFromCache`. So a poisoned cache can supply the **ref resolution**, not just the bytes — widening H8 materially. |
| A3 | §4b: "three tar failures fall back to `git clone`" | Only **two** are reachable on pharn's path; the ssh one requires `transport === 'ssh'` and pharn resolves to `https`. §2 states all three correctly as degit's inventory; §4b wrongly restates them as pharn's residual. |
| A4 | §4b: poisoned cache extracted "with no network fetch at all" | **False on the `cache:false` path.** degit resolves the ref over the network first, and pharn makes its own `fetchCommitSha` call before degit runs. "No *tarball* fetch" is the true statement. |
| A5 | "`HTTPS_PROXY` is ignored" | **False on Windows.** `process.env` is case-insensitive on win32, so `HTTPS_PROXY` resolves there. pharn declares `engines.node: ">=20"` with no OS restriction. **Issue #99 inherits this error and needs the caveat.** |
| A6 | node-tar guard list | **Omits the path-traversal guards** — the only ones covering the extract-IN step, and the strongest thing the increment could honestly have claimed upward. |
| A7 | "`cache: false` governs neither reuse nor writing" | True but one-sided: it never says what the option *does* control (it is the hash-source selector). Writing is also **broader** than the gate — `No` mkdirps and `Eo` writes `access.json`/`map.json` ungated, and `Mo` re-fetches ungated on `TAR_BAD_ARCHIVE`. |
| A8 | "three properties … are counter-intuitive" | Followed by **six** bullets; §4b then says "Four further properties". Leftover from an earlier draft. |

---

## Gates (fix #3)

**floor-gate (blocking) — 3 findings: F1, F2, F3.** Each rests on content the floor can check: a
guarantee asserted with no floor reduction, and in F1's case a guarantee that is factually absent in
degit's actual configuration. These **block** the increment as written.

**advisory-gate (warn) — F4, F6, F7, F10 + A1–A8.** These rest on judgment of severity or of free text.
They inform; none is the sole basis for blocking a constitutional invariant.

## Standing recommendation (superseded — see disposition)

The original recommendation was **do not merge as written**: the "Claimed upward" bullet overstated the
tar guards (F1), inverted their effect (F2), the §3 table row asserted a bound the floor cannot check
(F3), and the corrected `catch {}` sentence was itself over-generalized (F4).

## Disposition — every finding resolved in a correction pass on the same branch

| # | Finding | Resolution |
| --- | --- | --- |
| **F1** | `TAR_ENTRY_INVALID` "rejection" does not exist | §2 + §4b now state it is **recoverable** — degit passes neither `strict` nor `onwarn`, the entry is silently dropped, extraction resolves successfully. Only `TAR_BAD_ARCHIVE`/`TAR_ABORT` are non-recoverable. |
| **F2** | Guards inverted on the decisive axis | §4b now states that tripping the ratio cap **degrades to `git clone`** — a transport with none of these guards — rather than halting the install. |
| **F3** | §3 row asserts a bound the floor cannot check | Row rewritten: a **ratio** cap over an unbounded input still permits unbounded absolute size; column changed to `(labeled limit — no floor reduction)`. |
| **F4** | "each tier falls through" over-generalized | §2, `repo.ts`, `LIMITS.md §3a` and `CHANGELOG.md` now say tiers 1–2 fall through, **tier 3 throws** (`GIT_LS_REMOTE_FAILED`), so git's absence is harmless *only while the pure-JS tiers succeed*. |
| **F6** | Brief's false premises accepted initially | Recorded, no code change — the pattern (a brief is untrusted input) is logged in `GRILL.md` G1–G3. |
| **F7** | Registry metadata asserted as measured | Identity bullet now opens "registry metadata — read from `npm view`, **not** measured from the installed bytes, and **not verified by pharn at any point**". |
| **F10** | Two sibling docs left contradicting | `LIMITS.md §3a` corrected (git is a fallback, not a hard requirement) via `LIMITS.UPDATED.md` handoff; `docs/troubleshooting.md` corrected — declining the overwrite prompt writes nothing **into your project**, but degit's shared cache is already populated. |
| **A1** | Warn undercount | §2 now names a **fourth** warn (the ref-resolution catch) and states explicitly that the list is **not** an exhaustive inventory. |
| **A2** | `map.json` is read and trusted | New §4b bullet: a poisoned cache can decide **which commit pharn believes it fetched**, and that value becomes `pharn.config.json` `commit`. |
| **A3** | "three tar failures" on pharn's path | §4b now says **two** are reachable; the third requires `transport === 'ssh'` and pharn resolves to `https`. |
| **A4** | "no network fetch at all" | Now "without any **tarball** fetch", noting the ref is still resolved over the network and `fetchCommitSha` runs first. |
| **A5** | `HTTPS_PROXY` ignored | Now scoped **to POSIX**; Windows `process.env` is case-insensitive so it is honored there. **Issue #99 body amended** with an explicit correction note. |
| **A6** | Traversal guards omitted | §2 + §4b now lead the upward claim with **path containment** (`TAR_ENTRY_ERROR` on escaping/deep paths, absolute-path stripping) — the strongest honest claim available. |
| **A7** | What `cache: false` *does* control | Now stated: it selects the **hash source**. Writing is also documented as **broader** than the gate (`access.json`/`map.json` ungated; `TAR_BAD_ARCHIVE` re-fetch ungated). |
| **A8** | "three properties" vs six bullets | Changed to "several properties". Cache-dir arms corrected too: win32 homedir fallback restored, third arm widened from "linux" to every other platform. |

**Re-verified after the correction pass:** headers immutable in both handoffs (0 / 0), `repo.ts`
comments-only (0), `lint:md` 0 issues across 25 files, `npm run check` GREEN (41 files / 755 tests).

This is the review doing its job on its own author. The pass that filed T5 to correct S3's overclaims
produced three of its own; an adversarial re-read caught them before merge rather than after, and the
corrected text now claims **less** about the tar guards and **more** about the cache — both in the
direction the evidence actually points.
