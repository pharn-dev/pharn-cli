# GRILL — tar-entry-names

Plan: `.dev/features/tar-entry-names/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/tar-entry-names/PLAN.md:37'
  problem: 'A `TextDecoder` built with only `{ fatal: true }` silently STRIPS a leading byte-order mark (measured: EF BB BF 61 decodes to "a"). A name whose field starts with U+FEFF, itself a Cf format character, would lose it before the check and be written under a different name than the archive holds: neither refused nor faithful. Build the decoder with `ignoreBOM: true` so the BOM stays in the string and the Cf check refuses it.'
  evidence: '`readPathField` (strict `TextDecoder(''utf-8'', { fatal: true })`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/tar-entry-names/PLAN.md:41'
  problem: 'The byte-exact claim should be asserted on BYTES: read the extracted directory with `readdirSync(dir, { encoding: ''buffer'' })` and compare against the archive bytes (e2 80 94 for the em dash), not the decoded string, which would pass even if both sides were decoded the same wrong way. Add a BOM-prefixed name to the refusal cases.'
  evidence: 'valid UTF-8 `a—b.md` → written as exactly those bytes (FAILS on base)'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/tar-entry-names/PLAN.md:62'
  problem: '"on-disk name is its archive bytes decoded as UTF-8" holds for the name pharn passes to the filesystem; a filesystem that normalizes Unicode (HFS+ stores NFD) may store different bytes. Scope the claim to the name written, or label the on-disk half advisory for such filesystems.'
  evidence: '"an extracted entry''s on-disk name is its archive bytes decoded as UTF-8'
```

## Summary

The plan correctly moves the check onto the string that is written, which is the actual defect.
The one soundness gap is the decoder's default BOM handling: without `ignoreBOM: true` a leading U+FEFF
is removed before the check ever sees it, which recreates, for one character, exactly the check-vs-write
mismatch this increment exists to close. The pax budget and the escaped numeric message are sound as
planned (overlong forms and encoded surrogates are already refused by a fatal decoder — measured).

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory — 1 important) — for the human to
weigh before /pharn-dev-build; all three fold into the build without changing the plan's Files.
