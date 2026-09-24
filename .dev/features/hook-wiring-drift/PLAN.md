# PLAN — hook-wiring-drift (PHARN-04: upstream hook-wiring changes must be reported, not silent)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: a pure `diffHookWiring` compares the `hooks` block of the project's `.claude/settings.json`
  with the fetched upstream one and returns the upstream hook entries (event + matcher + command) the
  project lacks; `update` prints a `HOOKS` note naming them, and `status` prints a `HOOKS` section and
  counts missing upstream hooks toward `--strict`. `settings.json` itself is still NEVER written.
- layer(s): the CLI itself (`src/lib/hook-wiring.ts` new, `src/commands/{update,status}.ts`)
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Discovery — verified this run (P6)

Reproduced in the review (`repro/hook-wiring`): `init` at upstream 6.0.0 then `update --yes` to 6.17.1 →
"updated 35 · restored 33 · skipped 0", `.claude/settings.json` byte-identical (relative commands, no
`Stop` hook although `require-loop-record.cjs` was installed), and `status --strict` exit 0 "No drift".
Upstream changed the wiring twice (6.1.0 `CLAUDE_PROJECT_DIR`-anchored commands; 6.12.0 new `Stop` hook).
Live code: `install-capabilities.ts` copies `settings.json` only when absent; `install-manifest.ts`
excludes it, so neither `update` nor `status` ever looks at it. Not overwriting it is documented and stays.

## Files

- `src/lib/hook-wiring.ts` — `diffHookWiring(repoDir, projectRoot)`: reads both `.claude/settings.json`
  (`safeJoin` + `findSymlinkComponent` + regular-file + 256 KB cap, JSON parse, all failures → a named
  `unreadable`/`absent` status, never a throw); normalizes `hooks.<Event>[].{matcher, hooks[].command}` into
  `Event · matcher · command` entries; returns `{ status: 'match' | 'missing' | 'no-upstream' |
'project-absent' | 'unreadable', missing: HookEntry[] }`. Command strings are display-sanitized
  (control characters replaced). Pure of `process`/console — layer CLI/lib
- `src/commands/update.ts` — after a successful apply, compute it against the clone and print a
  `HOOKS` note when `missing` is non-empty (or the project file is unreadable), naming the entries and
  that `settings.json` is never written by pharn — layer CLI/command
- `src/commands/status.ts` — `HOOKS` note in the drift path; `--strict` exits 1 when upstream hooks are
  missing (extra user hooks never count) — layer CLI/command
- `tests/hook-wiring.test.ts` — match; missing Stop hook; changed command string counts as missing;
  extra user hooks ignored; project absent / unparseable / symlinked / oversized; upstream absent;
  control characters sanitized
- `tests/update.test.ts` — old wiring → HOOKS note printed, settings.json byte-identical
- `tests/status.test.ts` — old wiring → HOOKS section; `--strict` exits 1; matching wiring → exit 0
- `docs/commands/update.md` — the protected-files section: `update` reports hook-wiring differences (P4)
- `docs/commands/status.md` — HOOKS section + `--strict` semantics (P4)
- `CLAUDE.md` — status/update paragraphs (P4)

## Contracts satisfied

- `docs/commands/update.md` "What is protected by default": `settings.json` stays user-owned (unchanged);
  the defect was the silence, now closed by a report.

## Evals to write (P1)

- per test file above; the lib cases and the `status --strict` exit must fail on the base source.

## Guarantee audit (P0)

- "a missing upstream hook is reported by `status` and fails `--strict`" → floor: set membership over
  normalized `Event·matcher·command` strings (exact string compare).
- "pharn never writes `.claude/settings.json` on update" → unchanged; asserted byte-identical in tests.
- What the wiring MEANS (whether a user's differing command is equivalent) → not judged; a differing
  command string is reported as missing — advisory to the human, named in the note text.

## Trust audit (P2)

- Upstream `settings.json` is untrusted remote content; the project's is local user content. Both are
  parsed as DATA only (never executed), size-capped, symlink-refused, and only command strings reach the
  terminal — sanitized of control characters.

## Determinism audit (P5)

- Exact-string set difference; an unparseable file is a named status, never a guess.

## Open questions (HALT)

- none
