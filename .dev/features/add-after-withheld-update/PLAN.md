# PLAN — add-after-withheld-update (PHARN-05: one kept local edit must not dead-end `pharn add`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: when `update` withholds the version bump ONLY because of `modified` / `unrecorded` skips
  (the user's own kept edits), it records the version it DID apply as an additive
  `pendingSkillsVersion` in `pharn.config.json` (cleared by the next complete run); `add`'s version
  gate accepts a clone at `skillsVersion` OR `pendingSkillsVersion`. When the gate still refuses, the
  message names the real ways out instead of looping on "run `pharn update`".
- layer(s): the CLI itself (`src/types.ts`, `src/lib/pharn-config.ts`, `src/commands/{update,add}.ts`)
- constitution_refs: [P0, P1, P4, P5, P7]

## Discovery — verified this run (P6)

Reproduced (`repro/add-deadlock`): `init` 6.11.1 → one local edit in `.claude/commands/pharn-plan.md` →
`update --yes` to 6.17.1 twice, each "skipped 1", config stays 6.11.1 → `pharn add a11y` exit 1 "Skills
version mismatch … run `pharn update` first". Loop: `update` can never finish while the edit is kept.
Code: `update.ts` `versionWithheld = plan.counts.skipped > 0` keeps `skillsVersion`/`commit`;
`add.ts` `versionGate` compares `readSkillsVersion(clone) !== config.skillsVersion`;
`docs/commands/add.md` "`pharn update` is the only resolution".

Why restricting to `modified`/`unrecorded`: those are files the user owns and chose to keep — everything
else was upgraded, so the tree IS at the new version apart from them. `unverifiable` (no usable
records baseline → every present differing file skipped) and `unreadable` can leave most of the tree at
the old version, so they do NOT set `pendingSkillsVersion` and the gate keeps refusing.

## Files

- `src/types.ts` — `PharnConfig.pendingSkillsVersion?: string` (additive, P7) — layer CLI
- `src/lib/pharn-config.ts` — ingest: a present `pendingSkillsVersion` failing `VERSION_RE` is dropped
  (like a garbage `layout`), so a hand-edit can only fail closed — layer CLI/lib
- `src/commands/update.ts` — on a withheld run whose skip labels are all in `{modified, unrecorded}`,
  write `pendingSkillsVersion: installedVersion`; on a complete run, delete the field; any other
  withheld run leaves it absent — layer CLI/command
- `src/commands/add.ts` — `versionGate` passes when the clone's version equals `skillsVersion` or
  `pendingSkillsVersion`; its refusal names `pharn update --force` (backs up edits) and reverting the
  edits as the ways out when a pending version exists but upstream moved again — layer CLI/command
- `tests/update.test.ts` — withheld-by-`modified` → `pendingSkillsVersion` set; withheld-by-
  `unverifiable` → not set; complete run → cleared
- `tests/add.test.ts` — clone at pending version → add proceeds and never touches `skillsVersion`;
  clone at a third version → refused with the new message
- `tests/pharn-config.test.ts` — valid pending round-trips; garbage pending dropped; absent is legal
- `docs/commands/add.md` — "Version mismatch" section: the kept-edits case now works (P4)
- `docs/reference/pharn-config.md` — document `pendingSkillsVersion` (P4)
- `CLAUDE.md` — add/update paragraphs (P4)

## Contracts satisfied

- CLAUDE.md "`add` must never stamp a newer `skillsVersion` over unchanged old bytes" — preserved: `add`
  still never writes `skillsVersion`, and `pendingSkillsVersion` exists only when every non-user file
  was upgraded.

## Evals to write (P1)

- per test file above; the add-at-pending and update-sets-pending cases fail on the base source.

## Guarantee audit (P0)

- "`add` installs only at a version the project's non-user-owned files are at" → floor: exact version
  string membership in `{skillsVersion, pendingSkillsVersion}`, where `pendingSkillsVersion` is written
  only when every skip label ∈ `{modified, unrecorded}` (enum membership).
- A hand-edited `pendingSkillsVersion` is validated by `VERSION_RE`; a well-formed forged one could let
  `add` install at that version — the same trust level as a hand-edited `skillsVersion` today (advisory,
  named).

## Trust audit (P2)

- No new remote input; the new config field is local, hand-editable, regex-validated at ingest.

## Determinism audit (P5)

- Enum/string membership only; terminal = the existing named refusal.

## Open questions (HALT)

- none
