# GRILL — review-cleanups

Plan: `.dev/features/review-cleanups/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`;
nothing in it read as an instruction.

## Findings

### Honest scope / completeness (P7, P3)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/review-cleanups/PLAN.md:90'
  problem: 'The F21 abort design says ONE stderr line names the part-way stop and the backup dir, yet also that the existing abort tests keep their stderr assertions. tests/update.test.ts:1814-1826 pins the LAST log.info AND the LAST log.warn of an aborted run on stderr, so one line cannot satisfy both. Decide it here: keep the part-way warning (log.warn) and the backup pointer (log.info) on stderr and drop only the repeated .gitignore hint — the duplicate F21 names — so both existing assertions hold.'
  evidence: 'The aborted path prints one stderr line that names the part-way stop and the backup dir.'
- type: FINDING
  rule_id: 'P4'
  severity: important
  file: '.dev/features/review-cleanups/PLAN.md:115'
  problem: 'The backfill names two merged pairs, but at least ten PHARN commits were later extended or superseded by an entry already in [Unreleased] or by this plan: PHARN-02/16 by #223, PHARN-04/17 by #222, PHARN-06 by #219 (>=20.12.0 → >=20.13.0), PHARN-10 by #220, PHARN-11 by #216/#223, PHARN-12 by #221, PHARN-13 by #217, PHARN-14 and PHARN-15 by this plan (F23, F22), PHARN-18 by #218. Each needs ONE entry describing the net behavior since 0.5.0, or the section contradicts itself. The build should read each commit rather than its title.'
  evidence: 'Changes that a later entry already describes (e.g. PHARN-11''s manual carry, extended by #216; PHARN-13, extended by #217) get a single merged entry.'
```

### Determinism / parity (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/review-cleanups/PLAN.md:77'
  problem: 'Upstream''s parser takes the frontmatter as text.slice(3, end), so the REMAINDER of the opening line is content: `--- name: a11y` on line 1 supplies `name`. The plan''s line rule ("opens on a first line that starts with ---") does not say what happens to that remainder, and the differential test over "every fence shape" will disagree on it unless the port takes the same slice. Port upstream''s slice semantics literally, and include an opening-line-remainder shape in the differential set.'
  evidence: 'The fence opens on a first line that starts with `---` and closes at the next line that starts with `---`, which is the upstream rule'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/review-cleanups/PLAN.md:63'
  problem: 'SKIP_DIRS matches the dir name case-insensitively (detect-archetype.ts:157). The plan does not say whether ECOSYSTEM_DIRS does, nor whether the markers (Cargo.toml, go.mod, …) are matched exactly. State both; the conservative reading is: the dir name case-insensitively (as today), the marker names exactly as each tool writes them.'
  evidence: 'A new `ECOSYSTEM_DIRS` map skips a dir only when its marker holds:'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/review-cleanups/PLAN.md:93'
  problem: 'The spinner mock in tests/update.test.ts:33 returns fresh anonymous vi.fn()s per spinner, so no assertion can order a spinner stop against a log line today. The call-order case needs a recording spinner mock (one shared log of stop/info/warn calls); changing the shared mock touches every update test, so keep it behavior-compatible.'
  evidence: 'The spinner is stopped before the notice prints (call-order assertion on the clack mocks).'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/review-cleanups/PLAN.md:88'
  problem: 'Stopping s2 with "Backed up N file(s)" and then printing the notice''s "Backed up N file(s) to <dir> …" says the same thing twice on consecutive lines. Stop the spinner with a neutral phrase (or with the pointer itself and no repeat).'
  evidence: 'The backup callback first stops `s2` ("Backed up N file(s)"), prints the notice, then starts'
```

### Checked, no finding

- **Trust (P2).** The fence change widens the untrusted parser to upstream's rule only; the field
  reader, enums and duplicate-key refusal are unchanged. The ecosystem test reads only names already
  listed plus one `lstat` inside the user's own tree.
- **Scope.** The declared paths parse to 20 entries; the subtree refactor's six call sites are all
  declared (`install-records`, `install-manifest` ×2, `install-capabilities`, `update`, `remove`).
  A fresh scan finds exactly the three raw characters the plan names in `src/` and `tests/`, which
  hold only `.ts` files, so the hygiene test needs no binary exclusions.
- **Honest scope (P7).** The hygiene test answers a real, twice-repeated slip (#218 and plan D).

## Summary

Sound plan; three points must be decided before the build. The abort output must keep a stderr
`log.warn` and a stderr `log.info`, or an existing test breaks. The fence port must take upstream's
slice, opening-line remainder included, or its own differential test fails. The CHANGELOG backfill
must merge about ten pairs, not two. Smaller points: the case rule for the ecosystem dirs, a
recording spinner mock, and one duplicated line.

**ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 3 important, 3 minor) — for the human to
weigh before /pharn-dev-build.**
