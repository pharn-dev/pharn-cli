# REVIEW — signal-lock-release

Increment:

- `src/lib/fatal-signal.ts` (new): `onFatalSignal`, a lazily installed SIGINT/SIGTERM handler. It runs
  the registered cleanups newest first, removes every listener, re-raises, and falls back to
  `exit(128 + n)`. SIGHUP is deliberately excluded (the plan amendment: `nohup`).
- `src/lib/repo.ts`: the clone cleanup registers through `onFatalSignal`. `fetchCommitSha` discards a
  non-2xx body and reads a 2xx body through its own abort-cancelled reader. `downloadArchive`
  discards a non-2xx body.
- `src/lib/project-lock.ts`: `withProjectLock` registers the release plus the interrupted line for
  the lock's lifetime.
- Tests in four files, `docs/troubleshooting.md`, and two CHANGELOG entries.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed (1530 tests), `/pharn-dev-regress` returned `no-regressions`, and `/pharn-dev-verify`
returned `PASS`.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)**
  - "a SIGINT/SIGTERM while the lock is held releases it and still dies by the signal" → child
    processes observing the exit status and the lock file.
  - "the clone goes too" → the same child.
  - "a released lock's cleanup can never delete another process's lock" → a child writes an
    empty (mid-create) lock after release and signals itself. The lock survives.
  - "no SIGHUP listener" → a membership test.
  - "an unread SHA body is released" → observable-cancel streams, per the grill.
  - What the floor does not reach is named in VERIFY.md: SIGKILL, power loss, a hangup, a signal
    before registration, and the stub-only fallback.
- **L-eval (P1)** — 14 of the new cases fail when run against the base `src/`, checked in a
  worktree. The rest are guards: a leftover lock, the in-process clone cleanup, and the unchanged
  deadline answer.
- **L-trust (P2)** — untrusted response bodies are now consumed less (cancelled, never drained).
  Nothing new reaches output.
- **L-axis (P3)** — `fatal-signal.ts` has one reason to change. `repo.ts` and `project-lock.ts` each
  depend on it and not on each other. The body helpers stay in `repo.ts`, the fetch boundary's
  own module.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/lib/repo.ts:294'
  problem: "readText still has no byte cap, the same as the res.json() it replaces, so a hostile or broken API response can grow memory for up to 8 s. skills-version.ts caps its body at 256 KB. A cap needs a size above real commit responses, which carry file lists; that is out of this increment's scope, so it is named, not added."
  evidence: 'async function readText(res: Response, signal: AbortSignal): Promise<string> {'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/fatal-signal.ts:83'
  problem: "removeAllListeners(sig) removes every listener on the signal, not only clack's, before the re-raise. That is the pre-existing repo.ts behavior, moved unchanged, and correct for a process that is about to die. A future listener meant to observe a signal and let the process live would be removed too; the header comment says so."
  evidence: 'process.removeAllListeners(sig);'
```

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (minor).** The standing decision is the human's (GATE 2).
