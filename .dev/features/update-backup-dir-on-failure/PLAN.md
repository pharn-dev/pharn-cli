# PLAN — print the backup directory on `update`'s failure path

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: carry the `--force` backup directory out of `applyUpdate` so the failure branch of `pharn update` names `.pharn-backup/<timestamp>/` instead of exiting 1 with the pointer withheld.
- layer(s): pharn (the CLI) — `src/commands/` (the `update` verb), `tests/`, `docs/`
- constitution_refs: [P0, P1, P3, P4, P5]

## Live state read this run (P6)

- `src/commands/update.ts` — PR 4 has ALREADY landed on this branch: fatal exits route through
  `reportFatal` (`src/lib/report-error.ts`), and `failure` holds a boxed `FatalCause`, not a string.
  The failure branch is at `:252-259`, **not** the `188-209` the task description quotes.
- `createBackup` is called at `update.ts:348-349`; its result reaches the caller only as
  `UpdateOutcome.backupDir` (`:119`, `:438`), which is discarded on any throw.
- `reportOutcome` prints the two-line notice at `:513-520` — today the sole print site.
- Sibling 4.03 has also landed: `tests/update.test.ts` already uses a read-only DEST file (`:1375`)
  and a read-only PARENT dir (`:1416`) as its mid-loop-throw mechanisms, not a symlinked parent.
- `docs/commands/update.md:161` — "The directory is printed when it is created."
- `src/lib/backup.ts` is untouched by this increment (out of scope).

## Files

- `tests/update.test.ts` — three tests, written FIRST (P1) — layer: tests
- `src/commands/update.ts` — `onBackup` param + holder + extracted `printBackupNotice` — layer: `commands/` (the `update` verb, one axis, P3)
- `docs/commands/update.md` — name the abort case in the `--force` section — layer: docs (P4)

No new file, and no `lib/` change: the wording is `update`'s report, and `reportOutcome` already
lives in `update.ts`. Adding a lib for two log lines would split one axis across two files (P3).

## Design (the one shape both paths share)

1. `interface Backup { dir: string; count: number }`; `UpdateOutcome.backupDir: string | null`
   becomes `backup: Backup | null`, so one shape is used everywhere and the count is never
   re-derived at a second site.
2. `applyUpdate` gains an `onBackup?: (b: Backup) => void`, invoked immediately after
   `createBackup` returns and before `applyWrites`. `createBackup` does **not** move: it stays
   ordered after `planUpdate` and before the first write, and it still throws rather than returning
   partial work.
3. `runArchetypeUpdate` holds it in `const backupRef = { current: null as Backup | null }` — a
   holder, not a bare `let`: TS drops narrowing for a `let` assigned only inside a closure under
   this repo's `strict` config.
4. `printBackupNotice(backup, { aborted })` is the single wording source, called from
   `reportOutcome` (`aborted: false`) and from the failure branch (`aborted: true`). The aborted
   call additionally prints one line saying the run stopped part-way and some originals may already
   have been overwritten.
5. The failure-path call sits **after** `finally { repo.cleanup() }` and **before**
   `process.exit(1)`, after `reportFatal` so the failure leads and the recovery pointer follows.
6. Streams: `aborted: false` → stdout (byte-identical to today). `aborted: true` → **stderr**, via
   the `{ output: process.stderr }` option `report-error.ts` established — the notice is part of the
   fatal output, and an operator redirecting stderr to a log must see it.
7. `applyUpdate` stays pure of `process.exit`; `ApplyError.written` and the partial-failure
   recording contract, the withheld-bump rule, skips-exit-0, and "never deletes / never touches
   `.claude/settings.json`" are all untouched.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — not applicable; this increment emits no findings.
- The contract it does satisfy is documentary: `docs/commands/update.md:161` (P4 — the doc's
  existing promise becomes true on both paths rather than one).

## Evals to write (P1)

- `tests/update.test.ts` → `--force` run, two local edits, the hook's dest made read-only (0o444)
  so the backup succeeds and `copyFileSync` then fails EACCES mid-loop → exits 1, and a printed
  line contains `.pharn-backup/<ts>` for the `<ts>` directory that actually exists on disk.
- `tests/update.test.ts` → same failure path with `{ output: process.stderr }` asserted at the real
  call site (a `vi.fn()` mock swallows a missing option silently — the precedent at `:224`).
- `tests/update.test.ts` → a failure with NO backup (non-`--force`, config write EISDIR) → no
  printed line mentions `.pharn-backup`, so the notice never appears spuriously.
- `tests/update.test.ts` → `--force` where `createBackup` itself fails (a plain file at
  `.pharn-backup`) → still no notice: a failed backup aborts with the tree intact and nothing to
  point at.
- `tests/update.test.ts` → success-path regression: the existing "prints the backup directory"
  test still passes, now through the extracted helper, asserting both lines and the exact dir.

## Guarantee audit (P0)

- "the backup directory is printed whenever one was created, on BOTH the success and the failure
  path" → **advisory**. It is deterministic control flow demonstrated by a test (P1), not one of the
  three floor primitives (`ARCHITECTURE.md §2`). This is the same honest label `src/lib/backup.ts:13-16`
  already carries for its own ordering contract.
- "no notice is printed when no backup was created" → **advisory**, same class; the branch itself is
  a null-membership test on a value set exactly once (P5).
- "the failure-path notice reaches stderr" → **advisory** (an explicit `{ output }` option, test-pinned
  at the call site).
- "the backup's reads and writes stay inside the project" → **floor: path-containment** (`safeJoin`
  - `lstat`/`findSymlinkComponent` in `src/lib/backup.ts`). UNCHANGED by this increment — it is
  cited, not re-derived, and no new claim is made over it.
- Struck: "printing the directory guarantees the user can recover." It does not — recovery depends
  on the copies, which `backup.ts` guarantees only to the extent named above.

## Trust audit (P2)

The increment ingests **no** untrusted artifact. The printed path is `BACKUP_DIR` (a local constant)
plus a local `Date` timestamp, produced by `createBackup` and `safeJoin`-contained — no remote or
clone-derived string reaches it. The failure MESSAGE printed beside it (`errorMessage(failure.err)`)
can already contain clone-derived text; that is pre-existing, rendered as text and never executed,
and this increment does not widen it.

## Determinism audit (P5)

One new branch: `if (backupRef.current)`. It is a null-membership test on a field assigned exactly
once, by the `onBackup` callback, immediately after `createBackup` returns — never inferred from the
error, never from the presence of `--force`. The `aborted` flag is a literal at each of the two call
sites, not classified. There is no fallback that ends in a guess.

## Decisions taken (not open questions)

- **stderr on the failure path.** The notice is part of the fatal output; PR 4's whole thesis is
  that fatal output goes to stderr. Printed through `log.*({ output: process.stderr })`, never a
  reinstated raw `log.error`.
- **The abort line is gated on the backup existing.** A non-`--force` partial failure can also
  overwrite files, but only files pharn itself wrote and proved pristine (rows 1/3) — no user bytes
  are at risk, so there is nothing to point at and nothing to warn about.
- **The count stays `plan.backups.length`.** On a partial failure only some of those were actually
  overwritten, but "Backed up N file(s) … before overwriting" remains literally true, and narrowing
  it would need state `applyWrites` does not report.
- **`docs/commands/update.md` is extended**, not merely verified: the abort case is named so the
  existing sentence is precisely true (P4).

## Open questions (HALT)

None. The two candidate ambiguities (failure-path stream; whether the abort line fires without a
backup) are resolved above with their rationale, and either can be flipped at the approval gate.
