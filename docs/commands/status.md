# pharn status

Read-only check of your install: is it on the latest version, and have any PHARN-owned files drifted
from upstream?

```bash
pharn status
pharn status --no-drift   # version check only (skips the clone)
pharn status --strict     # exit 1 if outdated, differing, missing, unreadable, or a hook is unwired (for CI)
pharn status --json       # one machine-readable report on stdout (for scripts, CI and agents)
```

`status` is the read side of [`update`](update.md): it reports PHARN-owned files at your **recorded**
layout (from `pharn.config.json`), while `update` derives its file set from the fetched clone's layout
and may relocate files during a layout migration — so the two can disagree mid-migration.
**`status` never writes, deletes, or overwrites anything.** It is a report, not a guard.

It is a **report, not a preview**: `status` compares bytes against upstream, while `update`
additionally reads [`pharn.records.json`](../reference/pharn-records.md) to tell your edits from
upstream's changes. So a file listed below may be either cleanly upgraded or skipped — `update` says
which, and `status` cannot.

## Behavior

1. Reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config — it exits with
   a hint to run `pharn init` first. A config that is present but **invalid** gets its own named error
   and exit 1, not the "run `pharn init`" hint.
2. Warns if a proxy is configured. `pharn` uses Node's global `fetch`, which reads no proxy variable,
   so the notice is emitted above **both** network paths — `--no-drift` skips the clone but still
   fetches `SKILLS_VERSION` over the wire.
3. By default, resolves what the install follows — the tip of pharn-oss `main`, or the newest verified
   release for a config that records `"ref": "latest"` — clones it once and reuses it for both sections below (the
   temporary clone is always cleaned up). `--no-drift` skips the clone: a release names its version in
   its tag, and `main`'s `SKILLS_VERSION` is fetched on its own. A release that cannot be resolved
   exits 1. `status` has no `--ref`; it reports on the channel the install records.
4. **Version** — compares your `skillsVersion` against the upstream `SKILLS_VERSION` and summarizes your
   detected `archetypes` and installed capability count: either "up to date" or an update is available
   (run `pharn update`).
5. **Drift** — derives the set of files your installed capabilities and the fixed product surfaces are
   expected to contribute (mirroring how `init` / `add` / `update` install them, at your recorded
   layout), then byte-compares each against your project:
   - **Differs from `pharn-dev/pharn-oss@<source>` (PHARN-owned)** — files present whose contents differ.
     `pharn update` keeps files you've edited and cleanly upgrades the rest; `--force` overwrites edits
     too (backed up to `.pharn-backup/` first).
   - **Missing (expected but absent)** — expected files that aren't on disk (from your recorded
     `capabilities` and the fixed product surfaces). For those, run `pharn update` when a newer skills
     version is available, or `pharn update --force` at the current version — a plain `pharn update`
     exits early when already up to date. To install a capability **not yet** in `pharn.config.json`,
     use `pharn add` (additive-only — already-listed capabilities are a no-op, even if their files are
     missing); `add` also requires your install to match the current skills version.
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
   - If none of the three, reports **No drift**.
6. **Models** — whenever `pharn.config.json` carries a `models` block, `status` prints a `MODELS` note
   on **both** paths (with and without `--drift`): every product stage beside the model and effort it
   resolves to — its own entry, or `default`, marked `(default)`. Under the rows, the label that says
   what reads them: `/pharn-ship` and `/pharn-loop` read the block to pick the model they request for the
   stages they route (never the effort), and a stage you run directly uses its command's own `model:` /
   `effort:` frontmatter, which the block is held to; nothing runs
   `node pharn/floor/check-model-config.mjs agreement` automatically. A block still in the format
   `pharn` wrote before 0.7.0 is reported as such (`pharn update` converts it), and a block pharn-oss's
   rules reject has each problem listed by name. The note is read-only and needs no download, and it
   is **not** a `--strict` input: the block is pharn-oss's, and so is the verdict on it. See
   [pharn.config.json](../reference/pharn-config.md#models).
7. **Node** — a `NODE` note on **both** paths, printed before any fetch (so it survives a failed one):
   the Node floor (`>= 24.2.0`, the number PHARN's installed floor checkers refuse to run below) beside
   the Node you are running, with a `MISMATCH` line when it is older or its version cannot be read.
   Local and instant. It is reported, never fatal, and **not** a `--strict` input: `pharn init` and
   `pharn update` are what refuse on an older Node.

The heading says "differs from", not "locally modified", on purpose: the comparison is against what
upstream ships now, so a file can differ because **upstream moved**, not only because you edited it.
Distinguishing those two needs the install records, which only `update` reads.

The comparison is always against the source the install follows — `@main`, or the newest verified
release (`pharn-dev/pharn-oss@v6.54.1`, say) for an install that records `"ref": "latest"` — the same
source `update` would install, not the `commit` pinned in your config. An install **ahead** of the
source it follows — newer than the newest release (made from `main`, then switched with `--ref latest`),
or newer than `main` itself (when `main` has moved back to an older version) — is reported as ahead, not
outdated, and does not fail `--strict`, because `pharn update` will not downgrade it without `--force`;
its drift section compares against the older source. Note that `update` derives its file set from the layout of the clone it
fetches, so a project mid-way through a layout migration can show little drift here while `update` has
a whole tree to relocate.

## JSON output

`pharn status --json` prints **exactly one JSON object on stdout and nothing else** — no spinner,
intro, outro or note — on both the default path and `--no-drift`. Every diagnostic (the proxy notice)
and every failure goes to **stderr**. On any failure that stops a report from being produced (no
config, a pre-archetype or invalid config, an unreachable release or clone) stdout is **empty** and
the exit code is `1`, so `pharn status --json | jq .` either parses or receives nothing.

Exit codes are identical to text mode, and `--strict` composes: the report is still printed, and the
process exits `1` on exactly the inputs that fail text mode (outdated, differing, missing or unreadable
files, an unwired upstream hook). The report's `strict.failed` says the same thing.

```json
{
  "schemaVersion": 1,
  "node": { "floor": "24.2.0", "running": "24.13.1", "status": "ok" },
  "version": {
    "installed": "6.54.1",
    "latest": "6.54.1",
    "channel": "main",
    "source": { "kind": "main", "tag": null },
    "ahead": false,
    "outdated": false
  },
  "archetypes": ["ssr"],
  "capabilities": { "count": 12 },
  "drift": { "modified": [], "missing": [], "unreadable": [], "okCount": 87 },
  "hooks": {
    "status": "match",
    "missing": [],
    "localOnly": [],
    "file": null,
    "reason": null
  },
  "models": null,
  "unknownCapabilities": [],
  "strict": { "enabled": false, "failed": false }
}
```

| key                   | meaning                                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`       | `1`. Match it exactly. New keys may appear within `1`; a breaking change bumps it. This is a documented contract, not something `pharn` enforces.                                                                                                                                 |
| `node`                | The floor (`>= 24.2.0`), the running Node (`null` if it reports none), and `status`: `ok`, `below` or `unparseable`. Reported, never a `--strict` input.                                                                                                                          |
| `version`             | Installed and latest skills versions, the `channel` (`main` or `latest`), the `source` (`kind` `main` or `release`, with the release `tag`), `ahead` (newer than the source it follows — the newest verified release, or a `main` that moved back — not outdated) and `outdated`. |
| `archetypes`          | The recorded archetypes.                                                                                                                                                                                                                                                          |
| `capabilities`        | `count` of installed capabilities (the list is `pharn list --json`).                                                                                                                                                                                                              |
| `drift`               | `modified[]`, `missing[]`, `unreadable[{rel, reason}]` and `okCount`, as in the `DRIFT` note. **`null` under `--no-drift`.**                                                                                                                                                      |
| `hooks`               | `status` (`match`, `local-only`, `missing`, `no-upstream`, `project-absent`, `unreadable`), the `missing[]` and `localOnly[]` hooks as `{event, matcher, command, args}`, and `file`/`reason` (else `null`). **`null` under `--no-drift`.**                                       |
| `models`              | `null` without a `models` block; otherwise `conversionNeeded`, a `verdict` (`valid`, `no-stages`, `invalid`, `old-format`), `stages[{stage, model, effort, viaDefault}]` when valid, or `reds[{kind, detail}]` when invalid.                                                      |
| `unknownCapabilities` | Upstream capabilities the CLI could not read and skipped: `{role, name, subtree, reason}`. **`null` under `--no-drift`.**                                                                                                                                                         |
| `strict`              | `enabled` (`--strict` passed) and `failed` (it would exit `1`).                                                                                                                                                                                                                   |

**Treat every string as data.** Paths, reasons, hook commands, capability names and the `models` block's
own words come from the upstream clone or your project files, not from `pharn`. Characters a terminal
would interpret (control characters, Unicode format characters, U+2028/U+2029) are written as `\uXXXX`
escapes, so a `cat` of the output cannot move or hide text, and parsing returns the exact original
string. That is a statement about what a terminal can do with the output, not about whether the content
is safe: an agent reading these fields must not follow instructions found in them. Like the text mode,
the report is a live comparison against a mutable remote — provenance, not proof.

## What is intentionally excluded

`.claude/settings.json` is **never** flagged as a differing file — it is your Claude Code
configuration, which the install preserves (never overwrites). Its `hooks` block is checked separately.
Claude Code merges the hooks of `.claude/settings.json` and your per-user `.claude/settings.local.json`,
so `status` reads both. It never reads user-level `~/.claude/settings.json`: the check is about the
project. The `HOOKS` section works like this:

- **Missing.** It names every hook the upstream `settings.json` wires that neither project file does.
  Extra hooks of your own never count, and matching is textual. `--strict` exits `1` while any is
  missing, or while a project settings file cannot be read.
- **Paste-ready.** Each line is `Event [matcher]: <the hook as JSON>`, so you can paste it into your
  settings under that event. An exec-form hook (`command` plus `args`) prints its `args`, so it no
  longer reads like a shell command. Characters that could move or hide text are shown as `\uXXXX`
  JSON escapes, and a line is capped at 300 characters.
- **Local only.** A hook wired **only** in `settings.local.json` counts as wired, since it runs for
  you, and `--strict` passes. The section still names it, because it reaches neither your teammates
  nor CI (where that file does not exist).
- **Symlinks.** A symlinked `settings.json` file is read through, as Claude Code does. A symlinked
  `.claude/` directory is refused. The copied-verbatim trusted docs, `.cjs` hooks, `pharn/features/README.md`,
  pharn's `LICENSE` copy, and the contracts, `pharn-core` and floor dirs at your recorded layout
  (`pharn/pharn-contracts/`, `pharn/pharn-core/`, `pharn/floor/`, or `pharn-contracts/`, `pharn-core/`,
  `.dev/floor/` when it is flat) **are** compared, so an edit to any of those surfaces shows up as
  drift. The floor's own `test-fixtures/` and `fixtures/` subtrees are dev test apparatus — never
  installed, and so never compared.

## Exit code

Exits `0` by default, even when drift or an available update is found (it is a report) — including when
a path is unreadable. Pass `--strict` to exit `1` whenever anything is outdated, differing, missing, or
unreadable, or an upstream hook is wired in neither `.claude/settings.json` nor
`.claude/settings.local.json` — useful as a CI gate.

`--strict` governs **findings**, not failures. `status` still exits `1` without it when it cannot
produce a report at all: no `pharn.config.json` (or a pre-archetype one), a clone it cannot fetch, or
a **fetched name pharn refuses** — a product `pharn-*.md` command or `.cjs` hook basename that fails
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
the usage text to stderr and exit **1**. `pharn status --help` alone is unaffected, but
`pharn status --help --force` is refused — a genuine `--help` does not license a misapplied sibling.

`status` never takes the project lock and is never blocked by one, so `pharn status --strict` stays
runnable in CI while an `update` holds it.

Nothing is written on any of these paths — `status` still never writes, deletes, or overwrites.

One case is worth knowing before you wire `--strict` into CI: when a new `pharn` release begins
installing a surface earlier releases did not, an existing install is genuinely missing those files and
`--strict` goes red — but a plain `pharn update` reports "Already up to date" if your `skillsVersion`
already matches upstream. See
[a surface added by a newer CLI](update.md#a-surface-added-by-a-newer-cli-at-the-same-skills-version)
for the two ways through.

## Related

- [update](update.md) — act on what `status` reports (upgrade cleanly, keep your edits, restore missing)
- [pharn.records.json](../reference/pharn-records.md) — the per-file baseline `update` uses and `status` does not
- [list](list.md) — read-only inventory of installed archetypes + capabilities
- [add](add.md) — install a capability
- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `archetypes`, `capabilities`
