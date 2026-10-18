# REVIEW — dead-code-shared-helpers

Reviewed: the build (WIP commit `95de371`, diff vs `72d3fde`). Floor first:
`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). Everything below is **advisory**.

## Iteration 1

### Floor-gate findings (blocking)

None. Every claim the increment makes reduces to a deterministic check:

- "the deleted `..` checks were unreachable" — `tests/validate.test.ts` "the name allowlists admit no
  `..`" runs both regexes over eleven `..`-bearing candidates.
- "each symlink-walk caller keeps its outcome" — `findSymlinkComponentOr` catches every throw, the
  same breadth as the three replaced `catch {}` wrappers; new unit cases (clean, absent, symlink,
  ENOTDIR, escape refusal) plus the unchanged `dest-drift`/`add`/`remove`/`capability-removal`/
  `install-capabilities` suites.
- "each `readJsonBounded` caller keeps its failure shape" — the unchanged `install-records`,
  `upstream-models`, `pharn-config`, `init-plan` and `overwrite-check` suites pass, plus new
  `readJsonBounded` cases.
- "older CLIs still read a new config" — `modules: []` is still written (unchanged
  `install-archetype` tests); the released-version survey (0.3.0–0.12.0, `git grep` of the tags) is
  recorded in PLAN.md and is advisory evidence.

### Advisory findings

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/commands/list.ts:35'
  problem: 'The one visible difference named in the CHANGELOG (list --json load errors now pass through logErrorPlain, which strips control characters) has no test, because no current load-error message carries a raw control character: displayPath escapes the path and the validators JSON.stringify or escapeUnsafe their offenders. It is defence in depth, which the CHANGELOG wording does not overclaim.'
  evidence: 'const config = loadArchetypeConfigOrExit(cwd, { json });'
```

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/detect-archetype.ts:423'
  problem: 'readPackageFacts is newly exported and its only importer outside the module is a test. Acceptable: it is the package.json boundary (the way scanFileTree is already exported for tests), and it keeps the bounded-read cases pinned after packageJsonFound left the detection result.'
  evidence: 'export function readPackageFacts(cwd: string): {'
```

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/dead-code-shared-helpers/SHIP.md'
  problem: 'The advisory /pharn-dev-grill stage was not run between GATE 1 and the build in this ship run; grill gates nothing, so no verdict depends on it, but the roll-up must say so rather than imply the full chain ran.'
  evidence: 'GRILL.md: absent'
```

L-trust: nothing in the reviewed diff carried instruction-looking content; no decision rests on free
text. L-axis: each new helper lives in the module that already owned its axis (`symlink-guard.ts`,
`bounded-read.ts`, `validate.ts`); no sibling reference added.

No blocking findings → no fix iteration needed.
