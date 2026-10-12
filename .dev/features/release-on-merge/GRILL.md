# GRILL — release-on-merge

Plan: `.dev/features/release-on-merge/PLAN.md` · spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` = the plan's `spec_content_hash` (match, computed this run). Registered grillers: `{"registered":0,"grillers":[]}` (`count-grillers.mjs`) — inline axes only.

Live probe this run (grounding, not a finding): `GET https://registry.npmjs.org/@pharn-dev%2fpharn/0.11.0` → `200`, `…/0.99.0` → `404` — the registry endpoint the plan's `Registry check` relies on answers with exactly the two statuses it maps.

## Findings

### P1 — tests demonstrate behavior

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/release-on-merge/PLAN.md:29"
  problem: "The gate's exit-code mapping is the core 'a non-bump merge publishes nothing' guarantee, but the plan only regex-pins its text; under the workflow's usual `set -euo pipefail`, `git ls-remote --exit-code` returning 2 aborts the step before any mapping runs, and a text pin would not notice."
  evidence: "exit `0` → `release=false` …, exit `2` → `release=true`, **any other exit → fail**"
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/release-on-merge/PLAN.md:31"
  problem: "The registry-check step (200 → skip, 404 → publish, else fail) is pinned only statically; nothing executes it before a real release, so a wrong status mapping or a fetch that throws is first discovered in the privileged job."
  evidence: "mapping status by membership — `200 → published=true` …, `404 → published=false`, **anything else → fail**"
```

Suggested resolution (for the human / build): make both steps **behaviorally** tested from the committed YAML — the test extracts each step's `run:` block from `publish.yml` and executes it (bash for the gate with a stub `git` on `PATH` returning 0 / 2 / 128 and a temp `GITHUB_OUTPUT`; node for the registry check with the URL supplied through a step `env:` key and a local HTTP server returning 200 / 404 / 500). That turns R1's static pin into a demonstration for these two branches without running the workflow.

### P5 — determinism / fail-closed edges

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/release-on-merge/PLAN.md:25"
  problem: "The plan does not say the concurrency group is workflow-level; at job level a second run's gate could read 'no tag' while the first run is still between publish and release, and both would publish/tag the same version."
  evidence: "`concurrency: { group: publish, cancel-in-progress: false }` so two quick merges never publish in parallel"
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/release-on-merge/PLAN.md:32"
  problem: "Idempotency of `release` is keyed on the Release existing, but the gate is keyed on the tag; a tag that exists without a Release (or a tag pushed by hand for a version never published) makes the gate skip forever with no signal — recovery (delete the tag) is not documented."
  evidence: "If the release already exists (`gh release view` exit 0) the step is a no-op"
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/release-on-merge/PLAN.md:29"
  problem: "`git ls-remote` against `origin` relies on anonymous read of a public repo after `persist-credentials: false`; if the repo ever turns private it exits 128 and every merge's run goes red (fail-closed, but unexplained)."
  evidence: "checkout with `persist-credentials: false` … `git ls-remote --exit-code --tags origin`"
```

### P0 — guarantee audit

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/release-on-merge/PLAN.md:71"
  problem: "That npm's Trusted Publisher accepts an OIDC token minted on a `push` (and `workflow_dispatch`) event rather than `release` is assumed, not verified; nothing in-repo can check it, so it belongs among the named residuals rather than implied by 'unchanged guarantee'."
  evidence: "Workflow file name stays publish.yml and environment stays npm-publish so the npm Trusted Publisher config is unchanged"
```

### P4 — docs

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/release-on-merge/PLAN.md:49"
  problem: "The RELEASING.md rewrite should also tell the author to add the compare-link line (`[x.y.z]: …compare/vA...vB`) and refresh `[Unreleased]`; the extractor deliberately ignores the link block, so nothing else will prompt for it."
  evidence: "bump `package.json` + lockfile … and add the CHANGELOG section in the feature PR"
```

### P7 / P3 — scope and axes

No findings. The extra moving parts (`workflow_dispatch`, concurrency, registry idempotency, the PR-time consistency test) were each chosen by the human at GATE 1 against a named failure mode; `scripts/release-notes.mjs` has one reason to change; tests and docs stay per-file.

## Summary

The plan is coherent and keeps the security shape intact: the `id-token` grant stays in one job, the new write permission is isolated to a job that runs no repository or dependency code, and every branch ends in a fail-closed `else`. The main concern is **testing depth on the two shell/Node decision steps**. They carry the headline guarantees ("non-bump merges publish nothing", "a re-run never double-publishes"), but the plan only checks their text. One concrete trap is the `set -e` interaction with `ls-remote --exit-code`. Executing the committed `run:` blocks in vitest is cheap and closes that gap. The rest are small: say the concurrency is workflow-level, document how to recover from a stranded tag, name the Trusted Publishing event assumption as a residual, and remind authors about the CHANGELOG compare link.

ADVISORY VERDICT: 8 concerns raised (0 blocking-severity, 2 important, 6 minor) — for the human to weigh before /pharn-dev-build. This grill gates nothing.
