# GRILL — init-write-target-check (ADVISORY)

Plan under interrogation: `.dev/features/init-write-target-check/PLAN.md`.
Spec-hash check: **MATCH** — `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equals the plan's `spec_content_hash`. No drift (the binding block is `/pharn-dev-build`'s, fix #4 — surfaced here only).

Griller-registry note (advisory, not a plan finding): `node .dev/floor/count-grillers.mjs .` reports 81 registered grillers, but **all live under `test-*/pharn/…`** — the local fixture installs the CLI copies into, not first-class dev-repo grillers (the dev repo root ships no `pharn-pipeline/grillers/`). They are app-domain grillers (a11y, n-plus-one, security-for-apps), not grillers for a TypeScript-CLI plan; running them here would be noise. The built-in Step-2 axes are applied inline instead.

Findings conform to `pharn-contracts/finding-shape.md` (enum-gated `type`/`rule_id`/`severity`/`file` = my own assertions, trusted; free-text `problem`/`evidence` quote the untrusted plan, rendered as DATA). Severity is my **advisory** assignment (fix #3). **Nothing here blocks `/pharn-dev-build`.**

## Axis: P1 — tests are the spec

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/init-write-target-check/PLAN.md:49"
  problem: "The plan deletes the git-RCE regression tests (fresh-check.test.ts's core.fsmonitor cases) but leaves the replacement guard OPTIONAL, so the eliminated attack surface has no test keeping it eliminated."
  evidence: "Optional backstop: a static test asserting the init flow imports no `node:child_process`."
```

The security invariant does not disappear — it **shifts** from "every git call is hardened" to "there are no git calls." P1 says a security invariant needs a test that *demonstrates* it. Recommend making the static "init flow imports no `node:child_process`/git" guard **mandatory** (its `tests/` home is already in scope) — it is the honest successor to the deleted RCE regression tests, structurally asserting the surface stays gone.

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/init-write-target-check/PLAN.md:46"
  problem: "The check's path set is a MIRROR of installCapabilities (via the shared derivation), yet no planned test pins that mirror against a real install — so the check could list a path install does not write, or miss one it does, and stay green."
  evidence: "the set is a pure function of `layoutPaths(detectLayout(repoDir))` + `selection.selected` + the fixed surfaces … Reuses `diff.ts`'s already-reviewed derivation."
```

`collectExpectedInstallPaths` mirrors the real writer (`installCapabilities`) — the same diff↔install mirror-drift the repo already carries, now shared to one place (good), but still a mirror. The planned tests exercise the derivation over *fake* repos and a diff-regression, but none asserts `collectExpectedInstallPaths (∖ settings.json ∪ pharn.config.json)` equals the file set a **real** `installCapabilities` run writes into a temp dir. Recommend adding that mirror-consistency test (the repo already has fixture-install e2e infra). Also: the phrase "ACTUAL write targets" (line 46) slightly overstates — it is a mirror of the writer; label it so.

## Axis: P4 — docs cite code

```yaml
- type: FINDING
  rule_id: P4
  severity: important
  file: ".dev/features/init-write-target-check/PLAN.md:26"
  problem: "docs/commands/init.md contains a mermaid sequence diagram with a `fresh_check` participant; merely deleting the participant leaves a dangling reference and under-describes the NEW post-fetch confirm at its new position in the flow."
  evidence: "`docs/commands/init.md` (sequence diagram + \"### 3. Fresh check\" section + heuristics table)"
```

The slot moved (pre-fetch → post-fetch, near install). The diagram must be **re-drawn** to show the write-target confirm after fetch/resolve — not just have the `fresh_check` participant removed. A half-edited mermaid (participant referenced by an arrow but not declared, or the old ordering retained) is both a broken diagram and a doc that contradicts the code (P4).

## Axis: P5 — determinism

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/init-write-target-check/PLAN.md:19"
  problem: "The displayed conflict list is capped at 10 but the plan does not say it is sorted; readdirSync order is not stable across platforms, so the 'first 10' shown (and the tests over them) would be nondeterministic."
  evidence: "`log.warn` listing the concrete paths **capped at 10 + \"…and N more\"**"
```

`diff.ts` already sorts `modified`/`missing`. Sort the conflict list before capping/display for deterministic output and order-independent tests.

## Axis: P2 — trust propagation

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/init-write-target-check/PLAN.md:19"
  problem: "The check DISPLAYS filenames enumerated from the untrusted clone without re-validating them against COPY_FILENAME_RE/CAPABILITY_NAME_RE (only safeJoin gates the existsSync); a crafted name could carry terminal-escape/control chars into the warning text."
  evidence: "`log.warn` listing the concrete paths … These paths already exist and may be overwritten:"
```

Bounded (the clone is the pinned `pharn-dev/pharn-oss`, and `diff.ts` already displays paths the same way), so this is a low-impact note, not a hole. Consider validating/escaping displayed names, or explicitly recording the bound in the trust audit.

## Axis: P7 — honest scope

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/init-write-target-check/PLAN.md:31"
  problem: "confirmOverwriteIfExists currently logs the existing config's skillsVersion; the plan makes preserving that 'optional', so a small UX signal (which PHARN version you're overwriting) may silently vanish on a re-install."
  evidence: "The check reads the filesystem (and optionally the existing config's `skillsVersion` for the note)"
```

Very minor — just decide it explicitly rather than leaving it "optional".

## Prose summary

The plan is sound and its guarantee/trust/determinism audits are genuinely strong: the proceed/stop branch is a real membership test, the confirm is correctly labeled advisory (no safety claim rests on it), the untrusted-clone taint is bounded to a path-contained membership test plus a data-only display, and the P3 layer boundaries (new `lib/` derivation reused by `diff.ts`, one-stage `steps/` file, command→step wiring) are clean. The security *removal* is handled honestly (elimination, not hardening).

The concerns are refinements, all within the plan's existing file set: (1) don't delete the RCE regression tests without a **mandatory** structural successor guard (P1); (2) add a **mirror-consistency** test pinning the derivation to a real `installCapabilities` run, since "ACTUAL write targets" is a mirror (P1/P0); (3) actually **re-draw** the init.md sequence diagram for the new post-fetch slot, don't just delete the participant (P4); (4) **sort** the conflict list before capping (P5); (5) note/escape displayed untrusted names (P2); (6) decide the skillsVersion line explicitly (P7).

## ADVISORY VERDICT

6 concerns raised (0 blocking, 3 important, 3 minor) — for the human to weigh before `/pharn-dev-build`. This grill-log is **advisory**; it does not gate the build. The important findings (1–3) fall inside the approved scope and strengthen the increment without changing its axis; the orchestrated build will fold them in.
