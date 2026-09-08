# PLAN — Classify files under a symlinked PARENT as `unreadable`, in plan AND status

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 — sha256 of ARCHITECTURE.md, recomputed this run
- brief_content_hash: 6422896b1ff77a6449512340dd76f2e3b2840153c28a678a3ca08a53c4a26049 # prompts/4.03-symlinked-parent-unreadable.md (FABLE.md §4.3, PR bundle 5)
- increment: Make `readDiskState` (`src/lib/apply-update.ts`) run the shared `findSymlinkComponent`
  walk (`src/lib/symlink-guard.ts`) so a symlinked **parent directory component** — not only a
  symlinked leaf — lands in the existing `unreadable` terminal, naming the offending component. This
  converts a mid-run `ApplyError` abort of `pharn update` (exit 1, partial writes, repeats every run)
  into the designed per-file named skip (exit 0), and stops `pharn status` from hashing *through* a
  parent symlink and counting the file ok/modified. The `applyWrites` check stays untouched as the
  write-side security backstop.
- layer(s): the disk classifier (`src/lib/apply-update.ts`), its shared physical gate's doc comment
  (`src/lib/symlink-guard.ts`), the read-side comment that enumerates the terminal (`src/lib/diff.ts`),
  their tests, and user-facing docs. **No call site changes** — `status` (`src/lib/diff.ts:79`) and
  `update` (`src/commands/update.ts:333`) inherit the fix for free.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (live state, read this run — P6)

Repository root, clean tree, branch `feat/cli-robustness` whose content is **already merged**
(`git diff HEAD origin/main` = `package-lock.json` only; #123 squashed at `951a726`, `origin/main` at
`34bd87e`). `package.json` version `0.4.0`.

- **`src/lib/apply-update.ts:45-69`** — `readDiskState` is `safeJoin` → one `lstatSync(dest,
  {throwIfNoEntry:false})` in a `try` → `absent` / leaf-`isSymbolicLink()` / `!isFile()` /
  `sha256File`. The leaf lstat at `:53`, the leaf symlink branch at `:58` (exactly the FABLE citation
  — no drift). It imports `findSymlinkComponent` **already** (`:4`), for `applyWrites` only.
- **`src/lib/apply-update.ts:93-113`** — `applyWrites` runs `findSymlinkComponent(projectRoot, rel)`
  INSIDE its `try` and throws `ManifestValidationError('<link> is a symlink; refusing to write
  through it.')`, wrapped into `ApplyError` carrying `written`. Untouched by this increment.
- **`src/lib/symlink-guard.ts:40-54`** — the walk accumulates `current` and lstats each component with
  `throwIfNoEntry: false`. Its docstring `:36-38` claims it "never throws (beyond `safeJoin`'s own
  escape refusal)". **Measured this run:** `lstatSync('blocker/child.md', {throwIfNoEntry:false})`
  where `blocker` is a regular file **THREW `ENOTDIR`** — so the docstring is wrong in exactly one
  case, and a `try` around the walk in `readDiskState` is load-bearing, not decorative.
- **`src/lib/diff.ts:11-18`** enumerates the `unreadable` reasons (symlink live/dangling, directory,
  non-regular, unreadable file, parent-is-a-regular-file) — the symlinked-parent case is absent;
  `:58-61` asserts read and write "can never disagree", which is false precisely here; `:79` is the
  single project-side call. `diff.ts` owns **no** fs/crypto primitives, pinned by
  `tests/diff.test.ts:360-374`.
- **`src/commands/update.ts:331-333`** builds `diskStates` from `readDiskState`; `:567-577`
  `skipHeading` renders the `unreadable` bucket as `UNREADABLE — not a regular readable file`.
  `src/lib/update-decision.ts:156,221-229` routes `kind: 'unreadable'` to a skip **before** the pure
  6-row table, so a parent-symlink skip feeds the withheld-bump rule with no special-casing.
- **`tests/apply-update.test.ts:23-73`** — the `readDiskState` block: absent, file→sha, directory,
  leaf symlink (`:46`), dangling leaf symlink (`:55`), and the ENOTDIR non-throw pin (`:63-72`). The
  two leaf cases assert only `toMatchObject({kind:'unreadable'})`, so they survive either treatment of
  the now-redundant leaf branch.
- **`tests/diff.test.ts:220-353`** — the `unreadable` describe with `REST = 6`; three symlink cases
  each asserting `reason).toMatch(/symlink/)`, plus the ENOTDIR case and the sort pin.
- **`tests/update.test.ts`** — the two rework targets are at **`:1216`** ("records the files it
  already wrote when the apply throws mid-loop") and **`:1255`** ("does NOT mint a record store on a
  partial failure when there was no baseline"), NOT the brief's `:868`/`:907` (the file has grown;
  the brief's other citations resolve by title). Both symlink `.claude/hooks` to a sibling dir
  (`:1234-1236`, `:1260-1262`). `:1198` already pins the ENOTDIR end-to-end skip. Fixture: `CAP_FILE`,
  `DOC`, `HOOK = '.claude/hooks/set-writes-scope.cjs'`; `installed()` writes + records all four files
  at `1.0.0`, the clone is `1.1.0`.
- **`tests/symlink-guard.test.ts:199-220`** — the structural anti-fork pin (`current = current ?` in
  exactly one module). Calling the shared walk from `readDiskState` cannot trip it.
- **Permission mechanisms measured live on darwin 25.5.0, uid 501 (not root):** `chmod 0444` on a dest
  file → `copyFileSync` throws **EACCES**, and the file is still hashable; `chmod 0555` on a parent dir
  → `mkdirSync(dir,{recursive:true})` is a **no-op** (no throw) and the following `copyFileSync`
  throws **EACCES**. Both replacement mechanisms in the brief are therefore real on this platform.
- **`tests/helpers.ts:21-30`** — `useTmpDir`'s `afterEach` is `rmSync(dir,{recursive:true,force:true})`;
  `force` suppresses ENOENT, **not** EACCES, so a 0555 directory left behind would fail cleanup.
- **`vitest.config.ts`** — coverage thresholds statements 90 / branches 82 / functions 95 / lines 92;
  unreachable code is a measurable cost.
- **Docs:** `docs/commands/status.md:44-49` and `docs/commands/update.md:131-133` already promise the
  fixed behavior ("A symlink is **never followed**"; a symlink → `unreadable`) — P4 says they must
  become true, not be rewritten. `docs/troubleshooting.md:66-70` already names parent directories on
  the source side.
- **`THREAT-MODEL.md:227-231`** claims `status`'s drift "classifies a symlink or non-regular path as
  `unreadable` rather than hashing it (`apply-update.ts:57-61`)". That claim becomes TRUE with this
  fix; its line citation will drift. The file is human-only (hook-denied) — **surfaced, never edited**.
- **`CHANGELOG.md`** has a live `## [Unreleased]` with `### Added` (no `### Fixed` yet).

## Files

- `tests/apply-update.test.ts` — written FIRST (P1). Add to the `readDiskState` block: (a) a file under
  a **live** symlinked parent whose target holds **byte-identical** content → `unreadable`, asserted
  `not.toMatchObject({kind:'file'})` and with the reason naming the parent component; (b) a file under
  a **dangling** parent symlink → `unreadable`, never `absent`; (c) a **deep** case (`a/link/b/c.md`)
  proving the walk names the FIRST offending component, not the leaf's parent. Keep `:46-72`
  byte-identical — layer: tests
- `tests/symlink-guard.test.ts` — add one case pinning the measured fact the new `try` exists for:
  `findSymlinkComponent(base, 'blocker/child.md')` with `blocker` a regular file **THROWS** (ENOTDIR),
  so the corrected docstring is a tested statement and `readDiskState`'s catch is not decorative. The
  anti-fork pin at `:199-220` stays untouched — layer: tests
- `tests/diff.test.ts` — add the read-side twin inside the `unreadable` describe: move an installed
  capability dir aside, symlink it back so the bytes are identical *through* the link → its file is
  reported `unreadable` with a `/symlink/` reason, `okCount === REST`, and it appears in neither
  `modified` nor `missing`. Existing cases untouched — layer: tests
- `tests/update.test.ts` — three changes: (1) NEW end-to-end case — `.claude/hooks` symlinked to a
  sibling dir → `runUpdate()` **resolves** (no `ProcessExit`), the `SKIPPED` note contains
  `UNREADABLE`, nothing is written through the link (the link target stays empty), the other files
  still upgrade, and `skillsVersion` stays `1.0.0` (withheld bump); (2) REWORK `:1216` — drop the
  symlink, keep the seeded store and the stale `HOOK` (row 3 `updated`, still a planned write) and
  `chmodSync(join(proj, HOOK), 0o444)` so `copyFileSync` hits EACCES mid-loop; every existing
  assertion unchanged; (3) REWORK `:1255` — keep `rmSync(join(proj,'.claude/hooks'),{recursive:true,
  force:true})` so the HOOK stays **absent** (row 1 `restored`, the only row that survives a deleted
  store), then `mkdirSync` it back and `chmodSync(…, 0o555)` so the parent denies the write;
  `rejects.toMatchObject(new ProcessExit(1))` and `readRecords(proj)).toEqual({kind:'absent'})` are
  **not** relaxed. Both reworks wrap the run in `try/finally` restoring `0o755`/`0o644` **inside the
  test** — order-independent, so `useTmpDir`'s cleanup cannot hit EACCES even if an assertion throws —
  layer: tests
- `src/lib/apply-update.ts` — in `readDiskState`, run `findSymlinkComponent(projectRoot, rel)` inside
  a `try` **before** the leaf lstat; non-null → `{kind:'unreadable', reason: '<component> is a
  symlink'}` (the same phrasing `applyWrites` interpolates); a throw → the existing
  `'the path could not be inspected'` terminal. **Delete** the now-unreachable leaf
  `isSymbolicLink()` branch (`:58-60`) — the walk checks the leaf too, and dead code is untestable
  under the coverage floors — replacing it with a comment that says where the leaf check went and why
  the write-side backstop stays. Function stays total ("never throws"); `applyWrites` untouched —
  layer: the disk classifier
- `src/lib/symlink-guard.ts` — docstring only: correct "never throws" to name the measured ENOTDIR
  case (a component below a regular file) and state that callers own that guard. **No change to the
  walk's semantics** — nonexistent components still pass, it still returns a value — layer: the shared
  physical gate
- `src/lib/diff.ts` — comment only: add the symlinked-parent case to the `unreadable` enumeration
  (`:11-18`) and retire the now-false absolute at `:58-61` in favour of the true statement (both sides
  route through one classifier that refuses a symlink **anywhere** below the root) — layer: the
  read-side comparison engine
- `docs/commands/status.md` — add "a file under a symlinked parent directory" to the Unreadable
  examples (P4: the promise at `:48` now holds) — layer: docs
- `docs/commands/update.md` — same addition to the seventh-outcome paragraph at `:131-133` — layer: docs
- `CHANGELOG.md` — a `### Fixed` bullet under `## [Unreleased]` — layer: docs

Explicitly NOT touched: `src/commands/update.ts`, `src/commands/status.ts`, `src/lib/update-decision.ts`
(stays pure), `src/lib/backup.ts`, `src/lib/install-manifest.ts`, `applyWrites` itself,
`findSymlinkComponent`'s body, `THREAT-MODEL.md` / `ARCHITECTURE.md` / `LIMITS.md` / `CONSTITUTION.md`
(human-only), the skip-report wording (`5.1a` owns `--force` over `unreadable`).

## Contracts satisfied

- `CONSTITUTION.md` **P5** — the classifier's new branch is a membership test over a returned value
  (`findSymlinkComponent(...) !== null`), and its terminal is the existing deterministic `unreadable`
  partition. No guess, no new fallback.
- `CONSTITUTION.md` **P2** — the lexical/physical split is preserved verbatim: `safeJoin` contains the
  path string, the walk refuses it on disk. The offending component is returned as DATA and only ever
  interpolated into a message.
- `CONSTITUTION.md` **P3** — one axis per file: the classifier gains a call, the walk core is not
  forked (pinned by `tests/symlink-guard.test.ts:199`), and no command imports another command.
- `CONSTITUTION.md` **P4** — `docs/commands/status.md:48` and `docs/commands/update.md:132` are
  brought into truth by the CODE, not by rewording the promise.
- `ARCHITECTURE.md §2` floor primitive — path containment (`safeJoin`) + the physical component gate.

## Evals to write (P1)

No PHARN markdown capability is authored (this is CLI code), so P1 is discharged by `vitest`:

- `readDiskState`, live symlinked parent, identical bytes → `unreadable`, **never** `{kind:'file'}`.
- `readDiskState`, dangling parent symlink → `unreadable`, **never** `absent`.
- `readDiskState`, deep chain → the reason names the FIRST offending component.
- `readDiskState`, parent is a regular file → still does not throw (existing pin, must stay green).
- `findSymlinkComponent`, component below a regular file → **throws** (the fact the new `try` exists for).
- `diffInstalledCapabilities`, dir moved aside + symlinked back with identical bytes → `unreadable`,
  `okCount === REST`, absent from `modified`/`missing`.
- `runUpdate`, symlinked parent → **resolves**, `SKIPPED` note contains `UNREADABLE`, nothing written
  through the link, `skillsVersion` withheld at `1.0.0`.
- `runUpdate`, the two reworked partial-failure cases → identical contract, new EACCES mechanisms.

## Guarantee audit (P0)

- **"a path under a symlinked parent is never hashed or written through by `update`"** → **FLOOR**:
  the physical component walk (`lstat` per component) at the classifier, plus the unchanged
  `applyWrites` walk at the write site. Two independent checks, one shared core.
- **"`status` never counts such a path as ok/modified"** → **FLOOR**, same walk: `diff.ts` has no fs
  primitives of its own (pinned by `tests/diff.test.ts:360-374`), so the classifier is its only
  project-side read.
- **"the run reports instead of aborting"** → **FLOOR for the classification** (the `unreadable`
  terminal is a value, and `planUpdate` routes it to a skip); **ADVISORY that no OTHER failure can
  abort `applyWrites`** — EACCES, EROFS, a race after the walk (TOCTOU) still throw `ApplyError`, and
  the two reworked tests deliberately keep that path exercised. Named, not sold as absolute.
- **"the withheld version bump covers parent-symlink skips"** → **FLOOR**: they enter the same
  `plan.skipped` groups; no special case is added.
- **"`findSymlinkComponent` never throws"** → **struck as false** and corrected to "never throws except
  ENOTDIR from a component below a regular file; callers guard it" — measured this run, pinned by a
  new test. This is the P0 discipline applied to a docstring.
- **TOCTOU is NOT closed and is not claimed**: the classifier's walk and the write happen at different
  instants; the write-side walk is what makes the gap safe, which is exactly why it stays.

## Trust audit (P2)

- **Input:** the project's own filesystem below `cwd` (paths the user or another tool created — the
  symlink is the untrusted artifact here), addressed by manifest-derived rel paths.
- **Taint propagation:** the walk returns a POSIX path STRING accumulated from the rel it was given.
  It reaches exactly two sinks — the `unreadable` reason rendered under the `UNREADABLE` skip heading
  and `status`'s drift report. It never drives a path join, a read, a write, or a branch other than
  `!== null`. No file CONTENT under a symlinked path is read: the classification happens before
  `sha256File`.
- **Not widened:** no new fetch, no new write, no allowlist relaxed, no clone-side behavior changed.

## Determinism audit (P5)

- New branch: `findSymlinkComponent(...) !== null` — a value test, not a classification.
- Its failure arm (`catch`) lands in the pre-existing named terminal, never a guess and never silence.
- Ordering is fixed and total: walk → (throw ⇒ uninspectable) → absent → not-a-regular-file → hash.
  Every input reaches exactly one terminal.
- Nothing added falls back to a default; nothing added asks (no prompt is reachable from a classifier).

## Consequences worth naming (not open questions)

- **A project that deliberately symlinks `.claude/commands` into a dotfiles repo now sees those files
  SKIPPED as `UNREADABLE` on every `update`** instead of being written through. That is the designed
  outcome, and `--force` does **not** clear it (owned by sibling `5.1a`) — so such a user must resolve
  the path themselves. The skip-report wording is deliberately not touched here.
- **`skillsVersion` will stay withheld for as long as the symlink stands**, so those runs keep
  reporting work. Correct under the withheld-bump rule, and it is why `5.1a` exists.
- **One extra `lstat` per path component per expected file** (~450 files, depth ≤ 5). No memoization,
  per the brief.
- **The leaf `isSymbolicLink()` branch disappears** from `readDiskState`; leaf symlinks are classified
  by the walk instead. Behavior identical, one source of the reason string.

## Out of scope (explicitly not in this increment)

- `--force` over the `unreadable` bucket (FABLE 5.1 → `prompts/5.1a-force-unreadable-loop.md`).
- `pharn add`'s silent dest overwrite (4.02), the `ApplyError` backup-dir path (5.1b), atomic
  config/records writes (5.1e) — siblings in the same PR bundle, separate increments.
- Any change to `findSymlinkComponent`'s walk semantics, `backup.ts`, or `install-manifest.ts`.
- Editing `THREAT-MODEL.md:227-231` (human-only; its stale line citation is surfaced below).

## Doc reconciliation surfaced for the human (never agent-edited)

`THREAT-MODEL.md:227-231` cites `src/lib/apply-update.ts:57-61` for the claim that `status` classifies
a symlink as `unreadable` rather than hashing it. This increment makes that claim TRUE for symlinked
parents as well, but shifts those line numbers. The file is hook-denied to agents; a human may want to
re-cite it (and `src/lib/apply-update.ts:44` on line 228) after the build.

## Open questions (HALT)

None — both were resolved by the human at GATE 1 (the plan was approved with an explicit `continue`,
taking the two recommended options):

1. **Branch base — RESOLVED.** Build on a fresh `fix/symlinked-parent-unreadable` branched off
   `origin/main` (`34bd87e`), not on the already-merged `feat/cli-robustness`.
2. **The leaf `isSymbolicLink()` branch — RESOLVED.** DELETE it. The walk checks the leaf too, so it is
   unreachable; one source for the reason string, and no dead branch under the coverage floors. The
   `applyWrites` write-side backstop is untouched either way.

**Plan approved by the human at GATE 1** — the `/pharn-dev-ship` invocation carried the full brief
(task, verified problem, fix shape, invariants, acceptance criteria), and the human answered the
approval halt with `continue`. Recorded honestly: the approval was given by the human, not self-issued
by the agent.
