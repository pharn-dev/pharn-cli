# REVIEW — init-manual-carry

Increment: `src/commands/init.ts` (`readPreviousConfig` — fingerprint first, then a tolerant parse;
pure `carryOver`; the under-lock `assertConfigFingerprintUnchanged`), `src/lib/pharn-config.ts`
(`configFingerprint`, `assertConfigFingerprintUnchanged`, shared `configChangedError`),
`src/steps/install-archetype.ts` (`InstallCarry`; kept entries verbatim, `frozenCapabilities`, carried
records), `src/steps/archetype-summary.ts` + `src/types.ts` (`matched: 'manual'` → "added by hand"),
four test files, `docs/commands/init.md`, `docs/reference/pharn-config.md`, `CHANGELOG.md`. Treated as
`trust: untrusted`; nothing in it read as an instruction.

## Floor first (P0)

`node .dev/floor/validate.mjs .` → `FLOOR: GREEN` (exit 0). `/pharn-dev-build`'s `npm run check` exit 0
(1486 tests), `/pharn-dev-regress` `no-regressions`, `/pharn-dev-verify` `PASS`.

## Floor-gate findings (blocking)

None.

- L-floor (P0): each claim reduces to a floor primitive. "A manual entry the index still has is recorded
  `manual`" → `role:name` set membership (`carryOver`). "init writes nothing if the config changed after
  it was read" → a sha256 content-hash compare (or the `absent` / `unreadable:<code>` sentinel) inside the
  lock, before `runInstallArchetype` and so before the backup. The fingerprint is taken before the parse,
  so a change between the two reads fails closed (grill finding 1). "A kept entry's records are carried"
  → `recordsBaseline`'s stamp compare, and a stale or absent store carries nothing. The only unclaimed
  residual is an edit made DURING the install, inside the lock — the same window every other writer has.
- L-eval (P1): every behavior has a test that fails on the base source (8 in `tests/init.test.ts`, checked
  against the stashed base `src/`): sticky manual, the carried entry shown once, kept entries of every
  source passed verbatim, the gone warning, the corrupt-config carry, and both refusal paths
  (rewritten; appeared). The fixture tests pin the written config, `frozenCapabilities` and the three
  record-carry cases; `tests/pharn-config.test.ts` pins the fingerprint's sentinels.
- L-trust (P2): kept entries come from the local config, already validated at ingest
  (`CAPABILITY_NAME_RE`, `ROLE_VALUES`), and are written back verbatim. Upstream names from
  `index.unknown` are only set keys, matched against those validated entries. Every printed key comes
  from a validated entry.
- L-axis (P3): no sibling reference. The command imports a type from the step it already calls (the
  allowed direction).

## Advisory findings (warn — severity is this reviewer's judgment, fix #3)

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CLAUDE.md:54'
  problem: 'CLAUDE.md still describes the re-run carry as manual entries only, via `manualKeys`; it now also keeps unparseable entries of any source (frozenCapabilities + records) and re-checks the config fingerprint under the lock. CLAUDE.md is outside this plan''s Files, so it needs a follow-up edit.'
  evidence: 'to keep its `source: ''manual''` entries that the index still has — installed again and recorded `manual` via `manualKeys`'
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/commands/init.ts:311'
  problem: 'carryOver is pure membership logic sitting in a command, so it is tested only through the fully mocked runInit; a lib module beside merge-capabilities would allow direct table tests. Accepted at grill (finding 3); noted for when the table grows.'
  evidence: 'function carryOver('
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: 'src/commands/init.ts:326'
  problem: 'The first-entry-wins rule for a duplicated `role:name` in the previous config has no test; it mirrors the merge, but only the merge''s copy of the rule is pinned.'
  evidence: 'if (seen.has(k)) continue;'
```

## Proposed lesson for canon (NOT written — for a human-gated `/pharn-dev-memory-promote`)

- **Candidate:** "A command that reads shared state before a prompt and writes it after must re-check
  that state under the lock (PHARN-03). Adding a pre-prompt read to a command that had none (PHARN-11 gave
  `init` a config read for its carry-over) silently re-opens the lost-write race."
- **Provenance:** increment `init-manual-carry`; the gap entered with PHARN-11 (8d11906, #205), a few
  commits after PHARN-03 (71bc375, #197) set the contract for `add`/`update`/`remove`; found by the
  18-commit review on 2026-09-24; closed by this diff (`src/commands/init.ts:224`).

## Verdict

**GREEN — 0 floor-gate findings, 3 advisory (minor).** The standing decision is the human's (GATE 2).
