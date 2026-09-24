# PLAN — init-manual-carry (a re-run init keeps `pharn add`s the way `update` does)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: PHARN-11's carry-over is made consistent with `update`'s merge table and with PHARN-03's
  lock contract. (1) A `source: "manual"` entry stays `manual` even when archetype resolution also
  selects it (merge row 3, sticky). (2) An entry — of ANY `source`, manual or auto (amended at
  grill, see Open questions) — whose capability upstream ships but this CLI cannot parse is KEPT
  as-is — config entry VERBATIM, files and records untouched, listed in `frozenCapabilities` so
  `update` re-checks it — instead of silently dropped (merge row 0, `frozen | any source`). (3) A
  manual entry upstream no longer ships is still dropped, but NAMED (merge row 7's `dropped-gone`).
  (4) Carried entries render as "added by hand" in the summary and no longer also appear under
  SKIPPED. (5) Inside its lock, init refuses (nothing written) if `pharn.config.json` changed after
  init read it for the carry-over. (6) The two docs that still say re-init resets every entry to
  `auto` are corrected.
- layer(s): the CLI (`src/commands/init.ts`, `src/steps/`, `src/lib/pharn-config.ts`, `src/types.ts`)
  + user docs
- constitution_refs: [P1, P4, P5, P6, P7]

## Discovery — verified this run (P6)

- `init.ts:243-266` `carriedManualCapabilities` keeps a previous entry only if
  `source === 'manual' && inIndex && !selected`, and ONLY the carried keys become `manualKeys`
  (`init.ts:156`). `install-archetype.ts:135-140` stamps everything else `auto`. So a manual entry
  that resolution ALSO selects is re-recorded `auto` — reproduced by review: `[spa]` + `add
  griller:a11y`, project gains ssr, re-run init → a11y `auto`; a later `update` then reports
  "REMOVED — no longer selected" and drops a capability the user asked for by name. update's own
  table keeps it `manual` (`merge-capabilities.ts:200-205`, row 3).
- `inIndex = index.capabilities` only (`init.ts:255`). A manual entry in `index.unknown` (upstream
  ships it, this CLI cannot parse it) is dropped from the config and its files orphaned; `update`
  KEEPS the same entry (row 0, `kept-frozen`) with its records (`update.ts:558-580`) and
  `frozenCapabilities` (`update.ts:584-600`). Reproduced by review (add lens:perf → upstream gives
  perf an unparseable `applies` → `update` KEPT, re-init drops it).
- A manual entry gone from the index is dropped silently; `update` names it (`dropped-gone`).
- Display: carried entries are appended with `matched: []` (`init.ts:151`) → empty reason
  (`archetype-summary.ts:16-17`), while `...resolved` (`init.ts:144`) still lists the same
  capability under SKIPPED ("applies to [ssr]; detected [spa]").
- Lock: init reads the config (`init.ts:137` → `:249`) before its prompts and takes the lock only
  after them (`:197`), but never calls `assertConfigUnchanged` — `add.ts`, `update.ts:308` and
  `remove.ts` all do (PHARN-03). Reproduced by review: a concurrent `pharn add lens:perf` during
  init's confirm is lost when init writes its config. `assertConfigUnchanged` compares PARSED configs
  and throws when the current one is unreadable (`pharn-config.ts:371-387`); init reads TOLERANTLY
  (absent/corrupt → carry nothing), so it needs a comparison that also covers absent/unreadable.
- Docs: `docs/reference/pharn-config.md:58-60` ("every entry becomes `auto` and previous `manual`
  tags are lost") and `docs/commands/init.md:150` ("only `pharn add` writes `manual`") contradict
  `docs/commands/init.md:137-138` — a P4 contradiction.

## Files

- `src/commands/init.ts` — replace `carriedManualCapabilities` with one tolerant read of the
  previous config returning: `manualKeys` (every manual entry the index still has, selected or not),
  `extra` (those not selected — appended with `matched: 'manual'` and REMOVED from `skipped`),
  `kept` (entries of any `source` in `index.unknown`), `gone` (manual entries in neither — named in a
  warning), the previous `(skillsVersion, commit)` stamp, and a config fingerprint taken BEFORE the
  parse (grill finding 1 — a change between the two reads must fail closed); inside
  `withProjectLock`, assert the fingerprint is unchanged BEFORE `runInstallArchetype` — layer
  CLI/commands
- `src/lib/pharn-config.ts` — `configFingerprint(cwd)` (`absent` | `unreadable` | sha256 of the
  bytes; never throws) + `assertConfigFingerprintUnchanged(cwd, fingerprint, command)` throwing the
  existing `ProjectChangedError` message — layer CLI/lib
- `src/steps/install-archetype.ts` — take a `carry` argument (`manualKeys`, `kept`, previous stamp)
  in place of bare `manualKeys`; append `kept` entries verbatim to `capabilities`, write
  `frozenCapabilities` (sorted keys) when non-empty, and merge their records from the previous store
  (`recordsBaseline` + `recordsUnderCapabilities`, the pair `update` uses) into the new store — layer
  CLI/steps
- `src/steps/archetype-summary.ts` — `describeMatched('manual')` → "added by hand" — layer CLI/steps
- `src/types.ts` — `SelectedCapability.matched: 'universal' | 'manual' | Archetype[]` — layer types
- `tests/init.test.ts` — manual+resolved → in `manualKeys` (FAILS on base); carried entry absent
  from `skipped`, `matched: 'manual'`; unparseable entry (manual AND auto) → passed as `kept`
  verbatim, named; gone manual →
  named warning; config changed during the prompts → refusal, `runInstallArchetype` never called,
  exit 1 (FAILS on base); config unchanged/absent/corrupt → proceeds
- `tests/init-archetype.test.ts` — `kept` entry written verbatim + `frozenCapabilities`, its records
  carried from a stamp-valid store, dropped from a stale/absent one (never minted)
- `tests/archetype-summary.test.ts` — a `'manual'` entry renders "added by hand"
- `tests/pharn-config.test.ts` — fingerprint: absent / bytes / unreadable (directory); assert throws
  `ProjectChangedError` on any change, including absent→present
- `docs/commands/init.md` — the re-run paragraph + the config table row describe (1)-(5)
- `docs/reference/pharn-config.md` — replace the "start-over … every entry becomes `auto`" note
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed` entries

## Contracts satisfied

- `lib/merge-capabilities.ts` decision table rows 0, 3, 7 — init now agrees with them (cited, not
  restated, P4). Legacy `source`-absent entries are still NOT carried: the merge is "the ONLY place
  absence may be resolved" (CLAUDE.md), and `docs/commands/init.md` already limits the carry to
  `source: "manual"`.
- PHARN-03's "re-check the config under the lock" — extended to init.

## Evals to write (P1)

- listed under Files; the manual+resolved and config-changed cases fail on 0ca29b7.

## Guarantee audit (P0)

- "a manual entry the index still has is recorded manual" → floor: set membership over `role:name`.
- "init writes nothing if the config changed after it was read" → floor: sha256 content-hash
  compare of the file bytes (or the absent/unreadable sentinel) inside the lock, before the first
  write (the backup included).
- "a kept entry's records are carried" → floor: `recordsBaseline`'s stamp compare; a stale/absent
  store carries nothing (never minted, never blessed).

## Trust audit (P2)

- The previous config and records are local, user-editable input, already validated at ingest
  (`readPharnConfig`, `readRecords`); no new field is trusted. Upstream names in `index.unknown` are
  only used as set keys against config entries that passed `CAPABILITY_NAME_RE`.

## Determinism audit (P5)

- Every branch is a `role:name` set lookup or an exact enum compare; the lock check is a string
  equality over fingerprints.

## Open questions (HALT)

- none. RESOLVED at GATE 1 (2026-09-24, by the human): (2) a hand-added capability that upstream
  still ships but this CLI cannot parse is KEPT as-is, like `update` — "Leave it alone", the
  recommended option — not dropped with a warning. The plan was accepted as written.
- AMENDED after `/pharn-dev-grill` (2026-09-24, by the human): grill finding 2 asked whether an
  AUTOMATIC (`source: auto`, or absent) entry that upstream ships but this CLI cannot parse gets the
  same treatment; the human chose "Yes, leave them alone too" — so (2) keeps a frozen entry of ANY
  source verbatim, exactly as `update`'s row 0 does. Files unchanged.
