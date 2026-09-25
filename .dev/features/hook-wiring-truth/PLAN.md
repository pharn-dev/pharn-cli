# PLAN — hook-wiring-truth (the HOOKS check reads what Claude Code reads, and prints what can be pasted back)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `lib/hook-wiring.ts` changes in five ways.
  1. The project side also reads `.claude/settings.local.json` (F15).
  2. A symlinked `.claude/settings.json` LEAF on the project side is followed for reading (the
     `status --strict` half of F8).
  3. Every file is opened non-blocking, so a FIFO is refused instead of hanging (F18).
  4. Each missing hook prints as the exact JSON object that satisfies the check, exec form and shell
     form kept distinct (F17).
  5. That rendering is terminal-safe and length-capped through the shared sanitizer (F16).

  The note's heading only says what is true.

- layer(s): the CLI itself (`src/lib/hook-wiring.ts`), docs
- constitution_refs: [P0, P1, P2, P5, P6]

## Discovery — verified this run (P6)

Read on HEAD `abb274a`. `hook-wiring.ts` is unchanged since the review range.

- **F18.** `readSettings` (`:62-110`) calls `openSync(…, 'r')`, with no `O_NONBLOCK`. On a FIFO,
  `open` blocks before `fstat` can refuse it. The hardened readers already use
  `O_RDONLY | O_NONBLOCK` (`capability-index.ts:167-173`, `detect-archetype.ts:180-184`).
- **F8, status half.** `readSettings` walks `findSymlinkComponent`, and any symlinked component,
  leaf included, makes it `unreadable` → a HOOKS note → `--strict` exit 1 (`status.ts:137-147`). That
  happens even when the linked file wires every hook. The project-side content is never printed:
  only UPSTREAM entries reach the terminal. The upstream side is a clone written by our own
  extractor, and that side keeps its refusal.
- **F15.** Only `.claude/settings.json` is read. Claude Code merges hooks from `settings.json`,
  `settings.local.json` (gitignored, per-user) and user-level `~/.claude/settings.json`. Hooks wired
  in `settings.local.json` are reported missing, and with `settings.json` absent the heading says
  "is absent — no PHARN hook is wired" (`:185-186`), which is false. None of this is documented
  (`docs/commands/status.md:78-80`).
- **F16.** `displayHook` (`:170-174`) strips `[\x00-\x1f\x7f-\x9f]` with its own regex. It keeps
  `\p{Cf}` (U+202E, U+2066, U+200B) and has no length cap. `terminalSafe` (`terminal-safe.ts:27-39`)
  is the shared sanitizer and does both.
- **F17.** `displayHook` joins `[command, ...args]` with spaces. `entryKey` (`:143-145`) compares
  `[event, matcher, command, args]`, so exec and shell forms are different keys. Upstream's real
  `Stop` hook is exec form, and the other two are shell form:

  ```json
  {
    "type": "command",
    "command": "node",
    "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/require-loop-record.cjs"],
    "timeout": 10
  }
  ```

  (from a git-archive of pharn-oss). The exec-form hook prints as `Stop: node ${CLAUDE_PROJECT_DIR}/…`.
  Pasted back as `command`, that is shell form, so it stays "missing".

## Files

- `src/lib/hook-wiring.ts` — layer CLI/lib. Changes:
  - Every settings read opens with `O_RDONLY | O_NONBLOCK`, and the upstream side adds
    `O_NOFOLLOW`. `fstat` still refuses anything but a regular file, so a FIFO is refused instead of
    blocking forever (F18).
  - Project side: a symlinked LEAF is followed; a symlinked intermediate directory is still refused
    (GATE 1 answer 2 → a). Upstream side: the refusal stays as it is.
  - The diff reads the project's `settings.json` AND `settings.local.json`; the set of wired hooks
    is their union (F15). Each missing entry is still upstream data. The result names the upstream
    hooks wired ONLY in `settings.local.json` (GATE 1 answer 1 → a: they count as wired, with a
    note). An UNREADABLE project file makes the whole result unreadable, naming which file — pharn
    cannot know what it wires (grill finding 2).
  - The display line is `<event> [<matcher>]: {"type":"command","command":…,"args":[…]}`, args
    only when present (F17). It is built as JSON, then every character the shared sanitizer would
    strip is replaced by its backslash-u escape: still valid JSON, parsing back to the exact
    upstream string, with nothing raw reaching the terminal (F16). U+2028 / U+2029 are escaped too
    (grill finding 3). The event and matcher get the same escaping. Each line is capped at 300 characters with an ellipsis.
  - Headings say "not wired in `.claude/settings.json` or `.claude/settings.local.json`". The
    "absent" heading is used only when neither file exists, and makes no claim about other scopes.
- `tests/hook-wiring.test.ts` — layer tests. FAIL on base:
  - FIFO at `settings.json` → unreadable, within a bounded runtime (on base it hangs).
  - Hooks only in `settings.local.json` → match.
  - Symlinked leaf to a file wiring every hook → match.
  - U+202E / U+200B in an upstream command → the line holds their escape text and no raw Cf
    character.
  - A 200 000-character command → a line of at most 301 characters.
  - Exec-form Stop hook → the printed JSON, parsed and pasted into a project `settings.json`, makes
    the diff return match (the round trip F17 lacked).
  - Guards: a symlinked `.claude` dir is still unreadable; the upstream-side symlink is still
    refused.
- `src/commands/status.ts` — layer CLI/commands. `--strict` fails on the diff STATUS (missing or
  unreadable), no longer on the mere presence of a HOOKS note, so the local-only note prints without
  failing it (grill finding 1).
- `tests/status.test.ts` — layer tests. `--strict` exits 0 when the hooks are wired only in
  `settings.local.json` (FAILS on base), and the note names them as local-only.
- `tests/update.test.ts` — layer tests. Only if a heading assertion there changes.
- `docs/commands/status.md` — layer docs. The HOOKS check reads `settings.json` +
  `settings.local.json`, never user-level settings; it notes local-only wiring and prints
  paste-ready JSON.
- `docs/commands/update.md` — layer docs. The same, for update's HOOKS note.
- `CLAUDE.md` — layer docs. The `lib/hook-wiring.ts` sentence ("both files size-capped +
  symlink-refused…") becomes the new read rules.
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed` (local settings, symlinked settings, paste-able
  lines, FIFO) and `### Security` (format characters and the cap in the HOOKS note)

## Contracts satisfied

- PHARN-17's "one display sanitizer" (`terminal-safe.ts` header) now covers the HOOKS note, and
  PHARN-14/15's non-blocking open rule now covers this reader too (cited, P4).

## Evals to write (P1)

- Listed under Files. Seven cases FAIL on the base.

## Guarantee audit (P0)

- "no Cf, C0 or C1 character from upstream reaches the HOOKS note" → floor: an escape pass over the
  same `\p{Cf}`/C0/C1 class `terminalSafe` uses, plus a test.
- "a printed line satisfies the check when pasted" → floor: the round-trip test. Advisory beyond
  the tested shapes.
- "a FIFO cannot hang `status`/`update`" → floor: `O_NONBLOCK` + `fstat`, plus a test.
- "local-only wiring passes `--strict`" → floor: a test. Whether that is the right policy is the
  human's call (open question 1).

## Trust audit (P2)

- Upstream `settings.json` is untrusted. Its strings reach the terminal only escaped and capped.
- The project files are the user's own, read as data and never printed. Following their symlinked
  leaf reveals nothing: a target that is not JSON is `unreadable`, and its content never reaches
  output.

## Determinism audit (P5)

- Exact-string set membership, as today. Union is set union. No fallback guess.

## Open questions (HALT)

None open. Resolved at GATE 1 (human, 2026-09-25): every question below → **(a)**, the
recommended answer. Kept for the record:

1. Hooks wired only in `settings.local.json`. (a) They count as wired, so `--strict` passes, and the
   note says they apply to you only, not to teammates or CI — recommended. CI never has that file,
   so CI's answer is unchanged. (b) They are shown as local-only but `--strict` still fails, keeping
   local runs at parity with CI. (c) Keep reading `settings.json` only, and fix just the false
   wording and the docs.
2. A symlinked project `.claude/settings.json`. (a) Follow a symlinked LEAF only (the dotfiles case
   reported); a symlinked `.claude/` dir stays refused — recommended. (b) Follow any project-side
   symlink, since this is a read-only path. (c) Keep refusing, and say so in the note.
