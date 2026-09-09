# GRILL — ci-smoke-built-bundle

Plan under interrogation: `.dev/features/ci-smoke-built-bundle/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, identical to the plan's
`spec_content_hash`. No spec drift to surface. (The computation is floor-grade; the *block* on drift
belongs to `/pharn-dev-build`, fix #4 — this stage only warns.)

**Registered grillers: 0.** `node .dev/floor/count-grillers.mjs .` →
`{"registered":0,"grillers":[]}`. Membership is FLOOR; the pluggable axis contributes nothing today
(P7 — zero grillers exist, not "the grillers passed"). Everything below is the inline Step-2 axes.

**Grounding note (P6):** rather than reason about the plan's factual claims, this grill executed
them. `npm run build` (exit 0) then `node dist/index.js --version` → `0.4.0`, exit 0; `--help` →
usage, exit 0; the `&&` chain → exit 0. `head -c 400 dist/index.js` shows all three `external`
packages surviving as bare top-level imports (`import minimist from"minimist"`,
`from"@clack/prompts"`, `import pc from"picocolors"`) and
`var require2=createRequire(import.meta.url),PHARN_VERSION=require2("../package.json").version` at
**module scope, in the first line**. The plan's central mechanism claim is therefore observed, not
assumed.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/ci-smoke-built-bundle/PLAN.md:101'
  problem: "The `external`-list half of this guarantee is directionally overstated: only ONE of the two drift directions is newly covered, and the plan does not say which."
  evidence: '"A drift in `src/version.ts`''s `''../package.json''` depth, or in `scripts/build.mjs`''s `external` list, is caught before release" -> **floor at CI-run time: an exit code.**'
```

Interrogation. Esbuild treats the two directions asymmetrically, and the smoke sees only one of them:

- **Externalized but not resolvable/loadable at runtime** (a package moved to `devDependencies`,
  dropped from `dependencies`, or with broken CJS↔ESM interop) — **newly covered.** The bundle
  carries it as a bare import, so `node` throws at load. This is real coverage and the empirical
  probe above confirms the shape.
- **Missing from `external` while still imported** — **not newly covered, and does not need to be.**
  Esbuild bundles it instead; if it cannot be resolved the **build** fails (the gate that already
  exists), and if it can, the bundle simply grows and still runs.

The `version.ts` depth half needs no such caveat — it is unconditional, and stronger than the plan
claims: `PHARN_VERSION` is module-scope, so **`--help` alone** would trip a wrong depth, before a
flag is parsed. Recommendation: narrow the sentence to the first direction and name the second as
already-covered-elsewhere, so a reader cannot infer "the `external` list is fully exercised."

### Axis: eval coverage / structural-vs-semantic (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/ci-smoke-built-bundle/PLAN.md:101'
  problem: 'The CI step''s only assertion is a process exit code, so a bundle that loads and silently does nothing would pass the gate vacuously; no planned assertion compares the smoke''s OUTPUT to anything.'
  evidence: '"The CI step''s decision is a process **exit code** joined by `&&`. There is no parsing of output and no threshold."'
```

Interrogation. `src/index.ts:190` runs `main()` only when `isEntryPoint()` holds
(`realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)`). Were that ever false, the
process would print nothing and **still exit 0** — a green gate proving nothing. This grill probed
the realistic trigger and **it did not reproduce**: invoking the bundle through a symlinked
`argv[1]` still printed `0.4.0` and exited 0, because Node realpaths both sides. Severity is
therefore `minor`, not `important` — the residual is one of *shape*, not a reachable defect on the
`ubuntu-latest` runner.

Recorded for the human because closing it is cheap and would convert the assertion from "the process
did not crash" to "the process produced the right version": compare `node dist/index.js --version`
against `package.json`'s `version` in the same step. **Deliberately NOT recommended for this
increment** — the approved scope is the audit's minimal fix, and this is a second axis.

All planned assertions are `structural[]` in `eval-format.md`'s sense (array equality, an index
compare, a substring check over strings extracted from a committed file). **Nothing is routed
through a judge**, and no `semantic[]` assertion is claimed. Clean on the split this axis exists to
police.

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/ci-smoke-built-bundle/PLAN.md:90'
  problem: 'The eval set grew from the one pin the finding asked for (the step exists, with this command) to three assertions, two of which pin adjacent properties the audit did not name.'
  evidence: '"the smoked path is the **published** artifact -> assert `SMOKE_RUN` names `package.json`''s `bin.pharn`"'
```

Interrogation. Both additions are defensible and neither leaves the file or the subject: the
**ordering** assert encodes a real precondition (`dist/` does not exist before `npm run build`, and
a step list is order-sensitive), and the **`bin.pharn`** cross-check is what makes the pin mean
"the *shipped* artifact" rather than "some string". Without it the test pins an arbitrary literal
and the finding's own subject — the published binary — goes unasserted.

Raised anyway, at `minor`, because "did the plan grow past the approved minimal fix?" is precisely
the question the approving human reserved. This is the whole of the growth; there is no third file
and no `src/` change.

### Axis: one axis of change (P3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/ci-smoke-built-bundle/PLAN.md:63'
  problem: '`tests/ci-workflow.test.ts` is documented as pinning the required-status-check contract, and this increment gives it a second subject — the internal step composition of one job.'
  evidence: '"`tests/ci-workflow.test.ts` — extend the per-gate run-list assertion so `Build` may carry exactly this one extra run and no other gate may carry any"'
```

Interrogation, and why this is `minor` rather than a split. The file **already** asserts each job's
`run:` commands (`'runs each gate through its own npm script'`, and the runner/node pins), so "what
each gate job runs" is inside its existing subject, not a new one. Splitting one array-equality
assertion into a second test file would duplicate the `jobBlocks` extractor — the exact
`R2`-shaped duplication `.dev/floor/check-run-pins.mjs` documents as a cost, not a virtue. Keeping
it here is the right call; the finding records that the call was made rather than drifted into.

### Axis: trust propagation (P2)

**No finding.** The plan ingests no untrusted remote artifact, and it does not stop at "no untrusted
input, nothing to say": it names the one genuine delta — on a fork PR the `Build` job now *executes*
code it previously only compiled — and bounds it with the properties that are actually true of that
job (`on: pull_request` not `pull_request_target`, `permissions: contents: read`,
`persist-credentials: false`, no secrets, and fork-controlled code already executing via `npm ci`
lifecycle scripts and `scripts/build.mjs`). Arguing a surface change instead of assuming it away is
what this axis wants.

### Axis: determinism (P5)

**No finding.** Every planned branch is a membership/equality test over extracted strings or a
process exit code. No classification, no threshold, no fallback ending in a guess.

---

## Summary

The plan is unusually well-grounded for its size: every load-bearing fact (`--version`/`--help` exit
0, `npm ci` preceding the build, `PHARN_VERSION` at module scope, the `skipped: 7` tripwire) was
read from disk this run rather than assumed, and the two claims most likely to be oversold are
already struck in the plan itself — "the Build check is green, therefore the CLI works" (line 113)
and the resolvable-vs-correct residual on the three externals (line 118). That is the honest half of
P0 done without prompting.

The four concerns are: one **important** wording narrowing (the `external`-drift claim covers one
direction, not both), and three **minor** ones — the exit-code-only vacuity residual (probed, did not
reproduce), the eval set growing to three assertions inside the approved file set, and the pinning
test acquiring a documented second subject that is arguably inside its first. **None is a reason to
stop.** The important one is a sentence, not a design change.

One thing the plan gets right that deserves naming, because getting it wrong is the failure mode
that blocks every PR: it treats "a step, never a job" as a hard constraint with **two independent**
justifications — the ruleset's required-context contract, and the fact that `dist/` does not survive
between jobs. A future reader tempted to "clean this up" into its own job needs both reasons, and
both are written down.

---

**ADVISORY VERDICT: 4 concerns raised (0 blocking, 1 important, 3 minor) — for the human to weigh
before `/pharn-dev-build`.** This grill-log gates nothing: `/pharn-dev-grill` is advisory end-to-end,
and the deterministic backstops remain `/pharn-dev-build`'s spec-hash floor-gate and
`.dev/floor/validate.mjs`. Nothing here should be read as "the plan passed" or as a claim that the
increment is sound.
