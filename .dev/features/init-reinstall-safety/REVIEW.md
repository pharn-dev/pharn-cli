# REVIEW — init-reinstall-safety

Increment:

- `src/lib/dest-drift.ts`: `scanDest` takes an optional `sources` map (dest → clone path) and an
  optional records baseline. A differing file is drifted exactly when update's `decideFileAction`
  (`force: true`) sets `backup`, and carries its label. `manifestSources` converts the install
  manifest's absolute sources.
- `src/lib/install-capabilities.ts`: an exported pre-flight, `prepareInstall`, over a precomputed or
  computed manifest:
  - linked directories and linked files are named apart;
  - a live `.claude/settings.json` link is allowed, a dangling one is refused;
  - a directory at `pharn.config.json` / `pharn.records.json` is refused.

  `installCapabilities` accepts the manifest and still runs the pre-flight itself.
- `src/lib/install-manifest.ts`: `conflictingWriteTargets` accepts a precomputed manifest.
- `src/steps/install-archetype.ts`: `installManifest` and `reinstallBaseline`; the order is
  pre-flight → scan with the baseline → backup → copy; the records keys come from the same
  manifest.
- `src/steps/overwrite-check.ts`: the markers and count lines come from the scan's labels.
- `src/commands/init.ts`: builds the manifest once and passes it, with the baseline.
- Tests in five files, `docs/commands/init.md`, `docs/troubleshooting.md`, CLAUDE.md and CHANGELOG.

Treated as `trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check`
passed (1605 tests), `/pharn-dev-regress` returned `no-regressions`, and `/pharn-dev-verify`
returned `PASS`. The chain ran twice: this review's first read found two false claims in the
increment's own docs (advisory findings 1 and 2), which were fixed within the plan's `## Files`
before the second run.

## Floor-gate findings (blocking)

None.

- **L-floor (P0)** — each claim has a test:
  - "a file pharn wrote is never called your edit when the records are usable" → `decideFileAction`
    (already table-tested) plus the scan, prompt and step tests, and two whole-`runInit` runs;
  - "every file init overwrites that update would have skipped is backed up first, LICENSE
    included" → the pair scan plus flat and `pharn/` tests;
  - "a refused install writes nothing, not even a backup" → the pre-flight now precedes the backup,
    plus a test. Residual: a change between the pre-flight and the copy (TOCTOU), as `update` names;
  - "a directory at the config or records path is refused before the first write" → two tests;
  - "a live `settings.json` link is kept, a dangling one refused, the link untouched" → two tests;
  - "the manifest is built once per run" → a pass-through spy across a whole `runInit`, plus the
    identity assertions in `tests/init.test.ts` (a performance claim, not a safety one).
- **L-eval (P1)** — 35 cases fail on the base, each for the reason the plan names (VERIFY.md
  lists them). The guard cases pass on both.
- **L-trust (P2)** — `sources` values come from the manifest (inside the clone) and are
  re-`safeJoin`ed under the clone before any read, and a test pins an escaping value as a throw.
  The records are local, stamp-checked data; they can only take a file OUT of the backup set, and
  only one whose bytes are what pharn recorded writing. The prompt prints manifest paths (as
  before) and CLI-owned wording only.
- **L-axis (P3)** — the classification stays in `dest-drift.ts`, the pre-flight in
  `install-capabilities.ts`, the order in the install step, the wording in the prompt step.
  `init.ts` only orchestrates. `installManifest` is a thin wrapper in the install step, so `init.ts`
  imports no `*manifest.js` module: `tests/init.test.ts` has a static guard against re-introducing
  the deleted module manifest, and this keeps it as it is rather than loosening it.

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P6'
  severity: minor
  file: '.dev/features/init-reinstall-safety/PLAN.md:51'
  problem: 'RESOLVED IN THIS INCREMENT. The plan, and the test it replaced, said cpSync writes THROUGH a dangling settings.json link and creates its target outside the project. Measured on Node 20.13.0, 22.22.2 and 24.21.0 (absolute and relative targets): cpSync REPLACES the link with a regular file and writes nothing outside. The approved decision (refuse a dangling link) stands on the true reason — the link would be lost silently — and the code comment, docs and test title now say that.'
  evidence: 'Only a DANGLING leaf would be written through (`cpSync` follows it and creates the target outside the project).'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: 'docs/commands/init.md:147'
  problem: 'RESOLVED IN THIS INCREMENT (second iteration). The first build repeated the grill premise that a flat → pharn/ layout change backs up every differing file, marked "no pharn record". It does not: the new paths do not exist in a flat project, and the old files are left in place, so nothing extra is backed up. Only a file of the user own already at a new path is. The docs and the reinstallBaseline comment now say so, and a new case in tests/init-archetype.test.ts pins it.'
  evidence: 'a re-install that moves your project from the flat layout to `pharn/` backs up every file there that differs from upstream'
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: 'src/steps/install-archetype.ts:331'
  problem: 'PRE-EXISTING, NOT FIXED HERE. readRecords reads pharn.records.json with readFileSync, which blocks forever on a FIFO; update already reads it that way. init now reads it on every re-install (reinstallBaseline) rather than only when a kept capability needs its records, so a FIFO at that path now also hangs init. Only a local actor can plant one, a threat THREAT-MODEL.md does not model. The fix belongs in lib/install-records.ts (an O_NONBLOCK + fstat read, as the hook-wiring reader does), outside this plan.'
  evidence: ': recordsBaseline(readRecords(cwd), previousStamp).records;'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/lib/dest-drift.ts:147'
  problem: 'The dest list and its sources are two parameters. A dest missing from `sources` is read at its own path in the clone, which is right for add and wrong only for a mapped entry. Both init call sites build `sources` from the same manifest their dest list comes from, so they cannot disagree today; a caller that forgot `sources` would silently lose the LICENSE comparison again.'
  evidence: 'const srcRel = sources?.get(rel) ?? rel;'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'tests/init-archetype.test.ts:37'
  problem: 'A module mock counts only calls that cross a module boundary. On the base the spy sees 4 builds, not the 5 the plan counts: the fifth ran inside install-manifest.ts. The fix removes that one too (conflictingWriteTargets now receives the manifest), which the "uses the manifest it is GIVEN" test and the identity assertions in tests/init.test.ts show; the spy alone could not.'
  evidence: 'A module mock sees only calls that cross a module boundary'
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/lib/symlink-guard.ts:45'
  problem: 'PRE-EXISTING. Two comments here and the add passage in CLAUDE.md call the drift scan `collectDestDrift`; it is `scanDest`. Queued for plan F (review-cleanups) rather than widened into this increment.'
  evidence: 'wraps the call and turns it into its `unreadable` terminal; `collectDestDrift`'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/steps/install-archetype.ts:108'
  problem: 'The pre-flight runs after the overwrite prompt, so a user can confirm "Continue and overwrite?" and then be refused. Running it before the prompt as well would refuse first. Not in this plan, which orders pre-flight before BACKUP; noted as a possible follow-up.'
  evidence: 'const prepared = prepareInstall(repoDir, cwd, selection.selected, manifest);'
```

## Proposed lesson (candidate — NOT canon; promotion is a separate, human-gated run)

- **Re-measure a stated filesystem behavior on the CI Node before encoding it.** Provenance: this
  increment. Two claims about Node/`fs` behavior reached the build as fact, one from the plan
  (a dangling link is "written through") and one from the grill (a layout change "backs up every
  differing file"). Both were false when measured, and the second had already been written into the
  docs. Candidate rule: every behavior claim a plan or grill states about `fs` / `cpSync` / Node is
  re-measured at build time, on the CI Node version, before it is encoded in a comment, doc or test.

## Verdict

**GREEN — 0 floor-gate findings, 7 advisory (minor; two resolved in this increment).** The standing
decision is the human's (GATE 2).
