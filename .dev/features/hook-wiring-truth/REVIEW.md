# REVIEW — hook-wiring-truth

Increment:

- `src/lib/hook-wiring.ts`:
  - reads the UNION of `.claude/settings.json` and `.claude/settings.local.json`;
  - adds a `local-only` status and a `hookWiringFails` predicate;
  - opens every file `O_NONBLOCK` (upstream also `O_NOFOLLOW`);
  - follows a symlinked project FILE but not a symlinked `.claude/`;
  - prints each missing hook as its own JSON, escaped over the shared sanitizer's class plus
    U+2028/2029, capped at 300 characters.
- `src/commands/status.ts`: `--strict` reads the diff status instead of the note's presence.
- Tests in three files, `docs/commands/status.md`, `docs/commands/update.md`, CLAUDE.md and
  CHANGELOG.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed (1568 tests), `/pharn-dev-regress` returned `no-regressions`, and `/pharn-dev-verify`
returned `PASS`.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)** — each claim has a test:
  - "no format, line-separator or control character from upstream reaches the note" → the escape
    class plus tests over C0, C1, Cf and U+2028/2029;
  - "a printed hook satisfies the check when pasted" → the round-trip test over the NEW fixture;
    VERIFY repeated it on the real upstream file;
  - "a FIFO cannot hang status/update" → `O_NONBLOCK` + `fstat`, plus a child-process test with a
    hard timeout;
  - "local-only passes `--strict`" → the `status` test;
  - "an unreadable file is never guessed around" → a test that names the file.
- **L-eval (P1)** — 15 cases failed on the base. The rest are guards: a symlinked `.claude/`, a
  symlinked upstream file, C0 escaping, and split wiring.
- **L-trust (P2)** — upstream strings reach the terminal only escaped and capped. Project files are
  data and never printed. Following a symlinked project FILE reads the user's own target; what
  reaches output from it is at most the status and a fixed reason string.
- **L-axis (P3)** — the reading and display rules stay in `hook-wiring.ts`. `status.ts` gains one
  predicate call, and its gate now asks the module that owns the rule.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/hook-wiring.ts:224'
  problem: 'The two casts narrow `ReadResult` to ok|absent after the loop that returns on `unreadable`. They are correct today, but the compiler no longer checks the invariant; a later edit that drops the early return would pass typecheck. A small narrowing helper would keep it checked.'
  evidence: "const inShared = wiredKeys(shared as ReadResult & { kind: 'ok' | 'absent' });"
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/lib/hook-wiring.ts:254'
  problem: "The escape class is built from code points so no raw U+2028/2029 sits in the source. It duplicates terminal-safe.ts's class with two additions. If that class ever widens, this one will not follow unless edited too. A shared export would single-source it; kept local to avoid widening terminal-safe.ts's API in this increment."
  evidence: 'const ESCAPED = new RegExp('
```

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (minor).** The standing decision is the human's (GATE 2).
