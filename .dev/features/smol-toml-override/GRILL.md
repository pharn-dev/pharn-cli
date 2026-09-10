# GRILL — smol-toml-override (ADVISORY)

Plan under interrogation: `.dev/features/smol-toml-override/PLAN.md` (`trust: untrusted` to this stage).
**Spec-hash check: MATCH** — `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`,
equal to the plan's pinned `spec_content_hash` (line 3). Surfaced only; the blocking check is `/pharn-dev-build`'s (fix #4).

**Griller registry (FLOOR — deterministic membership):** `node .dev/floor/count-grillers.mjs .` →
`{"registered":0,"grillers":[]}`. No `role: griller` capability is installed in this repo, so the
pluggable slot contributed nothing and the findings below are the **inline axes** only.

---

## Findings

### Axis — P6 (discovery-first; verify live state)

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/smol-toml-override/PLAN.md:44"
  problem: "The Contracts-satisfied section justifies 'none' with a factual claim about the repo that is false and was not read this run — `pharn-contracts/` exists and is git-tracked (eval-format.md, finding-shape.md, seam-config.md)."
  evidence: "**None.** This repo ships no `pharn-contracts` tree, and a dependency override satisfies no PHARN contract. Recorded as \"none\" rather than invented (P4, P7)."
```

The **conclusion** likely survives — a dependency override plausibly satisfies none of those three
schemas — but the plan reached it from an unverified premise, in the one section whose whole purpose
is citation. This is the P6 shape exactly: a claim about repo state not grounded in a read.

### Axis — P1 / eval coverage (`pharn-contracts/eval-format.md` — cited, not restated)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/smol-toml-override/PLAN.md:17"
  problem: "The plan names tests/lint-gate.test.ts as its model but omits the very property that keeps that file from going hollow — a demonstration that the check actually REDS on a violating input; every planned assertion only observes the current happy state."
  evidence: "`tests/dependency-overrides.test.ts` — NEW. Pins the invariant in two layers (spelling + demonstration), mirroring `tests/lint-gate.test.ts`"
```

`lint-gate.test.ts` asserts the script's spelling **and then lints planted offences**, checking both
exit 1 on a violation and exit 0 on clean source. The planned test has no equivalent: nothing proves
that a lock entry at `1.7.0` would actually be rejected. The vacuity guard (line 57) and the `null`
hard-fail (line 59) are good but cover different failure modes. Making the check a **pure function
over a parsed lock object** would let the test feed a synthetic `1.7.0` tree and assert rejection —
turning "it passes today" into "it bites".

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/smol-toml-override/PLAN.md:47"
  problem: "The Evals section never classifies its assertions against the structural[]/semantic[] split, nor cites the contract that defines it, so the reader cannot tell the plan checked rather than assumed."
  evidence: "## Evals to write (P1)"
```

All four planned assertions **are** in fact `structural[]` (version compare, string equality, count,
`null` check) — none is routed through a judge, which is the outcome the contract wants. The gap is
that this is left implicit. Note the counter-argument the plan could have made and did not:
`eval-format.md` governs **Capability** evals (`evals/cases/*.md` + `evals/expected/*.md`), whereas
P1 in this repo is satisfied by `vitest`; saying so explicitly would close both this and the P6
finding above.

### Axis — P0 (guarantee-audit completeness)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/smol-toml-override/PLAN.md:65"
  problem: "The headline guarantee is stated one notch wider than its floor reduction: the test proves a property of the COMMITTED LOCKFILE, not of any installed node_modules tree."
  evidence: "**\"`smol-toml <= 1.7.0` is no longer resolvable in this repo's tree\"** → **floor**: primitive #3 (deterministic version compare) over `package-lock.json`"
```

For CI the two coincide, because CI installs via `npm ci` from that lock. For a contributor with a
stale `node_modules`, or after an `npm install --force`, they do not. The precise true statement is
"the committed lockfile records `smol-toml >= 1.7.1`, and CI installs from that lockfile" — still
floor, just narrower than "resolvable in this repo's tree".

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/smol-toml-override/PLAN.md:70"
  problem: "A GREEN lint:md is labeled floor evidence that smol-toml loads, but that inference depends on a third-party file's current internal structure which no gate in this repo pins."
  evidence: "**\"`npm run lint:md` still passes\"** → **floor**: exit-code gate, already a required CI check (`Markdown lint`). Because `toml-parse.mjs` is imported eagerly, a GREEN run **does** deterministically demonstrate `smol-toml@1.7.2` **loads**"
```

The exit code is floor. The **inference** from GREEN to "smol-toml was loaded" rests on
`markdownlint-cli2.mjs:21` importing `parsers/toml-parse.mjs` eagerly — true when read this run, and
movable by any markdownlint-cli2 patch release without a single test in this repo noticing. The
honest split is: exit code = floor; "therefore smol-toml loaded" = advisory inference about a
dependency's internals.

### Axis — P5 (determinism; and the failure mode of an over-tight assertion)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/smol-toml-override/PLAN.md:51"
  problem: "The spelling assertion is an exact equality against one literal specifier, so it reds on a SAFE tightening (e.g. a future `~1.7.3`) — training a maintainer to edit the test reflexively, which is precisely how the spelling layer goes hollow."
  evidence: "**spelling** → `package.json` has `overrides['smol-toml'] === '~1.7.1'` → exact string match. Changing the policy forces a conscious edit to this test."
```

The plan frames the brittleness as the feature ("forces a conscious edit"), and for a *loosening*
that is right. The asymmetry is the problem: the same red fires for a tightening that strictly
improves security. An assertion that the override **key exists** plus the existing lock-side
comparison encodes the real invariant without the false positive.

### Axis — P7 (honest scope)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/smol-toml-override/PLAN.md:109"
  problem: "With the npm-audit gate deferred, the specifier's stated benefit of auto-taking future 1.7.x patches is weaker than it reads — a range permits an upgrade but pins nothing; only a lockfile refresh changes the installed version."
  evidence: "**No `npm audit` CI gate.** It would be a new required status check that depends on the network and on a mutable advisory database, so it can flip red without any repo change — a flaky gate on `main`'s ruleset."
```

The deferral's own reasoning is sound (a network- and database-dependent required check on `main`'s
ruleset really can flip red with no repo change). The unstated half is what supplies the refresh:
**Dependabot is already enabled on this repo** — it is what produced alert 11 — so the trigger does
exist, and saying so would make the deferral complete rather than leave a gap the reader has to fill.

---

## Prose summary

The plan is unusually well-grounded on the axis that matters most for a security bump: it verified
the override empirically before proposing it (a scratch-copy `npm install --package-lock-only`, not a
memory claim), it identified that `markdownlint-cli2@0.23.2` pins `smol-toml` exactly and that
`npm audit fix --force` would *downgrade* the tool behind a required CI check, and its guarantee audit
**strikes two claims it could have gotten away with** — that this protects package consumers, and that
the repo was exploitable. Those strikes are the P0 discipline working as intended.

The concerns cluster in two places. First, **the test is specified to observe, not to bite** — it
mirrors `lint-gate.test.ts` in name but drops that file's defining move, the planted violation. This
is the finding most worth acting on before build, and it is cheap: extracting the check as a pure
function over a lock object costs a few lines and buys a real negative case. Second, **two guarantee
labels are a notch wider than their reductions** (lockfile vs installed tree; exit code vs "smol-toml
loaded") — neither is the disease in full, but both are the shape of it, and this repo's whole thesis
is catching that shape early.

The P6 finding is small in consequence and sharp in kind: the plan asserted the `pharn-contracts/`
tree does not exist while three tracked files sit in it. The conclusion is probably still right, which
is exactly why it is worth naming — an unverified premise that happens to land on the correct answer
is the one that survives review.

Nothing here suggests the increment is wrong or should not be built. The override choice (`~1.7.1`)
is well-argued and empirically confirmed, and the scope is genuinely minimal.

---

**ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 2 important, 5 minor) — for the human to
weigh before `/pharn-dev-build`.**

This grill-log **gates nothing** (P0). It does not block `/pharn-dev-build`, and "7 concerns" is not a
judgment that the plan is sound or unsound — every severity above is an LLM assignment and therefore
advisory (fix #3). The only floor-grade computation in this run was the spec-hash comparison (MATCH)
and the griller-registry membership count (0).
