# PLAN — interrupt-exit-code (PHARN-10: Ctrl-C mid-write must not exit 0, strand the lock, or hide the backup)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: (1) while `withProjectLock` holds the lock it registers a process `exit` listener that
  releases the lock synchronously and, when the process is exiting with code 0 (clack's `block()` turns
  Ctrl-C during a spinner into `process.exit(0)`), sets `process.exitCode = 130` and prints one stderr
  line saying the run was interrupted while writing; the listener is removed when `fn` settles.
  (2) `update` prints the backup pointer the moment `.pharn-backup/<ts>/` is created (as `add` does and
  `docs/commands/update.md` already claims), instead of only at the end.
- layer(s): the CLI itself (`src/lib/project-lock.ts`, `src/commands/update.ts`)
- constitution_refs: [P0, P1, P4, P5]

## Discovery — verified this run (P6)

Reproduced (`repro/ctrlc`): `update --yes --force` in a TTY, records write stalled by an injected fault,
Ctrl-C → "Canceled", **exit 0**, `.pharn.lock` left behind, `.pharn-backup/<ts>/` created but never
named, `pharn/CONSTITUTION.md` already overwritten. `src/lib/repo.ts:23-40` documents the mechanism
(`@clack/core` `block()` → `process.exit(0)`, no `finally` runs) and only fixes the clone leak.
Inside every lock callback there is no prompt that can legitimately `exit(0)`: `update`'s confirm and
the `remove` picker's confirm are before the lock, and the `add` picker returns `cancelled` and exits
after the lock. `update.ts` prints the backup via `onBackup` only at the end / on failure;
`docs/commands/update.md` says "The directory is printed when it is created".

## Files

- `src/lib/project-lock.ts` — the held-lock `exit` listener (release + 130 + one stderr line), added after
  acquisition and removed in the existing `finally` — layer CLI/lib
- `src/commands/update.ts` — `onBackup` prints the pointer immediately (stdout, the existing
  `printBackupNotice` text); the end-of-run success notice is not printed a second time; the aborted
  path keeps its stderr "stopped part-way" warning — layer CLI/command
- `tests/project-lock.test.ts` — a child process that calls `process.exit(0)` while holding the lock
  exits 130, prints the interruption line, and leaves no `.pharn.lock`; a normal release leaves no
  listener behind
- `tests/update.test.ts` — with `--force`, the backup pointer is printed before the records/config
  writes (ordering against a write that fails), and exactly once on success

## Contracts satisfied

- `docs/commands/update.md` "The directory is printed when it is created" — now true.
- CLAUDE.md / `project-lock.ts` "fail fast … never wedge" — an interrupted holder no longer strands its
  lock.

## Evals to write (P1)

- listed above; the exit-130 and print-at-creation cases fail on the base source.

## Guarantee audit (P0)

- "an interrupted write never exits 0" → floor for the `process.exit` path: the `exit` listener runs on
  every `process.exit`; it is not reached by SIGKILL (named — the next run already breaks a dead-pid lock).
- "the lock is released on `process.exit` while held" → same listener, synchronous `rmSync`.

## Trust audit (P2)

- No input change.

## Determinism audit (P5)

- Branch on the exit code (`=== 0`) and on "lock still held" (listener registered only while held).

## Open questions (HALT)

- none
