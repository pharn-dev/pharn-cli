---
file: "THREAT-MODEL.md"
trust: trusted
editable_by: "human only"
purpose: "The security foundation for pharn. Defines the surfaces, the attack surface of consuming untrusted remote content, and how the validation floor answers each. Elaborates P2; never contradicts CONSTITUTION.md."
---

# pharn — Threat Model

> Read `CONSTITUTION.md` (esp. P0, P2) and `ARCHITECTURE.md §2, §5, §7` first. The in-scope vulnerability list lives in `SECURITY.md`; this document is the trust-boundary map and attack/mitigation table for Surface B.

---

## 1. The surfaces — keep them separate

Conflating "the code we install" with "the code we run" is the most common mistake here.

- **Surface A — the content pharn _writes_ into the user's repo.** pharn copies PHARN
  methodology files (markdown + a few `.cjs`/`.mjs`) into `.claude/` and the mirrored
  capability/product paths. **pharn never executes them** — Claude Code does, later, on the
  user's machine. Whether that methodology is itself correct or safe is pharn-oss's concern
  and the user's review, not pharn's runtime. **Not the subject of this document.**
- **Surface B — pharn _itself_ consuming hostile remote input.** A compromised, forked, or
  MITM'd `pharn-dev/pharn-oss` serving a poisoned tree (capability frontmatter,
  directory names, symlinks). This is **architecture** — where the trust boundaries sit — and
  cannot be bolted on later. **This document is B.**
- **Surface B′ — the dev-loop _building_ pharn**, an agent reading hostile context (an issue, a
  PR, another model's output). Answered by the `writes:`-scope + trusted-file write-guard hooks
  (`ARCHITECTURE.md §3.3`).

The framing axiom: **pharn may not assume the remote is honest just because the URL says
`pharn-dev/pharn-oss`.** Defense rests on structural validation independent of "the repo is ours" —
the floor (`ARCHITECTURE.md §2`).

---

## 2. B's attack surface (name it explicitly)

pharn downloads the whole pharn-oss repo as a tarball (`src/lib/repo.ts` → `fetchRepo`), derives the
capability index from the clone's directory tree + markdown frontmatter
(`src/lib/capability-index.ts` → `parseCapabilityIndex`), then copies the resolved capabilities
and fixed product surfaces into the user's project (`src/lib/install-capabilities.ts`). There is
**no** `manifest.json`, **no** per-module `module.json`, and **no** wizard block. The concrete
surface:

1. **Malicious capability / product path** — a poisoned capability directory name, frontmatter
   field, or product command/hook filename containing `..`, an absolute path, or control chars →
   a write **outside the intended subtree** (arbitrary file overwrite in the user's repo). Symlinks
   planted in the clone are a variant (copied verbatim unless rejected). The highest-value target.
2. **Malformed capability frontmatter** — broken `role`/`applies` values, or a capability in the
   wrong subtree, to crash the install or mis-drive selection into an unintended capability set.
3. **Oversized / slow response** — a huge clone or a hanging fetch → DoS the install. Every pharn
   fetch now carries a timeout and a body cap, the clone included: a streamed-byte cap on the
   download and a second cap on the decompressed size (see the fetch boundary below).
4. **Redirect to an attacker host** — a 3xx from any `fetch()` endpoint (`SKILLS_VERSION`, commit
   metadata, the tarball) to an off-repo sink. All three pass `redirect: 'error'`.
5. **The copied methodology itself (Surface A)** — validated for **placement**, not for semantic
   content.
6. **Stale / renamed upstream paths** — `status`/`update`/`diff` resolve against `@main` HEAD (not
   the pinned `commit`), so an upstream rename can orphan or re-target a path.
7. **The archive itself** — entry paths, types, sizes and header fields are attacker-controlled
   bytes, read by pharn's own extractor (see the fetch boundary below).

**The fetch boundary, in pharn's own code.** The clone is one REST resolve followed by a direct
download of `https://codeload.github.com/pharn-dev/pharn-oss/tar.gz/<sha>`, extracted by
`src/lib/tar-extract.ts`. There is **no fetch dependency**: pharn imports nothing to obtain, cache,
or unpack the tree, spawns no `git` binary, and keeps no tarball cache. That matters for this
document specifically — the previous implementation delegated all of it to `degit`, so this section
had to describe _measured properties of a dependency_, which a version bump could move without any
pharn test noticing. Every property below is now pharn's own code, and every one of them is pinned by
a test.

- **One resolve, one download.** `fetchCommitSha` reads the branch head over the GitHub REST API; the
  `COMMIT_RE`-validated result is the last URL segment **and** the recorded `commit`. Nothing
  re-resolves the ref. The previous path resolved it a second time inside the dependency and matched
  the result only against **current ref tips**, so an upstream push landing between the two failed the
  whole command. codeload serves any commit, tip or not, so a mid-fetch push now yields exactly the
  pinned SHA.
- **The network floor applies to the clone, not just the metadata fetches.** `redirect: 'error'`, an
  `AbortController` timeout cleared in `finally`, and a body cap — the same three guards
  `lib/skills-version.ts` carries. The clone's timeout is separately sized (60 s, not 8 s) because it
  must cover a ~2.5 MB streamed body rather than a one-line response. codeload sends **no
  `content-length`**, so the cap is enforced by counting bytes as they stream, and a **second** cap
  bounds the _decompressed_ size — a compression bomb is bounded by neither the header nor the
  archive size.
- **Extraction rejects rather than skips.** This is the deliberate difference from what it replaces.
  The bundled node-tar was called with **neither `strict` nor `onwarn`**, so a `TAR_ENTRY_INVALID`
  (checksum / path / linkpath) was _recoverable_: the entry was silently dropped and extraction still
  resolved successfully. `tar-extract.ts` throws on every one of those. It sorts each header into
  three buckets:
  - **ACCEPT** typeflag `0`/NUL (regular file) and `5` (directory) — the only content types the
    archive holds.
  - **SKIP** typeflag `g` (pax global header) and `x` (pax extended header), advancing past the
    padded payload with **no** path rules applied. Every codeload tarball opens with a
    `pax_global_header` whose single-segment name has no leading component to strip, so an extractor
    that runs the path rules over it rejects every real archive on its first block.
  - **REJECT** `1`/`2` (hard/symlink), `3`/`4` (devices), `6` (fifo), `7`, and any unknown byte. The
    archive contains none today, so a rejection is a real signal rather than noise.
- **Paths are reassembled before they are judged.** The full path is `prefix + '/' + name` — ustar
  splits anything over 100 characters across those two header fields, and a large fraction of the
  live archive's entries use it. Reading `name` alone yields a bare leaf, which the strip-1 rule then
  rejects for having no leading component: a third of the tree silently lost, not merely misplaced.
  After reassembly: absolute paths and `..` segments are rejected, exactly one leading component is
  stripped, every entry must share the **same** root component, and every write resolves through
  `safeJoin` (`src/lib/validate.ts`). Entry count and total extracted bytes are both capped. Header
  checksums are verified, and the GNU base-256 numeric encoding is rejected rather than misparsed.
- **No cache, anywhere.** Each fetch downloads into a fresh `mkdtemp` dir and removes it on both the
  error path and `cleanup()`. The previous implementation left a SHA-named `.tar.gz` plus
  `map.json`/`access.json` in a shared, cross-project cache directory on every fetch, reused entries
  by **filename rather than a verified digest**, and — when ref resolution threw — took the
  ref→commit mapping out of that same cached `map.json`. Both the poisoned-cache surface and the
  cache-as-resolver surface are gone because the cache is gone. Caches already on disk from earlier
  versions are inert but not removed; see `docs/troubleshooting.md`.
- **No proxy support, stated as a limit.** Node's global `fetch` reads **no** proxy environment
  variable, on any platform. The previous dependency read `process.env.https_proxy` itself — only
  that lowercase spelling, and never `no_proxy`. So a user behind a corporate proxy who succeeded
  before will now fail; `pharn update` and `status --no-drift` already failed for the same reason,
  since those were always plain `fetch`. This makes one boundary consistent rather than newly broken,
  and it is a named limit (`LIMITS.md` §3a), warned about before the fetch rather than surfacing as
  an unexplained timeout.
- **No silent transport change.** The previous path could fall back from an HTTP tarball to a spawned
  `git clone`, or take the commit hash from cache, emitting `warn` events that `fetchRepo` registered
  no listener for — so the silence was pharn's. There are no fallbacks now: the download either
  succeeds at the pinned URL or the command fails.

---

## 3. How the architecture answers each (map to the floor)

Every answer reduces to the floor (P0) or is labeled a limit (`LIMITS.md`).

| Surface | Structural answer | Floor primitive (current file/function) |
| --- | --- | --- |
| malicious capability / product path | `CAPABILITY_NAME_RE` / `COPY_FILENAME_RE` + `..`/control-char rejection (`assertSafeString`, `assertNoDotDot` in `src/lib/validate.ts`); `safeJoin` guards **every** read/write in `parseCapabilityIndex`, `installCapabilityDirs`, `copyFilteredDir`, `collectExpectedInstallPaths`, `diffInstalledCapabilities`, and `remove`; symlink rejection at copy roots (`isSymlink` / `noSymlinks` in `src/lib/install-capabilities.ts`); pre-flight every capability source before any write (`installCapabilityDirs`) | regex + path containment + symlink backstop |
| malformed capability frontmatter | `parseCapabilityIndex` hard-fails naming the offending capability on missing subtree/markdown, unknown `role` (`assertRole`), unknown `applies` token (`assertAppliesToken`), or subtree/role mismatch — never a silent skip | shape check |
| oversized / slow `SKILLS_VERSION` fetch | 256 KB body cap + 8s timeout + `redirect: 'error'` | `fetchRemoteSkillsVersion` (`src/lib/skills-version.ts`) |
| oversized / slow commit-SHA resolve | 8s timeout + `redirect: 'error'` (JSON body; no separate cap) | `fetchCommitSha` (`src/lib/repo.ts`) |
| oversized / slow repo tarball | 60s timeout + a streamed-byte cap on the download + a separate cap on the **decompressed** size + `redirect: 'error'`; entry-count and total-byte caps in the extractor. A trip **throws** — there is no fallback transport to degrade to | `downloadArchive` (`src/lib/repo.ts`), `extractTarGz` (`src/lib/tar-extract.ts`) |
| redirect to attacker host | `redirect: 'error'` on every pharn `fetch()` call, the tarball included | `fetchRemoteSkillsVersion`, `fetchCommitSha`, `downloadArchive` |
| malformed / hostile archive entry | typeflag allowlist (files + dirs only; symlinks, hardlinks, devices and fifos **rejected**), `prefix`+`name` reassembly, `..`/absolute rejection, single-root check, `safeJoin` on every write, header-checksum verification | `extractTar` (`src/lib/tar-extract.ts`) |
| poisoned tarball cache | **not applicable — pharn keeps no cache.** Every fetch downloads into a fresh temp dir | `fetchRepo` (`src/lib/repo.ts`) |
| consent bypass / silent overwrite | install summary confirm (`runArchetypeSummary`); overwrite-conflict list derived from `collectExpectedInstallPaths` + default **No** (`confirmWriteTargets` in `src/steps/overwrite-check.ts`) | consent gate |
| copied methodology (Surface A) | validated for placement only; content trust is provenance + user review (`LIMITS.md §1`) | (labeled limit) |
| stale / renamed upstream | drift derived live; a missing expected path is **reported**, never guessed | `diffInstalledCapabilities` (`src/lib/diff.ts`) |

### 3.1 The config write (`pharn.config.json`) as a sink

Beyond the copied methodology (Surface A), pharn writes one structured file of its
own. `writePharnConfig` (`src/lib/pharn-config.ts`) serializes the config with
`JSON.stringify` to a **fixed, non-attacker-influenced path** — `configPath(cwd)` =
`resolve(cwd, 'pharn.config.json')` — so the sink location is never derived from
remote input. The record mixes local-origin fields (`pharnVersion`, `repo`,
`installedAt`, `modules`, the `models`/`seam` defaults) with three network-derived
ones, and **each network-derived field is validated at its ingest boundary before
it can reach this write** (P0/P2): `skillsVersion` against `VERSION_RE`
(`readSkillsVersion`, `src/lib/skills-version.ts`); every `capabilities[]` name
against `CAPABILITY_NAME_RE` (`parseCapabilityIndex` / `installCapabilityDirs`,
`src/lib/capability-index.ts` + `src/lib/install-capabilities.ts`); and the `commit`
SHA against `COMMIT_RE` — a full 40-hex sha — at the fetch boundary in `fetchRepo`
(`src/lib/repo.ts`), with `null` the documented degraded mode (§4, `LIMITS.md §3b`).
`JSON.stringify` neutralizes structural injection into the file, and the three
boundary validators keep unvalidated remote bytes from being recorded as
provenance — closing the CodeQL `js/http-to-file-access` flow (network → file) with
a named per-field sanitizer, not a "the source repo is ours" assumption (P0).

---

## 4. Residuals the design accepts (labeled, not hidden — `LIMITS.md`)

- **4a. Provenance, not verification.** pharn trusts the configured source repo by **provenance**
  (plus validation), not by a signature over a release. A compromised upstream serving valid-**shaped**
  but malicious methodology passes the structural floor. _Backstop:_ the floor still contains **where**
  bytes land (`safeJoin` + symlink rejection) and **how** the lightweight fetches are bounded — a
  hostile upstream is bounded to "content inside the mirrored install paths you can read and review,"
  never arbitrary-path write via validated names; off-host egress is blocked on pharn's `fetch()` calls.
- **4b. The archive is bounded and strictly parsed, but its CONTENTS are still only provenance.**
  `fetchRepo` now owns the whole download-and-extract path, so the residual is much smaller than it
  was — and what is left is worth stating precisely rather than implying it is closed:
  - **What is now floor, not delegation.** Timeout, streamed-byte cap, decompressed-size cap,
    `redirect: 'error'`, typeflag allowlist, path reassembly + containment, single-root check,
    entry/byte caps, header checksums. Each is pharn's own code with its own test, so a dependency
    bump cannot move any of them. The previous residual — "pharn bounds none of it" — is closed.
  - **What is closed by removal.** The shared cross-project tarball cache is gone, and with it both
    the poisoned-bytes surface (reuse keyed by **filename**, never a verified digest) and the worse
    one beneath it: a poisoned `map.json` could decide **which commit pharn believed it fetched**,
    and that value was what got recorded as `pharn.config.json` `commit`. So could the silent
    transport change from an HTTP tarball to a spawned `git clone`. pharn spawns no `git` and reads no
    cache; the download either succeeds at the pinned URL or the command fails.
  - **What remains.** The bytes are still **unverified**: provenance is by-SHA, not cryptographic
    (§4a, `LIMITS.md` §1b). A compromised upstream serving a valid-shaped tree at the resolved SHA
    passes every check above, because every check above is about **shape and placement**, never
    content. Extraction is also **not transactional** — a mid-extract rejection leaves a partial tree,
    which is why `fetchRepo` removes the temp dir on the error path rather than returning it.
  - **A named regression, not a hidden one.** Node's global `fetch` reads no proxy environment
    variable, so a user behind a corporate proxy who succeeded via the old dependency's own
    `https_proxy` read now fails. `LIMITS.md` §3a carries it, and every network-bearing command warns
    before the fetch when a proxy is configured.

- **4c. The stored content-hashes cover only what pharn wrote, at the matching stamp.** pharn does keep
  a per-file sha256 baseline — [`pharn.records.json`](docs/reference/pharn-records.md), stamped with the
  config's `skillsVersion`/`commit` — and `update` gates every file on it. The residual is its
  **coverage**, not its absence. Where the store is absent or its stamp disagrees, the two directions
  differ: a file **present** on disk becomes `unrecorded`/`unverifiable` and `update` **skips** it rather
  than overwrite (`src/lib/update-decision.ts:64-65`), while a file **absent** from disk is **restored**
  regardless of the store (row 1, `:60`). A file already byte-identical to upstream is never skipped even
  with no records, and its record is refreshed — so a degraded install partially heals, but never for the
  differing files an upgrade needs to touch (`:67-71`). `status` is not record-based at all: its drift is
  a **live `@main` comparison** via `readDiskState` (`src/lib/diff.ts:79`, `src/lib/apply-update.ts:44`),
  which classifies a symlink or non-regular path as `unreadable` rather than hashing it
  (`apply-update.ts:57-61`). _Backstop:_ drift **is** detected (`pharn status`, live), and bytes pharn
  cannot explain are **skipped, never overwritten** without `--force`.

---

## 5. The one residual (named, bounded, not zeroed)

pharn validates the **structure** of what it installs — paths contained, frontmatter enums known,
lightweight fetches bounded — but it does not, and cannot, validate the **semantic safety** of the
PHARN methodology content it copies verbatim into the project. **"It installed cleanly" means "it
landed where it should without escaping," NOT "the installed methodology is correct or safe to
run."** That judgment belongs to pharn-oss (the source) and the user's review.

Co-located: when the **dev-loop** reviews the pharn code it builds, a finding's free-text
(`problem`, `evidence`) inherits the reviewed code's untrusted tag (`ARCHITECTURE.md §8`) — bounded
by the enum-gated split, not zeroed. This is the one place the trust model rests on **provenance +
review**, not on the floor.
