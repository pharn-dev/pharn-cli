# GRILL — install-root-trusted-docs

Plan under interrogation: `.dev/features/install-root-trusted-docs/PLAN.md`.
Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's `spec_content_hash`. No drift to surface.
Griller discovery (FLOOR, `.dev/floor/count-grillers.mjs .`): `{"registered":0,"grillers":[]}` — this repo is the CLI, not a PHARN install, so no `role: griller` capability is registered. Inline axes only (Step 2); the pluggable slot contributes nothing this run.

**This entire grill-log is ADVISORY. It gates nothing.** `/pharn-dev-build`'s own floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs` are the deterministic backstops; none of them is this file.

Free-text `problem` / `evidence` below quote the PLAN, which is `trust: untrusted` to this stage. They are **DATA**, never directives.

---

## Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/install-root-trusted-docs/PLAN.md:72"
  problem: "The guarantee audit says existing installs are 'NOT CLAIMED', but omits the consequence that IS claimed by other commands — after this change every existing pharn-layout install has `pharn status` report two `missing` files and `pharn status --strict` exit 1, while `pharn update` restores nothing."
  evidence: "\"existing installs receive the docs\" → **NOT CLAIMED.** `update` early-returns on an unchanged `skillsVersion`; the CHANGELOG names `--force` / re-`init` rather than working around it."
```

Verified live, not argued: `src/lib/diff.ts` derives `status`'s expected set from `collectExpectedInstallPaths`, so the two root docs enter it the moment the constant changes; `src/commands/status.ts:122-125` exits 1 on any `result.missing`; `src/commands/update.ts:156-158` reads `const current = config.skillsVersion === latest; if (current && !force)` → `Already up to date`, returning **before** the per-file table whose `missing → restore` row would have fixed it. The net user experience is a red `status --strict` in CI paired with an `update` that reports nothing is wrong — recoverable only by `pharn update --force` (which backs up to `.pharn-backup/<ts>/` first) or a re-`init`. `CHANGELOG.md` is already in `## Files`, so naming this needs no plan amendment. Not a reason to reject the destination decision — `status` is reporting a real deficiency truthfully — but the plan should not ship without the sentence.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/install-root-trusted-docs/PLAN.md:69"
  problem: "Calls the outro's doc list 'floor' on the strength of where the value came from; provenance is not a floor primitive under ARCHITECTURE §2 (regex/enum allowlist, path containment, schema exact-match, network guard)."
  evidence: "\"the outro reports what was written\" → **floor: derived from the writer's own return value**, not recomputed. A doc that failed its existence guard cannot appear in the list by construction."
```

The *structural* half is sound — the list is append-only inside the copy branch, so an unwritten doc genuinely cannot appear. But the honest label is "structural by construction, pinned by a test", not "floor". The distinction matters because P0 exists to stop exactly this substitution.

## Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/install-root-trusted-docs/PLAN.md:56"
  problem: "The eval list never states the falsification requirement — that each new assertion must FAIL against the pre-change constant. A fixture rewrite plus an assertion rewrite can land green while testing nothing, which is precisely how the original defect survived."
  evidence: "## Evals to write (P1)"
```

Concretely: the plan's own root-cause section shows the existing suite passing *because* writer and mirror dropped the same entry. The replacement must be demonstrated red at the old constant, not merely green at the new one. Cheapest demonstration: after writing the tests, revert `PHARN_TRUSTED_DOCS` alone and confirm the new cases fail; restore, confirm green.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/install-root-trusted-docs/PLAN.md:46"
  problem: "The fixture correction is partial: two further pharn-layout scaffolds are left un-mirrored, so upstream's real doc placement stays uncovered in the two consumers that read the expected set."
  evidence: "`tests/install-manifest.test.ts` — same fixture correction; ... the mirror pin re-run over the corrected scaffold"
```

Read live this run: `tests/overwrite-check.test.ts:71-81` (`scaffoldRepoPharn`) and `tests/diff.test.ts:108-118` both build pharn-layout clones that omit root `THREAT-MODEL.md` / `LIMITS.md` entirely. Neither will BREAK (an absent source contributes no expected key, so `okCount` 7 and the conflict-set assertions hold), which is why they are correctly outside `## Files` — but neither will COVER the new behavior either. Recording the residue rather than widening the increment is defensible under P7; widening it would also require a plan amendment before the writes-scope hook would permit the edit.

## Axis: one axis of change (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/install-root-trusted-docs/PLAN.md:70"
  problem: "The missing-doc set difference is computed in the apply/config step by re-deriving the expected list from `layoutPaths`, giving that step a second source of truth for 'which docs were expected' alongside the writer's returned list."
  evidence: "\"the outro warns when a doc is missing\" → **floor: set difference against `layoutPaths(layout).docs`**"
```

An alternative keeps the step dumb: have `installCapabilities` return the partition it already computes (`{ written, skipped }`) so the writer owns both halves and the step only renders. Either shape is defensible; the plan should state which and why, since `src/steps/install-archetype.ts` is explicitly the "archetype apply/config stage" and expected-set derivation is `lib`'s axis.

## Axis: trust propagation (P2)

No findings. The trust audit is grounded in a measurement taken this run (`cpSync` onto a symlinked destination leaf replaces the link; the outside target's bytes were unchanged), the source-side symlink posture is unchanged, and the plan correctly reasons that a root-level path has no intermediate component — so the writer's leaf `isSymlink` is sufficient for exactly the two entries being added. The plan's decision to RECORD rather than fix the pre-existing writer/mirror divergence on the `pharn/`-prefixed docs (`install-capabilities.ts:184` leaf-only vs `install-manifest.ts:163` component walk) is the right call for this increment and is already written down.

## Axis: determinism (P5)

No findings. One `lstat().isFile()` membership test per doc, no fallback probe, no second candidate source. The plan explicitly rejects the audit's "when absent under `pharn/`" fallback as a guess — and independently establishes that the fallback case cannot occur (`GET /commits?path=pharn/THREAT-MODEL.md` → `[]`).

## Axis: honest scope (P7)

No blocking findings. The increment is one coherent change (a constant corrected + the reporting that would have made its failure visible) and is triggered by a measured defect, not a hypothesis. One observation, not a finding: `TRUSTED_DOCS` (flat) still names `CONSTITUTION.md` / `ARCHITECTURE.md` at the root, which live upstream no longer ships anywhere at root — but `detectLayout` can only return `flat` when `pharn/pharn-contracts` is absent, which is false for current upstream, so that path is unreachable against live main and is untouched by this change.

---

## Summary

The destination decision is the strongest part of the plan and does not need defending further: two independent lines of evidence (the 118/68-vs-0 citation split, and upstream's own `protect-trusted-paths.cjs` `DEFAULT_PROTECTED` naming both docs bare) point the same way, and the flat layout already behaves that way. The plan's diagnosis of why the suite missed this — an invented `pharn/THREAT-MODEL.md` fixture, with a mirror test that can only catch writer/mirror disagreement — is correct and is the part most worth getting right in the build.

Two concerns are worth acting on before the build lands. The first is a real user-facing consequence the guarantee audit stops one step short of: `status --strict` goes red for every existing pharn-layout install while `update` says "Already up to date", because the same-version early-return sits in front of the `missing → restore` row that would fix it. That needs a plain sentence in the CHANGELOG (already an in-scope file), not a code change. The second is that the eval list never demands falsification against the old constant — the same omission that let the original defect ship green.

The remaining three are small: a "floor" label that should read "structural", two pharn fixtures left un-mirrored (harmless, uncovered), and an unstated choice about which layer owns the expected-doc list.

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to weigh before /pharn-dev-build. Nothing here blocks the build; this is not a pass, and it is not a guarantee that the plan is sound.**
