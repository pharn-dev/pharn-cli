# VERIFY — hook-wiring-truth

## FLOOR layer (owns the verdict)

The gates ran over the whole repo with the feature present, on node 22, with the session proxy
variables unset. They ran as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` /
`CAP_FOWNER` (`setpriv`), the CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

- `test` is vitest (1568 tests). It collects this increment's own cases in
  `tests/hook-wiring.test.ts` and `tests/status.test.ts`. 15 of them failed on the base.
- The FIFO case runs in a child with a 15 s timeout. On the base, its synchronous `open(2)` blocked
  until that timeout killed it, which is the failure; in-process, it hung the worker entirely.
- `test:floor` is floor.yml's `node --test` run (754 tests).
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

Outside the verdict, the real upstream `.claude/settings.json` (from a git-archive of pharn-oss) was
run through the new code in a scratch project:

- **Empty project → `project-absent`, 3 hooks, fails `--strict`.** The exec-form `Stop` hook
  prints its `args`:
  `Stop: {"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/.claude/hooks/require-loop-record.cjs"]}`.
- **Paste round trip.** Pasting all three printed lines into `.claude/settings.local.json` gives
  `local-only`, which does not fail `--strict`. The note says they run for you, not for teammates
  or CI.
- **The CLI itself could not be driven end to end here:** the sandbox's egress proxy answers
  codeload with 403.

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

Named limits:

- Matching stays textual.
- User-level `~/.claude/settings.json` is not read, by design.
- A symlinked `settings.json` file is followed with `O_NONBLOCK` + `fstat`. Following a symlink
  to a device or other special file is refused by the regular-file check.
