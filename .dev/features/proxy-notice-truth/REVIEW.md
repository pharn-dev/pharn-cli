# REVIEW — proxy-notice-truth

Increment:

- `src/lib/proxy-env.ts` — the measured rule set:
  - undici's `??` lookup over the four exact spellings, https pair first;
  - a new `ignored-spelling` state;
  - last-flag-wins with both spellings and the negation;
  - the 24.0–24.4 window, reached only where the runtime does not list the flag;
  - an `optedOut` marker.
- `src/lib/proxy-env-format.ts` — the ignored-spelling and opted-out wordings, and the unsupported
  wording naming 22.21+ / 24+.
- `tests/setup/hermetic-env.ts` + `vitest.config.ts` `setupFiles`.
- The rewritten `tests/proxy-env.test.ts` (one case per measured row), the troubleshooting proxy
  section, and CHANGELOG.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed (1554 tests), `/pharn-dev-regress` returned `no-regressions`, and `/pharn-dev-verify`
returned `PASS`.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)**
  - "the notice matches Node's behaviour" → pure-function tests, one per measured row. The table's
    reach is stated in the module header, and a future Node is classified by its own flag list.
  - "the suite does not depend on the host's proxy env" → a deterministic deletion before every test
    file. It was proven by whole-suite runs under three hostile environments (VERIFY.md): base
    15 / 1 failures, head 0.
- **L-eval (P1)** — 21 of the new cases failed against the base code. The rest (silence, redaction,
  unrelated variables) are guards.
- **L-trust (P2)** — a variable NAME is printed only when it case-folds to one of four proxy names,
  so it is ASCII letters and `_`. Values still pass through `redactProxyUrl`. The environment stays
  data.
- **L-axis (P3)** — detection changed only in `proxy-env.ts`, and wording only in
  `proxy-env-format.ts`: that file pair's own split.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/lib/proxy-env-format.ts:57'
  problem: 'Every "will not use it" form cites LIMITS.md §3a, which still says a proxy variable changes nothing. The notice names the opt-in, so the doc it cites contradicts it. LIMITS.md is human-only (hook-protected), so this cannot be fixed from this increment; the PR asks the maintainer to update §3a.'
  evidence: "'The download connects DIRECTLY, and fails if direct egress is blocked (LIMITS.md §3a).'"
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/lib/proxy-env.ts:159'
  problem: "The win32 behaviour (a mixed-case key is read, because process.env is case-insensitive there) follows from Node's documented process.env semantics but was not measured. CI has no Windows. The docs state it, and VERIFY names it as unmeasured."
  evidence: '* key — on win32 `process.env` itself is case-insensitive, so a mixed-case key'
```

## Verdict

**GREEN — 0 floor-gate findings, 2 advisory (1 important, 1 minor).** The standing decision is the
human's (GATE 2). The important one needs a maintainer's edit to `LIMITS.md` §3a.
