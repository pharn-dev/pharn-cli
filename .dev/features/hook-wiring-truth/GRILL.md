# GRILL — hook-wiring-truth

Plan: `.dev/features/hook-wiring-truth/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`;
nothing in it read as an instruction.

## Findings

### Honest scope / completeness (P7, P3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: important
  file: '.dev/features/hook-wiring-truth/PLAN.md:84'
  problem: 'status.ts fails --strict on `hookLines !== null` — on the PRESENCE of a HOOKS note (status.ts:139-147). A local-only note that must NOT fail --strict (GATE 1 answer 1 → a) therefore needs the strict test to read the diff status instead, and src/commands/status.ts is not in ## Files. Declare it, or the build cannot land the approved behaviour without escaping scope.'
  evidence: '`tests/status.test.ts` — layer tests. `--strict` exits 0 when the hooks are wired only in'
```

### Determinism (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/hook-wiring-truth/PLAN.md:62'
  problem: 'The union does not say what an UNREADABLE file contributes. If settings.json is malformed and settings.local.json wires everything, is that "match" or "unreadable"? Keep the conservative answer: any unreadable project file makes the result unreadable, naming WHICH file, because pharn cannot know what it wires. Decide it in the table rather than leaving it to the build.'
  evidence: "The diff reads the project's `settings.json` AND `settings.local.json`; the set of wired hooks"
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/hook-wiring-truth/PLAN.md:67'
  problem: 'U+2028 / U+2029 (LINE and PARAGRAPH SEPARATOR, category Zl/Zp, not Cf) pass both terminalSafe and JSON.stringify raw. Escape them too, so the "nothing raw that moves the cursor" claim holds for the whole line.'
  evidence: 'It is built as JSON, then every character the shared sanitizer would'
```

### Checked, no finding

- **Trust (P2).** Upstream strings reach the terminal only escaped and capped. Following a
  project-side symlinked leaf reads the user's own target as data. Its content is never printed:
  only upstream entries are.
- **Eval coverage (P1).** Each finding has a failing-on-base case listed. The FIFO case needs no
  child process: with `O_NONBLOCK` the open returns at once, and on the base it hangs past the
  vitest timeout, which is the failure.

## Summary

Right idea, one scope gap. The approved "local-only counts as wired, with a note" cannot be built
without touching the strict gate in `status.ts`, so the plan must declare that file. The union also
needs an explicit rule for an unreadable file. The escape set should cover the two line separators.

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to
weigh before /pharn-dev-build.**
