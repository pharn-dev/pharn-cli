# REVIEW — fetch-hard-deadline

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** "a fetch returns control within its timeout" reduces to the timer's own `reject` in
  a `Promise.race` — independent of whether the runtime delivers the abort to the body stream.
- **L-eval (P1):** `tests/deadline.test.ts` (4 cases) + one "abort never reaches the body" case per
  call site (download, commit-SHA resolve, SKILLS_VERSION) — all three HANG on the base source (vitest
  5 s timeout). `repo.test.ts` / `repo-signals.test.ts` fakes now return real web `ReadableStream`s.
- **Out-of-suite evidence (grill #1):** the review's original repro (chunked server dripping every
  250 ms, 3 s cap, `gc()` at 1 s): old shape "NOT ABORTED after 10 s" on Node 22.22.2 and 20.20.2;
  the `withDeadline` shape rejects at 3.0 s on both.
- **L-trust (P2):** no change to what remote bytes are accepted; the byte caps are unchanged.
- **L-axis (P3):** `lib/deadline.ts` has one axis (bounding a network operation's duration); the two
  fetch modules consume it.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/deadline.ts'
  problem: "After the deadline the losing work may keep a socket open until undici's own timeouts if the cancel does not propagate; the CLI's callers exit or continue regardless, so this is a resource note, not a hang."
  evidence: 'running.catch(() => undefined);'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 2 advisory findings. No lesson proposed for canon.
