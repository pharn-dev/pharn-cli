# GRILL — status-proxy-notice

Plan under interrogation: `.dev/features/status-proxy-notice/PLAN.md`.
**Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's
`spec_content_hash` (`PLAN.md:3`). No spec drift to surface; `/pharn-dev-build` re-enforces this as a
floor-gate (fix #4).

Registered grillers: `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`.
No `role: griller` capability is installed in this repo, so Step 2b contributes nothing and the
findings below come from the inline axes only (P7 — stated, not silently skipped).

> The plan is `trust: untrusted` to this stage. All `problem` / `evidence` free-text below quotes it
> as DATA.

---

## Findings

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/status-proxy-notice/PLAN.md:128'
  problem: 'The "fires exactly once" guarantee is credited to a floor check that provably cannot detect the regression it names — a count over the mocked log.warn is blind to a two-call-site duplication, because the two branches are mutually exclusive and each would still emit exactly one warning per run.'
  evidence: '"the notice fires exactly once per run" → **floor: enum/count check** — a `toHaveBeenCalledTimes` style count over the mocked `log.warn`, plus the single-call-site shape.'
```

This is the one finding worth arguing with the plan about. Split the claim in two, because the two
halves have different grades:

- **"exactly one warning reaches the user per run"** — genuinely floor-reducible; a
  `toHaveBeenCalledTimes(1)` over the mocked `log.warn` is a deterministic count. Keep it labeled
  floor.
- **"there is exactly one call site in the source"** — pinned by **nothing**. If a future change
  re-duplicated the block into both branches, every run would still warn exactly once and every
  planned assertion would stay green. The trailing clause _"plus the single-call-site shape"_ is
  doing unearned work: it reads as though the shape is covered, and it is not. It is **advisory**
  (review discipline / the comment), and P0 says label it so.

The practical consequence is small — a duplicated notice would be a maintenance defect, not a
user-visible one — which is exactly why it should be labeled honestly rather than defended. A test
cannot see source shape; only a reviewer or a static check can.

### Axis: eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/status-proxy-notice/PLAN.md:113'
  problem: 'Every planned eval exercises a fetch that SUCCEEDS, so the one scenario the notice exists for — a proxy-only network where the fetch FAILS — is the single path with no test; the ordering could regress there without any assertion going red.'
  evidence: '`--no-drift` + proxy set → **warns**, and the warn happens **before** `fetchRemoteSkillsVersion` resolves'
```

The plan's four eval rows all assume the fetch resolves. But the user story in the finding is
"a proxy-only user gets an unexplained failure" — the fetch **throws**, `status.ts:65-69` stops the
spinner, calls `reportFatal`, and exits 1. The notice's whole value is that it is already on screen
when that happens.

Nothing in the planned suite would catch a future edit that emitted the notice only on the success
path (for instance, moving it inside the `try` after the `await`). Recommend one more row:
`--no-drift` + proxy set + `fetchRemoteSkillsVersion` rejects → the warning was emitted, and emitted
before the fatal report. The harness already supports it: `stubProcessExit` makes the `exit(1)`
throwable, and `fetchRemoteSkillsVersion` is a plain `vi.fn()`.

This is the highest-value finding in this grill: it is the difference between testing the mechanism
and testing the reason the mechanism exists.

### Axis: honest scope / precision (P7, P4)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/status-proxy-notice/PLAN.md:47'
  problem: 'A cited path:line does not resolve to the sentence it is quoted for — the promise "pharn says so before it fetches" is at docs/troubleshooting.md:204, not in the cited :190-196 range, which covers only the section heading and the preceding paragraph.'
  evidence: '`docs/troubleshooting.md:190-196` ... then promises "If a proxy variable is set, `pharn` says so **before** it fetches".'
```

The substance is right — the doc genuinely already promises the fixed behavior, and that is a strong
argument for the fix — but this repo's discipline is that a cited `path:line` resolves. `:190` is the
`## Proxy environment variables` heading; the quoted promise is `:204`. Correct the citation rather
than the claim.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/status-proxy-notice/PLAN.md:132'
  problem: 'The plan describes the test delta as "the two proxy cases named above", but the four named eval rows map to one inverted case, two unchanged cases, and one new case — an ambiguous count for a document /pharn-dev-build reads as its instruction set.'
  evidence: 'stay green unmodified apart from the two proxy cases named above'
```

State the delta exactly: **one** case inverted + retitled (`:182-193`), **one** describe-block comment
corrected (`:154-157`), **one** case added (fire-exactly-once), **two** cases untouched (`:161-179`
drift-path order, `:195-208` silence).

---

## What the interrogation CONFIRMED (not findings — recorded so the human need not re-derive them)

These were checked against the live source this run, because the grill request named them:

- **No other `status` path reaches a fetch without passing the hoisted notice.** `runStatus`
  (`:41-45`) does `intro` → `cwd` → `loadArchetypeConfigOrExit` → `runArchetypeStatus`; the load can
  `exit(1)` but performs no fetch. Inside `runArchetypeStatus` there are exactly two fetch sites
  (`:63`, `:90`), one per branch, and the hoist dominates the branch that separates them. `--strict`
  adds no fetch — it only selects exit codes.
- **Pre-spinner ordering survives the hoist.** Both branches construct and start their spinner
  *inside* the branch (`:59-60` and `:86-87`), so a block placed above the `:58` guard is pre-spinner
  for both. The invariant that motivated the original placement is strengthened, not weakened.
- **The legacy-config refusal still wins.** The hoist stays inside `runArchetypeStatus`, which only
  runs past `loadArchetypeConfigOrExit`. A pre-archetype config still exits 1 with
  `LEGACY_CONFIG_MESSAGE` and zero round-trips — the promptless-local-step-first ordering is intact.
- **The notice cannot fire spuriously.** Both branches fetch unconditionally, so there is no
  `status` path that warns about a proxy and then makes no network call.
- **The order assertion is real, not presence-dressed-as-order.** Capturing
  `log.warn.mock.calls.length > 0` *inside* `fetchRemoteSkillsVersion.mockImplementationOnce` runs
  the check at call time, which proves precedence rather than co-occurrence. It mirrors the existing
  `warnedBeforeFetch` pattern at `:161-179`. One mechanical note for `/pharn-dev-build`: that mock must
  still return a valid version string, or `printArchetypeVersion` renders against `undefined`.
- **`CHANGELOG.md` targeting is correct.** `### Fixed` under `## [Unreleased]` is `:39`; the `:152`
  occurrence belongs to a released version and must not be touched.
- **Scope holds.** No sibling-PR file appears in `## Files`. `LIMITS.md` is correctly excluded (P2,
  floor-write-protected) and the plan does not plan an edit to it.
- **`update.ts` is correctly named-but-not-fixed** (`PLAN.md`, "Out of scope"). Leaving it is the
  right call for this PR and the right thing to have written down; it must reach the human.

## Summary

The plan is small, correctly scoped, and grounded in reads taken this run — the defect, the
placement invariants, and the two trusted-doc citations all check out against live files. Its
strongest move is refusing to hide the test inversion: naming "the suite defended the bug" is the
part most likely to be quietly dropped, and it is written down.

Two concerns are worth weighing before build. The **P1 gap is the substantive one**: every planned
eval exercises a *successful* fetch, leaving the failure path — the actual user story behind the
finding — unpinned. The **P0 concern** is a labeling honesty issue rather than a defect: a count
assertion is credited with pinning a source-shape property it structurally cannot see, and P0 asks
for that to be relabeled advisory rather than defended. The two minor findings are precision fixes
to a document that `/pharn-dev-build` reads as instructions.

Nothing here suggests the increment is wrong or should not proceed. No constitution violation was
found.

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor) — for the human to
weigh before /pharn-dev-build.** This grill-log is advisory end-to-end and **gates nothing**: it does
not block, approve, or certify `/pharn-dev-build`. The deterministic backstops remain `/pharn-dev-build`'s
own floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`.
