# PLAN — update-frozen-recheck (a frozen capability stays re-checked until its files actually land)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `update` keeps a capability's key in `frozenCapabilities` after it parses again for as
  long as any of ITS files was skipped in the run, so the same-version gate stays open and a later
  run re-checks those files; it also stops writing a `pendingSkillsVersion` equal to the
  `skillsVersion` it withheld.
- layer(s): the CLI (`src/commands/update.ts`) + user docs
- constitution_refs: [P1, P4, P5, P6]

## Discovery — verified this run (P6)

- `update.ts:207-208`: the same-version early return is skipped only while
  `config.frozenCapabilities` is non-empty (PHARN-13, aec6d3e).
- `update.ts:586-589`: the next `frozenCapabilities` is exactly the config entries that are
  unparseable THIS run — a capability that parses again is dropped from the list unconditionally.
- `update.ts:506-510`: a skip withholds the bump — but on a frozen re-check run the bump already
  happened on the run that froze it (that run left the capability's files out of the plan entirely),
  so `nextSkillsVersion = config.skillsVersion` withholds nothing.
- Net effect, reproduced by review with vitest on fake clones: installed 1.0.0, user edits a file
  under lens:x; upstream 2.0.0 makes x unparseable → `update` keeps x, records 2.0.0,
  `frozenCapabilities: [lens:x]`; x parses again at 2.0.0 → `update` reports MODIFIED and CLEARS the
  field → every later `update` prints "Already up to date" with zero fetches; after the user reverts
  the edit as advised, the file stays at v1 for good (only `--force` recovers). Same with an absent
  store after a `--force` freeze run (files skipped as UNRECORDED). Control (never frozen): the bump
  is held and the next run re-reports the skip.
- `update.ts:516-519`: on that same-version re-check with only user-edit skips,
  `pendingSkillsVersion = installedVersion` equals the withheld `skillsVersion` — a no-op field.
- `plan.skipped` is `{ label, rels[] }[]` with project-relative rels at the clone's layout
  (`update-decision.ts:174`); a capability's rels share the prefix
  `layoutPaths(layout).{grillers|lenses}/<name>/` — the same prefix `recordsUnderCapabilities`
  (`install-records.ts:363-378`) already uses.
- Docs: `docs/commands/update.md:101-105` ("that run updates its files as usual and clears the
  field") and `docs/reference/pharn-config.md:77-81` ("the field is removed once none are left").

## Files

- `src/commands/update.ts` — next `frozenCapabilities` = config entries still unparseable ∪ config
  entries listed in the PREVIOUS `frozenCapabilities` that parse now but have ≥1 rel under their
  capability dir in `plan.skipped` (sorted, de-duplicated); `pendingSkillsVersion` omitted when it
  equals `nextSkillsVersion` — layer CLI/commands
- `tests/update.test.ts` — in the frozen block: a user-edited file under a formerly-frozen capability
  → re-check run skips it AND keeps the key (FAILS on base); the next run fetches again (FAILS on
  base); after reverting the edit the file upgrades and the key clears; a skip under ANOTHER
  capability does not keep the key; the same-version re-check writes no `pendingSkillsVersion`
  (FAILS on base); existing frozen tests unchanged
- `docs/commands/update.md` — the frozen paragraph: the field clears once the capability parses AND
  none of its files had to be skipped
- `docs/reference/pharn-config.md` — the `frozenCapabilities` paragraph, same rule
- `src/types.ts` — the `frozenCapabilities` field comment only (no type change): it also lists a
  capability that parses again while one of its files is still skipped, and a re-run `init` writes it
  too (init-manual-carry) — added at grill (finding 2), comment-only, intent unchanged
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed`

## Contracts satisfied

- CLAUDE.md's `update` invariant "a run that skipped anything withholds the … bump so … the next run
  still has work" — restored for the frozen path (cited, not restated, P4).

## Evals to write (P1)

- listed under Files.

## Guarantee audit (P0)

- "a formerly-frozen capability with a skipped file keeps the gate open" → floor: prefix membership
  of skipped rels + set membership of the previous `frozenCapabilities` keys (P5).
- Unchanged residual (named, not closed here): a NEW upstream capability this CLI could not parse
  never reaches `frozenCapabilities` (it is not in the config), so after upgrading pharn it installs
  only on the next `SKILLS_VERSION` bump or via `--force` / `pharn add` — pre-existing, outside
  PHARN-13's scope.

## Trust audit (P2)

- No new input. `frozenCapabilities` is already validated at ingest (a non-`role:name` list is
  ignored, `docs/reference/pharn-config.md:81`); only keys that match a config entry are re-emitted.

## Determinism audit (P5)

- Set membership and string-prefix tests only.

## Open questions (HALT)

- none
