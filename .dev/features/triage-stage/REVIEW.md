# REVIEW — triage-stage

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (0 capabilities checked). That is the only
guaranteed part of this review; every lens finding below is advisory.

Scope reviewed: the working-tree diff over `30ed793` (20 paths; see `regression-report.json` `.inside`).

## Floor-gate (blocking) findings

None.

## Advisory findings

### L-floor → P0

No new guarantee. Acceptance of `triage` reduces to enum membership (`PRODUCT_STAGES.includes`), held
equal to pharn-oss's checker by `tests/model-config-parity.test.ts` (sha256-pinned vendored copy, the
key set extracted from its source, the corpus compared verdict by verdict and RED line by RED line).
The doc text describing `/pharn-triage` is attributed to pharn-oss 7.7.0 and claims nothing for the CLI.

### L-eval → P1

Each new behaviour has a test that fails without it (observed red before the source change): the
parity set test, two parity corpus blocks (valid + bad-model `triage`), `resolve triage` through
`it.each(PRODUCT_STAGES)`, a direct `model-config` case, the format rows, and the status MODELS note.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "tests/model-config-parity.test.ts:42"
  problem: "The new frontmatter-core.mjs pin protects the file's bytes, but the comment's claim that it 'serves only the checker's agreement mode' is not itself tested; it holds today because every runChecker call in the suite uses validate or resolve."
  evidence: "It serves only the checker's `agreement` mode, which this suite never runs"
```

### L-trust → P2

The two vendored `.mjs` files are test-only, executed only by vitest (as the previous checker was),
and both are byte-pinned. No new runtime input; no free-text reaches a decision. Nothing in the
reviewed files read as an instruction to the reviewer.

### L-axis → P3

One axis per file: `model-config.ts` is still pharn-oss's rules only; the fixture refresh, the test
updates and the docs each change for this one reason. No sibling import added.

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "CLAUDE.md:1"
  problem: "CLAUDE.md and the model-config.ts header describe the vendored checker as one byte-for-byte, sha256-pinned file and do not mention the vendored frontmatter-core.mjs beside it; both statements stay true, so this is a completeness note, not drift (the grill raised the same point)."
  evidence: "the vendored checker (`tests/fixtures/pharn-oss/check-model-config.mjs`, byte-for-byte, sha256-pinned with its upstream commit)"
```

## Build-time plan amendments (recorded, not findings)

Two kinds of file were added to `PLAN.md` `## Files` during the build, each dated there, and the
writes-scope re-set from the amended plan:

- four tests (`init-archetype`, `update`, `models-update`, `pharn-config`) used `triage` as their
  example of a stage pharn-oss does not have; they now use `deploy` (already the parity corpus's
  unknown-stage name). Two would otherwise fail; two would have stayed green while saying something
  false.
- `tests/release-consistency.test.ts` gains `v0.18.0` in `KNOWN_TAGS`, the documented step for the
  bump after a release (`docs/RELEASING.md` step 2).

## Out of scope (follow-up)

- `tests/fixtures/pharn-oss/validate.mjs` is also behind pharn-oss `main` (upstream's validator now
  imports `frontmatter-core.mjs` and `capability-files-core.mjs`). Refreshing it is its own increment
  under the "capability frontmatter rules — a pinned copy" procedure in `docs/contributing.md`.

## Lesson candidate

None proposed. The stand-in that became real (a test's "unknown stage" example later adopted by
upstream) happened once; promoting it now would be speculative (P7). If it recurs, the candidate is:
"pick an unknown-name example upstream will never adopt."

VERDICT: GREEN — 0 floor-gate findings; 2 minor advisory findings for the human.
