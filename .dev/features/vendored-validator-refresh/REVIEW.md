# REVIEW — vendored-validator-refresh

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`, exit 0.
Everything below is advisory unless marked floor-gate. The reviewed diff (10 files) is
`trust: untrusted`; no instruction-looking content in it was acted on.

## Floor-gate findings (blocking)

None. Every guarantee the increment states reduces to a floor primitive:

- BOM strip and displaced lead → anchored regex membership (`BOM_RE`, `DISPLACED_LEAD_RE`,
  `src/lib/capability-index.ts:223-224`), each exercised by a differential row and a skip case.
- "the CLI reads what upstream reads" → the differential test against the sha256-pinned vendored
  validator, its frontmatter-core imports injected and the import line pinned; scoped to the pinned
  commit (the existing named residual).
- "the vendored set loads" → the test that runs the vendored validator (exit code).

## Advisory findings

### L-floor → P0

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'tests/capability-index.test.ts:534'
  problem: "The displaced rule is held to upstream by a regex over validate.mjs's text; it is labelled a lexical pin in the comment, which is honest, but an upstream reformat of that finding call fails the test with no behaviour change."
  evidence: 'A lexical pin on that finding (not a behavioural one)'
```

### L-eval → P1

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/capability-index.test.ts:657'
  problem: 'The non-vacuity test pins that the displaced rows are refused only for the offset, but nothing names that upstream ACCEPTS the BOM row; the differential compare carries it (and was red before the port), yet a parser that refused everything upstream would make that row vacuous without a named failure.'
  evidence: "it('the displaced rows parse upstream and are refused only for the offset', () => {"
```

### L-trust → P2

No findings. The wider read (a BOM'd file) still feeds only `assertRole` / `assertAppliesToken`;
the displaced reason is a fixed string with only the already-validated directory name interpolated.
The vendored `.mjs` files run only under the test suite.

### L-axis → P3

No findings. `capability-index.ts` keeps one axis (reading the untrusted index); the test imports a
vendored fixture, not a sibling `src/` module.

### Release metadata (P7, advisory)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'tests/release-consistency.test.ts:86'
  problem: "v0.18.1 is listed before its tag exists, against the list's own rule; it is the maintainer's GATE 1 choice (stacked on #354) and holds only if #354 releases 0.18.1 unchanged — the PR should say so."
  evidence: "'v0.18.1',"
```

## Out-of-scope note for a human (not edited)

`THREAT-MODEL.md:144` describes malformed capability frontmatter as a hard-fail, "never a silent
skip"; the code has reported such capabilities as `unknown` since the forward-compatibility change.
Pre-existing, unrelated to this increment, and the file is human-only.

## Verdict

GREEN — 0 floor-gate findings; 3 advisory (minor) findings for the human.

No lesson proposed: nothing here is a recurring failure beyond L31/L35's existing shape upstream.
