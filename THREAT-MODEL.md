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
   commit metadata) to an off-repo sink. The `degit` path is separate (GitHub tarball delivery
   via the `degit` dependency).
5. **The copied methodology itself (Surface A)** — validated for **placement**, not for semantic
   content.
6. **Stale / renamed upstream paths** — `status`/`update`/`diff` resolve against `@main` HEAD (not
   the pinned `commit`), so an upstream rename can orphan or re-target a path.

---

## 3. How the architecture answers each (map to the floor)

Every answer reduces to the floor (P0) or is labeled a limit (`LIMITS.md`).

| Surface | Structural answer | Floor primitive (current file/function) |
| --- | --- | --- |
| malicious capability / product path | `CAPABILITY_NAME_RE` / `COPY_FILENAME_RE` + `..`/control-char rejection (`assertSafeString`, `assertNoDotDot` in `src/lib/validate.ts`); `safeJoin` guards **every** read/write in `parseCapabilityIndex`, `installCapabilityDirs`, `copyFilteredDir`, `collectExpectedInstallPaths`, `diffInstalledCapabilities`, and `remove`; symlink rejection at copy roots (`isSymlink` / `noSymlinks` in `src/lib/install-capabilities.ts`); pre-flight every capability source before any write (`installCapabilityDirs`) | regex + path containment + symlink backstop |
| malformed capability frontmatter | `parseCapabilityIndex` hard-fails naming the offending capability on missing subtree/markdown, unknown `role` (`assertRole`), unknown `applies` token (`assertAppliesToken`), or subtree/role mismatch — never a silent skip | shape check |
| oversized / slow `SKILLS_VERSION` fetch | 256 KB body cap + 8s timeout + `redirect: 'error'` | `fetchRemoteSkillsVersion` (`src/lib/skills-version.ts`) |
| oversized / slow commit-SHA resolve | 8s timeout + `redirect: 'error'` (JSON body; no separate cap) | `fetchCommitSha` (`src/lib/repo.ts`) |
| oversized / slow `degit` clone | **no pharn-imposed timeout or body cap** — labeled limit (§4) | (labeled limit) |
| redirect to attacker host (lightweight fetches) | `redirect: 'error'` on every pharn `fetch()` call | `fetchRemoteSkillsVersion`, `fetchCommitSha` |
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
- **4b. No pharn-imposed bounds on the `degit` clone.** `fetchRepo` delegates the full-tree download
  to `degit` with no timeout or body cap in pharn code. A pathological upstream tarball can still DoS
  an install. _Backstop:_ the clone lands in a temp dir and only **structurally filtered** subsets are
  copied (`installCapabilities` / `install-manifest.ts`); report bypasses of that filter, not mere size.
- **4c. No stored content-hash of installed files.** `status`/`diff` re-derive the expected byte set
  **live** against `@main`, not against a per-file hash pinned in `pharn.config.json`. _Backstop:_
  drift **is** detected (`pharn status`) — just live, not against a stored baseline.

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
