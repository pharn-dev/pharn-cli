# PLAN — proxy-env-notice

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md, read this run)
- increment: Make degit's environment-driven proxy behavior **discoverable from pharn's own output** — one pure detector over `process.env` + `process.platform`, rendered as a `log.warn` immediately before each clone, plus the user-facing doc section that currently does not exist.
- layer(s): pharn-cli `src/lib` (pure detection) + `src/commands` (presentation) + `docs/` — this repo is the installer, not a PHARN layer; `ARCHITECTURE.md §4` layer names do not apply to it (same as every prior `pharn-cli` increment).
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

---

## Decision: Option **1**, widened to cover both directions; Option **3 rejected on measured grounds**

The ship args offered three options. This plan picks **1 (detect and warn)** and extends it by one
branch to also name the *honored* case, because the filing's own harm statement is symmetric
("Neither case is currently discoverable from any pharn output"). It **rejects 3** and treats **2** as
already-done-where-it-can-be-done. Reasons, each grounded in a measurement made this run:

**Why not Option 3 (record it in the config / install summary).** Two independent blockers.

1. **It cannot be honestly worded as a record.** `Ao()` in `dist/src-COTalb41.js` reads:
   `if(!t.cache){ try{ await se(n.file,ce.F_OK); …FILE_EXISTS…; return }catch{} … await t.fetch(n.url,n.file,t.proxy) }`
   — when the SHA-named tarball is already in the shared cache, the function **returns before any
   fetch**, so no proxy is used at all. A tar failure can also fall back to a spawned `git clone`,
   which never receives `t.proxy`. So "a proxy was in effect" is **not derivable from the
   environment**, and writing it into `pharn.config.json` would be a guarantee-shaped claim with no
   floor reduction — a **P0 violation**, compounding `LIMITS.md §1c` (the config is an advisory
   record). What *is* derivable is "degit will read this value", which is a statement about
   configuration, not about the transport — and that belongs in transient console output, not in a
   persisted provenance field.
2. **Credential leak.** `https_proxy` conventionally carries inline credentials
   (`http://user:pass@host:3128`). `pharn.config.json` is written to the project root and is
   git-committed. Recording the value would commit proxy credentials into the user's repository.
   This alone disqualifies Option 3 as filed. (The same hazard forces **redaction** in the console
   message this plan *does* add — see `redactProxyUrl` below.)

**Why Option 2 is already done where an agent may do it.** `THREAT-MODEL.md` §2 and §4b already state
the lowercase-only read **with** the win32 correction, and `CHANGELOG.md` records it (#98). `LIMITS.md`
is on `DEFAULT_PROTECTED` in `.claude/hooks/protect-trusted-paths.cjs:58` — **the build agent cannot
write it** (fix #2); a `LIMITS.md` edit is a human action outside this loop. The doc gap that is both
real and agent-writable is **user-facing**: `grep -rn -i proxy docs/` returns **zero hits**. This plan
closes that, in `docs/troubleshooting.md`, next to the existing degit-cache section (`:114`) that set
the precedent for documenting degit's environment-level side effects.

---

## Measured facts this plan rests on (all re-measured live this run, `degit@3.6.6`)

| # | Fact | How measured |
| - | ---- | ------------ |
| F1 | `this.proxy = process.env.https_proxy` is **unconditional** — there is no `t.proxy ?? …` fallback, so **pharn cannot pass a proxy option**. The only lever is the env var itself. | `grep -oE '.{300}https_proxy.{300}' node_modules/degit/dist/src-COTalb41.js`; `src/degit.d.ts` correctly declares no `proxy` option |
| F2 | Exactly **one** proxy env name exists across every `dist/*.js` chunk: lowercase `https_proxy`. No `HTTPS_PROXY`, `no_proxy`, `NO_PROXY`, `ALL_PROXY`. | `grep -rnoE 'https?_proxy\|HTTPS?_PROXY\|no_proxy\|NO_PROXY\|ALL_PROXY\|all_proxy' node_modules/degit/dist/*.js` → 1 hit |
| F3 | **NEW — refines #98's FACT-TABLE H5 and the ship args.** The `PROXY` event is emitted by `verboseInfo`, defined `verboseInfo(e){this.verbose&&this.info(e)}`. `fetchRepo` passes `{force:true, cache:false}` — **no `verbose`** — so the `PROXY` event **never fires on pharn's path**. H5 and the ship args both say "`Ao()` logs `{code:'PROXY'}`" without the verbose gate; an `emitter.on('info', …)` listener would therefore observe **nothing**. | `grep -oE '.{120}this\.verbose.{200}' …src-COTalb41.js` |
| F4 | The proxy reaches only the **tarball download** (`t.fetch(n.url,n.file,t.proxy)`), inside `if(!t.cache)`, and **after** a `FILE_EXISTS` early return. The bundled `https-proxy-agent` lives in `dist/utils-DCX7uekb.js`. | same `Ao()` extract; `grep -roE '.{250}ProxyAgent.{250}'` |
| F5 | On win32 `process.env` is case-insensitive, so `process.env.https_proxy` resolves an uppercase `HTTPS_PROXY`. `package.json` sets `engines.node ">=20"` with **no** `os` restriction, so both behaviors are in the supported matrix. | Node documented behavior; `grep -n engines -A3 package.json` |

**F3 is the load-bearing new fact:** it closes off the "just listen to the event" design, which would
otherwise look cheaper and more honest than an env read. Observation is unavailable without
`verbose: true`, which would also unleash `FILE_EXISTS` / `DOWNLOADING` / `EXTRACTING` / `FOUND_MATCH`
noise on every run. So an **env read is the only available signal**, and the plan is honest that this
is a statement about *configuration*, never about *the transport that ran*.

---

## Files

> Amended 2026-08-19 after `/pharn-dev-review` — see **Amendment** at the end. Entries added by that
> amendment are marked "(added by amendment)".

- `src/lib/proxy-env.ts` — degit-proxy-behavior logic: the `ProxyNotice` truth table, the
  measured-version membership set, and the one impure read (`resolveDegitProxyRead`). No message strings.
- `src/lib/proxy-env-format.ts` — presentation only: `proxyNoticeMessage` + `redactProxyUrl`. Splits the
  axis the way `model-routing.ts` / `model-routing-format.ts` already do. (added by amendment — review finding P3)
- `src/commands/init.ts` — call site before the fetch spinner.
- `src/commands/add.ts` — call sites before each of the two fetch spinners.
- `src/commands/update.ts` — call site before `const s2 = spinner()`.
- `src/commands/status.ts` — call site inside the drift branch only.
- `tests/proxy-env.test.ts` — truth table, version membership, version read.
- `tests/proxy-env-format.test.ts` — message wording + redaction. (added by amendment)
- `tests/init.test.ts` — wiring + ordering.
- `tests/add.test.ts` — wiring at both add paths. (added by amendment — review finding P1)
- `tests/update.test.ts` — wiring. (added by amendment — review finding P1)
- `tests/status.test.ts` — wiring, and silence under `--no-drift`. (added by amendment — review finding P1)
- `docs/troubleshooting.md` — "Proxy environment variables"; the false pin claim removed.
- `.dev/features/degit-fetch-boundary-truth/FACT-TABLE.md` — H5 corrected: the `PROXY` event is
  `verboseInfo`-gated and never fires on pharn's path. (added by amendment — review finding P6)
- `CHANGELOG.md` — `[Unreleased]` entry.
- `src/lib/repo.ts` — version-scope the degit comments to the measured range. (added by amendment 2 — review finding P0, minor)
- `package-lock.json` — bump the dev/CI degit to the version consumers actually resolve. (added by amendment 2 — review finding P7, minor)

**Not touched:** `src/degit.d.ts`, `pharn.config.json`'s schema, `LIMITS.md` / `THREAT-MODEL.md`
(hook-protected, human-only), and `package.json`'s `^3.6.1` **range** — the published contract is
unchanged; only the lockfile moves.

### Why not in `fetchRepo` (P3, and one concrete bug it avoids)

`repo.ts` is the only fetch-path module with **zero** UI imports, and every one of the five call sites
wraps `await fetchRepo()` in an already-started clack `spinner()`. A `log.warn` from inside `fetchRepo`
would render **into the live spinner frame** and be overwritten. Returning the notice as a field on
`FetchedRepo` was also rejected: it would tie the notice's lifetime to a **successful** clone, so a
clone that fails *because of* the misconfigured proxy — the single most valuable moment to say this —
would print nothing.

---

## Behavior (the truth table `detectProxyNotice` implements)

Lookup rule: on `win32`, scan the env's keys **case-insensitively** for `https_proxy` (modelling Node's
real win32 `process.env`); on every other platform, exact-key lookup only. Empty string counts as unset.

| # | `https_proxy` | `HTTPS_PROXY` | platform | result | rendered as |
| - | ------------- | ------------- | -------- | ------ | ----------- |
| 1 | unset | unset | any | `null` | nothing |
| 2 | unset | **set** | ≠ win32 | `{kind:'ignored'}` | **warn**: `HTTPS_PROXY` is set but the clone reads only lowercase `https_proxy`, so it will connect **directly**; set `https_proxy` to the same value if you meant to proxy. |
| 3 | unset | **set** | win32 | `{kind:'active', value}` | notice (row 4 wording) — win32 resolves it |
| 4 | **set** | either | any | `{kind:'active', value}` | **warn**: the clone **may be routed** through `<redacted>`; degit reads no `no_proxy`/`NO_PROXY`, so proxy exclusions do **not** apply to it. |
| 5 | set, equal to `HTTPS_PROXY` | set | ≠ win32 | `{kind:'active', value}` | row 4 — correctly *not* an "ignored" warning |

**"may be routed", never "was routed"** — F4: a cached tarball short-circuits before the fetch, and a
tar failure degrades to `git clone`, which never receives the proxy. The wording is the P0 label.

`redactProxyUrl` replaces any userinfo component with `***` (`http://u:p@h:3128` → `http://***@h:3128`)
and, on an unparseable value, returns a fixed `"(set)"` rather than echoing raw bytes — the env is
attacker-influencable (`THREAT-MODEL.md §4b`) and its value must not be echoed verbatim into a terminal.

---

## Contracts satisfied

- No `pharn-contracts` schema is touched. This increment adds **no** Capability, **no** `rule_id`, and
  **no** finding — it is installer behavior, so the finding-shape / capability-frontmatter contracts do
  not apply (cited, not restated — P4).
- `THREAT-MODEL.md §4b` "The environment reaches the fetch" — this increment gives that named residual
  its first *user-visible* surface. The residual is **not closed** and this plan does not claim it is.

## Evals to write (P1)

`tests/proxy-env.test.ts` — one case per truth-table row, each **demonstrating** behavior, not asserting existence:

- row 1 → `detectProxyNotice({}, 'linux')` === `null`; also `{https_proxy:''}` → `null` (empty ≠ set)
- row 2 → `{HTTPS_PROXY:'http://p:3128'}`, `'linux'` → `kind:'ignored'`; message contains both spellings and the word `directly`
- row 2 (darwin) → same input, `'darwin'` → `kind:'ignored'` (pins that the POSIX branch is platform-family-wide, not linux-only)
- row 3 → `{HTTPS_PROXY:'http://p:3128'}`, `'win32'` → `kind:'active'` **and NOT `'ignored'`** — the false-warning regression the ship args explicitly flag
- row 3 (win32 casing) → `{HtTpS_PrOxY:'http://p:3128'}`, `'win32'` → `kind:'active'` (case-insensitive scan, not a two-name special case)
- row 4 → `{https_proxy:'http://p:3128'}`, `'linux'` → `kind:'active'`; message contains `may be routed` and `no_proxy`
- row 5 → both set to the same value, `'linux'` → `kind:'active'`, never `'ignored'`
- redaction → `http://user:secret@h:3128` → message contains `***`, and **does not contain** `secret`
- redaction fallback → `'not a url'` → message contains `(set)` and not the raw value
- purity → calling the detector does not read `process.env` (assert the injected record drives the result: `detectProxyNotice({}, 'linux')` is `null` even while the real `process.env.https_proxy` is stubbed set)

`tests/init.test.ts` — two cases:

- ignored-spelling env → `log.warn` called with the notice **before** `fetchRepo` resolves (ordering pinned, per the "clone that fails because of the proxy" rationale)
- clean env → no proxy `log.warn` at all (silence on the common path)

## Guarantee audit (P0)

| claim | reduction |
| ----- | --------- |
| "Given `(env, platform)`, `detectProxyNotice` returns exactly the truth-table row" | **FLOOR — enum/presence membership test** (`ARCHITECTURE.md §2` primitive 3). Pure function, no I/O, one test per row (P1). |
| "The notice is emitted before the clone is attempted" | **FLOOR — test-pinned call ordering** in `tests/init.test.ts`. |
| "A proxy URL's credentials are never echoed to the terminal" | **FLOOR — regex/parse-based redaction** with a fixed `"(set)"` fallback, tested by a negative assertion (the secret is absent from the output). |
| "pharn cannot pass a proxy option to degit" | **ADVISORY — provenance** (dependency content, measured across degit 3.6.1-3.8.0). Corrected from an earlier "FLOOR" label: a fact measured once by hand is none of the three floor primitives, and `THREAT-MODEL.md` §4b already settles this for this dependency ("the guards belong to the dependency, so they are **provenance, not pharn floor**"). |
| "The confident `ignored` warning fires only on a degit version whose lowercase-only read was actually measured" | **FLOOR — enum membership** (`MEASURED_DEGIT_VERSIONS`, exact-string set of the 9 published versions in the `^3.6.1` range). This is the review's blocking finding converted into a real membership test rather than a prose caveat. |
| "You are being proxied / not being proxied" | **NOT CLAIMED — would be advisory with no floor.** F4 (cache short-circuit, `git clone` fallback) makes it underivable. The message says **"may be routed"** and the docs say so explicitly. |
| "Setting `https_proxy` makes the clone safe/observable" | **NOT CLAIMED.** `THREAT-MODEL.md §4b` residual stands unchanged; this increment adds visibility, not a guarantee. |
| "pharn's own `fetch()` calls honor / ignore the proxy" | **NOT CLAIMED — deliberately unmeasured this run.** Node's global fetch and proxy env is a separate axis; asserting it without measurement is exactly the "true-sounding, wrong sentence" the #98 FACT-TABLE warns about. See Open question Q2. |

## Trust audit (P2)

The ingested untrusted input is **`process.env`** — attacker-influencable per `THREAT-MODEL.md §4b`
("an attacker-controlled environment can interpose on the clone"). Taint propagation:

- The env **value** is untrusted free text. It reaches exactly one sink: a terminal string. It is
  **never** a branch input beyond `set`/`unset` (P5), **never** written to `pharn.config.json`, never a
  path, and never passed to a shell.
- It is **redacted before rendering** (`redactProxyUrl`), and an unparseable value degrades to the fixed
  literal `"(set)"` — so hostile bytes (ANSI escapes, control chars, a fabricated "error" line) cannot be
  echoed verbatim to spoof pharn's own output.
- The **presence/absence** booleans and `platform` are floor-verifiable (membership) and are the only
  things any branch reads — mirroring `ARCHITECTURE.md §8`'s enum-gated / tainted-free-text split.

## Determinism audit (P5)

Every branch is a presence or membership test: `platform === 'win32'`, and `value !== undefined && value !== ''`.
There is no classification, no heuristic, and no network read. There is **no fallback that ends in a
guess**: the terminal case (row 1, nothing set) is **silence**, which is the correct and complete
answer, not a degraded one.

---

## Open questions (HALT) — RESOLVED at the plan gate (2026-08-19)

Both were answered by the human at GATE 1; no plan content changed (both answers matched the
recommendation). Recorded here so `/pharn-dev-build` inherits no unresolved HALT.

- **Q1 — scope of the "active" branch (rows 3-5).** The filing scoped detect-and-warn to the *ignored*
  case only; this plan also warns on an *honored* proxy (may-be-routed + `no_proxy` does not apply),
  at the cost of a line on every clone for a correctly-configured proxy user.
  → **RESOLVED: keep BOTH branches.** The filing's own harm statement is symmetric ("neither case is
  currently discoverable from any pharn output"), and the `no_proxy` fact has no other surface.
  The full truth table above ships as written.
- **Q2 — do pharn's own `fetch()` calls honor the proxy?** Not measured this run, deliberately.
  → **RESOLVED: out of scope.** No claim is made about `fetchCommitSha` /
  `fetchRemoteSkillsVersion`; the doc section covers **only** the degit clone. The guarantee-audit row
  "pharn's own `fetch()` honors / ignores the proxy → NOT CLAIMED (deliberately unmeasured)" stands as
  the honest label. If the asymmetry matters it is a separate increment with its own measurement.

## Approval

Approved **as written** at the plan gate on 2026-08-19 (human, `/pharn-dev-ship` GATE 1).

---

## Amendment — 2026-08-19, after `/pharn-dev-review`

The first build of this plan passed every floor verdict (`validate` 0, `no-regressions`, `PASS`) and
`/pharn-dev-review` still returned **1 blocking finding**: `docs/troubleshooting.md` claimed
`degit@3.6.6` was "the version this release resolves." Re-measured live, that was worse than stale —
**degit's latest is 3.8.0**, `package.json` declares `^3.6.1`, `files: ["dist"]` ships no lockfile, and
`scripts/build.mjs:15` marks degit `external`. A consumer installing today gets **3.8.0**, not 3.6.6.
The measurement had never been wrong; the **scope of the pin** was.

### What the amendment changes

1. **A real version gate replaces the prose caveat (the blocking fix).** Every published version in the
   declared range was swept — **3.6.1, 3.6.2, 3.6.3, 3.6.4, 3.6.5, 3.6.6, 3.7.0, 3.7.1, 3.8.0** — and
   all nine show exactly one proxy env name (lowercase `https_proxy`), the same unconditional
   `this.proxy=process.env.https_proxy`, and the same `verboseInfo(e){this.verbose&&this.info(e)}` gate.
   Those nine become `MEASURED_DEGIT_VERSIONS`, an exact-string set. `resolveDegitProxyRead()` reads the
   installed version at runtime (`createRequire(import.meta.url)('degit/package.json')`, verified
   reachable — degit declares no `exports` field) and the confident wording fires **only** on set
   membership. An unmeasured or unreadable version degrades to a hedged message naming both the measured
   range and what is actually installed. The claim now reduces to the floor (enum membership) instead of
   resting on a hand measurement, and a future degit release degrades the message rather than falsifying it.
2. **All three remaining call sites get wiring tests** (review finding P1): `add` (both paths), `update`,
   `status` — plus the `--no-drift` silence, previously asserted only in a comment.
3. **The POSIX casing hole closes** (review finding P5). Detection now scans case-insensitively on
   **both** platform families; on POSIX a variant that is not exactly lowercase yields `ignored`, and the
   notice names **the variable actually found** rather than assuming `HTTPS_PROXY`. Multiple variants
   resolve deterministically (prefer `HTTPS_PROXY`, else the lexicographically first) so the output does
   not depend on env insertion order (P5). The echoed name is safe by construction: only a key whose
   lowercase equals `https_proxy` can be returned, so it is one of 2^11 ASCII spellings and cannot carry
   a control character.
4. **Presentation splits out** into `proxy-env-format.ts` (review finding P3).
5. **The guarantee-audit FLOOR mislabel is corrected** to `ADVISORY — provenance` (review finding P0).
6. **`FACT-TABLE.md` H5 is corrected** (review finding P6).

### What it deliberately does NOT change

The rejection of the filing's Option 3 stands, on the same two measured grounds. `LIMITS.md` and
`THREAT-MODEL.md` remain untouched (hook-protected, human-only) — and §4b's existing sentence is still
accurate, since it never named a version. `package.json`'s `^3.6.1` range is **not** narrowed: pinning
the dependency is a separate decision with its own trade-offs, and this increment's job is to stop
*claiming* a pin that does not exist, not to create one. Worth surfacing for the human, though: pharn's
lockfile sits at 3.6.6 while 3.8.0 is current.

---

## Amendment 2 — 2026-08-19, closing the two findings left open at the post-review gate

`/pharn-dev-review` run 2 returned GREEN with two advisory findings recorded as **out of scope**, and
recommended a follow-up increment. The human elected to close them here instead. This amendment
records the scope expansion and the reasoning, rather than letting two files appear in a diff
un-declared.

### Why bundling is defensible here (the P3/P7 tension, argued not waved)

Run 2's finding said folding `repo.ts` in "would bundle two increments," because the proxy read and
the cache/ref-tier/tar claims are different **measurement axes**. That is true of the axes and false
of the **defect**: both are version-scoped claims about `degit` written without version scoping, and
both are falsified by the same fact (the declared range resolves past what this repo develops
against). Fixing one and leaving the other would leave the root cause live in the file the increment
already cites. The axes stay separate in the code; only the correction is shared.

### What amendment 2 changes

1. **`src/lib/repo.ts` comments are re-scoped, not rewritten.** Each claim they make was re-measured
   against **3.8.0**, the version `^3.6.1` resolves to today, and all still hold: the tarball download
   still sits inside `if(!t.cache)` behind a `FILE_EXISTS` early return; the cache dir still resolves
   `%LOCALAPPDATA% ?? ~/AppData/Local` on win32, `~/Library/Caches` on darwin, `$XDG_CACHE_HOME ??
   ~/.cache` elsewhere; `map.json` / `access.json` / `USING_CACHE` / `TAR_BAD_ARCHIVE` are all present;
   the three ref-resolution tiers and `GIT_LS_REMOTE_FAILED` are intact. So the comments were never
   **wrong** — they were pinned to a version nobody runs. They now name the measured **range**.
2. **The lockfile moves to 3.8.0.** The published contract (`package.json`'s `^3.6.1`) is deliberately
   **unchanged** — narrowing a dependency range is a maintainer decision with its own trade-offs, and
   this increment's job is to stop *claiming* a pin, not to create one. What moves is the version CI
   installs, so the version tested is the version users resolve. This also points the new tripwire in
   `tests/proxy-env.test.ts` at 3.8.0, meaning the claim is re-derived on every CI run from the bytes
   consumers actually get.

   API compatibility verified live before the bump: `degit(src, opts)` is still a callable default
   export, `.clone()` / `.on()` are present, `this.proxy` still reads from the environment, there are
   still no runtime dependencies, and `engines.node` is `>=20.0.0` against pharn's `>=20`.

### What it still does not change

`package.json`'s range, `src/degit.d.ts` (there is still no `proxy` option to declare), the `cache`
option, the cache dir, and the absence of a clone timeout / body cap. `THREAT-MODEL.md` §4b's labeled
limit stands untouched and remains accurate — it never named a version.

