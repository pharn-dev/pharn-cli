# REVIEW — pharn-ci-comment-pr-head

Floor first: `node .dev/floor/validate.mjs .` = 0 (also inside VERIFY's PASS). Everything below is
advisory. The reviewed diff (`f83b736..3199ca6`) is `trust: untrusted`. Nothing in it read as an
instruction to the reviewer.

## Floor-gate findings

None. No guarantee in the increment lacks a floor reduction or an `advisory` label:

- check names unchanged → `tests/ci-workflow.test.ts` set equality;
- no repository code in the write-token job → the zero-`run:` / no-toolchain / exact-steps pin;
- the only write grant is in the comment job → the `: write` scan over `ci.yml`;
- same inputs as the gate → the `with:`-map equality, minus exactly `comment` / `fail-on-verdict`;
- fork-only workflow_run path → the exact `if:` pin.

The one claim no floor covers ("the comment agrees with the gating report") is labelled advisory in
the plan and is checked by hand on the PR.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.github/workflows/ci.yml:174'
  problem: "The workflow comment states as fact that a Dependabot PR's token is raised by the permissions block, which no read this run confirmed; it should say what is expected and what happens if not."
  evidence: "A Dependabot PR's token is raised by the permissions block below."
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/ci-workflow.test.ts:397'
  problem: 'The write-grant scan requires the line to end right after `write`, so a grant with a trailing YAML comment (`contents: write # …`) would slip past it.'
  evidence: "captureAll(ci.source, /^\\s+([a-z-]+: write)$/gm)"
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.github/workflows/ci.yml:191'
  problem: "The comment job consumes an artifact; for a same-repo PR that is as trusted as the checkout, and pharn-ci only reads it as coverage, so a forged file can only flatter its own PR (pharn-ci's documented residual). Recorded so the trust boundary stays visible, no change needed."
  evidence: 'name: pharn-ci-input'
```

L-axis (P3): each file changes for one reason. The test file pins CI workflows only. No sibling
references. L-eval (P1): no markdown capability or `rule_id` is added; the new behaviour is covered
by six new vitest cases, each shown able to fail by a deliberate mutation.

## Verdict

GREEN — 0 floor findings, 3 advisory (all minor). The first two are one-line fixes inside the plan's
`## Files`.

## Lesson candidate (proposed, not canon)

- "A `workflow_run` comment in pharn-ci's PR-number mode cannot agree with a `pull_request`
  gate: read pharn-ci's mode limits before reading its comment as a verdict." Provenance: this
  increment (`3199ca6`), PRs #354/#355/#356. Promotion only via `/pharn-dev-memory-promote`.
