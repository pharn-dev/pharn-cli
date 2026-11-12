# PLAN — hook-session-cwd

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- base: f83b736a98867eed28c12f6d164189627e4be0e1
- increment: the two PreToolUse write-guards (`enforce-writes-scope.cjs` fix #7, `protect-trusted-paths.cjs` fix #2) judge a write against the SESSION's checkout — the git work tree named by the hook payload's `cwd` — when, and only when, that work tree is the hook's own project or a verified linked worktree of the same repository; every other case keeps today's `process.cwd()` root (fail-closed).
- layer(s): dev-loop floor hooks (`.claude/hooks/`, ARCHITECTURE.md §3.3 — Hook class); not product code, nothing in `src/` or `docs/` changes
- constitution_refs: [P0, P1, P2, P5, P6, P7]

## Why (live state, read this run)

- `.claude/settings.json` wires both hooks as `node .claude/hooks/<hook>.cjs`, a path relative to the hook process's cwd.
- Both hooks take `ROOT` from `process.cwd()`; `enforce-writes-scope.cjs` also reads `.pharn/writes-scope.json` from `process.cwd()`.
- Observed this run: in this session (started from the main checkout, working in `.claude/worktrees/triage-stage-port-0cf3b8/`) a Write to a worktree path was denied as `Blocked path : .claude/worktrees/triage-stage-port-0cf3b8/.dev/features/hook-session-cwd/PROBE.md`, judged against the MAIN checkout's scope file. So the hook process runs with cwd = the main checkout, runs the main checkout's copy of the hook, and reads the main checkout's scope; a scope the dev loop sets inside the worktree (`set-writes-scope.cjs` runs via Bash, whose cwd IS the worktree) is never read. Every Write/Edit in a worktree session is denied unless the maintainer widens the main checkout's scope by hand (as done for pharn-dev/pharn-cli#358 and for this run).
- Claude Code hook contract (code.claude.com/docs/en/hooks, read this run): every hook receives on stdin a common field `cwd` — "Current working directory when the hook is invoked"; its worktree note: "`${CLAUDE_PROJECT_DIR}` stays put … `cwd` follows Claude: the `cwd` field in the hook's input JSON is the worktree root after Claude enters a worktree, and the new directory after Claude runs `cd`. Read it when a hook needs to know which directory Claude is working in."
- Git's worktree link (read this run): the worktree's `.git` is a FILE `gitdir: <common>/worktrees/<name>`; `<common>/worktrees/<name>/gitdir` holds the path back to `<worktree>/.git`; `commondir` holds `../..`.

## Design

New shared module `.claude/hooks/session-root.cjs` exporting `sessionRoot(payloadCwd, anchor = process.cwd())`, returning a realpath'd directory:

1. `anchorReal` = realpath(anchor) (or anchor on failure — today's exact ROOT).
2. `payloadCwd` not a string, not absolute, contains a NUL, or cannot be realpath'd → `anchorReal`.
3. `top` = the nearest ancestor of realpath(payloadCwd) (inclusive) holding a `.git` entry; `.git` is `lstat`ed — a symlinked `.git` or any other type is not a work tree marker and ends the search with no `top` → `anchorReal`.
4. `top === anchorReal` → `anchorReal` (a subdirectory of the project: unchanged behaviour).
5. `anchorCommon` = the anchor's common git dir: `<anchor>/.git` if a directory; if a file, its `gitdir:` target's `commondir` (resolved against that gitdir), else the gitdir itself. Any failure → `anchorReal`.
6. Accept `top` ONLY if it belongs to the same repository:
   - (a) `<top>/.git` is a directory whose realpath equals `anchorCommon` (the main work tree, when the anchor is a linked worktree), or
   - (b) `<top>/.git` is a regular file (≤ 4096 bytes) whose first line is `gitdir: <G>`, realpath(G resolved against `top`) has parent exactly `<anchorCommon>/worktrees`, AND `<G>/gitdir` (≤ 4096 bytes, trimmed, resolved against G) realpaths to realpath(`<top>/.git`) — the two-way link git itself writes.
     Anything else (a nested or foreign repo, a forged `.git` file whose admin dir does not point back, an unreadable file) → `anchorReal`.

Both hooks then use `ROOT = sessionRoot(payload.cwd)`; `enforce-writes-scope.cjs` reads the scope file at `path.join(ROOT, ".pharn/writes-scope.json")` (was `process.cwd()`). Globs, `ALWAYS`, `DEFAULT_SAFE_SET`, the setter-only `SCOPE_FILE` deny, symlink canonicalization and the deny message are unchanged — they now apply relative to the session's work tree. `set-writes-scope.cjs` needs no change (it runs via Bash, cwd = the session's directory; its tests gain a round-trip case proving the pair now agrees).

Consequence, stated: in a verified worktree session, a Write to the MAIN checkout is outside `ROOT` and denied (the worktree is the session's tree). In the main-checkout session nothing changes.

## Files

- `.claude/hooks/session-root.cjs` — new: `sessionRoot(payloadCwd, anchor)` + its git-link checks, stdlib-only — layer Hook
- `.claude/hooks/enforce-writes-scope.cjs` — `ROOT` and the scope file from `sessionRoot(payload.cwd)`; header comment documents the session root — layer Hook
- `.claude/hooks/protect-trusted-paths.cjs` — `ROOT` from `sessionRoot(payload.cwd)` (relative targets + symlink walk resolve in the session's tree) — layer Hook
- `.claude/hooks/git-worktree-fixture.cjs` — new test support: a real `git init` repo + `git worktree add` under `.claude/worktrees/<n>` in a temp dir, plus the hook-spawn helper with a payload `cwd` — layer Hook (tests)
- `.claude/hooks/session-root.test.cjs` — new: unit cases for every accept/reject branch of `sessionRoot` — layer Hook (tests)
- `.claude/hooks/enforce-writes-scope.test.cjs` — process cwd ≠ session cwd cases — layer Hook (tests)
- `.claude/hooks/protect-trusted-paths.test.cjs` — process cwd ≠ session cwd cases — layer Hook (tests)
- `.claude/hooks/set-writes-scope.test.cjs` — setter-in-worktree → hook-from-main round trip — layer Hook (tests)
- `.dev/features/hook-session-cwd/PLAN.md` — this plan — layer dev-loop artifact

### Explicitly not touched

- `.claude/settings.json` — the hook wiring stays `node .claude/hooks/<hook>.cjs` (the main checkout's copy runs; this change reaches worktree sessions once merged and pulled into the main checkout)
- `.claude/hooks/set-writes-scope.cjs` — already writes to the session's cwd
- `.pharn/writes-scope.json` — runtime state (pharn-dev/pharn-cli#358 untracks it); never committed by this increment
- `src/`, `docs/`, `CHANGELOG.md`, `package.json` — no product behaviour changes; dev-only, no version bump (as #353)

## Contracts satisfied

- ARCHITECTURE.md §3.1/§7 "`writes:` ENFORCED by the pre-write hook" (fix #7) — now true in a worktree session too, against the scope that session's setter wrote.
- ARCHITECTURE.md §3.3 Hook class — deterministic, non-LLM, stdlib-only (no `git` spawn in the hooks).

## Evals to write (P1) — `node --test` (floor.yml runs `.claude/**/*.test.cjs`)

Fixture: temp `main/` = real git repo with one commit; `main/.claude/worktrees/wt` = `git worktree add`. "hook(main, wt)" = hook process cwd `main/`, payload `cwd` = `wt/`.

session-root.test.cjs:

- no / non-string / relative / NUL / nonexistent payload cwd → anchor
- payload cwd = anchor, or a subdirectory of it → anchor
- payload cwd = linked worktree, or its subdirectory → worktree root
- anchor = linked worktree, payload cwd = main work tree → main (case a)
- forged `.git` file pointing at the real worktree's admin dir (back-link names another tree) → anchor
- forged `.git` file pointing at a fake `main/.git/worktrees/fake` with no `gitdir` → anchor
- `.git` file pointing outside `<common>/worktrees` → anchor
- nested repo inside main, and a foreign repo outside main → anchor
- a symlinked `.git` → anchor

enforce-writes-scope.test.cjs:

- hook(main, wt), no scope anywhere: `wt/src/x.ts` (absolute) → ALLOWED (was denied: judged as `.claude/worktrees/wt/src/x.ts`)
- hook(main, wt): the WORKTREE's scope governs — wt scope `[src/a.ts]`, main scope `[".claude/worktrees/wt/**"]`: `wt/src/a.ts` allowed, `wt/src/b.ts` DENIED
- hook(main, wt subdir `wt/src`) → judged at the worktree root
- hook(main, wt): `wt/.claude/hooks/x.cjs` DENIED; `wt/.pharn/writes-scope.json` DENIED (setter-only); `main/src/x.ts` DENIED (outside the session tree)
- hook(main, forged `.git` under `main/.dev/evil`): `main/.dev/evil/src/x.ts` DENIED (fallback to main root)
- hook(main, foreign repo): its `src/x.ts` DENIED
- hook(main, `cwd: 42` / relative / missing dir): `wt/src/x.ts` DENIED (fallback = today)

protect-trusted-paths.test.cjs:

- hook(main, wt): `wt/CONSTITUTION.md` and relative `CONSTITUTION.md` BLOCKED; relative `src/foo.js` allowed
- hook(main, wt): relative `features/notes.md` that is a symlink in the WORKTREE onto `../CONSTITUTION.md` → BLOCKED (resolved in the session tree; was resolved against main, where no such link exists)

set-writes-scope.test.cjs:

- setter run with cwd = wt writes `wt/.pharn/writes-scope.json` (main's untouched); enforce hook(main, wt) then allows exactly that scope and denies a sibling

## Guarantee audit (P0)

- "a worktree session's writes are judged against that worktree's `writes-scope.json`" → floor: hook (fix #7), with the root selection reduced to path-equality tests over `realpath` results + git's two-way link (`.git` file → `<common>/worktrees/<n>`, `<n>/gitdir` → back). Tested with a REAL `git worktree add`.
- "a payload `cwd` cannot move the root to a tree outside the repository's own work trees" → floor: the accept test is equality against `anchorCommon` (case a) or the two-way link into `<anchorCommon>/worktrees/` (case b); everything else falls back. Forged-file / foreign / nested cases are evals above.
- "fail-closed" → floor: every error path returns the anchor root, i.e. today's behaviour, which denies worktree writes; no new allow without the verified link.
- "a session's trusted docs stay protected" → floor: fix #2's basename/fragment test is root-independent and unchanged.
- Residuals (advisory, stated): (1) the change takes effect only once the main checkout runs the new hook (settings wiring runs the main checkout's copy); (2) the payload `cwd` is supplied by Claude Code — a session that `cd`s into another verified worktree of the same repo is judged against THAT worktree's scope (same repository, its own scope file, its own fix #2); (3) Bash writes bypass PreToolUse entirely (pre-existing limit, unchanged); (4) relative tool paths resolve against the session root, not a `cd`'d subdirectory (Claude Code's Write/Edit take absolute paths).

## Trust audit (P2)

- The payload `cwd` is input from the harness, treated as untrusted data: it only ever SELECTS among the repository's own verified work trees by equality tests; it never becomes a glob, a scope entry, or a path written. File reads it causes are bounded (≤ 4096 bytes, `lstat` first, no symlinked `.git`).
- The worktree's `.pharn/writes-scope.json` was written by that worktree's setter (Bash), exactly as the main checkout's is today; the Write tool still cannot write it (`SCOPE_FILE` deny, relative to the session root).

## Determinism audit (P5)

- Every branch in `sessionRoot` is a type test, a string/path equality, or a regex match on `^gitdir: (.+)$`; no guess. The terminal fallback is the anchor root (today's fail-closed behaviour).

## Open questions (HALT)

- none — the cwd contract was read from Claude Code's docs and observed live; the maintainer asked for this fix.
