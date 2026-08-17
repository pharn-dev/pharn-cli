# PLAN — symlink-guard-core

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Extract the three near-identical symlink-component walks (`backup.ts`, `apply-update.ts`, `install-manifest.ts`) into one shared core, `findSymlinkComponent`, behind three thin adapters that preserve each site's failure shape byte-for-byte.
- layer(s): pharn-core (this CLI's `src/lib/`) — no Capability, no contract change
- constitution_refs: [P0, P1, P2, P3, P5, P7]

## Live-state verification (P6) — read this run, not from memory

**Base advanced past the build prompt's receipt.** The prompt states `base: latest main (verified at
e097adb)`; live `HEAD` is **`2cd061d`** ("remove dead legacy symbols", #95). That commit touched
`src/lib/validate.ts` (−20 lines), `constitution.ts`, `format.ts`, `pharn-config.ts` — **not** the
three walker files. Every §0 receipt was therefore re-verified verbatim against live bytes:

| Impl                       | Prompt's receipt        | Live (verified this run)                      | Match |
| -------------------------- | ----------------------- | --------------------------------------------- | ----- |
| `assertNoSymlinkComponent` | `backup.ts:94-110`, called `:76` | `backup.ts:94-110`, called `:76`      | ✅    |
| `assertNoSymlinkPath`      | `apply-update.ts:113-127`, called `:94` | `apply-update.ts:113-127`, called `:94` | ✅ |
| `hasSymlinkComponent`      | `install-manifest.ts:71-85`, called `:116` + `:149` | `install-manifest.ts:71-85`, called `:116` + `:149` | ✅ |

The ×3 comment confession is live: the *"components BELOW the root … may legitimately live under a
symlinked ancestor (e.g. macOS `/tmp`)"* rationale appears at `backup.ts:91-93`,
`apply-update.ts:110-111`, `install-manifest.ts:66-69`.

**Green baseline:** `npm run check` GREEN — prettier clean, eslint clean, both tsc configs clean,
**40 test files / 734 tests passed**. `node .dev/floor/validate.mjs .` → `FLOOR: GREEN`, exit 0.

**Fourth-copy sweep — `grep -rn "isSymbolicLink" src/` returns 11 hits, all classified.** The prompt
named 5 expected seeds; there are 11. **No unclassified component walk exists** — the six extra hits
are all dirent-filters or single-leaf state checks, both of which the prompt's own taxonomy excludes:

| Hit                             | Class            | Verdict            |
| ------------------------------- | ---------------- | ------------------ |
| `install-manifest.ts:79`        | component-walk   | **target**         |
| `apply-update.ts:121`           | component-walk   | **target**         |
| `backup.ts:104`                 | component-walk   | **target**         |
| `install-manifest.ts:46`        | dirent-filter (`walkFiles`)        | out |
| `install-records.ts:257`        | dirent-filter (`capabilityRecordPaths` walk) | out |
| `capability-index.ts:70`        | dirent-filter (subtree listing)    | out |
| `detect-archetype.ts:138`       | dirent-filter (file-tree scan)     | out |
| `install-capabilities.ts:207`   | dirent-filter (`copyFilteredDir`)  | out |
| `install-capabilities.ts:61`    | leaf-state (`isSymlink` helper)    | out |
| `apply-update.ts:57`            | leaf-state (`readDiskState`)       | out |
| `backup.ts:61`                  | leaf-state (backup root check)     | out |

**Purity receipt for the home decision holds.** `src/lib/validate.ts` imports **`node:path` only**
(`import { resolve, sep } from 'node:path'` — line 1); `grep -c "node:fs\|lstat\|readFile\|existsSync"`
→ **0**. It is I/O-free by construction, and `CLAUDE.md:58` (verified, exact line) calls `safeJoin`
*"the **lexical** path-containment gate"*.

**Pin inventory — 45 `symlink` mentions confirmed** (backup 11 + apply-update 13 + install-manifest
21 = 45), representing **16 named pins**:

- `tests/backup.test.ts:78` refuses to write through a symlinked .pharn-backup (safeJoin is lexical only)
- `tests/backup.test.ts:92` refuses to back up a source that is a symlink
- `tests/backup.test.ts:99` refuses a source whose PARENT is a symlink (lstat only guards the leaf)
- `tests/apply-update.test.ts:46` a symlink → unreadable, so it is never hashed or written through
- `tests/apply-update.test.ts:55` a DANGLING symlink → unreadable, not absent (the row-1 overwrite trap)
- `tests/apply-update.test.ts:129` refuses to write through a symlinked DESTINATION file
- `tests/apply-update.test.ts:145` refuses to write through a symlinked PARENT directory
- `tests/apply-update.test.ts:161` a dangling destination symlink is refused rather than followed
- `tests/install-manifest.test.ts:154` describe: collectExpectedInstallPaths (untrusted symlinks)
- `tests/install-manifest.test.ts:157` skips a symlink inside a walked dir (mirrors install …)
- `tests/install-manifest.test.ts:344` describe: collectExpectedInstallPaths — symlinked SOURCE roots (P2)
- `tests/install-manifest.test.ts:362` a symlinked capability dir contributes NOTHING …
- `tests/install-manifest.test.ts:376` a symlinked contracts/floor dir contributes nothing
- `tests/install-manifest.test.ts:384` a symlinked trusted doc is not expected
- `tests/install-manifest.test.ts:394` a symlinked ANCESTOR of a capability dir contributes nothing
- `tests/install-manifest.test.ts:404` a symlinked ANCESTOR of the floor dir contributes nothing

**Zero test-file edits needed, measured:** old walker names appear **0×** in `tests/` (all 8 mentions
are in `src/`, listed below), and **no test asserts a message string** — the throw pins use
`.toThrow(/symlink/i)` (backup ×3) and `.toThrow(ApplyError)` (apply ×4). ⚠️ **This is a measured
deviation from the prompt's invariant 2** and drives Open Question 4 below.

**Old-name mentions, all 8, all in `src/`:** `install-manifest.ts:71,116,149`;
`apply-update.ts:94,113`; `backup.ts:76,94`; and **`backup.ts:75`** — the prose cross-reference
("Mirrors applyWrites' `assertNoSymlinkPath` on the write side") that names a function this PR
deletes. Confirmed: it is the only prose mention repo-wide.

## Files

- `src/lib/symlink-guard.ts` — **new** — the shared physical path gate: `findSymlinkComponent`, one doc-comment carrying the below-root rationale + the nonexistent-tail semantics — layer pharn-core
- `tests/symlink-guard.test.ts` — **new** — the core's unit table (P1) — layer pharn-core
- `src/lib/backup.ts` — delete the private walker; adapter at `:76` preserving `Cannot back up ${rel}: ${link} is a symlink.`; rewrite the `:75` cross-reference to name the core — layer pharn-core
- `src/lib/apply-update.ts` — delete the private walker; adapter at `:94` **inside** the existing `try` preserving `${link} is a symlink; refusing to write through it.` — layer pharn-core
- `src/lib/install-manifest.ts` — delete the private walker **and its private `toPosix`** (now imported from `validate.ts`, per OQ2); `findSymlinkComponent(...) !== null` at `:116` (`return`) and `:149` (`continue`); **narrow the `node:path` import to `{ join, resolve }`** — `sep`'s only use was inside `toPosix` (`:58`), so leaving it orphans the import and `eslint --max-warnings 0` fails (GRILL finding, blocking) — layer pharn-core
- `src/lib/validate.ts` — **one pure additive export**: `toPosix` relocated here (OQ2 resolution (a)); stays fs-free — layer pharn-core
- `tests/validate.test.ts` — **pins for the relocated `toPosix`** (both branches) — added to the whitelist at the grill amendment (GRILL finding P1/`PLAN.md:88`) — layer pharn-core
- `CLAUDE.md` — one clause at `:58` naming the physical gate's home alongside the lexical one, and `toPosix` joining `safeJoin` — docs
- ~~`CHANGELOG.md`~~ — **excluded** (OQ5 → skip: messages preserved ⇒ no user-facing change ⇒ internal)

**Not touched, named so nobody over-unifies:** `.dev/floor/*` symlink handling (documented
convention, own cross-check via `check-run-pins` R2: no floor script imports another);
`readDiskState` (`apply-update.ts:44-68`, leaf-state, a different concern);
`install-capabilities.ts`' `isSymlink`/`noSymlinks` per-dirent copy filter (entry filter, not a walk).

## The core (HALT 1 deliverable — signature + doc-comment draft)

```ts
/**
 * The first component of `rel` (below `base`) that is a symlink, or `null` when
 * none is — the shared PHYSICAL path gate, the complement to `safeJoin`'s LEXICAL
 * one (lib/validate.ts). `safeJoin` contains the path STRING but does not resolve
 * symlinks, and both `copyFileSync` and a plain read FOLLOW one. `lstat` refuses
 * to dereference only the FINAL component — it happily resolves every ancestor —
 * so checking the leaf alone would still read or write through a symlinked parent.
 *
 * Components are checked BELOW `base` only: the base itself (a project root, or a
 * degit clone's temp dir) may legitimately live under a symlinked ancestor (e.g.
 * macOS `/tmp`).
 *
 * A component that does NOT EXIST is not an offender (`throwIfNoEntry: false` →
 * `null` → not a symlink → keep walking). Callers depend on this: `applyWrites`
 * creates the parent directories AFTER this walk returns, so a restore into a
 * deleted subtree must pass.
 *
 * Returns the offending accumulated POSIX path, which is what each caller's
 * message or skip decision names. Callers own the failure shape — this returns a
 * value and never throws.
 */
export function findSymlinkComponent(base: string, rel: string): string | null;
```

Body: `toPosix(rel).split('/')`, skip empty segments, accumulate `current`,
`lstatSync(safeJoin(base, current), { throwIfNoEntry: false })?.isSymbolicLink()` → `return current`;
`return null` after the loop.

## Adapter diffs (verbatim, byte-preserving)

**`backup.ts` `:71-76`** — `action` had exactly ONE call site (`back up ${rel}`), so inlining it
reproduces the old string byte-for-byte:

```ts
    // Per COMPONENT, not just the leaf — `lstat` refuses to dereference only the
    // final component, so a symlinked parent would still be read through. Shares
    // findSymlinkComponent (lib/symlink-guard.ts) with applyWrites' write side.
    const link = findSymlinkComponent(projectRoot, rel);
    if (link !== null) {
      throw new ManifestValidationError(
        `Cannot back up ${rel}: ${link} is a symlink.`,
      );
    }
```

**`apply-update.ts` `:92-97`** — stays inside the `try`, so the `catch` still wraps into
`ApplyError` carrying `written`; `mkdirSync`/`copyFileSync` order untouched:

```ts
    try {
      const to = safeJoin(projectRoot, rel);
      const link = findSymlinkComponent(projectRoot, rel);
      if (link !== null) {
        throw new ManifestValidationError(
          `${link} is a symlink; refusing to write through it.`,
        );
      }
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
```

**`install-manifest.ts` `:116` / `:149`** — skip flow unchanged:

```ts
    if (findSymlinkComponent(repoDir, relDir) !== null) return;
...
    if (findSymlinkComponent(repoDir, doc) !== null) continue;
```

## Contracts satisfied

- None in `pharn-contracts/` (live contents: `eval-format.md`, `finding-shape.md`,
  `seam-config.md`) — this increment is CLI-internal refactoring of `src/lib/`, adds no Capability,
  emits no finding, and touches no seam. Cited, not restated (P4).

## Evals to write (P1)

**`pharn-contracts/eval-format.md` does not apply here** (grill amendment, P4): this increment adds
no Capability and no `evals/` artifact, so there is no `{case, expected}` pair and no
`structural[]`/`semantic[]` partition to declare. P1 is satisfied the way it is satisfied everywhere
else in this CLI — with `vitest` tests. Every case below is deterministic; none is routed through a
judge.

`tests/symlink-guard.test.ts` — real-fs fixtures in the style of `tests/apply-update.test.ts:39-63`:

- mid-component symlink → returns that component's accumulated posix path
- leaf symlink → returns the leaf
- **dangling** symlink component → returns it (not `null`) — precedent `apply-update.test.ts:55`
- clean path, everything real → `null`
- **nonexistent tail** → `null` (the load-bearing semantics `applyWrites`' post-walk `mkdirSync` needs)
- nonexistent MIDDLE component → `null` (the walk continues, does not abort)
- empty / duplicate separators (`a//b`, leading `/`) → identical result to the clean twin
- **declared-delta pin:** a backslash `rel` walks identically to its posix twin (`toPosix` convergence)
- two symlinked components → returns the **FIRST**
- `base` itself a symlink → `null` (below-root only — the macOS `/tmp` rationale)
- **the two adapter messages, byte-exact** (OQ4 → pin), via the public `createBackup` / `applyWrites`
  entries so the three protected suites stay untouched:
  `Cannot back up <rel>: <link> is a symlink.` and `<link> is a symlink; refusing to write through it.`
  ⚠️ **Instrument corrected at the grill amendment:** assert on the caught error's `.message` with
  `toBe`, **not** `toThrow('…')` — verified in the installed `@vitest/expect/dist/index.js:1295`,
  a string argument to `toThrow` is `actual.includes(expected)`, a SUBSTRING test that cannot pin
  bytes. `applyWrites`' message is asserted on the `ApplyError`'s wrapped text (the adapter's string
  is interpolated into it), keeping the existing `toThrow(ApplyError)` class pins untouched.
- **the structural anti-fork pin** (OQ3 → add): the accumulator idiom `current = current ?` occurs in
  exactly one `src/**` file, `symlink-guard.ts` — same class as `tests/init.test.ts:188` (isTTY inv-6)
- **`toPosix`'s two branches** (grill amendment), in `tests/validate.test.ts`: `sep`→`/` normalization
  and the trailing-slash strip

Existing suites: **not edited**; all 45 mentions / 16 pins must stay green (invariant 1).

## Guarantee audit (P0)

- "No read or write passes through a symlinked path component" → **floor**: path-containment
  (`safeJoin`) + a deterministic non-LLM `lstat` component walk. Unchanged in kind by this PR — the
  same class `backup.ts:14-15` already claims ("every read and write is safeJoin-contained and
  lstat-guarded").
- "Each site's failure shape (2 messages + 1 boolean) is preserved byte-for-byte" → **floor**
  (regex/exact-string match over content, via a test), **upgraded by the OQ4 resolution**. As the
  prompt specified it this was **advisory** — the existing suites pin only `/symlink/i` and
  `toThrow(ApplyError)`, so invariant 2 would have reduced to a one-shot Phase C grep that is not a
  regression guard. The new file now pins both strings byte-exactly through the public entries.
- "`ManifestValidationError` stays the thrown class; `ApplyError` + `written` carry byte-equivalent"
  → **floor**: pinned by the existing untouched `toThrow(ApplyError)` + `written` assertions.
- "**No copy-paste fork preserving the accumulator spelling** is reintroduced" → **floor**
  (literal-string membership over `src/**`, via a test), **upgraded by the OQ3 resolution**;
  **advisory** (one-shot grep) as the prompt specified it. Measured: the accumulator idiom
  `current = current ?` occurs **exactly 3×** today, all three walks, and **0** other
  path-accumulating loops exist — so the pin is a literal string match, not the brittle
  loop-detection the prompt argued against.
  ⚠️ **Claim narrowed at the grill amendment** (GRILL, P0/important): the earlier wording, "no fourth
  fork is reintroduced", was **wider than the instrument**. A fork spelled `current += '/' + segment`,
  `[current, segment].filter(Boolean).join('/')`, or via `path.posix.join` walks the same components
  and passes the pin. The narrowed sentence is what a literal-string match actually proves, and the
  test's own comment must say so.
  ⚠️ **Consequence the build must respect:** the core's body must keep that exact accumulator
  spelling, since the pin matches it literally.
- "The refactor changes no behavior" → **floor** for everything the 734-test suite covers; the walk's
  own semantics move from *implicitly* covered (through 3 public entries) to *directly* pinned (P1).

## Trust audit (P2)

- **`base`** is either the project root (user-owned) or a **degit clone temp dir (untrusted)**.
  **`rel`** derives from the untrusted clone's directory names (via `collectExpectedInstallPaths`) or
  from config capability names (already validated by `CAPABILITY_NAME_RE`).
- Taint propagation is **unchanged**: the returned string is an accumulated path built from `rel`'s
  own segments, and it flows to exactly two places — (a) interpolation into a user-facing error
  message, and (b) a `!== null` branch. It is **data, never executed**, exactly as `current` is today
  in all three walkers. No new taint path is created and none is removed.
- Every filesystem access stays `safeJoin`-contained inside the core, so nothing escapes `base`.

## Determinism audit (P5)

- The core's only branch is `stat?.isSymbolicLink()` — a boolean filesystem predicate, no
  classification. Each adapter's branch is `!== null`, a null-membership test.
- Terminal behavior is a hard-fail (backup/apply throw) or a named skip (manifest `return`/`continue`)
  — never a silent guess, never a fallback that invents an answer.
- A nonexistent component is deterministic-by-contract (documented in the core's doc-comment), not an
  accident of `throwIfNoEntry: false`.

## Approval

**APPROVED AS WRITTEN** by the human at HALT 1 (GATE 1), 2026-08-17. All five open questions
resolved. Spec pinned at
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`.

**AMENDED after `/pharn-dev-grill`** (same day, human-approved): `tests/validate.test.ts` joins the
whitelist (**7 files**) to pin the relocated `toPosix`. Three further grill findings are folded into
the sections above without changing the file set — the corrected message-pin instrument
(`.message`/`toBe`, not `toThrow(string)`), the `sep` import narrowing in `install-manifest.ts`, and
the narrowed anti-fork claim. See `.dev/features/symlink-guard-core/GRILL.md`.

## Open questions (HALT) — ALL RESOLVED by the human at HALT 1

**Resolutions (all four recommendations accepted):** OQ1 → **new `src/lib/symlink-guard.ts`**;
OQ2 → **(a) move `toPosix` to `validate.ts`** (adds `validate.ts` to the whitelist for one pure
additive export); OQ3 → **add the literal-string anti-fork pin**; OQ4 → **byte-pin both adapter
messages** in the new test file; OQ5 → **skip `CHANGELOG.md`** (internal; messages preserved ⇒ no
user-facing change). The Files list, Evals list, and Guarantee audit above already reflect these.

1. **Home for the core.** → **RESOLVED: new `src/lib/symlink-guard.ts`.** Recommend **new `src/lib/symlink-guard.ts`** — the purity receipt above
   verifies `validate.ts` is fs-free, and `CLAUDE.md:58` already teaches the lexical/physical split.
   The alternative (`validate.ts` as home) means asserting validate.ts may do I/O.
2. **`toPosix` ownership — the prompt did not measure this, and it blocks a naive extraction.**
   → **RESOLVED: (a), move it to `validate.ts`.**
   `toPosix` is **private in `install-manifest.ts:57`**, used at `:73` (the walk) **and `:104`**
   (the `add` key normalizer), and it exists **nowhere else in `src/`**. The core needs it, so
   `symlink-guard.ts` importing it from `install-manifest.ts` while `install-manifest.ts` imports
   the core is a **circular import**. Three ways out — (a) move `toPosix` to `validate.ts`
   (P3-cleanest: purely lexical, sits beside `safeJoin`, already imports `sep`; cost: `validate.ts`
   joins the whitelist for a pure additive export), (b) `symlink-guard.ts` owns and exports it and
   `install-manifest.ts` imports from there (no new whitelist file; mild axis smell — a
   normalization helper living in a module named for the symlink gate), (c) `symlink-guard.ts`
   defines its own private copy (zero scope change, but a de-duplication PR that adds a
   duplication). Recommend **(a)**.
3. **Anti-fork structural pin** → **RESOLVED: add it.** The prompt recommended skip on brittleness grounds, but the
   brittleness does not apply: `current = current ?` is a **literal string** occurring exactly 3×
   today (all three walks), so the pin is "occurs exactly 1×, in `symlink-guard.ts`". This repo
   already carries precisely this class of guard (`tests/init.test.ts:188` inv-6 for `isTTY`;
   `:241` for `child_process`). Recommend **add** — it converts invariant 5 from a one-shot grep
   into a regression guard, for ~10 lines.
4. **Byte-pin the two adapter messages?** → **RESOLVED: pin both, byte-exact.** Measured: no test asserts either message today
   (`/symlink/i` + `toThrow(ApplyError)` only). As written, the PR's headline invariant ("preserve
   every site's failure shape byte-for-byte") is enforced by a grep that runs once and then is gone.
   Recommend **pin both in the new file** via `createBackup` / `applyWrites` — it does not edit the
   three protected suites, and P1 says tests are the spec.
5. **`CHANGELOG.md` entry?** → **RESOLVED: skip.** Messages preserved ⇒ no user-facing change ⇒
   internal (the prompt marks it optional).
