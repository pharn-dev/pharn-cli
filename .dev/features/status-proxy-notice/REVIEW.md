# REVIEW — status-proxy-notice

**Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN**, exit 0. Standing verdicts:
`regression-report.json` `.verdict` = `no-regressions`; `verify-report.json` `.verdict` = `PASS`
(six gates, all exit 0, 1126 tests). The increment was entitled to reach review.

> The increment is `trust: untrusted` to this stage. Nothing instruction-shaped was found in the
> reviewed code; all `problem` / `evidence` free-text below is DATA.

---

## Floor-gate findings (blocking)

**None.** No P0 guarantee lacks a floor reduction or an `advisory` label; no eval binding is missing
that the floor disagrees about; no sibling reference exists.

## Advisory findings (inform; never a sole basis for blocking)

### L-floor → P0/P4

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'CHANGELOG.md:41'
  problem: 'The entry claims parity with "every other network-bearing command", but `update` is still not one of them — its first network call is unguarded — so the changelog asserts a repo-wide property this PR does not deliver.'
  evidence: '**`pharn status --no-drift` now warns about a configured proxy, like every other network-bearing command.**'
```

This is the one finding worth acting on before merge, and it is small. The body of the entry is
exact; the headline is the loose part. `init` warns before its only fetch, `add` warns before its
fetch on **both** entry paths, and `status` now warns before both of its own — but `update` calls
`fetchRemoteSkillsVersion()` at `:144` while its notice sits at `:203`, guarding only `fetchRepo()`
at `:212`. So "every other" is not yet true, and this repo's standard is that a claim is either
accurate or labeled.

Because the defect is real and sibling-owned, the honest options are to narrow the headline (e.g.
"like `init` and `add`") or drop the comparison. Recommend narrowing rather than deleting — the
comparison is the useful part for a reader.

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'LIMITS.md:117'
  problem: 'The trusted doc still asserts "Every network-bearing command warns before fetching", which remains globally false while `update` skips its first fetch — and this repo cannot fix it, since LIMITS.md is floor-write-protected and owned upstream.'
  evidence: 'Every network-bearing command warns before fetching when it finds a proxy variable set, so the failure is explained rather than silent.'
```

Recorded so it is not mistaken for closed. This PR makes the sentence true **of `status`**; it does
not make it true of the product. Correctly **not** edited here (P2 — `protect-trusted-paths.cjs`
write-guards it, and it is pharn-oss's file).

### L-eval → P1

No finding. The floor and this lens agree, and the agreement is worth stating because the numbers
look vacuous: `validate` reports "0 capabilities checked" because this is a TypeScript increment with
no markdown Capability, so the `rule_id`→eval binding is vacuously satisfied. P1's substance is met by
the vitest layer instead — and met unusually well, because the tests were **mutation-checked**:
reverting only `src/commands/status.ts` turns exactly the three new/inverted cases RED
(`VERIFY.md`). That is the property the previous assertion lacked; it passed *because* of the bug.

### L-trust → P2

No finding. The increment ingests no new untrusted input. The one attacker-influencable value —
`process.env`'s proxy setting — is unchanged in handling: `detectProxyNotice` can surface only a key
whose lowercase equals `https_proxy` (safe to print by construction) and the value still renders
through `redactProxyUrl` (userinfo → `***`, unparseable → `(set)`, capped). The call **moved**; the
redaction boundary did not, so no taint reaches a new sink and the value is still never written to
`pharn.config.json`. No instruction-looking content in the reviewed artifact influenced this review.

### L-axis → P3

No finding. `src/commands/status.ts` still owns exactly one verb; the diff adds **no imports at all**
(the two proxy symbols were already imported), and `grep '^import' | grep 'commands/'` returns 0 —
no command→command edge.

---

## The specific questions asked

**Is the new comment accurate, or does it overstate?** Accurate — every clause was checked against
the code, not accepted:

- "precedes EVERY fetch this command can make" — there are exactly **two** fetch sites reachable from
  `status` (`:84` `fetchRemoteSkillsVersion`, `:102` `fetchRepo`); both sit below the notice at
  `:72-76`. Everything else (`readSkillsVersion`, `parseCapabilityIndex`, `diffInstalledCapabilities`)
  reads the already-downloaded clone. So the claim is exhaustive, not rhetorical.
- "Above both spinners" — each branch constructs its own spinner *after* the guard.
- "Still below `loadArchetypeConfigOrExit`" — that call is in `runStatus`, upstream of this function,
  so a legacy-config refusal still exits 1 at zero round-trips.

The comment also names the **old** reasoning as the error rather than silently deleting it. That is
the right call for this repo: the stale comment was not incidental to the bug, it was the bug's
justification, so a reader who later wonders "why not put this in the branch?" now finds the answer
instead of re-deriving the mistake.

**Does inverting a committed assertion set a bad precedent?** It would, if done quietly. Here it is
justified and recorded in five places — `PLAN.md` (a named section), `GRILL.md`, the test's own
describe-block comment, the `CHANGELOG` entry, and `VERIFY.md`'s mutation check. The mutation check is
what makes it safe rather than merely documented: it demonstrates the new assertion **fails against
the bug**, so the inversion cannot be a rationalization for weakening a test. The precedent this sets
is a good one — *when a test and a documented guarantee disagree, one of them is wrong and you must
say which, out loud*.

**Is `LIMITS.md §3a`'s "every" now true of `status`?** Of `status`, yes — on **both** paths, per the
two-fetch-site enumeration above. Of the product, no: `update` remains outstanding (finding above).

**Is the P0 floor/advisory split honest?** Yes, and correctly applied in the built code. "Exactly one
warning per run" is genuinely floor — `expect(notices).toHaveLength(1)`, run over both paths via
`it.each`, and it filters on the notice text so the drift path's unrelated
`unknownCapabilitiesWarning` cannot mask a duplicate. "Exactly one call site in the source" is
correctly labeled **advisory**, because two branch-local call sites would still emit one warning per
run and pass every assertion. The plan originally credited the count with pinning the shape; the grill
caught it and it was relabeled rather than defended.

## What the three-file scope left undone (for the reader)

1. **`src/commands/update.ts` — same defect class, still open.** Its first network call is unguarded,
   so a proxy-only `pharn update` dies with "Failed to check for updates" and **no** warning at all;
   its "already up to date" early-return also fetches and returns without reaching the notice.
   Sibling-owned; deliberately untouched.
2. **`LIMITS.md:117` stays overstated** until (1) lands. Upstream + floor-protected; unfixable here.
3. **Dev-loop tooling gap (not product):** `check-regress.mjs scope` flags `.pharn/writes-scope.json`
   as a blocking fix#7 scope escape, though `enforce-writes-scope.cjs:61` lists `.pharn/**` as
   always-writable scratch and the file is tracked. The two halves of fix #7 disagree; it will fire on
   every `/pharn-dev-regress` run. Detailed in `REGRESSION.md`.
4. **`tests/lint-gate.test.ts` has a 5000ms-timeout flake under parallel load** (it spawns `eslint`
   per case). Reproduced and isolated in `VERIFY.md`; pre-existing, not this PR's.

## Proposed lesson for canon (NOT written here — `/pharn-dev-memory-promote` decides, human-gated)

- **Candidate:** *A green suite is not evidence of correct behavior when a test encodes the same
  mistaken reasoning as the code. When a documented guarantee and a passing test disagree, determine
  which one the code is following before changing either — and when inverting a committed assertion,
  prove the new one fails against the bug (mutation-check it) so the inversion cannot be a
  rationalization.*
- **Provenance:** increment `status-proxy-notice`; `tests/status.test.ts:182-193` (pre-fix) asserted
  `expect(warned).not.toContain('will not use it')` under `--no-drift`, promoted from the stale
  `src/commands/status.ts:79-80` comment, while `LIMITS.md:117` and `docs/troubleshooting.md:204`
  both promised the opposite. Mutation evidence recorded in `VERIFY.md`.
- **Why it may be canon-worthy (P7 — real, not hypothetical):** this is the second-order failure the
  methodology exists to catch — the spec layer defending a defect — and it was caught by reading a
  trusted doc against the code, not by any gate.

---

**VERDICT: GREEN — 0 floor-gate findings, 2 advisory (1 important, 1 minor).**

The important one (`CHANGELOG.md:41`'s "like every other network-bearing command") is an accuracy fix
inside this PR's own scope and is worth making before merge. It is **advisory**: it rests on my
judgment of the wording, not on a floor check, and it blocks nothing.

This review certifies neither correctness nor merge-readiness — the floor verdicts certify the gates
they ran, and the merge decision is the human's.
