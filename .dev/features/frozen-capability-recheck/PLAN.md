# PLAN — frozen-capability-recheck (PHARN-13: a KEPT (frozen) capability must be re-checked on every update)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: when `update` keeps a capability it could not parse upstream ("frozen"), it records its
  `role:name` in an additive `frozenCapabilities` config field (cleared once none are frozen); while that
  field is non-empty the same-version early return ("Already up to date") is skipped, so every run
  re-fetches, re-reports KEPT, and refreshes the capability's files once the parse succeeds (e.g. after a
  pharn upgrade). The version bump itself stays as designed, so `add` is not blocked.
- layer(s): the CLI itself (`src/types.ts`, `src/lib/pharn-config.ts`, `src/commands/update.ts`)
- constitution_refs: [P1, P4, P5, P7]

## Discovery — verified this run (P6)

Review (agent test with mocked repo): after a run with a frozen capability, `update` bumps
`skillsVersion` (`versionWithheld` counts only file skips); the next `update` at the same version exits
"Already up to date" without fetching (`fetchRepo` calls = 0), so the KEPT report does not repeat, and
after a CLI upgrade the capability's bytes stay old until upstream bumps its version or `--force`.
`docs/commands/update.md:101-103` claims the message "repeats on every run while the situation lasts"
and "clears … when you upgrade pharn". `update.ts` computes `frozen` from `index.unknown`
(`:423`) and keeps their records (`frozenRecords`); the early return is at the version check after
`fetchRemoteSkillsVersion`.

## Files

- `src/types.ts` — `PharnConfig.frozenCapabilities?: string[]` (additive, P7) — layer CLI
- `src/lib/pharn-config.ts` — ingest: kept only when an array of `role:name` strings (role enum +
  `CAPABILITY_NAME_RE`); anything else dropped (fail-safe: the early return then applies as today) — layer CLI/lib
- `src/commands/update.ts` — write the sorted frozen keys of the config's capabilities (field omitted when
  empty); skip the same-version early return while the loaded config has any — layer CLI/command
- `tests/update.test.ts` — run 1 with a frozen capability records the key; run 2 at the same version
  fetches again and re-reports KEPT; once the capability parses, its files are refreshed and the field is
  cleared
- `tests/pharn-config.test.ts` — valid field round-trips; garbage dropped
- `docs/commands/update.md` — the KEPT paragraph matches the behavior (P4)
- `docs/reference/pharn-config.md` — document the field (P4)

## Contracts satisfied

- `docs/commands/update.md` "repeats on every run … clears when you upgrade pharn" — now true.

## Evals to write (P1)

- listed above; the "run 2 re-fetches" case fails on the base source.

## Guarantee audit (P0)

- "a frozen capability is re-checked on every update" → floor: early return skipped iff the validated
  field is non-empty (membership).

## Trust audit (P2)

- The new field is local, hand-editable, validated at ingest; it only gates whether a fetch happens.

## Determinism audit (P5)

- Set membership; sorted output.

## Open questions (HALT)

- none
