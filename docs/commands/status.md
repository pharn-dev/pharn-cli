# pharn status

Read-only audit of your install: is it on the latest version, and have any PHARN-owned files drifted
from upstream?

```bash
pharn status
pharn status --no-drift   # version check only (skips the clone)
pharn status --strict     # exit 1 if outdated, differing, missing, or unreadable (for CI)
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
   a hint to run `pharn init` first.
2. By default, clones `pharn-dev/pharn-oss@main` once and reuses it for both sections below (the
   temporary clone is always cleaned up). `--no-drift` skips the clone and uses the lightweight
   `SKILLS_VERSION` fetch for the version section only.
3. **Version** — compares your `skillsVersion` against the upstream `SKILLS_VERSION` and summarizes your
   detected `archetypes` and installed capability count: either "up to date" or an update is available
   (run `pharn update`).
4. **Drift** — derives the set of files your installed capabilities and the fixed product surfaces are
   expected to contribute (mirroring how `init` / `add` / `update` install them, at your recorded
   layout), then byte-compares each against your project:
   - **Differs from `pharn-dev/pharn-oss@main` (PHARN-owned)** — files present whose contents differ.
     `pharn update` keeps files you've edited and cleanly upgrades the rest; `--force` overwrites edits
     too (backed up to `.pharn-backup/` first).
   - **Missing (expected but absent)** — expected files that aren't on disk (from your recorded
     `capabilities` and the fixed product surfaces). For those, run `pharn update` when a newer skills
     version is available, or `pharn update --force` at the current version — a plain `pharn update`
     exits early when already up to date. To install a capability **not yet** in `pharn.config.json`,
     use `pharn add` (additive-only — already-listed capabilities are a no-op, even if their files are
     missing); `add` also requires your install to match the current skills version.
   - **Unreadable (not a regular readable file)** — expected paths that **exist** but cannot be
     compared: a symlink (live *or* dangling), a directory, another non-regular file, an unreadable
     file, or a path whose parent is a regular file. Each is listed with the reason. `status` cannot
     compare these and `pharn update` skips them too — only you can resolve them, by inspecting the
     path. A symlink is **never followed**: reading through one would report it as merely "differs"
     when its target has other bytes, or say nothing at all when its target happens to match.
   - If none of the three, reports **No drift**.

The heading says "differs from", not "locally modified", on purpose: the comparison is against
upstream `@main`, so a file can differ because **upstream moved**, not only because you edited it.
Distinguishing those two needs the install records, which only `update` reads.

The comparison is always against `pharn-dev/pharn-oss@main` (the same ref the CLI installs from), not the
`commit` pinned in your config. Note that `update` derives its file set from the layout of the clone it
fetches, so a project mid-way through a layout migration can show little drift here while `update` has
a whole tree to relocate.

## What is intentionally excluded

`.claude/settings.json` is **never** flagged — it is your Claude Code configuration, which the install
preserves (never overwrites). The copied-verbatim trusted docs, `.cjs` hooks, `pharn-contracts/`, and
`.dev/floor/` checkers **are** compared, so an edit to any of those surfaces shows up as drift.

## Exit code

Exits `0` by default, even when drift or an available update is found (it is a report) — including when
a path is unreadable. Pass `--strict` to exit `1` whenever anything is outdated, differing, missing, or
unreadable — useful as a CI gate.

## Related

- [update](update.md) — act on what `status` reports (upgrade cleanly, keep your edits, restore missing)
- [pharn.records.json](../reference/pharn-records.md) — the per-file baseline `update` uses and `status` does not
- [list](list.md) — read-only inventory of installed archetypes + capabilities
- [add](add.md) — install a capability
- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `archetypes`, `capabilities`
