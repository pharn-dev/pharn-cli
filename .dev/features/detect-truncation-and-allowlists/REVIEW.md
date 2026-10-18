# REVIEW — detect-truncation-and-allowlists

Reviewed: commit `4e239f4` on `fix/detect-truncation-and-allowlists` (diff vs `a405e69`). Floor
first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). Everything below is **advisory**.

## Iteration 1

### Floor-gate findings (blocking)

None. Every guarantee the increment states reduces to a deterministic check pinned by a test:

- "`truncated` iff a cap stopped the walk at an entry it would classify, before settlement" — integer
  compares + boolean flags in `scanFileTree`; pinned by the budget-exact, skipped-entries,
  depth-at/past-cap, empty-deep-dir and cleared-by-settlement tests in
  `tests/detect-archetype.test.ts`.
- "a settled result equals a full walk" — pinned by the settled-vs-full comparison test (archetypes and
  evidence `toEqual`).
- "backend reads `dependencies` only" — set membership in `packageFacts` (`PACKAGE_RULES.readsDev`),
  pinned per package in `tests/archetype.test.ts`.
- `detectionTruncated` absent when false — pinned by the unchanged key-list test in
  `tests/init-report.test.ts` and end to end in `tests/init-dry-run-json.test.ts`.

The allowlists' _correctness about what a project is_ stays labeled a heuristic (README limitations,
troubleshooting) with `--archetype` as the correction — no guarantee is sold over it (P0).

### Advisory findings

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: 'docs/commands/init.md:320'
  problem: "The command reference's '3. Detect archetypes' section (which the CHANGELOG links to) still says only 'Reads package.json dependency names' — it names neither the dependencies-only rule for backend, nor devDependency evidence, nor the 50,000/24 bounds and the stopped-early line."
  evidence: 'Reads `package.json` dependency names and walks the project tree (bounded and symlink-safe, ...'
```

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/steps/archetype-summary.ts:2'
  problem: 'The summary step now imports the I/O module detect-archetype.ts for WALK_LIMITS; acceptable (steps → lib is the permitted direction, and the limits are the reading strategy this file must describe), noted so a later move of WALK_LIMITS keeps one source.'
  evidence: "import { WALK_LIMITS } from '../lib/detect-archetype.js';"
```

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/detect-truncation-and-allowlists/verify-report.json'
  problem: "Iteration 1's verify FAIL is a 5 s timeout in tests/lint-gate.test.ts (spawns eslint) under load average ~24 from parallel agents; the file is outside this increment and passes alone (7/7). Not a defect of the increment, but the loop must re-run rather than wave it through."
  evidence: 'FAIL tests/lint-gate.test.ts > lint gate: no soft tier > accepts clean source ... Test timed out in 5000ms.'
```

L-trust (P2): no instruction-looking content in the diff; the new data are a CLI-computed boolean and
allowlist literals (`devDependency` evidence is the allowlist's own string, never manifest bytes).
L-axis (P3): `archetype.ts` keeps the classification rules (allowlists, dev/runtime split),
`detect-archetype.ts` the reading strategy (limits, settlement, truncation) — one axis each.

Verdict (iteration 1): GREEN on the floor-gate; 1 important + 2 minor advisory findings.

## Iteration 2

Reviewed: commit `17ac899` (iteration 1 + a docs-only change). Floor: `validate` GREEN.

- The P4 finding is addressed: `docs/commands/init.md` "3. Detect archetypes" now states the
  dependencies-only backend rule (with the runtime DB driver sentence and `--archetype backend`), the
  devDependency evidence, the unread peer/optional maps, the new SSR frameworks, and the walk's bounds,
  settled stop and stopped-early line, linking the troubleshooting entry.
- The lint-gate timeout did not recur (VERIFY iteration 2: every gate 0).

New advisory finding:

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/steps/archetype-summary.ts:45'
  problem: "The warning's number is grouped with toLocaleString('en-US'), which depends on the Node build's ICU; a --with-intl=none build would print 50000 instead of 50,000 (and the pinning test would fail there). Official Node builds ship full ICU, so this is theoretical today."
  evidence: "WALK_LIMITS.maxEntries.toLocaleString('en-US')"
```

Verdict (iteration 2): GREEN on the floor-gate — no blocking finding; 1 minor advisory finding open
(P5, ICU-dependent grouping), 2 minor iteration-1 findings stand as notes.

## Proposed lesson (not canon — for `/pharn-dev-memory-promote`, human-gated)

None proposed: the lint-gate timeout is an environment effect (machine load), not a recurring defect
of the build loop that this increment evidences.
