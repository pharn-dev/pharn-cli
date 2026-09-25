# GRILL — signal-lock-release

Plan: `.dev/features/signal-lock-release/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}`, so only the inline axes run. The plan is
`trust: untrusted`, and nothing in it read as an instruction.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/signal-lock-release/PLAN.md:47'
  problem: 'The re-raise must never leave the process running. SIGHUP (added at GATE 1) has no default-kill emulation on win32, where Node emulates only SIGINT/SIGTERM/SIGKILL for process.kill, and a kill that throws inside the handler would leave the process alive with its listeners removed. Wrap the re-raise: if process.kill throws, exit with 128 + the signal number.'
  evidence: '4. Re-raises `sig`, so the exit status stays 130/143/129.'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/signal-lock-release/PLAN.md:59'
  problem: "The interrupted-while-writing line printed from the signal path must obey the same rule as the exit path: a stderr write failure (EPIPE on a closed terminal, which is exactly SIGHUP's case) must be swallowed, or it replaces the signal exit with an exception."
  evidence: '`withProjectLock` registers `release(cwd)` plus the same "interrupted while writing" stderr line'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/signal-lock-release/PLAN.md:76'
  problem: 'The deadline case needs fake timers AND a body stream whose cancel is observable. Otherwise "the reader was cancelled" is inferred from the null result, which the base code already returns, so the test would pass on the base and prove nothing. Assert on the recorded cancel call.'
  evidence: 'A 2xx body that never ends → at the 8 s deadline the reader was cancelled and the result is'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/signal-lock-release/PLAN.md:69'
  problem: 'The "leaves alone a lock another process created" case has to create that foreign lock between the release and the signal, in the child. Say so in the test, or the case collapses into the plain release case.'
  evidence: 'After a normal release, a later SIGTERM leaves alone a lock file another process created'
```

### Checked, no finding

- Axis (P3): the signal logic leaves `repo.ts` for a module whose one reason to change is fatal-signal
  handling. `project-lock.ts` and `repo.ts` both depend on it, and neither on the other.
- Determinism (P5): a fixed signal list and set membership. Handlers are installed lazily, on the
  first registration, so a run that never registers keeps the default disposition: the same
  behaviour as today for the prompt-only phases.
- Trust (P2): response bodies are cancelled, never read further. There is no new output from
  untrusted data.

## Summary

The design is sound. The one important gap is the win32 re-raise: once SIGHUP joins the list, the
handler must end the process even where `process.kill` cannot emulate the signal. The rest is test
sharpness: cancels must be observable rather than inferred, and the foreign-lock case needs an
explicit setup.

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to
weigh before /pharn-dev-build.**
