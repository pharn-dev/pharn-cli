---
file: "LIMITS.md"
trust: trusted
editable_by: "human only"
purpose: "What pharn does NOT guarantee. Labels the irreducible limits and the residual honestly. Required by P0 and P7: a limit sold as a guarantee is the disease this repo exists to prevent."
---

# pharn — Limits (what we do not guarantee)

> Per P0 and P7, this file is not a disclaimer footnote — it is first-class architecture. If a claim
> elsewhere contradicts a limit named here, **the limit wins.**

---

## 1. The irreducible limits

These cannot be reduced to the floor. They are **not bugs to fix** — they are truths to **stop
overselling**. Each has a floor backstop that bounds its blast radius; none has a fix that makes it
a guarantee.

### 1a. pharn validates placement, not content

The floor contains **where** fetched files land (`safeJoin`) and validates their **paths + schema**
— it does **not** vet the **semantic content** of the PHARN methodology it copies. A `module.json`
with perfectly safe paths can still install methodology whose body is whatever the upstream shipped.

- **Struck claim:** "`pharn init` installed it, so the methodology is safe."
- **True statement:** pharn guarantees the files landed in `.claude/` without escaping; content
  trust is **provenance** (`pharn-dev/pharn-oss`) + the **user's review**.
- **Backstop (floor):** `INSTALL_PATH_RE` + `safeJoin` bound a hostile module to content **inside**
  `.claude/`, never an arbitrary-path write.

### 1b. Trust in the remote is provenance, not cryptographic

pharn records a `commit` SHA (best-effort via the GitHub API) but fetches from a mutable remote
via `degit`; it stores **no signature and no upstream-authenticating hash**. The per-file sha256s it
does store ([`pharn.records.json`](docs/reference/pharn-records.md)) are taken from the **written
file, never from the upstream source** — dest-side drift baselines, provenance-neutral by
construction. A compromised or MITM'd upstream serving valid-shaped content passes the structural
floor.

- **Struck claim:** "the pinned commit proves the installed bytes are authentic."
- **True statement:** the `commit` records **which ref** was installed; it does not cryptographically
  verify the **bytes**. Only `redirect: 'error'` + timeout + size-cap + path validation are actually
  guaranteed.
- **Backstop (floor):** the network + path floor bounds a hostile upstream; it never turns provenance
  into proof.

### 1c. `pharn.config.json` is an advisory record, not a live guarantee

`pharnVersion` / `skillsVersion` / `modules[]` / `installedSkills[]` record what a run **intended**
to install. The file is plain JSON the user can edit, and it is not re-verified against the
filesystem except when `status` runs.

- **Struck claim:** "the config says module X is installed, therefore its exact files are present and
  unmodified."
- **True statement:** the config is a record of **intent**; actual on-disk state is derived **live**
  by `pharn status` / `diff` (against `@main`, not the pinned `commit`). "installed per config" ≠
  "these exact bytes present" until `status` is run.
- **Backstop:** `pharn status` re-derives drift live — that is the guarantee, not the config field.

### 1d. `update` / `status` resolve against `@main`; `remove` resolves offline

There is no manifest. `update`/`status` re-derive the expected set from a fresh `@main` clone (not the
pinned `commit`), while `remove` resolves against **nothing remote** — it is addressed entirely from
`pharn.config.json` via `configLayout` (`src/commands/remove.ts:12`, `:212`, `:307`). An upstream
**rename** lands at two levels: a renamed **capability** surfaces in `update`'s membership report as
`dropped-gone` / `added` (`src/lib/merge-capabilities.ts:79`, `:201`), while a renamed **file inside** a
capability is restored at its new path and the old copy is left on disk — `update` never deletes
(`src/commands/update.ts:452`).

- **Struck claim:** "`remove`/`update` always know exactly what the pinned version installed."
- **True statement:** `update`/`status` reconstruct from the **current** upstream, so a capability
  renamed since the pin is **reported**, never guessed; `remove` reconstructs from the **recorded
  config**, deleting the directory the recorded `layout` addresses for that capability
  (`src/commands/remove.ts:72`) and pruning that capability's entries from `pharn.records.json`
  (`:117`).
- **Backstop:** every one of those paths is `safeJoin`-contained. Two residuals remain named: a file
  **orphaned by an upstream rename** — `update` restores the new path, leaves the old one, and reports
  nothing, bounded to the install subtree and visible to `pharn status`; and `remove`'s delete takes the
  **whole directory** at that address, including files you added inside it.

---

## 2. The residual (named, bounded, not zeroed)

pharn validates **structure** (paths contained, schema known, fetch bounded) but cannot validate
the **semantic safety** of the methodology content it installs (`THREAT-MODEL.md §5`). "Installed
cleanly" = "landed without escaping," **not** "safe or correct." Co-located: when the dev-loop
reviews the pharn code it builds, a finding's free-text is untrusted data; the enum-gated split
bounds it but does not zero it. This is the one place trust rests on **provenance + review**, not the
floor.

---

## 3. Operational limits (known constraints, not solved)

State these honestly; do not pretend they are free.

### 3a. Network + git dependency

`init` / `add` / `update` require a network and a working `degit`/`git`. There is no offline or
air-gapped install path today.

### 3b. GitHub API rate limits

The `commit` SHA is fetched best-effort via the GitHub API; unauthenticated rate limits can make it
unavailable, so `commit` may be **absent** — the install still proceeds (an advisory field, never a
gate).

### 3c. Single-source coupling

Modules are fetched from **one** configured repo (`pharn-dev/pharn-oss`) via `degit`; there is no
mirror or failover. Upstream availability is a hard dependency.

### 3d. Claude Code only (today)

Installs target `.claude/`. **Codex and Cursor are Coming soon** (P7) — explicitly deferred, not
silently unsupported.

---

## 4. What "good" means here

Per P0, claiming pharn is "proven safe" would be the exact disease this repo prevents. The honest
standard:

- Every _guarantee_ reduces to the floor (`ARCHITECTURE.md §2`) **or** is labeled `advisory`.
- The known threats (`THREAT-MODEL.md §2–§4`) are closed or labeled.
- The irreducible limits (§1) are named, not hidden, and backstopped.
- The one residual (§2) is named.

"Good" = known holes closed or labeled, and limits honest. **Not** "no holes."
