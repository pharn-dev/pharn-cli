# pharn status

Read-only check of your install: is it on the latest version, and have any PHARN-owned files drifted
from upstream?

```bash
pharn status
pharn status --no-drift   # version check only (skips the clone)
pharn status --strict     # exit 1 on any strict condition (for CI): see "Strict conditions" below
pharn status --json       # one machine-readable report on stdout (for scripts, CI and agents)
```

`status` is the read side of [`update`](update.md): it reports PHARN-owned files at the `pharn/`
layout, the one both read. An install recorded at the removed `flat` layout is refused with one
message to re-run `pharn init` (see [Layout](#behavior), step 7).
**`status` never writes, deletes, or overwrites anything.** It is a report, not a guard.

It is a **report, not a preview**: `status` compares bytes against upstream, while `update`
additionally reads [`pharn.records.json`](../reference/pharn-records.md) to tell your edits from
upstream's changes. So a file listed below may be either cleanly upgraded or skipped — `update` says
which, and `status` cannot. `status` reads `pharn.records.json` for one thing only: to find
[orphaned files](#orphaned-files). The drift comparison never uses it.

## Behavior

1. Reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config — it exits with
   a hint to run `pharn init` first. A config that is present but **invalid** gets its own named error
   and exit 1, not the "run `pharn init`" hint.
2. Warns if a proxy is configured. `pharn` uses Node's global `fetch`, which reads no proxy variable,
   so the notice is emitted above **both** network paths — `--no-drift` skips the clone but still
   fetches `SKILLS_VERSION` over the wire.
3. By default, resolves what the install follows — the newest verified release for a config that
   records `"ref": "latest"` (what `pharn init` writes by default), or the tip of pharn-oss `main` for a
   config with no `ref` — clones it once and reuses it for both sections below (the temporary clone is
   always cleaned up). `--no-drift` skips the clone: on the release channel it makes **one** request
   (`releases/latest` — the tag names the version), and `main`'s `SKILLS_VERSION` is fetched on its own.
   A release that cannot be resolved exits 1. `status` has no `--ref`; it reports on the channel the
   install records.
4. **Version** — compares your `skillsVersion` against the upstream `SKILLS_VERSION`, names the
   **channel** the install records (`Channel  latest — verified releases`, or `Channel  main — the
pharn-oss tip` with the command that switches to releases; an install with no recorded `ref` follows
   `main`), and summarizes your detected `archetypes` and installed capability count. On the release
   channel it says whether a newer verified release exists (``v7.1.2 → v7.1.3 (newer verified release
v7.1.3 — run `pharn update`)``, or `(no newer verified release)`); on `main`, "up to date" or an update
   is available (run `pharn update`). Neither the channel nor the release line is a `--strict` input
   beyond the existing outdated check.
5. **Drift** — derives the set of files your installed capabilities and the fixed product surfaces are
   expected to contribute (mirroring how `init` / `add` / `update` install them), then compares each file's content against your project (line endings in text files are
   ignored, so a `core.autocrlf=true` checkout is not drift — see
   [Line endings](../troubleshooting.md#line-endings-windows-coreautocrlf)):
   - **Differs from `pharn-dev/pharn-oss@<source>` (PHARN-owned)** — files present whose contents differ.
     `pharn update` keeps files you've edited and cleanly upgrades the rest; `--force` overwrites edits
     too (backed up to `pharn/.backup/` first).
   - **Missing (expected but absent)** — expected files that aren't on disk (from your recorded
     `capabilities` and the fixed product surfaces). Run `pharn update` to restore them (files you
     edited are kept) — at any skills version, since every `update` downloads and plans. To install
     a capability **not yet** in `pharn.config.json`, use `pharn add` (additive-only — already-listed
     capabilities are a no-op, even if their files are missing); `add` also requires your install to
     match the current skills version.
   - **Unreadable (not a regular readable file)** — expected paths that **cannot be compared**: a
     symlink (live _or_ dangling), a file **under a symlinked parent directory** (say `.claude/hooks`
     pointed at a dotfiles repo), a directory, another non-regular file, an unreadable file, or a path
     whose parent is a regular file. Not all of them exist — a dangling parent symlink or a parent
     that is a regular file leaves nothing at the path, and that is still reported here rather than as
     missing, because the truth is that something is in the way. Each is listed with its reason; when
     a symlink is the cause the reason **names the offending path component**, and the other cases
     give a generic reason. `status` cannot compare these and `pharn update` skips them too — only
     you can resolve them, by inspecting the path. A symlink is **never followed**, at the path itself
     or at any parent directory below your project root: reading through one would report it as merely
     "differs" when its target has other bytes, or say nothing at all when its target happens to match.
   - **Not shipped upstream** — a product surface the install declares (the commands, the hooks,
     each trusted doc, pharn's `LICENSE` copy, `features/README.md`, the contracts, `pharn-core` and
     floor dirs) for which the fetched clone ships **no file at all**, at the clone's own layout. Each
     is listed by path with its kind, e.g. `pharn/pharn-contracts (contracts)`. Nothing was installed
     there, so the installed commands, hooks and checkers that use it will not find it, and no `pharn`
     command can fix it: pharn-oss moved or dropped it, or ships it in a form this `pharn` does not
     take (say, hooks with an extension other than `.cjs`/`.mjs`). If pharn-oss moved it, a newer
     `pharn` may know where (`npm i -g @pharn-dev/pharn@latest`). The list of declared surfaces is
     pharn's own and closed: a surface pharn-oss **adds** is neither installed nor reported. And
     it is checked per surface, not per file: a hook wired in `settings.json` whose script is
     missing from a hooks directory that still ships other hooks is not reported here.
   - If none of the four, reports **No drift**.
   - Then an `ORPHANED` note, when there is any: see [Orphaned files](#orphaned-files).
6. **Models** — whenever `pharn.config.json` carries a `models` block, `status` prints a `MODELS` note
   on **both** paths (with and without `--no-drift`): every product stage beside the model and effort it
   resolves to — its own entry, or `default`, marked `(default)`. Under the rows, the label that says
   what reads them: `/pharn-ship` and `/pharn-loop` read the block to pick the model they request for the
   stages they route (never the effort), and a stage you run directly uses its command's own `model:` /
   `effort:` frontmatter, which the block is held to; nothing runs
   `node pharn/floor/check-model-config.mjs agreement` automatically. A block pharn-oss's rules reject,
   such as one still in the format `pharn` wrote before 0.7.0, has each problem listed by name. The note is read-only and needs no download, and it
   is **not** a `--strict` input: the block is pharn-oss's, and so is the verdict on it. See
   [pharn.config.json](../reference/pharn-config.md#models).
7. **Layout** — there is one layout, `pharn/`. The legacy `flat` layout was removed in v0.21.0
   ([support policy](../support-policy.md#the-flat-layout-is-removed)): an install recorded at it
   (`"layout": "flat"`, or no `layout` key) makes `status` exit 1 on both paths and under `--json`,
   before any download, with one message to re-run `pharn init` — which reinstalls at `pharn/`, keeps your
   `pharn add` capabilities, and leaves the old top-level copies in place, listed under `ORPHANED` until
   you delete them. A pharn-oss in the flat layout predates `pharn-install.json`, so the fetch refuses
   it. There is no `LAYOUT` note any more.
8. **Node** — a `NODE` note on **both** paths, printed before any fetch (so it survives a failed one):
   the Node floor (`>= 24.2.0`, the number PHARN's installed floor checkers refuse to run below) beside
   the Node you are running, with a `MISMATCH` line when it is older or its version cannot be read.
   Local and instant. It is reported, never fatal, and **not** a `--strict` input: `pharn init` and
   `pharn update` are what refuse on an older Node.
9. **Deprecated** — no note any more: the `DEPRECATED` note v0.20.0 printed for a `flat` install
   is replaced by the refusal in step 7.

The heading says "differs from", not "locally modified", on purpose: the comparison is against what
upstream ships now, so a file can differ because **upstream moved**, not only because you edited it.
Distinguishing those two needs the install records, which only `update` uses for this.

The comparison is always against the source the install follows — `@main`, or the newest verified
release (`pharn-dev/pharn-oss@v6.54.1`, say) for an install that records `"ref": "latest"` — the same
source `update` would install, not the `commit` pinned in your config. An install **ahead** of the
source it follows — newer than the newest release (made from `main`, then switched with `--ref latest`),
or newer than `main` itself (when `main` has moved back to an older version) — is reported as ahead, not
outdated, and does not fail `--strict`, because `pharn update` will not downgrade it without `--force`;
its drift section compares against the older source.

## Orphaned files

On the drift path, `status` also lists the files `pharn` recorded writing that upstream no longer
ships but that are still in your project — the same `ORPHANED` note, grouped `UNCHANGED` / `EDITED` /
`UNREADABLE`, that `pharn update` prints (see [update](update.md#orphaned-files) for what each group
means and what is never listed). `pharn update` never deletes them
([What PHARN deletes](../reference/deletes.md)); delete the ones you no longer need by hand.

It needs a usable [`pharn.records.json`](../reference/pharn-records.md) — present and valid (its
`skillsVersion`/`commit` stamp does not matter). Without one, nothing is listed. A root
`THREAT-MODEL.md` or `LIMITS.md` an install from a pharn-oss before 7.0.0 left, and the old top-level
copies of a `flat` install after a re-run `pharn init`, are listed here like any other leftover.

Orphans are **not** a `--strict` input. `--strict` asks whether your install is current and intact. An
orphan is a leftover file beside it that `update` never deletes (see
[What PHARN deletes](../reference/deletes.md)), so a red CI would wait on a manual delete for a file
that changes nothing about the install.

## Prettier

When the project uses Prettier (see [`init`](init.md#prettierignore) for how that is decided) and its
`.prettierignore` does not cover the files listed in a usable
[`pharn.records.json`](../reference/pharn-records.md), `status` prints a `PRETTIER` note naming the
missing lines and saying that `pharn update` adds them — or, when pharn cannot write the file (a
symlink, not a regular file), the lines to add yourself. It is local, so it prints with `--no-drift`
too. Like orphans, it is **not** a `--strict` input: it says nothing about whether your install is
current and intact.

## JSON output

`pharn status --json` prints the same report as **one JSON object** on stdout and nothing else, on the
default path and under `--no-drift`. Exit codes match text mode: `--strict` still prints the report, and
its `strict.failed` says whether it exits 1, on exactly the [strict conditions](#strict-conditions). Its
keys, the `schemaVersion` 1 stability rule and a real example are in the
[JSON output reference](../reference/json-output.md#status).

## What is intentionally excluded

`.claude/settings.json` is **never** flagged as a differing file — it is your Claude Code
configuration, which the install preserves (never overwrites). Its `hooks` block is checked separately.
Claude Code merges the hooks of `.claude/settings.json` and your per-user `.claude/settings.local.json`,
so `status` reads both. It never reads user-level `~/.claude/settings.json`: the check is about the
project. The `HOOKS` section works like this:

- **Missing.** It names every hook the upstream `settings.json` wires that neither project file does.
  Extra hooks of your own never count, and matching is textual. `--strict` exits `1` while any is
  missing, while a project settings file cannot be read, or while neither project settings file
  exists (see [Strict conditions](#strict-conditions)).
- **Replace, not add.** If a project file already wires the same `.claude/hooks/` script under the
  same event and matcher in another spelling (say, the relative `node .claude/hooks/x.cjs` where
  upstream anchors it on `${CLAUDE_PROJECT_DIR}`), the hook is listed under `REPLACE`, with your
  current line next to upstream's. Replace your line: adding upstream's beside it would run the
  script twice. Hooks with no such line are listed under `ADD`. This changes no status.
- **Paste-ready.** Each line is `Event [matcher]: <the hook as JSON>`, so you can paste it into your
  settings under that event. An exec-form hook (`command` plus `args`) prints its `args`, so it no
  longer reads like a shell command. Characters that could move or hide text are shown as `\uXXXX`
  JSON escapes, and a line is capped at 300 characters.
- **Local only.** A hook wired **only** in `settings.local.json` counts as wired, since it runs for
  you, and `--strict` passes. The section still names it, because it reaches neither your teammates
  nor CI (where that file does not exist).
- **Symlinks.** A symlinked `settings.json` file is read through, as Claude Code does. A symlinked
  `.claude/` directory is refused. The copied-verbatim trusted docs, `.cjs`/`.mjs` hooks, `pharn/features/README.md`,
  pharn's `LICENSE` copy, and the contracts, `pharn-core` and floor dirs (`pharn/pharn-contracts/`,
  `pharn/pharn-core/`, `pharn/floor/`) **are** compared, so an edit to any of those surfaces shows up as
  drift. The floor's own `test-fixtures/` and `fixtures/` subtrees are dev test apparatus that
  pharn-oss's `pharn-install.json` leaves out — never installed, and so never compared.

## Exit code

Exits `0` by default, even when drift or an available update is found (it is a report) — including when
a path is unreadable. Pass `--strict` to exit `1` on any of the [strict conditions](#strict-conditions)
below — useful as a CI gate.

### Strict conditions

This is the one list of what fails `--strict`. `pharn status --help`, the
[exit-code table](../troubleshooting.md#exit-codes) and the `--json` report's `strict.failed` mean
exactly this. `--strict` exits `1` when any of these holds:

1. **Outdated.** Your `skillsVersion` differs from the `SKILLS_VERSION` of the source the install
   follows, and is not ahead of it. An install **ahead** of its source is not outdated (see
   [Behavior](#behavior)).
2. **Differs.** A PHARN-owned file on disk whose content differs from upstream's (line endings in text
   files are ignored).
3. **Missing.** A file your recorded capabilities or the fixed product surfaces should contribute is not
   on disk.
4. **Unreadable.** An expected path that cannot be compared: a symlink, a file under a symlinked parent,
   a directory or another non-regular file, an unreadable file.
5. **Not shipped upstream.** A product surface the install declares for which the fetched clone ships
   no file at all.
6. **Unwired hook.** The upstream `.claude/settings.json` wires hooks (when it wires none, this
   condition never holds), and one of:
   - one of those hooks is wired in neither `.claude/settings.json` nor `.claude/settings.local.json`;
   - either of those two files cannot be read (it could wire anything, so the answer is unknown);
   - neither file exists.

Under `--no-drift` only condition 1 is checked: there is no clone to compare conditions 2 to 6 against.

These are reported and **never** fail `--strict`:

- [orphaned files](#orphaned-files), in any group;
- the [`PRETTIER`](#prettier) note;
- the `NODE` mismatch (a Node older than the floor, or one whose version cannot be read);
- the `MODELS` note's REDs (a `models` block pharn-oss's rules reject);
- a hook wired **only** in `.claude/settings.local.json`, and extra hooks of your own;
- an install ahead of the source it follows, and the channel or release line;
- an installed capability this `pharn` cannot read in the fetched clone (an unknown `role` or `applies`,
  or a name that fails the allowlist): it is warned about as SKIPPED and left out of the comparison;
- the layout: there is no `LAYOUT` note. An install recorded at the removed `flat` layout is refused
  before any report (exit `1` with or without `--strict`, [Behavior](#behavior) step 7), a failure and
  not a finding.

`--strict` governs **findings**, not failures. `status` still exits `1` without it when it cannot
produce a report at all: no `pharn.config.json` (or a pre-archetype one), a clone it cannot fetch, or
a **fetched name pharn refuses** — a product `pharn-*.md` command or `.cjs`/`.mjs` hook basename that fails
the copy allowlist (lowercase words joined by single hyphens, one of `.md`/`.cjs`/`.mjs`/`.json`, no
control characters), or any path that would escape your project root. That is a fetch-boundary
refusal, not drift in your project: `pharn init` and `pharn update` refuse the same clone, so there is
nothing for `status` to report against.

A **capability directory** whose name fails that allowlist is different — it is not fatal. `status`
warns that the capability "could not be read and was SKIPPED", then reports on the rest: the same
forward-compatibility posture it takes for a capability whose `role` or `applies` it does not
recognise.

Two argv refusals fire **before** `status` runs at all, so they precede every code path above: an
option `status` does not take (``Unsupported option for `status`: "--force"``, for example — the options
`status` takes are `--strict`, `--no-drift` and `--json`) and an unexpected extra argument. Both print
one error line and ``Run `pharn --help` for usage.`` to stderr and exit **1**. `pharn status --help` alone prints
the `status` usage line and only its options, and exits 0; but
`pharn status --help --force` is refused — a genuine `--help` does not license a misapplied sibling.

`status` never takes the project lock and is never blocked by one, so `pharn status --strict` stays
runnable in CI while an `update` holds it.

Nothing is written on any of these paths — `status` still never writes, deletes, or overwrites.

One case is worth knowing before you wire `--strict` into CI: when a new `pharn` release begins
installing a surface earlier releases did not, an existing install is genuinely missing those files and
`--strict` goes red until a plain `pharn update` restores them, at the same skills version too. See
[a surface added by a newer CLI](update.md#a-surface-added-by-a-newer-cli-at-the-same-skills-version).

## Related

- [update](update.md) — act on what `status` reports (upgrade cleanly, keep your edits, restore missing)
- [pharn.records.json](../reference/pharn-records.md) — the per-file baseline `update` uses; `status`
  reads it only to find orphaned files
- [list](list.md) — read-only inventory of installed archetypes + capabilities
- [add](add.md) — install a capability
- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `archetypes`, `capabilities`
