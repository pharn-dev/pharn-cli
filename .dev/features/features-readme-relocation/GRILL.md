# GRILL — features-readme-relocation

Plan under interrogation: `.dev/features/features-readme-relocation/PLAN.md` (approved at GATE 1).
Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **MATCHES** the plan's `spec_content_hash` (line 3). No drift. (Computation is floor-grade; the blocking gate on drift is `/pharn-dev-build`'s, not this stage's.)
Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`. Capability grillers live in pharn-oss, not in this repo, so **only the inline axes ran** (P6: measured, not assumed).

**This grill-log is ADVISORY end-to-end. It gates nothing.** Every finding below rests on model judgment; `severity` values are enum-gated strings but their *assignment* is advisory (fix #3). `/pharn-dev-build` is not blocked by anything here.

> All `problem` / `evidence` free-text below quotes `PLAN.md`, which is `trust: untrusted` to this stage. It is rendered as **DATA** — never an instruction (P2).

---

## Axis: trust propagation (P2)

```yaml
- type: FINDING
  rule_id: "P2"
  severity: important
  file: ".dev/features/features-readme-relocation/PLAN.md:123"
  problem: "The trust audit says the clone can only flip existsSync true or false, but omits that existsSync FOLLOWS symlinks — so a clone whose `pharn/features` is a symlink makes the probe return the pharn path, the writer's findSymlinkComponent then correctly refuses it, and a legitimate ROOT copy is never attempted. A hostile clone can therefore SUPPRESS an install it cannot breach."
  evidence: "Taint does not enter the branch: the clone can only make `existsSync` true or false, and both outcomes yield one of two **hard-coded** constants."
```

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/features-readme-relocation/PLAN.md:125"
  problem: "The plan calls the probe's existsSync a `non-following existence test`. It is not: fs.existsSync stats through symlinks. safeJoin contains the path lexically but resolves nothing. The claim as written is false and should be corrected rather than carried into a code comment."
  evidence: "the probe adds one `existsSync` against `safeJoin(repoDir, 'pharn/features/README.md')` — a contained, non-following existence test"
```

```yaml
- type: FINDING
  rule_id: "P2"
  severity: important
  file: ".dev/features/features-readme-relocation/PLAN.md:115"
  problem: "Moving the destination to `pharn/features/README.md` makes this the only pharn-layout surface whose DESTINATION components are symlink-walked. Verified in src/lib/install-capabilities.ts: the trusted-docs loop, the LICENSE copy, contracts, core and floor all guard only the SOURCE (leaf isSymlink / noSymlinks filter) and write to `pharn/...` with no dest walk. So a project whose `pharn/` is a symlink has every other surface written straight through it while this one file refuses. The asymmetry is pre-existing, but this increment is what makes `pharn/` a walked component, so the plan should name it rather than inherit it silently."
  evidence: "This increment moves the *string* those guards are applied to and moves NONE of the guards."
```

## Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/features-readme-relocation/PLAN.md:113"
  problem: "Every planned test exercises resolveFeaturesReadme through installCapabilities / collectExpectedInstallPaths. The pure function's own four-cell truth table is never pinned directly — in particular `flat` layout against a clone that DOES carry pharn/features/README.md, which must still resolve to the root path. An install-level test cannot distinguish that cell from `flat has no pharn dir at all`."
  evidence: "pinned by a test asserting the manifest key equals the installed path over one clone"
```

## Axis: determinism (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/features-readme-relocation/PLAN.md:131"
  problem: "On a flat→pharn migration BOTH advisories fire, and they give contradictory instructions about the same directory: abandonedLayout says the leftovers are `left behind and are no longer managed by pharn — delete them by hand`, while the new one says the features artifacts are `left where they are ... move them by hand`. A user reading both can reasonably delete their own audit trail. The plan asserts the two are complementary without reconciling the verbs."
  evidence: "Deliberately **not** guarded on `written.length > 0` (unlike `abandonedLayout`)"
```

## Axis: honest scope / ordering (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: blocking
  file: ".dev/features/features-readme-relocation/PLAN.md:117"
  problem: "The plan treats MIN_CLI as already-shipped background, but never draws the consequence for its OWN verification step. pharn-oss now ships MIN_CLI 0.5.0 and minCliGate is called from init.ts:117, update.ts:304 and add.ts:205+322. At package.json 0.4.0 every one of those commands REFUSES against pharn-oss main. The plan's end-to-end check (`npm run build:install-local`, then `init` in a scratch project) therefore cannot run until C8's version bump has landed. C8 is listed last in the file order."
  evidence: "MIN_CLI refuses a ≤0.4.0 CLI against the post-relocation clone\" → **floor**, and it is `min-cli-gate.ts`'s, already shipped in 0.4.0."
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/features-readme-relocation/PLAN.md:81"
  problem: "tests/docs-install-tables.test.ts also asserts the two install tables `list the same artifacts in the same order` by array equality over their Artifact columns. README.md and docs/getting-started.md must therefore receive the byte-identical replacement string; the plan lists them as separate doc edits with separate line numbers and does not name the coupling."
  evidence: "`REQUIRED` takes `pharn.featuresReadme`; drop the unused `FEATURES_README` import; add `flat.featuresReadme` to `FORBIDDEN_LEADS`"
```

---

## Summary

The plan is unusually well-audited — the guarantee audit reduces every claim or labels it advisory, the P7 non-guarantee (the file stays optional) is stated rather than hidden, and the two brief premises it corrects were verified live. The concerns are concentrated in three places.

**The one that changes the build order** is the MIN_CLI interaction. The plan correctly refuses to take credit for `min-cli-gate.ts`, but that honesty stops one step short: with pharn-oss at `MIN_CLI 0.5.0`, this repo's own CLI is *currently refused by its own upstream*, so C8's version bump is a **precondition** of the plan's end-to-end verification, not its final step. Doing C8 early costs nothing and unblocks the check.

**The symlink findings** are all denial-of-install, not escape — the guards hold. But two plan sentences are wrong as written (`existsSync` does not follow / the clone can only flip a boolean harmlessly), and one real asymmetry gets newly exposed: `pharn/` becomes a walked destination component for exactly one file while every neighbouring surface writes through it unguarded. None of this needs fixing in code; it needs the plan's prose corrected so a wrong claim does not get copied into a source comment, which is how this repo's comments earn their weight.

**The contradictory-advisory finding** is the only one with user-visible consequence: "delete them by hand" and "move them by hand" landing in the same terminal output, about paths that look the same to the reader.

Two smaller gaps: the probe's own truth table is only tested indirectly, and the two install tables are coupled by an array-equality assertion the plan does not mention.

## ADVISORY VERDICT

**7 concerns raised (1 blocking-severity, 3 important, 3 minor) — for the human to weigh before `/pharn-dev-build`.** This is not a pass or a failure, and it does not gate the build; the deterministic gates remain `/pharn-dev-build`'s spec-hash + unresolved-HALT checks and `.dev/floor/validate.mjs`.
