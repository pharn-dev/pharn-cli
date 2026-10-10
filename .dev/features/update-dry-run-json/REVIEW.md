# REVIEW — update-dry-run-json (ADVISORY except the floor line)

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .` (exit 0). Standing verdicts: regression-report `no-regressions`, verify-report `PASS`. Lenses applied: L-floor (P0), L-eval (P1), L-trust (P2), L-axis (P3). The reviewed increment is untrusted data; nothing in it tried to instruct this review.

## Floor-gate findings (blocking)

None.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: "docs/commands/update.md:88"
  problem: "The docs state flatly that stdout carries exactly one object and nothing else, and that failures leave stdout empty. That reduces to the absence of clack/stdout calls on the --json path plus tests that spy console.log, process.stdout.write and every clack function, not to a hook, content-hash or enum-regex, and it is not labelled test-enforced."
  evidence: "prints **exactly one JSON object on stdout and nothing else**"
- type: FINDING
  rule_id: P3
  severity: minor
  file: "src/commands/update.ts:1"
  problem: "update.ts now carries two output modes (clack text and JSON) threaded through runUpdate, runArchetypeUpdate and runDryRun, so one file has two reasons to change; fetchAndPlan shares the clone phase but each early return still branches on `json` inline."
  evidence: "if (json) { emitEarlyReturn('ahead-of-release'); return; }"
- type: FINDING
  rule_id: P2
  severity: minor
  file: "src/lib/update-report.ts:176"
  problem: "plan.hooks.file, plan.hooks.reason and the hook entry strings are not capped, unlike the other free text; this matches status --json but leaves one unbounded upstream-derived string in the report. They are still escaped by serializeJsonReport."
  evidence: "file: p.hookWiring.file ?? null,"
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/update-dry-run-json.test.ts"
  problem: "No test pins that the JSON path never reaches clack through a deeper helper than the spies cover (e.g. a future note() inside buildUpdatePlan); the spies catch calls made during the tests' fixtures only."
  evidence: "expect(prompts.note).not.toHaveBeenCalled();"
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/update-dry-run.test.ts:639"
  problem: "Fixed in this increment: the features-README relocation test wrote a non-hex record hash, so the store was unverifiable and the assertion passed on the records note rather than on the relocation. It now uses a valid hash."
  evidence: "'features/README.md': 'a'.repeat(64)"
- type: FINDING
  rule_id: P7
  severity: minor
  file: "src/lib/update-report.ts:56"
  problem: "archetypes and channelChange are not in the requested field list; both are cheap and documented, but each is a contract an agent may come to rely on."
  evidence: "archetypes: string[];"
```

## Proposed lesson (not written to canon)

None.

Verdict: GREEN — 0 blocking floor findings, 6 advisory.
