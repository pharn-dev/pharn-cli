# pharn status

Read-only audit of your install: is it on the latest version, and have any PHARN-owned files drifted from upstream?

```bash
pharn status
pharn status --no-drift   # version check only (skips the clone)
pharn status --strict     # exit 1 if outdated, modified, or missing (for CI)
```

`status` is the read side of [`update`](update.md): it surfaces the same state `update` would overwrite, but **never writes, deletes, or overwrites anything**. It is a report, not a guard.

## Behavior

1. Reads `pharn.config.json`. If none exists, exits with a hint to run `pharn init` first.
2. By default, clones `pharn-dev/pharn-oss@main` once and reuses it for both sections below (the temporary clone is always cleaned up). `--no-drift` skips the clone and uses the lightweight `manifest.json` fetch for the version section only.
3. **Version** — compares your `skillsVersion` and per-module versions against the manifest, then reports either "up to date" or that an update is available (run `pharn update`). This overlaps with part of [`pharn list`](list.md) by design.
4. **Drift** — derives the set of files each installed module and skill is expected to contribute (mirroring how `init` / `add` / `update` install them), then byte-compares each against your `.claude/`:
   - **Locally modified (PHARN-owned)** — files present but whose contents differ. `pharn update` will overwrite these.
   - **Missing (expected but absent)** — files an installed module/skill expects that aren't on disk. Re-run `pharn update` (or `pharn add`) to restore them.
   - If neither, reports **No drift**.

The comparison is always against `pharn-dev/pharn-oss@main` (the same ref the rest of the CLI installs from), not the `commit` pinned in your config.

## What is intentionally excluded

`.claude/CONSTITUTION.md` and everything under `.claude/memory-bank/` are **never** flagged. They are materialized once at `init` and are meant to be hand-edited — `update` never touches them, so reporting local edits to them would be noise.

This exclusion is anchored at the `.claude/` root. The pristine template **sources** under `.claude/templates/` (including `templates/memory-bank/` and `templates/constitution/`) are PHARN-owned and **are** diffed — only the materialized working copies at the root are skipped.

## Exit code

Exits `0` by default, even when drift or an available update is found (it is a report). Pass `--strict` to exit `1` whenever anything is outdated, modified, or missing — useful as a CI gate.

## Related

- [update](update.md) — apply the fixes `status` reports (overwrite drift, restore missing)
- [list](list.md) — read-only inventory of installed vs. available modules/skills
- [add](add.md) — install a module or a single `category:skill`
- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `modules`, `installedSkills`
