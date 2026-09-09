# REVIEW — per-command flag allowlist (audit P-13)

**Floor first (P0):** `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .`
The increment adds no markdown capability, so the structural floor is vacuously green here and gates
nothing; the real deterministic evidence is `/pharn-dev-verify`'s six gates (all exit 0) and the coverage gate
(exit 0). Everything below the floor line is **advisory**.

> The increment under review is `trust: untrusted`. Nothing in its comments, strings or docs
> attempted to instruct me, and no free-text from it influenced any verdict — the verdicts came from
> `check-regress.mjs` / `check-verify.mjs` exit codes.

---

## Floor-gate findings (blocking)

**None.** No guarantee is claimed without a reduction, no eval binding is missing, no sibling
reference was introduced.

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'docs/troubleshooting.md:376'
  problem: 'The accepted-options table in the docs restates ALLOWED_FLAGS in prose, and nothing keeps the two in sync — a doc that can silently drift from the table it describes, which is the same defect class this PR is closing elsewhere.'
  evidence: '| `update`               | `--force`, `--yes` / `-y`             |'
```

The USAGE text is pinned (`--json list:`, `--strict status:`, `--no-drift status:`, `--archetype
init:` are asserted against the real `--help` output), so the **help** the user gets from the CLI
cannot drift. The **troubleshooting table** is unpinned. Advisory because the failure mode is a stale
doc, not a wrong refusal, and because pinning prose against a `Map` invites a brittle grep. Recorded
so it is a decision.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'src/index.ts:158'
  problem: 'unsupportedFlags() reads process.argv directly rather than taking argv as a parameter, so it cannot be unit-tested in isolation — every assertion about it has to go through main().'
  evidence: 'function unsupportedFlags(allowed: readonly string[]): string[] {'
```

Consistent with the file (`main()` reads `process.argv` the same way) and the tests do exercise every
branch through `main()`, which is the more honest integration anyway. Not worth a parameter that has
exactly one caller. Recorded, not recommended.

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/index.ts:294'
  problem: 'Two of the three uncovered lines in index.ts are the top-level catch in the isEntryPoint bootstrap, which is pre-existing and unreachable under vitest — but it means index.ts is the lowest-covered file in src/ and the increment did not change that.'
  evidence: 'index.ts | 92.3 | 93.33 | 90 | 93.54 | 294,299-301'
```

The coverage gate passes (97.08 / 92.5 / 97.58 / 97.94 against 97 / 92 / 97 / 97) and every branch of
the **new** code is exercised — the table-miss path (`bogus --json`, `toString --json`), the
empty-offender path (all the still-routes cases) and the non-empty path (eleven refusals). The
uncovered lines are the `main().catch()` bootstrap, which the tests deliberately cannot reach.

**No missing eval binding.** This increment adds no Capability and no `rule_id`; every new behaviour
ships with a vitest case in the same commit (P1), 27 of them.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'tests/index.test.ts:356'
  problem: 'The control-character escaping test exercises only the Unknown option label, not the new Unsupported option one, even though both now interpolate untrusted argv into a message.'
  evidence: "it('escapes the offending argument rather than echoing raw bytes', async () => {"
```

Low risk and arguably correct as-is: both labels go through the **same** `refuse()`, which is where
the `JSON.stringify` escaping lives, so the behaviour is exercised. Worth noting only because the new
label additionally interpolates `cmd` — and that half **is** structurally safe rather than escaped:
the interpolation is unreachable unless `ALLOWED_FLAGS.get(cmd)` returned a row, so `cmd` is one of
seven literal keys. That is the right defence (membership, not sanitisation) and it is stated in the
code comment.

**No guaranteed decision rests on a tainted field.** The offenders come from minimist's own
declared-key check; the label's command name is gated by a `Map` hit; every verdict in this run came
from an exit code.

### L-axis → P3

**No findings.** `src/index.ts` keeps its single axis — parse and validate argv, then dispatch —
which is the same axis `MAX_POSITIONALS`, `refuse()` and the unknown-option gate already occupy. No
new imports; no command→command or step→step reference. The grill raised extracting
`unsupportedFlags()` to `lib/`; on review that would create a module whose only caller is
`index.ts` and whose input is `process.argv`, which is worse. Declining it is the right call.

---

## One thing worth the human's attention (not a finding against this increment)

`tests/lint-gate.test.ts` is **flaky under machine load** and reddened twice during this run — three
timeouts inside `npm run test:coverage`, then one and two on repeated solo runs. It spawns seven real
`eslint` processes against vitest's default 5000ms timeout. **It is not caused by this increment**: I
tested causality directly — stashed, it passed in 3.72s; restored, it passed in 6.39s and then 3.39s
on a quiet machine, and the final `npm run test:coverage` exited **0** with all four thresholds
cleared. The earlier reds coincided with a concurrent coverage run and a 200MB `node_modules` clone.
It is a pre-existing tight timeout in a file outside this increment's `## Files`, so it was correctly
not touched — but it is the kind of thing that turns a CI runner red for reasons a reader will blame
on the PR in front of them.

## Proposed lesson (candidate only — NOT written to canon)

- **Lesson:** when a table drives behaviour and a second list must agree with it, derive the second
  from the first rather than testing that they match. Here the global minimist `boolean:` declaration
  became `[...GLOBAL_FLAGS, ...ALLOWED_FLAGS.values()]`, which makes "declared for no command" —
  the exact shape of P-13 — unrepresentable instead of merely tested-against.
- **Provenance:** increment `per-command-flag-allowlist`, `src/index.ts` `DECLARED_BOOLEANS`;
  originating finding: audit P-13; the grill's F1 raised the residual half (a row granting a flag the
  command does not read), closed by an agreement test rather than by derivation.
- Promotion is a separate human-gated `/pharn-dev-memory-promote` run. Nothing was written to
  `.dev/memory-bank/**` here.

---

## Verdict

**GREEN — 0 floor-gate findings, 4 advisory (all minor).** The increment does what the approved plan
said, the flip list matches what shipped, both contradicted prose sites were rewritten rather than
deleted, and the deterministic gates are green. Advisory findings are recorded for the human; none of
them blocks.
