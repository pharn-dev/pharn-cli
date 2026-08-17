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
  MITM'd `pharn-dev/pharn-oss` serving a poisoned `degit` tree (capability frontmatter,
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

pharn `degit`-clones the whole pharn-oss repo (`src/lib/repo.ts` → `fetchRepo`), derives the
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
3. **Oversized / slow response** — a huge clone or a hanging fetch → DoS the install. The
   lightweight `SKILLS_VERSION` fetch and the commit-SHA resolve have pharn-imposed bounds; the
   `degit` clone does **not** (see §4).
4. **Redirect to an attacker host** — a 3xx from a `fetch()` endpoint (`SKILLS_VERSION`,
   commit metadata) to an off-repo sink. The `degit` path is separate — GitHub tarball delivery
   through the `degit` dependency, whose measured mechanics are described immediately below.
5. **The copied methodology itself (Surface A)** — validated for **placement**, not for semantic
   content.
6. **Stale / renamed upstream paths** — `status`/`update`/`diff` resolve against `@main` HEAD (not
   the pinned `commit`), so an upstream rename can orphan or re-target a path.
7. **The shared `degit` tarball cache** — a cross-project, on-disk directory pharn writes to on
   every fetch and reads from without a digest check (see the cache paragraph below, and §4b).

**The `degit` boundary, measured.** The description above says "pharn `degit`-clones"; what that
delegates is worth naming precisely, because three properties of it are counter-intuitive. Measured
against the installed dependency at **`degit@3.6.6`** (the version `package-lock.json` pins;
`package.json` declares the range `^3.6.1`):

- **Identity.** `degit` is published from `github.com/Rich-Harris/degit`, maintained by
  `rich_harris` and `yoglib`, and released through npm **trusted publishing (GitHub Actions OIDC)**
  with `yoglib` as the approving maintainer. It declares **no runtime `dependencies`** — its git
  client and tar implementation are **bundled into the published tarball** (`dist/*.js`), so a
  dependency-tree audit of pharn will not show them and `npm ls` cannot reach them.
- **Ref resolution is three-tier, and the git binary is a last resort.** degit tries pure-JS
  `listServerRefs`, then `getRemoteInfo2`, and only then spawns `git ls-remote --symref`
  (`dist/client-*.js`). Each tier falls through on an **empty `catch {}`**, so the fallback is
  silent and pharn cannot distinguish "resolved over HTTP" from "shelled out to git." A missing
  `git` binary is therefore not by itself an install failure.
- **`cache: false` is not no-cache.** pharn passes `cache: false` (`src/lib/repo.ts`), but degit's
  entire download step runs **inside** `if (!options.cache)`: it **reuses** an existing tarball at
  the cache path when one is present, and otherwise creates that path and downloads **into** it.
  Every fetch therefore leaves a SHA-named `.tar.gz` plus `map.json` and `access.json` in a shared,
  cross-project cache directory — `~/Library/Caches/degit` on darwin, `$XDG_CACHE_HOME ?? ~/.cache`
  then `/degit` on linux, `%LOCALAPPDATA%/degit` on win32. Note `XDG_CACHE_HOME` is **not** consulted
  on darwin. Extraction also stages into a temp dir **inside** that cache directory.
- **Tar handling is bundled node-tar, and it carries real guards.** Extraction enforces a
  `maxDecompressionRatio` (aborting with `max decompression ratio exceeded`), strips absolute paths
  unless `preservePaths` is set — degit does not set it — and rejects malformed entries
  (`TAR_ENTRY_INVALID` on checksum/path/linkpath, `TAR_BAD_ARCHIVE` on unrecognized or truncated
  input). These are the extractor's own guards, not pharn's, and pharn's `safeJoin` + symlink
  rejection still gate everything copied **out** of the clone.
- **degit reads `process.env.https_proxy` itself.** Its constructor assigns
  `this.proxy = process.env.https_proxy` unconditionally and routes downloads through a bundled
  `https-proxy-agent`. pharn passes no `proxy` option, but the environment reaches the fetch
  regardless. Only the **lowercase** name is read — `HTTPS_PROXY`, `no_proxy`, and `ALL_PROXY` are
  ignored.
- **degit's `warn` events are dropped by pharn, not by degit.** degit emits `warn` on three
  tar→`git clone` fallbacks (ssh transport, a git-LFS pointer in the snapshot, and a failed tarball
  download or extraction). Its own CLI registers a listener and prints them; `fetchRepo` registers
  none, so on pharn's path the transport can silently change from an HTTP tarball to a spawned
  `git clone` with no signal to the user. The silence is pharn's.

---

## 3. How the architecture answers each (map to the floor)

Every answer reduces to the floor (P0) or is labeled a limit (`LIMITS.md`).

| Surface | Structural answer | Floor primitive (current file/function) |
| --- | --- | --- |
| malicious capability / product path | `CAPABILITY_NAME_RE` / `COPY_FILENAME_RE` + `..`/control-char rejection (`assertSafeString`, `assertNoDotDot` in `src/lib/validate.ts`); `safeJoin` guards **every** read/write in `parseCapabilityIndex`, `installCapabilityDirs`, `copyFilteredDir`, `collectExpectedInstallPaths`, `diffInstalledCapabilities`, and `remove`; symlink rejection at copy roots (`isSymlink` / `noSymlinks` in `src/lib/install-capabilities.ts`); pre-flight every capability source before any write (`installCapabilityDirs`) | regex + path containment + symlink backstop |
| malformed capability frontmatter | `parseCapabilityIndex` hard-fails naming the offending capability on missing subtree/markdown, unknown `role` (`assertRole`), unknown `applies` token (`assertAppliesToken`), or subtree/role mismatch — never a silent skip | shape check |
| oversized / slow `SKILLS_VERSION` fetch | 256 KB body cap + 8s timeout + `redirect: 'error'` | `fetchRemoteSkillsVersion` (`src/lib/skills-version.ts`) |
| oversized / slow commit-SHA resolve | 8s timeout + `redirect: 'error'` (JSON body; no separate cap) | `fetchCommitSha` (`src/lib/repo.ts`) |
| oversized / slow `degit` clone | **no pharn-imposed timeout or body cap** — labeled limit (§4). The bundled extractor's own `maxDecompressionRatio` bounds a compression bomb, but it is degit's guard, not pharn's | (labeled limit + dependency-owned guard) |
| redirect to attacker host (lightweight fetches) | `redirect: 'error'` on every pharn `fetch()` call | `fetchRemoteSkillsVersion`, `fetchCommitSha` |
| poisoned entry in the shared `degit` cache | **none in pharn** — reuse is keyed by filename, not a verified digest — labeled limit (§4b) | (labeled limit) |
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
- **4b. The `degit` clone is delegated, and pharn bounds none of it.** `fetchRepo` hands the
  full-tree download to `degit` with no timeout and no body cap in pharn code, so a pathological
  upstream tarball can still DoS an install. Four further properties of that delegation are residuals
  in their own right, all measured at `degit@3.6.6` (§2):
  - **The shared cache is real state pharn does not control.** `cache: false` suppresses neither the
    write nor the reuse; every fetch persists a SHA-named tarball into a cross-project cache
    directory, and a later fetch **reuses whatever file sits at that path**. Reuse is keyed by
    **filename, not a verified digest**, so anything able to write
    `<cache>/github/<owner>/<repo>/<sha>.tar.gz` can have pharn extract those bytes with no network
    fetch at all. Pinning to a commit SHA does **not** close this: the SHA is the file's _name_, never
    a checked property of its contents.
  - **The transport can change silently.** Ref resolution falls through pure-JS tiers to a spawned
    `git ls-remote` on empty `catch {}`, and three tar failures fall back to a spawned `git clone`.
    degit emits `warn` at those fallback sites; pharn registers no listener, so neither the user nor
    the install record learns which transport actually ran.
  - **The environment reaches the fetch.** degit reads `process.env.https_proxy` itself and routes
    downloads through a bundled `https-proxy-agent`, so an attacker-controlled environment can
    interpose on the clone even though pharn passes no proxy option. The lowercase-only read also
    means `HTTPS_PROXY` is silently ignored — a footgun in both directions.
  - **Claimed upward:** extraction is **not** unguarded. The bundled node-tar enforces a
    `maxDecompressionRatio`, strips absolute paths (degit leaves `preservePaths` unset), and rejects
    malformed entries (`TAR_ENTRY_INVALID`, `TAR_BAD_ARCHIVE`). Understating this would be as
    dishonest as overstating it — but the guards belong to the dependency, so they are **provenance,
    not pharn floor**, and a degit change could remove them without any pharn test noticing.

  _Backstop:_ the clone lands in a temp dir and only **structurally filtered** subsets are copied
  (`installCapabilities` / `install-manifest.ts`), with `safeJoin` + symlink rejection gating every
  path that leaves it; report bypasses of that filter, not mere size.
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
