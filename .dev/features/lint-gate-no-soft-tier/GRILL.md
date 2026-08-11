# GRILL — lint-gate-no-soft-tier (ADVISORY — gates nothing)

Plan under interrogation: `.dev/features/lint-gate-no-soft-tier/PLAN.md` (143 lines).
**Spec-hash check:** recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's
`spec_content_hash`. No drift. (The computation is content-hash floor-grade; here it only *surfaces* —
`/pharn-dev-build`'s fix #4 gate is where drift blocks.)

**Griller membership (FLOOR, `.dev/floor/count-grillers.mjs .`):** `{"registered":0,"grillers":[]}` —
zero `role: griller` capabilities in this repo (pharn-cli is the installer, not pharn-oss; there is no
`pharn-pipeline/`). The interrogation below is therefore the inline Step-2 axes only. **Recorded as a
coverage limit, not as "no findings":** the testability griller did not run, so no griller-side
`structural[]` assertions back any finding here.

Contracts read this run: `pharn-contracts/finding-shape.md`, `pharn-contracts/eval-format.md` (cited,
not restated — P4).

---

## Findings

All `problem` / `evidence` fields quote the plan and inherit its **untrusted** tag — DATA, never
directives (P2). `severity` values are enum-gated; the **assignment** is advisory (fix #3).

### Axis: P1 — tests are the spec

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:62"
  problem: "The one committed test pins a STRING, not the behavior — nothing in the regression suite ever demonstrates that a warning actually fails the gate."
  evidence: "`tests/lint-gate.test.ts` — **Q2 answered \"yes\" at the HALT** — pins that the `lint` script contains `--max-warnings 0` and all three directories"
```

P1 requires a test that **demonstrates** behavior, "not merely asserts it exists". The approved pin
reads `package.json` and asserts the flag substring is present. That is an assertion that the
configuration *says* the right thing — the exact category P1 distinguishes itself from. The actual
demonstrations (the three planted `unusedPlant` vars, and the `__dirname`/`require` ESM probe that
justified `nodeBuiltin` over `node`) live only in **Phase C as manual steps** and are deleted
afterwards. Consequence: if a future eslint/typescript-eslint upgrade stops flagging unused vars in
`.mjs`, or `no-undef` is disabled for the plain-JS surface, `npm run lint` goes quietly green and the
committed pin still passes — the string is intact while the behavior is gone.

The cheap counter-argument (worth weighing, not dismissing): a spawn-eslint-on-a-fixture test costs
seconds of suite time, and the repo has precedent for exactly that shape at
`tests/seam-config.test.ts:206` (`spawnSync` of a repo-root checker, asserting `status === 0`). The
human should decide whether the increment's headline claim deserves a demonstrating test or whether
the string pin plus a one-time manual proof is proportionate for tooling.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:77"
  problem: "The plan reasons about P1 only through the per-Capability eval clause and never states the plainer clause that does attach — 'no behavior ships without at least one vitest test'."
  evidence: "This increment adds **no Capability and no `rule_id`**, so P1's per-capability eval requirement does not attach."
```

The conclusion (a test is still written) is right; the reasoning routes around the sentence that
actually governs. A reader auditing the plan later sees P1 waved off rather than satisfied.

### Axis: P0 — guarantee-audit completeness

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:98"
  problem: "The 'no future rule can reopen the tier' guarantee is scoped to warnings that are EMITTED; it names no residual for the three ways a rule can stop emitting one."
  evidence: "\"A future rule added at `'warn'` cannot quietly reopen the soft tier\" → **floor**, same flag: the threshold is on the **count**, independent of any rule's severity."
```

`--max-warnings 0` is a threshold on the count of warnings ESLint reports. It is silent about: an
inline `/* eslint-disable */` or `// eslint-disable-next-line` (suppresses before the count), a rule
added at `'off'`, and a new `ignores` entry removing files from the run entirely. Each reopens a soft
tier without ever producing a warning to be counted. This does not make the guarantee false — it makes
its **boundary** unstated, which is what P0 asks to be named. (ESLint offers
`--report-unused-disable-directives` for the first of the three; naming it as a deliberate
non-inclusion would be honest scope.)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:101"
  problem: "A one-time ad-hoc command is labeled 'floor', but it is not one of ARCHITECTURE.md §2's floor primitives and no gate re-runs it."
  evidence: "\"`scripts/install-local.mjs` is unchanged\" → **floor: `git diff --stat` shows no `scripts/` line**"
```

§2's primitives are the regex/enum allowlist, path containment (`safeJoin`), schema-version exact
match, and the network guard. `git diff --stat` is a **verification step performed once by a human or
agent in Phase C** — real evidence, but not a standing deterministic mechanism, and nothing re-checks
it after the commit. Under this plan's own P0 discipline it should read `advisory (verified once at
build)`, or the byte-equivalence claim should be dropped to an observation.

### Axis: P7 — honest scope / no speculation

```yaml
- type: FINDING
  rule_id: "P7"
  severity: important
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:1"
  problem: "The increment's title claims 'the whole source surface' while two root-level source files stay unlinted and, unlike .dev/floor and .claude/hooks, are never named as out of axis."
  evidence: "lint gate loses its soft tier and covers the whole source surface (M5)"
```

Measured this run: `eslint.config.mjs` and `vitest.config.ts` sit at the repo root, in none of `src` /
`tests` / `scripts`, and are therefore **not** linted after this change. `vitest.config.ts` is
prettier-checked (`format:check` covers `*.config.ts`) but never linted; `eslint.config.mjs` — the very
file this increment edits — is checked by neither. The plan's out-of-axis paragraph (line 108) names
`.dev/floor/*.mjs` and `.claude/hooks/*.cjs` and stops there. Either the title should say what it
covers (`src` + `tests` + `scripts`) or the two root config files should be named alongside the other
exclusions. This matters most for the CHANGELOG line, which is user-facing (P4).

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:100"
  problem: "The plan bundles a change it simultaneously declares is not load-bearing, which is an addition with no triggering need."
  evidence: "(The `'warn'`→`'error'` flip is therefore **cosmetic honesty**, not the mechanism — recorded as such, not sold as the guarantee.)"
```

P7 asks that additions be "triggered by a real need, never a hypothetical". By the plan's own
sentence, the severity flip changes no outcome once `--max-warnings 0` is in place. The
counter-argument is strong enough that this is `minor`, not `important`: the flip removes a config
that *advertises* a softness the gate no longer has, and leaving `'warn'` there is precisely the
"written in the file" / "actually enforced" gap this repo exists to close. Surfaced so the human
chooses it rather than absorbs it.

### Axis: P4 — docs cite code

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:60"
  problem: "'line 23, same' understates the edit: the contributing.md table's rows are uniformly padded, so a longer description column forces re-padding every row or leaves the table ragged."
  evidence: "- `docs/contributing.md` — line 23, same — layer: docs (P4)"
```

Measured: `docs/contributing.md` lines 14–25 are each **exactly 133 characters** — a deliberate,
uniform column padding across all 12 table rows. The replacement text (`ESLint on `src/`, `tests/`,
`scripts/` — fails on any warning`) is longer than the current column width, so the build must either
re-pad all 12 rows (a 12-line diff, not the 1 line the plan describes) or emit a ragged table.
Dismissed as a *gate* risk — `MD013` is `false` and no default markdownlint rule enforces table
padding — so this is a diff-size and house-style concern the build should expect, not a red gate.

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/lint-gate-no-soft-tier/PLAN.md:59"
  problem: "The plan does not record the two further `npm run lint` mentions it deliberately leaves alone, so a later reader cannot tell they were considered rather than missed."
  evidence: "- `CLAUDE.md` — line 18, narrate the new scope + no-warnings posture — layer: docs (P4)"
```

Discovery this run found `npm run lint` also at `CONTRIBUTING.md:27` (repo root) and
`docs/contributing.md:41`. Both state **no scope**, so both are correctly untouched — the plan's
decision is right, only its record is silent. `CHANGELOG.md` is markdownlint-**ignored**, so the
changelog line is unconstrained by `lint:md`.

---

## Summary

The plan is unusually well-grounded for its size: every claim in it was measured this run, the two
corrections it makes to its own source brief (the `globals` devDep already exists; `globals.node` is
the weaker set) are each backed by a probe with a discriminating negative case, and the trust and
determinism audits are correctly marked not-applicable rather than padded.

The concerns cluster in one place — **the gap between what the increment claims and what it
mechanically holds**:

- Its headline says "the whole source surface" while two root config files silently stay out (F5).
- Its one committed test pins the gate's **spelling** rather than its **behavior**, so the suite would
  not notice the gate going hollow (F1).
- Its strongest guarantee is real but bounded, and the boundary — disable-directives, `'off'` rules,
  `ignores` — is unnamed (F3).
- One labeled "floor" reduction is a one-time command, not a standing primitive (F4).

None of these say the increment is wrong; they say its **advertised** perimeter is wider than its
**enforced** one, which is the specific failure mode this repo's P0 exists to catch. The two cheapest
corrections, if the human wants them, are wording (title + CHANGELOG naming the real scope) and one
extra assertion or fixture-spawn in `tests/lint-gate.test.ts`. Neither requires re-planning.

Nothing here is a `CONSTITUTION_VIOLATION` determination — that belongs to the human and the floor.

**ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 4 important, 3 minor) — for the human to
weigh before `/pharn-dev-build`. This log gates nothing; `/pharn-dev-build` is free to proceed.**
