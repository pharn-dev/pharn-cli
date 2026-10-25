# REVIEW — markdown-it-15-0-3

Floor first: `node .dev/floor/validate.mjs .` exit 0 (GREEN). Everything below is advisory.

Reviewed: `package.json` (one line), `package-lock.json` (15 entries, matching the plan's trial byte for byte),
`tests/dependency-overrides.test.ts` (+58), `CHANGELOG.md` (+4). The increment is `trust: untrusted`; no
instruction-looking content was found in it.

## Floor-gate findings (blocking)

None. Every guarantee the increment claims reduces to a floor check: the lockfile pin is a regex match plus
`compareVersionCore` in the required `Test` check; the docs are clean under the new linter (`lint:md` exit 0).

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'tests/dependency-overrides.test.ts:298'
  problem: 'The new block does not name the prerelease residual the smol-toml block names: compareVersionCore treats a prerelease as equal to its release, so a hypothetical 15.0.3-rc would pass.'
  evidence: "const MARKDOWN_IT_MINIMUM = '15.0.3';"
```

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'tests/dependency-overrides.test.ts:307'
  problem: "The lockfile loop's rejection path is shown only by the RED run during the build, not by a planted-lock test (the katex block has the same shape; smol-toml's pure auditSmolToml does have one)."
  evidence: "describe('markdown-it floor', () => {"
```

### L-eval → P1

No findings. The behaviour (the lockfile floor) has a test; the matcher and comparator each have a demonstrating
test (nested copy matched, lookalike not; 15.0.1 and 15.0.2 rejected, 15.0.3 accepted). No capability or
`enforces` rule_id is added.

### L-trust → P2

No findings. The CLI ingests nothing new at run time; the new npm tarballs are dev-only, pinned by lockfile
`integrity` (which pins bytes, not benignness — named in the plan as advisory), and none has an install script.

### L-axis → P3

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: 'tests/dependency-overrides.test.ts:285'
  problem: "A file named for overrides now also holds a lockfile floor that is not an override, and the lock-floor loop now exists in three near-copies; a later rename (e.g. dependency-floors) or a shared helper would keep the file's name honest."
  evidence: 'The `markdown-it` floor, pinned the same way — but NOT an override.'
```

## Verdict

GREEN — 0 floor-gate findings, 3 advisory (all minor). No lesson proposed for canon: nothing here is a new
recurring failure.
