# REVIEW — publish-split-oidc

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** grill concern #1 was taken into the build: `check-run-pins.test.mjs` now pins that
  `id-token: write` appears exactly once, inside the `publish` job, and that this job has no checkout,
  no `npm ci`/`install`, and uses `--ignore-scripts` (fails on the base file). `check-action-pins.mjs`
  and `check-run-pins.mjs` report no violations over the live repo; the full stdlib floor suite passes
  (749/749).
- **L-trust (P2):** grill concern #2 was taken in: the privileged job publishes exactly
  `pharn-dev-pharn-<version>.tgz`, where `<version>` is the build job's output after the strict tag
  check — not "whatever tarball arrived". Content integrity across jobs is still a named residual.
- **L-eval (P1):** a workflow cannot run locally; YAML was parsed to confirm the permission layout
  (`build`: none beyond top-level `contents: read`; `publish`: `contents: read` + `id-token: write`).
- **L-axis (P3):** one workflow, two jobs, each with one purpose.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.github/workflows/publish.yml'
  problem: "actions/upload-artifact@ea165f8… (v4.6.2) and actions/download-artifact@d3f86a1… (v4.3.0) are pinned from the author's knowledge and could not be verified from this environment; the first release run is their test (a wrong SHA fails before publishing anything)."
  evidence: 'uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'docs/RELEASING.md'
  problem: 'Prerelease tags are now refused; publishing an rc requires a workflow change (and `--tag`).'
  evidence: 'a prerelease tag (`v1.2.0-rc.1`) or a tag without the `v` is refused'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 3 advisory findings. No lesson proposed for canon.
