# GRILL — config-loader-honest-errors

Header: interrogating `.dev/features/config-loader-honest-errors/PLAN.md`. Spec-hash check:
`sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the
plan's `spec_content_hash` (no drift; `/pharn-dev-build`'s content-hash floor-gate is the real enforcer). Registered
grillers: `count-grillers.mjs` → `0` (no external griller axes to run; inline axes only). The plan is
`trust: untrusted` here — findings quote it as DATA.

## Findings (finding-shape; enum-gated fields trusted, free-text inherits the plan's untrusted tag)

### Axis: Guarantee-audit completeness (P0) + Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/config-loader-honest-errors/PLAN.md:119"
  problem: "The 'CLI validator ≡ floor validator ≡ contract' lockstep claim is backed only by a cross-check that the DEFAULT config is GREEN in both — it does not prove the TS validator and check-seam-config.mjs REJECT the same bad inputs (unknown key / duplicate / dead threshold)."
  evidence: "'floor cross-check: the existing seam-config.test.ts spawns check-seam-config.mjs on the default; both move together or the test reds.'"
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/config-loader-honest-errors/PLAN.md:55"
  problem: "list.ts's own --json-aware error path and the init.ts/install.ts tolerate-and-warn behavior are behavior changes, but the Evals section only exercises loadConfigOrExit — neither of those two distinct paths gets a planned test."
  evidence: "'src/commands/list.ts — --json-aware try/catch (its own, since it emits via emitError…)'"
```

### Axis: Determinism (P5) + Trust (P2) — the bare-catch disease must not reappear

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/config-loader-honest-errors/PLAN.md:52"
  problem: "loadConfigOrExit must catch NAMED errors only (instanceof ModelRoutingError || SeamConfigError) and rethrow the rest; a bare catch(e){log(e.message);exit(1)} re-introduces the exact swallow this increment removes — a programming bug (TypeError) would be mislabeled a config error and exit 1 as if user-caused."
  evidence: "'add loadConfigOrExit(cwd)' — the plan does not pin the catch to the named error classes."
```

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/config-loader-honest-errors/PLAN.md:23"
  problem: "The plan asserts an unknown/offending key is 'echoed as JSON-escaped DATA' but no eval locks it; a control-char-bearing key should be proven escaped in the message."
  evidence: "'the offending key/value is echoed JSON-escaped as DATA'"
```

### Axis: Honest scope / no speculation (P7) + Docs cite code (P4)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/config-loader-honest-errors/PLAN.md:83"
  problem: "pharn is a PUBLISHED CLI and this stricter validation now REJECTS configs that previously loaded (extra/typo'd keys in models/seam) and hard-errors instead of 'run init' — a user-visible, potentially surprising change — yet CHANGELOG.md is absent from the Files list."
  evidence: "'docs/troubleshooting.md — distinguish absent … from present-but-invalid' — the only doc touched; no CHANGELOG entry."
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/config-loader-honest-errors/PLAN.md:83"
  problem: "The contract reversal (seam 'extra fields ignored' → rejected) may leave a stale statement of the old posture elsewhere; the plan sweeps only troubleshooting.md, not docs/ broadly or CLAUDE.md."
  evidence: "only 'docs/troubleshooting.md' appears under Docs (P4)."
```

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/config-loader-honest-errors/PLAN.md:12"
  problem: "The increment bundles two separable concerns — loader honesty (BUG 1/3) and a strict-validation posture reversal that edits a trusted contract + floor validator (BUG 2/4); human-directed ('fix everything'), but a mid-build RED entangles the loader fix with the contract change."
  evidence: "'scope note: LARGE but coherent — one theme … Human directed \"fix everything, best way\"'"
```

### Axis: One axis of change (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/config-loader-honest-errors/PLAN.md:31"
  problem: "loadConfigOrExit adds I/O (clack log + process.exit) to pharn-config.ts, previously a pure schema module — defensible via the cancelAndExit precedent, but a conscious second axis (loading vs. interactive error presentation)."
  evidence: "'A shared loadConfigOrExit (in pharn-config.ts, mirroring cancelAndExit in lib/confirm.ts)'"
```

## Prose summary

The plan is sound and its guarantee/trust/determinism audits are unusually explicit; the interrogation
found no floor claim dressed as advisory and no undocumented guarantee. The concerns are refinements,
not rework:

- **Two genuinely load-bearing ones.** (a) The **lockstep** between the TS validator, the floor
  `.mjs`, and the contract is *asserted* but only cross-checked on the happy path — it should be
  enforced with parallel RED cases so a future drift reds a test (P0/P1). (b) `loadConfigOrExit` must
  **not** become a new bare-catch: pin its catch to the named error classes and rethrow the rest, or
  the increment quietly recreates the disease it exists to kill (P5/P2).
- **One publish-hygiene gap.** A stricter validator that rejects previously-loading configs is a
  user-visible change on a published CLI → it wants a **CHANGELOG.md** entry (P4), currently unlisted.
- **Coverage edges.** `list.ts`'s json error path and the `init`/`install` warn-and-proceed path are
  behavior changes without planned evals (P1).
- **Acknowledged, human-directed.** Scope bundling (P7) and the `pharn-config.ts` I/O axis (P3) are
  conscious calls the human already accepted; surfaced for the record, not to reopen.

## Verdict

ADVISORY VERDICT: 8 concerns raised (4 important-severity, 4 minor) — for the human to weigh before
`/pharn-dev-build`. `/pharn-dev-grill` gates nothing; the deterministic backstops remain `/pharn-dev-build`'s spec-hash floor-gate
and `.dev/floor/validate.mjs`. The three actionable refinements (lockstep RED cross-checks; named-only
catch in `loadConfigOrExit`; a CHANGELOG entry) are strong candidates to fold into the build.
