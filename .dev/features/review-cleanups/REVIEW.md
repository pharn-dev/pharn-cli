# REVIEW — review-cleanups

Increment:

- `src/lib/detect-archetype.ts`: `target`/`vendor`/`venv`/`.venv` leave `SKIP_DIRS` for an
  `ECOSYSTEM_DIRS` map, skipped only beside their build file (checked over the parent's
  already-read entries) or, for a virtualenv, holding `pyvenv.cfg` (one `lstat`).
- `src/lib/capability-index.ts`: the frontmatter fence is upstream's slice, ported literally.
- `src/commands/update.ts`: the backup callback stops the running spinner, prints the notice, and
  starts a new one for the writes. An abort repeats only the warning and the pointer on stderr.
- `src/lib/layout.ts` `capabilitySubtree`, used at the six sites that carried the ternary.
- Comment fix in `src/lib/symlink-guard.ts`; raw invisible characters in two test files became
  escapes; a new `tests/source-hygiene.test.ts`.
- CHANGELOG backfill for PHARN-01..18 (merged into net-since-0.5.0 entries), CLAUDE.md catch-up,
  docs skip lists.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed (1649 tests), `/pharn-dev-regress` returned `no-regressions`, and `/pharn-dev-verify`
returned `PASS`. The chain ran twice: this review's first read found a misplaced comment (advisory
finding 1), fixed within the plan's `## Files` before the second run.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)** — each claim has a test:
  - "a hand-authored route under `target/`/`vendor/` is scanned" → the detector tests (and a base
    probe: `[ssr]` there, `[ssr, backend]` now);
  - "the CLI accepts every fence upstream's validator accepts" → the differential test, run
    against the validator's own function extracted from `.dev/floor/validate.mjs`;
  - "no log line is printed while a spinner animates in update's apply" → the recording-mock
    order test;
  - "no raw invisible character in `src/` or `tests/`" → the hygiene test, which also pins its own
    class against each kind it names.
  - CHANGELOG / CLAUDE.md accuracy stays advisory, as the plan labels it.
- **L-eval (P1)** — 16 cases fail on the base (VERIFY.md lists them); the guards pass on both.
- **L-trust (P2)** — the fence now accepts exactly what upstream's validator accepts, plus the
  named CRLF leniency; the enums, the field reader and the duplicate-key refusal are unchanged. The
  detector reads names it already listed and one `lstat` inside the user's own tree, never through
  a symlink (symlinked entries are skipped before the check).
- **L-axis (P3)** — each change stays in the module that owns it. The subtree mapping moved to
  `layout.ts`, which already owns `LayoutPaths`; `remove.ts` lost its private copy.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/layout.ts:119'
  problem: 'RESOLVED IN THIS INCREMENT. The first build inserted capabilitySubtree between configLayout and its leading comment, so that comment ("The layout an installed project was recorded with…") sat above the wrong function. Moved above the comment in the second iteration.'
  evidence: 'export function capabilitySubtree('
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'tests/capability-index.test.ts:482'
  problem: 'The differential test evaluates code with `new Function`. The text is this repo''s committed .dev/floor/validate.mjs, not anything fetched, and the extraction must match exactly one `function parseFrontmatter(text)` or the test fails — but a reader should know the test executes that file''s function body.'
  evidence: 'return new Function(`${found![0]}; return parseFrontmatter;`)() as ('
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'tests/capability-index.test.ts:530'
  problem: 'The one named difference from upstream: a CRLF block now parses here (the multiline field pattern matches before a CR) while upstream''s per-line pattern yields no field and its CI refuses the file. On the base both refused. The direction is lenient, never stricter, and pinned by a test; aligning it would mean changing readField, outside this plan.'
  evidence: "it('is more lenient than upstream on CRLF, never less', () => {"
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'tests/source-hygiene.test.ts:49'
  problem: 'The hygiene check covers src/ and tests/ only. docs/, scripts/, .claude/ and .dev/ are not scanned; a raw character there would still pass. Widening it is cheap but was not in the approved scope.'
  evidence: "it.each(['src', 'tests'])('%s/ holds none', (dir) => {"
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:10'
  problem: 'Merging to net-since-0.5.0 entries rewrote several entries that earlier PRs in this batch had added (#216, #221, #222, #223), and dropped two that described only unreleased intermediate states (the manifest built five times; the notice "no longer" printing raw in a note that did not exist in 0.5.0). Every remaining fact was kept; a reviewer comparing against those PRs will see them reworded rather than appended.'
  evidence: '### Added'
```

## Proposed lesson (candidate — NOT canon)

- None new. The raw-invisible-character slip that this increment fixes now has a floor check.

## Verdict

**GREEN — 0 floor-gate findings, 5 advisory (minor; one resolved in this increment).** The standing
decision is the human's (GATE 2).
