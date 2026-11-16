# REVIEW — command-integration-suites

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is advisory.

Scope reviewed: `tests/support/{harness,clack-stub,tar-fixture}.ts`, `tests/commands/*.test.ts`,
`tests/update-plan.test.ts`, `tests/orphans.test.ts`, `vitest.config.ts`, `docs/contributing.md`.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: 'vitest.config.ts:16'
  problem: 'AC2 (no vi.mock of a src/ module outside index.test.ts) is checked by a grep in VERIFY.md, not by a lint rule, so a future test can reintroduce a src mock with CI green.'
  evidence: "git grep -lE \"vi\\.(do)?[mM]ock\\(['\\\"](\\.\\./)+src/\" -- tests → tests/index.test.ts only"
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'CLAUDE.md:92'
  problem: "CLAUDE.md's Testing section and a src comment (src/lib/init-plan.ts:405) still name deleted files (commands-integration.test.ts, init-archetype.test.ts); both are CORE-192's files, so not edited here."
  evidence: 'tests/commands-integration.test.ts is the one command suite that mocks no src/ module'
- type: FINDING
  rule_id: P3
  severity: minor
  file: 'tests/commands/update.test.ts:1'
  problem: "Several suites define the same local helpers (clone-cleanup TMPDIR stub, a 'no clack call' check, a fresh-output reset, a held-lock writer, a node:fs openSync lock hook) that belong in tests/support/."
  evidence: 'isolateClones() / watchClones() / expectNoClack() / expectClackSilent() / fresh() / clearAll()'
- type: FINDING
  rule_id: P1
  severity: minor
  file: 'tests/commands/update-dry-run.test.ts:1'
  problem: "The hostile-capability-name JSON case is weaker than before: a real tarball cannot carry ESC in a directory name, so the hostile string sits in frontmatter and only 'no raw ESC on stdout' is asserted, not an exact round trip."
  evidence: 'old: a mocked parseCapabilityIndex returned a name with ESC'
- type: FINDING
  rule_id: P7
  severity: minor
  file: 'tests/commands/update.test.ts:1'
  problem: "update.test.ts (3.2k lines, ~5.4 s) is the suite's long pole under --maxWorkers=2; splitting it would cut wall time, and total test lines (44,287) stay above the epic's 30k."
  evidence: 'branch 19.4–19.8 s vs main 16.3–16.8 s (1.18–1.21x)'
```

## Lenses

- **L-floor (P0):** the PR claims no new runtime guarantee. Coverage floors are a CI floor (vitest
  thresholds); wall time and "every documented refusal covered" are labelled advisory in PLAN.md.
- **L-tests (P1):** every deleted case is either ported (an observable assertion on exit code,
  output, files, config/records bytes or the fetch log), merged into a table row, kept as a
  representative of a unit-tested pure module, or listed as dropped with a reason (wiring-only spy,
  source-text pin, unreachable-without-a-mock defensive branch). Security invariants kept: unsafe
  capability names refused at load, symlinked components refused before and under the lock,
  strict-child delete, symlinked-dir refusal in `add`, dangling-link pre-flight in `init`, escaping
  of hostile strings in JSON.
- **L-trust (P2):** no untrusted input enters; fixtures are test-owned.
- **L-axis (P3):** one suite per command; the harness only knows the network and the terminal.

Coverage lost versus the start of the branch (branches only; statements/functions/lines did not drop):
`init-plan.ts:339` and `:581` (`??` fallbacks the real carry-over never takes), `install-archetype.ts:204`
(a symlink appearing between two in-process pre-flights — a race), `install-capabilities.ts:356`
(else arm when a clone has no core dir — V8 attributes it to the consequent for a flat clone, whose
outcome is asserted), `update-decision.ts:341` (the sort comparator's `-1` arm: the manifest already
lists unit files in order, so V8 never asks it; the sorted output is asserted).

Verdict: advisory. 5 minor findings, none blocking. The decision is the human's.
