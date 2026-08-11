# REVIEW — lint-gate-no-soft-tier

**Step 1, floor first (P0):** `node .dev/floor/validate.mjs .` → **exit 0, GREEN** (0 capabilities). The
increment was entitled to reach review. Everything below the floor line is **advisory**.

Increment under review (`trust: untrusted`): `eslint.config.mjs`, `package.json`, `CLAUDE.md`,
`docs/contributing.md`, `CHANGELOG.md`, `tests/lint-gate.test.ts`.

---

## Floor-gate findings (blocking)

**None.**

Checked, and each held:

- **L-floor / P0** — every guarantee the increment states reduces to an exit-code threshold
  (`--max-warnings 0` in the `lint` script, invoked by `npm run check` and by CI at
  `.github/workflows/ci.yml:32`), and the residual is **named in the artifact itself** rather than left
  implied (`CHANGELOG.md:101`). No unreduced guarantee, so no blocking finding.
- **L-eval / P1** — no Capability and no `rule_id` are added, and the floor agrees: `validate.mjs`
  reports 0 capabilities, so there is no eval binding to miss and **no floor/lens disagreement**. The
  behavior that *is* added ships with a test in the same increment.
- **L-axis / P3** — `eslint.config.mjs` takes two hunks (platform globals, rule severity) but both are
  the same axis: *how the lint gate is configured*. No leaf imports a sibling; `tests/lint-gate.test.ts`
  imports nothing from `src/`.
- **L-trust / P2** — the increment ingests no untrusted artifact and emits no finding free-text of its
  own. No guaranteed decision rests on a tainted field.

---

## Advisory findings

### L-eval → P1

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: "tests/lint-gate.test.ts:51"
  problem: "The demonstration costs half the suite's aggregate test time and is now its long pole — one file contributes 3.16s of 6.23s across 40 files."
  evidence: "it.each([ ['src/_plant.ts', …], ['tests/_plant.ts', …], ['scripts/_plant.mjs', …] ])"
```

Measured: `npx vitest run tests/lint-gate.test.ts` → 7 tests, **3.16s** of test time from **8 ESLint
spawns**; the full suite reports 6.23s of aggregate test time across 40 files (3.60s wall, since vitest
parallelizes). Wall-clock damage is masked today by that parallelism, but the suite can no longer finish
faster than ~3.2s no matter how many cores it gets — this file is the critical path.

This is the **cost of the fix for the grill's F1** ("the test pins a STRING, not the behavior"), and it
is a real trade, not a defect: a demonstration that actually runs ESLint cannot be free. Worth the
human's attention because it is the kind of cost that compounds silently. Cheapest reductions, if
wanted: the two "clean source" spawns (`tests/lint-gate.test.ts:57`) are the least load-bearing —
`npm run lint` exiting 0 on the real tree already proves the gate is not always-red — and the two
platform cases could share one spawn. That would take 8 spawns to ~4 without losing a distinct claim.

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "tests/lint-gate.test.ts:9"
  problem: "The test's header states the no-soft-tier guarantee without the boundary the CHANGELOG names, so the artifact a maintainer reads first is the less honest of the two."
  evidence: "'warn' later cannot quietly reopen the tier, because the threshold is on the warning COUNT, not on any rule's severity."
```

The sentence is **true as scoped** — it is a claim about rule *severity*, and severity genuinely cannot
reopen the tier. But `CHANGELOG.md:101-103` goes further and names the three real escapes (a rule set to
`off`, a new `ignores` entry, an inline `eslint-disable`), and a maintainer changing lint config will
open the test, not the changelog. One clause would align them.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "tests/lint-gate.test.ts:28"
  problem: "The demonstration spawns eslint with --max-warnings 0 in its own argv rather than running `npm run lint`, so no single test exercises the actual gate command end-to-end."
  evidence: "[eslintBin, '--stdin', '--stdin-filename', asPath, '--max-warnings', '0'],"
```

The two halves compose to cover it — the string pin holds the script's spelling, the spawn holds
ESLint-plus-this-config's behavior — and the decomposition is what keeps the file at 3.2s instead of
minutes. Recorded so the seam is **known** rather than discovered later: the flag proven effective is
the one this test passes, not the one `package.json` stores.

### L-trust → P2 (self-observed — the lens turned on this run)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/lint-gate-no-soft-tier/GRILL.md:1"
  problem: "Untrusted-tagged grill free-text shaped this increment's content: three grill findings were folded into the build."
  evidence: "F1 'The one committed test pins a STRING, not the behavior'; F3 'the boundary is unstated'; F5 'two root-level source files stay unlinted'"
```

Reported because the lens asks directly whether instruction-looking content in a reviewed artifact
changed behavior, and here the honest answer is **yes, content-wise**. The bounds that make it
acceptable, stated rather than assumed:

- **No verdict rested on it.** `validate` exit, `regression-report.json:.verdict`, and
  `verify-report.json:.verdict` were each computed from exit codes alone; the grill fed none of them.
- **Every fold-in was independently re-derived**, not obeyed. The clearest evidence that the boundary
  held is grill **F7**, which asserted the `contributing.md` table would need re-padding: build measured
  the column at 97 chars against 61 chars of new text and **refuted it** rather than complying. A
  finding that was wrong got rejected on measurement — which is the defense working, not a near-miss.
- **The fold-ins stayed inside the approved `## Files`**, so fix #7 bounded them structurally; `scope`
  exited 0 confirming no path escaped.

The residual is the named one (`LIMITS.md §2`): a downstream human reading this free-text is steered by
heuristic, not by a floor.

### Observation (not a finding) — P7

The source brief's fourth row ("add `globals` as a devDep") was a **no-op**: `globals ^17.9.0` was
already declared at `package.json:64` and already a root devDependency in `package-lock.json`. Recorded
here so a future reader of the brief does not "restore" a dependency line that was never missing, and so
the untouched `package-lock.json` is understood as correct rather than forgotten.

---

## Proposed lesson candidate (NOT written to canon — `/pharn-dev-review` writes only this file)

Proposing one, because it is a **real, twice-observed** failure in this repo's own measurement practice
(P7 — real, not hypothetical), and it materialized *during this run*:

- **Candidate:** _Capture a gate's exit code in a form that cannot silently lie — and remember the shell
  is zsh._ This repo's review ledger already records the `… | tail; echo $?` trap (reports tail's status;
  the source brief says it has fired five times). This run produced a **new costume of the same
  disease**: `TESTS=$(git ls-files …); node --test $TESTS` word-splits in bash but **not in zsh**, so
  `node --test` received all 46 paths as one filename and exited 1. Both baseline and HEAD would have
  recorded that spurious `1`, `check-regress` would have classified it `pre_existing`, and the verdict
  would have been `no-regressions` **for the wrong reason** with the `tests` gate silently vacuous — a
  false RED decaying into a false GREEN. Remedy: pipe file lists through `xargs`, and assert the gate's
  *shape* (`# pass N`), not only its exit code.
- **Provenance:** increment `lint-gate-no-soft-tier`; observed at the `/pharn-dev-regress` baseline
  capture; corrected and recorded in `.dev/features/lint-gate-no-soft-tier/REGRESSION.md` §"One
  measurement correction".
- **Promotion path:** a separate, human-gated `/pharn-dev-memory-promote` run under its own scope, behind
  `check-provenance.mjs`. The model does not self-promote (P2).

---

## Verdict

**GREEN — 0 floor-gate (blocking) findings.** 1 important + 3 minor advisory findings, plus one
observation and one proposed lesson candidate.

Stated honestly (P0): GREEN here means **the floor was green and no lens found an unreduced guarantee,
a missing eval binding, or a sibling import.** It is **not** a judgment that the increment is wise or
that its scope is the right one — whether `eslint.config.mjs` and `vitest.config.ts` should have been in
the gate, and whether the demonstration is worth half the suite's test time, are the human's calls.
