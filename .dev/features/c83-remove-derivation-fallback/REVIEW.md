# REVIEW — c83-remove-derivation-fallback

Floor first: `node .dev/floor/validate.mjs .` exits 0, and `npm run check` + build are GREEN (VERIFY.md, `verify-report.json` PASS). Diff size: src +171/−764 across 20 files; tests +1526/−3195 across 27 files, plus the 2 vendored fixtures deleted.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** "nothing installs from a manifest-less tree" reduces to `readJsonBounded`'s `absent` kind → throw inside `fetchRepo`'s cleanup `try`. Every branch point re-reads through the same parser.
- **L-eval (P1):** the refusal is exercised at every layer: the parser, `fetchRepo` (release + main), and the init / update / status / add suites, explicit `--ref` included.
- **L-axis (P3):** no sibling import is added. `executable-unit` now imports the name predicates from `install-surfaces`, their owner.

## Advisory findings (warn; judgment, not floor)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: "tests/commands/update.test.ts:3455"
  problem: "A flat install that moves to the pharn layout settles in two runs. The move keeps the flat tree's root THREAT-MODEL.md/LIMITS.md, and the NEXT run's root-footprint migration deletes them while they still equal their record. The old pre-7 fixtures hid this; docs (update.md) and the CHANGELOG now state it. Whether the move should retire them in the same run, or never, is a product decision for the flat-layout follow-up."
  evidence: "The next run sees a pharn-layout install with record-proved root THREAT-MODEL.md / LIMITS.md and a clone that ships both under pharn/"
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: "src/lib/upstream-manifest.ts:207"
  problem: "The manifest refuses one capability name declared in two roles, so the address resolver's 'use griller:x or lens:x' ambiguity branch can no longer be reached from upstream. It is dead in practice; a follow-up can drop it or keep it as defence."
  evidence: "declares capability \"${name}\" twice"
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "tests/install-capabilities.test.ts"
  problem: "Three surviving test titles still name the old layout ('copies .dev/floor checkers…', '…ships neither root doc…', and in install-manifest.test.ts '…in both layouts'), while their bodies check pharn/ paths only. They were kept verbatim so test-integrity sees no title churn."
  evidence: "is [] for a complete clone, in both layouts"
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "LIMITS.md:65"
  problem: "LIMITS.md §1d opens 'There is no manifest.' This has been stale since pharn-install.json landed (#393), not because of this change. LIMITS.md is human-owned and hook-protected, so it needs a human patch."
  evidence: "There is no manifest."
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: "src/lib/upstream-manifest.ts:118"
  problem: "The refusal names the tree's SKILLS_VERSION, which is tree data. It is read through readSkillsVersion (VERSION_RE) and escaped with escapeUnsafe. A hostile value is refused by VERSION_RE first, and the message then leaves the version out; tests/upstream-manifest.test.ts asserts no ESC or U+202E reaches it. Recorded as checked, not as a defect."
  evidence: "which = ` (SKILLS_VERSION ${escapeUnsafe(readSkillsVersion(repoDir))})`"
```

## Verdict

GREEN: 0 floor-gate findings, 5 advisory findings (1 important, 4 minor).

No lesson is proposed for canon. The two-run settle and the write-order change are recorded here and in BUILD.md; nothing shows them to be a recurring failure yet.
