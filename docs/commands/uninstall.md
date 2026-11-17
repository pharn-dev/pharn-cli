# pharn uninstall

Remove PHARN from a project. `uninstall` deletes **only the files `pharn` can prove it wrote and nobody
changed**, removes the directories that leaves empty, and deletes `pharn.records.json` and
`pharn.config.json` (the config is backed up first). Everything else stays exactly where it is.

```bash
pharn uninstall          # shows the plan, then asks for confirmation (default No)
pharn uninstall --yes    # no prompt — for scripts and CI (-y works too)
```

It needs **no network and no clone**: the proof is local — [`pharn.records.json`](../reference/pharn-records.md).
What every other command deletes is listed in [What PHARN deletes](../reference/deletes.md).

## What is deleted

Every path recorded in a usable `pharn.records.json` is checked, and deleted only when **all** of these
hold:

- it is a path a `pharn` install writes — a capability directory's files, a `pharn-*` command under
  `.claude/commands/`, a hook script under `.claude/hooks/`, a trusted doc, the `LICENSE` copy, the
  features README, `pharn-contracts/`, `pharn-core/`, or the floor checkers — in either layout, so a
  file an older install left at the other layout, or one upstream has since stopped shipping (an
  [orphan](../reference/pharn-records.md#orphaned-files)), is covered too;
- it is a regular file, reached without passing through a symbolic-linked directory;
- its content still matches the recorded hash — `pharn` wrote exactly this, and nobody changed it.
  Line endings in text files are ignored, so a file that only went from LF to CRLF (for example
  after a `core.autocrlf=true` checkout) is still deleted — see
  [Line endings](../troubleshooting.md#line-endings-windows-coreautocrlf).

The install-path rule has one named exception: **`.claude/settings.json`, when `pharn init` created it.**
A fresh `init` copies pharn-oss's `settings.json` only when your project has none, and records its hash.
While the file still matches that record it is deleted with the rest, so nothing is left wiring hooks to
the scripts `uninstall` removes. Once you have edited it, it is kept and listed with your changed files.
A `settings.json` that existed before `init` is never recorded, so it is never deleted.

Then each directory left **empty** is removed, deepest first, up to (never including) the project root.
A directory that still holds anything is left — so your own `pharn/features/<feature>/` work, a file you
added inside a capability directory, and a `.claude/` that still holds a `settings.json` (or anything
else of yours) keep their directories. If `.claude/` or `pharn/` ends up completely empty, it is removed
too.

Last, `pharn.records.json` is deleted, then `pharn.config.json` — after it is copied to
`pharn/.backup/<timestamp>/pharn.config.json`, printed as soon as it exists:

```text
Backed up pharn.config.json to pharn/.backup/20261013-141530.
pharn/.backup/ is not gitignored — add it to .gitignore or delete it once you are happy.
```

The backup keeps whatever only the config held: your `models` and `seam` blocks and any keys of your own.

## What is never deleted

- **A file you changed.** A recorded file whose bytes differ from its record stays in place and is
  listed — it is yours now.
- **A file `pharn` has no record of** — anything you added, anywhere. There is no proof `pharn` wrote it.
- **A recorded path outside `pharn`'s install paths** (for example a hand-edited `src/app.ts` entry),
  even when its hash matches. These are named in the plan.
- **Anything that is not a regular file** at a recorded path (a directory, a symbolic link, a FIFO), or
  a file that cannot be read. Listed as kept.
- **`.claude/settings.local.json`, and a `.claude/settings.json` `pharn` has no record of or that you
  changed.** `pharn` never writes either file after `init`. Instead, `uninstall` prints the hooks still
  wired in them to a hook script it removed — see [Hooks](#hooks).
- **Every `pharn/.backup/` directory**, including the one this run creates. Delete it yourself once you
  no longer need it.
- **`pharn/` itself, while anything is still in it.** After the deletes (and after the project lock in
  `pharn/` is released) `uninstall` removes `pharn/` if it is empty. It never is after a real run — the
  config's backup sits in `pharn/.backup/` — so the `UNINSTALLED` note names what is left (for example
  `.backup`, or pharn-oss's runtime scratch `.run`) and that you may delete `pharn/` once you no longer
  need them.

### A `settings.json` from an install made before this change

Installs made with an older `pharn` did not record `.claude/settings.json`, so `uninstall` leaves it, as
it always did, and the `HOOKS` note lists the hooks it still wires to removed scripts. To check, look for
a `".claude/settings.json"` entry in the `files` map of `pharn.records.json` before you uninstall — none
means the file will be left. If `pharn init` created the file and you never added anything to it, delete
it yourself after `uninstall` (and `.claude/` if it is then empty); otherwise remove the entries the
`HOOKS` note lists. See also [Removing PHARN by hand](../troubleshooting.md#removing-pharn-by-hand).

## The plan and the confirmation

Before anything is written, `uninstall` prints a `PLAN` note: how many files it will delete, the files
it keeps because you changed them, paths it cannot verify, recorded paths outside the install paths, and
how many recorded files are already gone. It always ends with the reminder that
`.claude/settings.local.json`, every `pharn/.backup/` directory and the lines pharn added to `.gitignore`
and `.prettierignore` are left untouched (they are harmless without PHARN; delete them by hand if you
like). pharn only ever appends to those two files, so `uninstall` does not edit them either — not even a
`.prettierignore` pharn created, which may hold your own lines by now. The reminder names
`.claude/settings.json` too, unless `pharn.records.json` records it: then the plan's own lines already
say whether it is deleted, kept, or already gone.

In a terminal it then asks one question, defaulting to **No**:

```text
Uninstall PHARN — delete 412 file(s), pharn.records.json and pharn.config.json?
```

`--yes` / `-y` skips that question and nothing else. Off a terminal (CI, a pipe) **without** `--yes`,
`uninstall` refuses with exit 1 instead of prompting into a stream nobody reads. Declining, or
cancelling with Ctrl-C at the prompt, exits 0 with nothing changed.

`uninstall` takes the project lock (`pharn/.lock`) before it reads anything and holds it across the
plan, the confirmation and the deletes, so no other `pharn` command changes the project meanwhile (one
started while the prompt is open is refused, naming `uninstall`). After you confirm, it checks again
each file the plan would delete: a file you edited while the prompt was open is kept, and the final
summary reports what actually happened.

## Hooks

When a hook script `uninstall` removed (or that was already gone) is still referenced by a hook in
`.claude/settings.json` or `.claude/settings.local.json`, a `HOOKS` note lists each such entry as JSON
under its event and matcher, so you can delete it by hand. Matching is textual — an entry whose command
or arguments contain the script's path, e.g. `.claude/hooks/protect-trusted-paths.cjs`. A hook that
reaches a removed script another way (a wrapper script, a differently spelled path) is not listed. A
`settings.json` that `init` created and you never changed is deleted by the run, so it has no entries
left to list.

## When `uninstall` refuses

Each of these exits 1 and removes nothing:

- **No usable `pharn.records.json`** — missing or corrupt. Nothing can be proven to be `pharn`'s, so
  nothing is deleted. Follow [Removing PHARN by hand](../troubleshooting.md#removing-pharn-by-hand). A
  store written for a different `skillsVersion`/`commit` than `pharn.config.json` (an interrupted `add`
  or `update`) is still usable: only a file whose bytes match its record is deleted, whatever the
  stamp — see [The stamp is not a gate](../reference/pharn-records.md#the-stamp-is-not-a-gate).
- **A directory on the way to a recorded file is a symbolic link** — deleting through it would delete a
  file outside the project.
- **`pharn.config.json` cannot be backed up** (for example `pharn/.backup` is a symbolic link).
- **Another `pharn` command holds the project lock**, `pharn.config.json` was edited while the prompt
  was open, or `pharn.records.json` is gone or broken by then.
- **A pre-archetype (module) config** — the shared config check rejects it, as every command does.

When there is **no `pharn.config.json` at all**, `uninstall` prints
`PHARN is not installed here (no pharn.config.json). Nothing was removed.` and exits **0**, so running it
twice is harmless.

## If a delete fails part-way

If a file cannot be deleted (a permission error, say), `uninstall` stops, says how many files were
already deleted, and exits 1. `pharn.records.json` and `pharn.config.json` are deleted **last**, so they
are still there: fix the cause and run `pharn uninstall` again — the files already gone are reported as
"already gone" and the run finishes. Each run backs up the config again, so a resumed uninstall leaves
one config backup per attempt.

## Options

| Option        | Meaning                                          |
| ------------- | ------------------------------------------------ |
| `--yes`, `-y` | Skip the confirmation prompt.                    |
| `--help`      | Show the `uninstall` usage line and its options. |

`uninstall` takes no argument and no other option; `pharn uninstall --force`, `--dry-run`, or an extra
argument is refused with exit 1.
