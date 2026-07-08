# PLAN — harden-install-path

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # ARCHITECTURE.md (fix #4)
- increment: Close the three Fable install-path findings on pharn-cli — a symlink-escape arbitrary-write hole and a missing dev/product allowlist on the LEGACY copy path (`install-modules.ts`), plus a floating-`main` degit fetch (`repo.ts`) whose recorded `commit` can diverge from the fetched bytes.
- layer(s): pharn-cli `lib/` (`repo.ts`, `install-modules.ts`, `installer.ts`) + `commands/` (`init.ts`, `add.ts`, `update.ts`). NB — ARCHITECTURE.md §4's layer tree describes the PHARN **methodology** modules, not the installer's TypeScript source; installer-source layering is **CONSTITUTION P3** (`index → commands → steps → lib`, no sibling imports). All shared logic here stays in `lib/`.
- constitution_refs: [P0, P1, P2, P5, P6, P7]

---

## Discovery findings (live reads this run — P6)

- **The LEGACY path is the DEFAULT and is live.** `init.ts:41-47` comment is explicit: archetype install is "experimental, flag-gated … The legacy module/wizard flow below stays the default." Default `pharn init` → `runInitV2`/`runInitLegacy` → `runInstall` → `fetchAndInstall` → **`install-modules.ts`**. It is also reached by `add` (module/skill) and `update`. **BUG 3's "if dead, remove it" branch does NOT apply — removing `install-modules.ts` would break the default flow (P7). We HARDEN.**
- **BUG 2 confirmed.** `safeJoin` (`install-modules.ts:139-148`) is pure lexical (`resolve` + `startsWith`); it never resolves symlinks. Every `cpSync` in the file (`:34` installModule, `:81` installSkills, `:105`/`:123` materializeCore) copies with **no symlink filter** → `cpSync` (default `dereference:false`) materializes a fetched symlink verbatim. Two-entry `installs` (plant a symlink dir, then write a file through it) escapes `.claude/` with **no `..`**, bypassing `INSTALL_PATH_RE` (enforced at `manifest.ts:190-198`), `assertNoDotDot`, and `safeJoin`.
- **The hardened reference exists.** `install-capabilities.ts:62-63` already defines the exact posture to mirror: `isSymlink` guards every copy **root**; `noSymlinks` is the `cpSync` **filter** for nested symlinks; dev-only exclusion is **structural** (`DEV_COMMAND_PREFIX`, `isTestFile`). This plan brings the legacy path to that posture (and one step beyond — see FIX 2 Layer 2).
- **BUG 1 confirmed.** `repo.ts:22` `degit(`${REPO}#main`)` floats; `fetchCommitSha()` is a **separate** GitHub-API call (`installer.ts:59`, `init.ts:91`, `add.ts:349`, `update.ts:239`). A push between the two calls makes the recorded `commit` ≠ the fetched tree (TOCTOU). degit source (verified this run): `repo#<ref>` → `github.com/<repo>/archive/<ref>.tar.gz`; a full SHA is a valid ref; if `main` moves mid-fetch degit **fails closed** (cannot find the old sha as a ref tip) rather than fetching drift.

---

## Files

- `src/lib/install-modules.ts` — **FIX 2 + FIX 3** (core). Add `isSymlink`/`isTestFile`/`isDevCommand`/`copyFilter` helpers (mirroring `install-capabilities.ts`, defined **locally** — importing from `install-capabilities.ts` would create a cycle, since it imports `safeJoin` from here). Add `assertRealDestWithin(claudeDir, to)` (FIX 2 Layer 2). Apply to `installModule`, `installSkills` (+ symlink-root reject in `assertSkillSourcesExist`), `materializeCore`. `safeJoin` stays a pure lexical check (still the first gate; used by read-only `diff.ts`).
- `src/lib/repo.ts` — **FIX 1**. `fetchRepo()` resolves the sha **first** (`fetchCommitSha()`), pins `degit(`${REPO}#${sha ?? REPO_BRANCH}`)`, and returns `{ dir, sha, cleanup }` (adds `sha: string | null` to `FetchedRepo`).
- `src/lib/installer.ts` — **FIX 1 caller**. Replace `const commit = await fetchCommitSha();` (`:59`) with `const commit = repo.sha;`; drop the now-unused `fetchCommitSha` import. Auto-fixes default `init`, module/skill `add`, module `update` (they read `commit` from this result).
- `src/commands/init.ts` — **FIX 1 caller** (archetype branch). `:91` `await fetchCommitSha()` → `repo.sha` (`repo` in scope). Drop `fetchCommitSha` import if now unused.
- `src/commands/add.ts` — **FIX 1 caller** (archetype add). `resolveArchetypeAdd` has only `repoDir`, not `repo`; add a `sha: string | null` param and pass `repo.sha` from the call site (`:284`), replacing `await fetchCommitSha()` (`:349`). Drop the import if now unused.
- `src/commands/update.ts` — **FIX 1 caller** (archetype update). `:239` `await fetchCommitSha()` → `repo.sha` (`repo` in scope). Drop the import if now unused.
- `tests/install-modules.test.ts` — **FIX 2 + FIX 3 evals** (new cases; see below). Mirror `install-capabilities.test.ts`'s `symlinkSync`/`lstatSync` patterns.
- `tests/repo.test.ts` — **FIX 1 evals** (pin + fallback; mock `degit` to capture the `src` arg, stub the sha fetch).
- `tests/installer.test.ts` — update to the new `fetchRepo` contract (mock returns `sha`; drop the separate `fetchCommitSha`). Run the full suite and reconcile every break (P1).
- `tests/add.test.ts` — archetype-add path now reads `repo.sha`; give its `fetchRepo` mock a `sha` (materializes the plan's "add tests that assert the recorded commit" line).
- `tests/update.test.ts` — archetype-update path now reads `repo.sha`; give its `fetchRepo` mock a `sha` (materializes the plan's "update tests that assert the recorded commit" line).

> **If OQ1 = split:** build only `install-modules.ts` + `tests/install-modules.test.ts` this run (FIX 2 + FIX 3); FIX 1 (the five fetch-layer files) becomes a separate follow-up increment.

---

## Contracts / invariants satisfied (cite, don't restate — P4)

- **THREAT-MODEL.md §2 surface #1** ("Malicious `installs` / skill path … write **outside `.claude/`** … The highest-value target") + **§3** floor row ("`safeJoin` guards **every** copy") — FIX 2 closes the symlink bypass of that floor. This was the **verified** hole.
- **THREAT-MODEL.md §1 Surface A** (dev vs. product content) — FIX 3 extends `install-capabilities.ts`'s structural dev/product exclusion to the legacy path (`pharn-dev-*` commands + `*.test.*` never installed).
- **LIMITS.md §1b** (remote trust is provenance, not cryptographic) + **§3b** (`commit` may be absent; install still proceeds) — FIX 1 makes the recorded `commit` **consistent** with the fetched tree **without** overselling authenticity and **without** contradicting §3b (the SHA-unavailable path stays the documented degraded mode). See OQ2.
- **CONSTITUTION P2** (untrusted remote content is data; every copy `safeJoin`-guarded) — FIX 2 restores this invariant on the legacy path against symlinks, which the lexical `safeJoin` alone cannot uphold.

---

## Evals to write (P1 — vitest; "tests are the spec")

FIX 2 (`tests/install-modules.test.ts`):
- **Layer 1 root reject** → `installModule` with an `installs` **source that is a symlink** → throws `ManifestValidationError`, **nothing written**.
- **Layer 1 nested skip** → `installModule` on a dir containing a nested symlink → real siblings copied, the symlink **not** materialized in `.claude/` (assert via `lstatSync`, not `existsSync`).
- **Layer 2 write-through refused (the verified attack)** → pre-plant `.claude/escape` as a symlink → `/outside`; `installModule` with `installs: { real: "escape/pwned" }` → throws, `/outside/pwned` **not** created.
- **Skill source symlink** → `assertSkillSourcesExist` rejects a symlinked skill `from` (pre-flight, nothing written).
- **materializeCore symlink** → symlinked memory-bank / constitution source → throws.
- **Fresh install still works** → no `.claude/` present, real sources → files land (Layer 2 tolerates a non-existent base).

FIX 3 (`tests/install-modules.test.ts`):
- **dev command excluded** → `installs: { commands: "commands/" }` where the dir contains `pharn-dev-build.md` + `pharn-plan.md` → only `pharn-plan.md` lands.
- **test file excluded** → a `*.test.mjs` alongside a real hook → the `.test.mjs` is not copied.
- **regression guard** → the existing "copies each installs entry" case still passes (no false exclusion of product files).

FIX 1 (`tests/repo.test.ts`):
- **pins to resolved sha** → stub sha-fetch → `deadbeef…`; assert `degit` called with `${REPO}#deadbeef…` **and** returned `repo.sha === "deadbeef…"` (recorded == fetched).
- **falls back when sha unavailable** → stub sha-fetch → `null`; assert `degit` called with `${REPO}#${REPO_BRANCH}` **and** `repo.sha === null` (LIMITS §3b degraded mode preserved).

---

## Guarantee audit (P0)

- **"No copy from the untrusted repo materializes a symlink, and no copy root is a symlink" (FIX 2 L1)** → **floor**: `lstatSync().isSymbolicLink()` membership + `cpSync` `filter` (enum/regex-class check, ARCHITECTURE §2 primitive #3).
- **"No copy writes THROUGH a symlink that escapes `.claude/`" (FIX 2 L2)** → **floor**: `realpathSync` path-containment — the **"path-containment test (`safeJoin`)"** named in **CONSTITUTION P0**, strengthened to resolve symlinks. (P0 is authoritative over ARCHITECTURE §2's three-primitive framing.)
- **"The legacy path never installs `pharn-dev-*` commands or `*.test.*` files" (FIX 3)** → **floor**: structural basename allowlist (prefix/suffix membership).
- **"The recorded `commit` equals the sha degit was pinned to (recorded == fetched, or fail-closed)" (FIX 1)** → **floor**: a deterministic code invariant — the *same* `sha` value is threaded to the degit ref and to `config.commit`; degit fails closed if it cannot fetch that sha. Testable (P1).
- **"The fetched bytes are authentic / the upstream is not compromised" (FIX 1)** → **ADVISORY** — explicitly **not** guaranteed (LIMITS §1b: provenance, not cryptographic). Labeled advisory; the network + path floor bounds a hostile upstream to content inside `.claude/`, it never proves the bytes. **No** guaranteed decision rests on this.
- **"Reproducible install" (FIX 1)** → **ADVISORY** (bounded): reproducible only while the pinned sha's tarball remains fetchable from the mutable remote (GC caveat, LIMITS §1b/§3c).

No claim in this increment is a guarantee lacking a floor reduction. The two authenticity/reproducibility claims are labeled advisory, per P0.

## Trust audit (P2)

The increment ingests **untrusted** input: the degit-cloned tree (module `installs` dirs/files, skill `from` dirs, `pharn-core` templates) and the GitHub-API commit sha. Taint propagation: fetched bytes reach the user's `.claude/` **only if** they pass the structural floor — path allowlist (`manifest.ts`) + lexical `safeJoin` + **new** symlink-root reject + `copyFilter` (no symlink / dev-command / test file) + **new** `realpathSync` destination containment. A fetched **symlink** is never materialized and never traversed. The `commit` sha is written as an **advisory record only** — it never drives a filesystem write or a branch. No tainted value reaches a guaranteed decision (ARCHITECTURE §5 / §8).

## Determinism audit (P5)

Every new branch is a membership/containment test: `isSymbolicLink()` (bool), basename prefix/suffix (string membership), `realpath.startsWith(base + sep)` (containment). FIX 1's `sha ?? REPO_BRANCH` branches on a deterministic "sha unavailable" signal (`null`), falling back to the **documented** degraded mode (LIMITS §3b) — not a guess; the degit-cannot-find-sha case **fails closed** (throws). No classification drives any branch.

---

## Deferred (P7 — stated, not done)

- **Archetype-path Layer-2 parity.** `install-capabilities.ts` prevents *materializing* symlinks (Layer 1) but, like the pre-fix legacy path, relies on lexical `safeJoin` for the destination — so a **pre-existing** out-of-band symlink in the user's project is a residual there too. The task scopes the archetype path as "clean," and its Layer-1 defense already closes the in-batch plant-then-traverse attack, so there is **no verified/triggering need** (P7) to expand this increment into it. `assertRealDestWithin` is written so a follow-up could adopt it for parity. Flagged for a human, not done here.

---

## Open questions — RESOLVED at GATE 1 (human, 2026-07-08)

- **OQ1 — Scope → BUNDLE ALL THREE.** FIX 1 + FIX 2 + FIX 3 ship in this one increment (the `## Files` list stands in full). No split.
- **OQ2 — FIX 1 sha-unavailable → GRACEFUL FALLBACK.** `degit(${REPO}#${sha ?? REPO_BRANCH})` + `commit: sha` (null when unresolved). Preserves LIMITS §3b; **no** trusted-doc change. This is exactly the `repo.ts` design in `## Files` and the P0 audit above — no plan substance changed.

Plan **approved as written**. Proceeding to grill → build → regress → verify → review (GATE 2).
