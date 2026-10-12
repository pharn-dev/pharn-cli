# REVIEW — release-on-merge

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN, run this review). `/pharn-dev-verify` → PASS (7 gates exit 0). Everything below is **advisory** unless marked floor-gate.

## Floor-gate findings (blocking)

None. Every guarantee the increment claims reduces to a floor primitive or is labeled advisory:

- `id-token: write` once, inside `publish` (sliced to its own job) — regex pin, `.dev/floor/check-run-pins.test.mjs`.
- `contents: write` once, inside `release`; `release` holds no `id-token`, no checkout, no install, no `node` — regex pins in both test files, each with a mutation control.
- Tag decision (`ls-remote` exit ∈ {0, 2}, else fail), ref == main, strict `X.Y.Z` — the committed `Decide` step executed against a stub `git` (`tests/publish-workflow.test.ts`).
- Registry status ∈ {200, 404}, else fail (redirect and no-answer included) — the committed `Registry check` step executed against a local HTTP server.
- Release notes = exact literal `## [X.Y.Z]` heading — behaviorally tested (`tests/release-notes.test.ts`); lockfile/CHANGELOG agreement on every PR (`tests/release-consistency.test.ts`).
- "Merge = publish is safe", "the bump is right", "the Trusted Publisher accepts a push-triggered run" — labeled advisory / named limits in `docs/RELEASING.md` § Limits.

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "docs/RELEASING.md:115"
  problem: "When a bump's release run fails and is not re-run, the next non-bump merge's run sees no tag and publishes that version from the LATER commit; this is self-healing but the docs describe only re-running, so a maintainer may be surprised that 0.12.0 on npm includes a later docs/deps change."
  evidence: "Every job is safe to repeat: the gate releases only while the tag is absent"
```

### L-eval → P1

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/release-consistency.test.ts:43"
  problem: "The non-vacuity control assumes CHANGELOG has no heading for the next minor; if an author writes `## [0.12.0]` before bumping package.json, this test fails with a message that points at the control rather than at the real inconsistency (a CHANGELOG ahead of package.json)."
  evidence: "const bumped = `${major}.${minor! + 1}.0`;"
```

No capability, rule or `enforces` binding is added, so the P1 eval-binding floor has nothing to bind; the increment's behaviour ships with 34 new/changed vitest + node tests (floor and vitest agree: both GREEN).

### L-trust → P2

No findings. The only inputs are this repository's own committed files, a git exit code and an HTTP status; no response body is parsed. The version reaches shell and `${{ }}`-built env values only after the strict regex in `gate`; `RELEASE_NOTES.md` reaches `gh` as a file, never as an argument or expression. Nothing in the reviewed files read as an instruction to the reviewer.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: "tests/publish-workflow.test.ts:20"
  problem: "`codeOf`/`jobBlock` duplicate the floor test's helpers of the same name; this follows the existing floor-isolation precedent (no floor script imports another, and vitest tests do not import .dev/floor), but a slicing fix now has two homes."
  evidence: "/** One job's lines, from its header to the next job header. */"
```

### Docs → P4

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".github/PULL_REQUEST_TEMPLATE.md:28"
  problem: "A relative link in a PR template is rendered in the PR description, where `../docs/RELEASING.md` resolves against the pull-request URL and 404s; the existing template names files as plain text."
  evidence: "see [`docs/RELEASING.md`](../docs/RELEASING.md)"
```

## Surfaced for the human (not findings against the build)

- The `npm-publish` environment still has no required reviewers, so after this merges, **merging a version bump publishes with no further click** (named in `docs/RELEASING.md` § Limits). Whether to add one is a GitHub setting.
- This PR deliberately does not bump the version: its own merge exercises the skip path (tag `v0.11.0` exists → `gate` ends green). The publish path, and npm's acceptance of a `push`-event OIDC token, are first exercised by the next bump.
- `.pharn/writes-scope.json` is tracked in git and changes with every loop stage; it is in the diff as the loop's scratch, not as product.

## Proposed lesson (candidate only — not written to canon)

None proposed: the one defect found during the build (a `set -e` + `git ls-remote --exit-code` interaction, caught by the grill before code) is specific to this workflow and already pinned by an executing test; it is not yet a recurring failure (P7).

VERDICT: GREEN — 0 floor-gate findings; 4 advisory findings (all minor).
