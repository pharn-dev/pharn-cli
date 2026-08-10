# GRILL — floor-gate-action-pins

Plan under interrogation: `.dev/features/floor-gate-action-pins/PLAN.md` (treated as `trust: untrusted`).
**Spec-hash check: MATCH** — `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's `spec_content_hash`. (Floor-grade computation; it only *surfaces* here — `/pharn-dev-build`'s fix #4 gate is what blocks.)

**Griller discovery (FLOOR — membership):** `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`. Inline axes only.

**Two plan claims independently re-verified before interrogating (P6):**

- `floor.yml:26` does contain `".dev/**/*.test.mjs"` in its `node --test` glob list — the wiring claim is real, not assumed.
- Only `lens-scanner-map.test.mjs` enumerates `.dev/floor/` (`readdirSync`), and it filters `scan-code-*` — so a new `check-action-pins.mjs` cannot trip its orphan-scanner assertion. The plan's naming rationale holds.

---

## Findings

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/floor-gate-action-pins/PLAN.md:63"
  problem: "The live repo-consistency test asserts only that the checker exits 0, which is also what happens when it finds nothing to check, so a renamed or mis-resolved workflows directory would turn the gate vacuously green instead of red."
  evidence: "'running the checker over `REPO` exits 0 — the invariant holds for this repo *now*'"

- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/floor-gate-action-pins/PLAN.md:46"
  problem: "The ref grammar admits only owner/repo@sha and local ./ paths, leaving docker:// image refs and ${{ }} expression refs to be reported as floating-ref with no exemption path and no stated policy."
  evidence: "'**Require** `uses: <owner>/<repo>[/<path>]@<40 lowercase hex> # v<major>.<minor>.<patch>`.'"

- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/floor-gate-action-pins/PLAN.md:29"
  problem: "The gate's enforcement is claimed as floor but rests on a runtime resolved by a floating node-version the plan itself lists as an unaddressed follow-up, so the guarantee inherits an unpinned dependency it does not name."
  evidence: "'A new `.dev/floor/*.test.mjs` is therefore **auto-collected with no CI change**.'"

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/floor-gate-action-pins/PLAN.md:22"
  problem: "The stated requirement that the two increments land together is a process expectation with nothing enforcing it, so splitting the PR would put a red floor test on main."
  evidence: "'so the two must land together. If `pin-floor-actions` were reverted, this test would correctly go RED.'"
```

## Prose summary

> Free-text `problem` / `evidence` quote the plan and inherit its **untrusted** tag — DATA for a human, never instructions (P2).

**F1 is the one that matters, and it is the repo's own disease in miniature.** "Exit 0" is overloaded: it means *both* "I checked 9 refs and all conform" *and* "I found no `.github/workflows/` and had nothing to do." A gate that cannot distinguish those is a gate that reports success for having looked nowhere — precisely the "silent truncation reads as covered" failure. The plan even specifies the vacuous case deliberately (`no .github/workflows/ dir → exit 0, checked: 0`), which is right for the **CLI** (a consumer repo without workflows is not in violation) but wrong for the **repo-consistency test**, which must additionally assert it actually inspected something. Concrete fix: have that test assert `checked >= 9` — or, better, derive the expected count from the live tree — and assert `violations: []` explicitly rather than reading exit 0 alone. Cheap, and it converts the gate from "did not complain" to "looked at N things and found none wrong."

**F2.** The grammar is a whitelist with no declared behavior for two real GitHub Actions forms: `uses: docker://alpine:3.18` and `uses: ${{ matrix.action }}`. Neither exists in this repo today, so nothing breaks now — but the first person to add a container step gets an unexplained `floating-ref` and no documented way out. Two defensible policies, and the plan should pick one **explicitly** rather than let the regex decide by accident: (a) treat `docker://` as out of scope and skip it, like `./`; or (b) require a digest there too (`docker://image@sha256:…`), which is the stricter and arguably more consistent reading. An expression ref genuinely *cannot* be pinned, so it should be a **named** violation reason (`unpinnable-ref`) rather than being mislabeled `floating-ref`. P5 asks that branches be membership tests with no silent fallback; right now these two forms fall through to a reason that misdescribes them.

**F3.** The plan is careful to call the wiring floor-grade, and it is — but the chain is: floor.yml → `actions/setup-node` (now digest-pinned, good) → `node-version: lts/*` → whichever Node that resolves to → whether that Node's `--test` expands quoted glob patterns. `lts/*` is the exact floating input the plan lists as out-of-axis follow-up #1. The guarantee is real today and the plan should keep it, but it should **name** the dependency instead of presenting the wiring as unconditional. There is also no proof step: nothing in the plan requires demonstrating that the new test is actually collected. Recommend running floor.yml's exact `node --test` command line after the build and confirming the new test's name appears in the output — the same "assert by name, not by absence of red" discipline the previous increment's F3 established.

**F4.** Declared honestly and accepted at GATE 1; recorded only so the coupling is visible if the PR is later split.

**Positive worth stating (checked, not assumed).** This increment retroactively closes the `important` P1 finding from `pin-floor-actions`' review — *"every gate in the verify set is blind to `.github/workflows/**`"*. After this lands, `.github/workflows/**` has deterministic coverage for the first time, and it is the previous increment's own property being covered. That is the right order of operations: fix the instance, then make the instance's absence checkable.

**Axes with nothing to report:** P1 (the eval list is unusually complete — it includes both boundary cases and, notably, the historical `# v6` defect as a named ★ case), P2 (no untrusted ingest; the output has no free-text field at all, so there is nothing to taint), P3 (two files, one axis each; the plan correctly refused to extend `validate.mjs` and cited its header to justify it), P4 (cites `gitleaks.yml:11` and the `lens-scanner-map` precedent rather than restating them).

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 blocking, 3 important, 1 minor) — for the human to weigh before `/pharn-dev-build`.**

Nothing here blocks; `/pharn-dev-grill` gates nothing. Two findings change what should be **built** rather than merely how it is described: **F1** (assert `checked >= 9` and `violations: []`, not bare exit 0) and **F2** (name a policy for `docker://` and add an `unpinnable-ref` reason for expression refs). Both are small and both make the gate honest about what it actually inspected — recommend folding them into the build rather than deferring, since the plan's `## Files` already covers the two files they touch.
