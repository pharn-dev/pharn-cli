# REVIEW — hook-session-cwd

Reviewed: the working-tree diff against `f83b736` — `.claude/hooks/session-root.cjs` (new),
`enforce-writes-scope.cjs`, `protect-trusted-paths.cjs`, `git-worktree-fixture.cjs` (new), and the four
`*.test.cjs` suites. Floor first: `npm run check` exit 0, `validate.mjs` exit 0, the `floor` workflow's
`node --test` set 785/785, regress `no-regressions`, verify `PASS`. The seven new positive hook cases
were also run against the `HEAD` hooks in a scratch copy: all seven fail there and pass here, so they
demonstrate the change rather than restate it.

## Floor-gate findings (blocking)

None.

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.claude/hooks/enforce-writes-scope.cjs:52'
  problem: 'The new require and the sessionRoot call add a throw surface at module load; a hook that exits with any non-2 code is a NON-blocking error to Claude Code, so a missing or broken session-root.cjs would let the write through (fail-open) instead of falling back to the process cwd.'
  evidence: 'const { sessionRoot } = require("./session-root.cjs"); … const ROOT = sessionRoot(payload.cwd);'
```

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.claude/hooks/protect-trusted-paths.cjs:33'
  problem: 'Same throw surface in the trusted-doc guard: an exception while loading or calling session-root.cjs exits 1, which Claude Code treats as non-blocking, so the fix #2 backstop would not deny.'
  evidence: 'const { sessionRoot } = require("./session-root.cjs");'
```

Every branch inside `sessionRoot` itself catches its own fs errors (`realOr`, `gitEntry`, `readSmallFile`),
so the risk is a partial checkout or a future edit, not today's code. A `try { … } catch { realpath(cwd) }`
around the require + call in both hooks would close it, with one test that runs a hook copy beside a
broken `session-root.cjs`.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/hook-session-cwd/PLAN.md:101'
  problem: "The fix reaches worktree sessions only after it is merged AND pulled into the main checkout, because settings.json runs the main checkout's copy of each hook; until then every worktree session still needs the manual scope widening."
  evidence: 'the change takes effect only once the main checkout runs the new hook'
```

### L-eval → P1

No gap found: every accept and reject branch of `sessionRoot` has a unit case (16), each hook has
process-cwd ≠ session-cwd cases, and the setter → hook round trip is pinned. Tests need a `git` binary
(present on the `floor` workflow's ubuntu runner).

### L-trust → P2

The payload `cwd` only selects among the repository's own work trees through realpath equality and git's
two-way link; it is never a glob, a scope entry, or a written path. Reads it triggers are capped at
4096 bytes through one `O_NOFOLLOW | O_NONBLOCK` descriptor. Forging a work tree would need a back-link
under `.git/worktrees/`, which no default-safe or `ALWAYS` glob reaches. Nothing in the reviewed files
tried to steer this review.

### L-axis → P3

`session-root.cjs` holds one reason to change (which tree a write is judged in); the fixture is test
support only. No sibling-module references.

## Verdict

GREEN — 0 floor-gate findings; 3 advisory (2 important, 1 minor) for the human at GATE 2.

## After GATE 2

The maintainer chose "fix, then open PR". Both hooks now load and call `session-root.cjs` inside a
`try`, falling back to the process cwd on any throw; one test per hook runs a copy beside a missing,
load-throwing and (enforce) call-throwing `session-root.cjs` and asserts exit 2. Those tests fail
against an unguarded copy (2 failures) and pass with the guard. The two important findings are fixed;
the minor one (takes effect after merge + pull) stands as a stated residual.

## Proposed lesson (candidate only — not canon)

None: the fail-open note is specific to this increment's new require, not a recurring failure yet.
