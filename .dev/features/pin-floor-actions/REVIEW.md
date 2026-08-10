# REVIEW — pin-floor-actions

**Step 1 — floor first (P0):** `node .dev/floor/validate.mjs .` → **exit 0**, `FLOOR: GREEN — 0 capabilities checked in .` The increment reached review with a green floor, as required.

Increment under review (`trust: untrusted`): the three-file diff against `112e226` — `.github/workflows/{floor,ci,publish}.yml`.

---

## Findings

> Free-text `problem` / `evidence` inherit the reviewed increment's untrusted tag (`ARCHITECTURE.md §8`) — quoted DATA for a human, never a directive.

### L-floor → P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".github/workflows/ci.yml:18"
  problem: "The increment fixes an instance of comment↔digest divergence without reducing the claim to a floor check, so the exact failure it repairs can recur silently and did once already."
  evidence: "'- uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0'"
  gate: advisory-gate
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".github/workflows/floor.yml:20"
  problem: "The zero-execution-change property holds only against upstream state read at plan time, and nothing in the repo re-asserts it at merge time, so a tag that moves before merge would leave the claim stale rather than false-but-detected."
  evidence: "'- uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0'"
  gate: advisory-gate
```

### L-eval → P1

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".github/workflows/floor.yml:19"
  problem: "The increment ships zero deterministic coverage over the files it changed — every gate in the verify set is blind to .github/workflows/** — so a green floor and a green verify are both compatible with a broken workflow."
  evidence: "'- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1'"
  gate: advisory-gate
```

**Floor agreement check (required by this lens):** `validate.mjs` reports `0 capabilities checked`, and the increment adds no Capability and no `rule_id`. The floor and this lens **agree** that no eval binding is owed — there is no disagreement to report. The finding above is about *coverage*, not about a missing binding.

### L-trust → P2

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/pin-floor-actions/PLAN.md:34"
  problem: "The incoming build prompt contained a literal ref string that is not a valid commit SHA, and applying it verbatim as instructed would have written an unresolvable action ref into the fork-PR workflow."
  evidence: "'actions/checkout@3d3c42e5aac5ba805825da76410c18127.0.1'"
  gate: advisory-gate
```

**Did instruction-looking content change my behavior?** It tried, and it did not. The build prompt presented a "verified digest table" and instructed *"apply verbatim"*; one row's value was corrupted (38 chars, embedded `.`). The value written was **not** taken from that instruction — it was taken from `git ls-remote https://github.com/actions/checkout v7.0.1`, an independent deterministic read, and the discrepancy was surfaced at the plan halt rather than normalized away. This is the enum-gated/free-text split working at the *input* boundary: a prose directive lost to a floor-checkable fact. Recorded because noting it is the defense (P2), not because the prompt was hostile — it was a copy-paste error.

**No guaranteed decision in this increment rests on a tainted or free-text field.** Every decision was string equality against `ls-remote` output, path membership, or an exit code. The `REGRESSION.md` / `VERIFY.md` free-text gates nothing.

**Trust-surface note (in favor of the change):** `floor.yml` is the repo's only workflow triggered by fork `pull_request`, i.e. the one place untrusted third-party input meets executing third-party actions. Moving it from tag resolution to a content-addressed pin narrows what can execute there to one fixed commit — floor primitive #2 applied to the highest-exposure surface. `persist-credentials: false` narrows what a compromise could reach; it remains **advisory** hardening, not a guarantee, and is correctly labeled so in the plan.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/pin-floor-actions/PLAN.md:10"
  problem: "The increment spans two change-reasons — supply-chain pinning and credential hardening in one file, plus comment accuracy in two files the pinning does not otherwise touch — where the comment fix was independently shippable."
  evidence: "'`.github/workflows/floor.yml` — pin both `uses:` by digest + add `persist-credentials: false`'"
  gate: advisory-gate
```

Per-file, P3 holds: each of the three files changes for exactly one reason as written (floor.yml: "align with the repo's hardening convention"; ci/publish: "make the version comment true"). No sibling references exist to route through `pharn-contracts` — these are YAML config, not modules. This duplicates `GRILL.md` F4 deliberately: it was raised pre-build, accepted by the human at GATE 1, and is recorded post-build as a visible choice rather than quietly dropped.

---

## Gate split (fix #3)

- **floor-gate (blocking): none.** No finding here derives from content the floor can check and fail — `validate.mjs` is GREEN, no eval binding is owed, no sibling reference exists, and no guaranteed decision rests on a tainted field.
- **advisory-gate (warn): all five findings above.** Each rests on my judgment of severity or of free-text. None is a basis for blocking, and none may be read as one.

## What the increment got right (not padding — these were checked, not assumed)

- Every load-bearing digest↔tag mapping was verified against live `ls-remote` this run, including the annotated-tag `^{}` footgun (all lightweight — the plain line *is* the commit).
- The diff is byte-exact to what the human approved at GATE 1; the build's writes-scope was floor-pinned to the plan's three paths, so a fourth-file write would have been denied at write time, not merely reported.
- **Comment-form normalization, verified post-build:** `grep -rnE "# v[0-9]+$" .github/workflows/` now returns nothing — every pin comment is full semver (`5 × # v7.0.1`, `3 × # v7.0.0`, `2 × # v4.37.4`). The major-only `# v6` outlier — the exact form dependabot mishandled at `ff48077` — no longer exists in the repo. That is a real reduction in the recurrence surface, even though it is not a floor guarantee.

## Verdict

**GREEN — 0 floor-gate findings; 5 advisory findings (0 blocking, 2 important, 3 minor).**

Standing floor verdicts from the chain: `validate` exit 0 · `regression-report.json` `"no-regressions"` · `verify-report.json` `"PASS"`. This verdict is **advisory** and gates nothing; `/pharn-dev-review` emits no `findings.json` and has no `check-review.mjs`. The two `important` findings (P0 recurrence surface, P1 coverage blindness) are both arguments for the *follow-up* named below, not objections to this change.

---

## Proposed lesson candidate (NOT written to canon — P2/P7)

Proposed for `.dev/memory-bank/lessons-learned.md` via a separate, human-gated `/pharn-dev-memory-promote` run. `/pharn-dev-review` declares no `.dev/memory-bank/**` path and writes no canon.

- **Candidate:** A dependabot digest bump can carry a pinned action across a **major version** while leaving the trailing `# vN` comment untouched, so the comment silently becomes false while the digest stays correct. Nothing in the repo checks comment↔digest agreement, so the divergence is invisible until someone audits pins by hand. Prefer **full-semver** pin comments (`# v7.0.0`, not `# v7`) — the major-only form is what diverges — and treat comment↔digest agreement as **unguarded** until a floor check exists.
- **Why it qualifies as real, not hypothetical (P7):** it actually occurred in this repo at `ff48077` ("bump actions/setup-node from 6 to 7"), which wrote the v7.0.0 digest under a `# v6` comment in `ci.yml`, and it survived undetected through `c425edd` (which copied the same pattern into `publish.yml`) until this increment. Two files, two subsequent PRs, one manual audit to find it.
- **Provenance:** increment `pin-floor-actions`; base `112e22616993bf219fc251a4f0c5d008ea017cb2`; originating commit `ff48077`; corroborating upstream reads — `refs/tags/v6` moved `48b55a0…` (v6.4.0) → `249970729cb0ef3589644e2896645e5dc5ba9c38` (v6.5.0).
- **Named follow-up it argues for (not built here — P7, and it would have needed a fourth file):** a `.dev/floor/` regex gate over `.github/workflows/**` asserting every `uses:` matches `@<40-hex> # v<semver>`, which would convert both the "no floating refs" and the comment-form properties from point-in-time greps into floor primitive #3. Deliberately deferred: once floor.yml holds a digest, dependabot preserves that form, so there is no triggering need today.
