---
file: "THREAT-MODEL.md"
trust: trusted
editable_by: "human only"
purpose: "The security foundation for pharn. Defines the surfaces, the attack surface of consuming untrusted remote content, and how the validation floor answers each. Elaborates P2; never contradicts CONSTITUTION.md."
---

# pharn — Threat Model

> Read `CONSTITUTION.md` (esp. P0, P2) and `ARCHITECTURE.md §2, §5, §7` first.

---

## 1. The surfaces — keep them separate

Conflating "the code we install" with "the code we run" is the most common mistake here.

- **Surface A — the content pharn _writes_ into the user's repo.** pharn copies PHARN
  methodology files (markdown + a few `.cjs`/`.mjs`) into `.claude/`. **pharn never executes
  them** — Claude Code does, later, on the user's machine. Whether that methodology is itself correct
  or safe is pharn-oss's concern and the user's review, not pharn's runtime. **Not the subject of
  this document.**
- **Surface B — pharn _itself_ consuming hostile remote input.** A compromised, forked, or
  MITM'd source repo serving a poisoned `manifest.json` / `module.json` / `degit` tree. This is
  **architecture** — where the trust boundaries sit — and cannot be bolted on later. **This document
  is B.**
- **Surface B′ — the dev-loop _building_ pharn**, an agent reading hostile context (an issue, a
  PR, another model's output). Answered by the `writes:`-scope + trusted-file write-guard hooks
  (`ARCHITECTURE.md §3.3`).

The framing axiom: **pharn may not assume the remote is honest just because the URL says
`pharn-dev/pharn-oss`.** Defense rests on structural validation independent of "the repo is ours" —
the floor (`ARCHITECTURE.md §2`).

---

## 2. B's attack surface (name it explicitly)

pharn fetches a manifest, per-module `module.json`, and `degit`-clones a subtree, then copies
files into the user's `.claude/`. The concrete surface:

1. **Malicious `installs` / skill path** — a `module.json` `installs` map or a skill `from` path
   containing `..`, an absolute path, or control chars → a write **outside `.claude/`** (arbitrary
   file overwrite in the user's repo). The highest-value target.
2. **Malformed `schemaVersion`** — an unknown version, to make an old CLI **guess** at a new schema.
3. **Malformed `wizard` block (v2)** — broken `sections`/`questions`/`options`, to crash or
   mis-drive the questionnaire into an unintended install set.
4. **Oversized / slow response** — a huge manifest or a hanging fetch → DoS the install.
5. **Redirect to an attacker host** — a 3xx from the fetch endpoint to an off-repo sink.
6. **The copied methodology itself (Surface A)** — validated for **placement**, not for semantic
   content.
7. **Stale / renamed upstream paths** — `update`/`remove`/`status` resolve against `@main` HEAD (not
   the pinned `commit`), so an upstream rename can orphan or re-target a path.

---

## 3. How the architecture answers each (map to the floor)

Every answer reduces to the floor (P0) or is labeled a limit (`LIMITS.md`).

| Surface | Structural answer | Floor primitive |
| --- | --- | --- |
| malicious `installs` / skill path | `INSTALL_PATH_RE` + `..`/control-char rejection; `safeJoin` guards **every** copy; `assertSkillSourcesExist` (no partial installs) | regex + path containment |
| malformed `schemaVersion` | exact-match `1`\|`2`, else **hard-fail** | enum check |
| malformed `wizard` | `parseWizard` hard-fails **naming** the offending section/question/option; never a silent v1 fallback | shape check |
| oversized / slow fetch | 256KB body cap + 8s timeout | network guard |
| redirect to attacker host | `redirect: 'error'` | network guard |
| copied methodology (Surface A) | validated for placement only; content trust is provenance + user review (`LIMITS.md §1`) | (labeled limit) |
| stale / renamed upstream | drift derived live; a missing `from` is **reported**, never guessed | (reported, labeled) |

---

## 4. Residuals the design accepts (labeled, not hidden — `LIMITS.md`)

- **4a. Provenance, not verification.** pharn trusts the configured source repo by **provenance**
  (plus validation), not by a signature over a release. A compromised upstream serving valid-**shaped**
  but malicious methodology passes the structural floor. _Backstop:_ the floor still contains **where**
  bytes land (`safeJoin`) and **how** they are fetched (guards) — a hostile upstream is bounded to
  "content inside `.claude/` you can read and review," never arbitrary-path write or off-host egress.
- **4b. No stored content-hash of installed files.** `status`/`diff` re-derive the expected byte set
  **live** against `@main`, not against a per-file hash pinned in `pharn.config.json`. _Backstop:_
  drift **is** detected (`pharn status`) — just live, not against a stored baseline.

---

## 5. The one residual (named, bounded, not zeroed)

pharn validates the **structure** of what it installs — paths contained, schema known, fetch
bounded — but it does not, and cannot, validate the **semantic safety** of the PHARN methodology
content it copies verbatim into `.claude/`. **"It installed cleanly" means "it landed where it
should without escaping," NOT "the installed methodology is correct or safe to run."** That judgment
belongs to pharn-oss (the source) and the user's review.

Co-located: when the **dev-loop** reviews the pharn code it builds, a finding's free-text
(`problem`, `evidence`) inherits the reviewed code's untrusted tag (`ARCHITECTURE.md §8`) — bounded
by the enum-gated split, not zeroed. This is the one place the trust model rests on **provenance +
review**, not on the floor.
