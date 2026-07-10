# pharn status

Read-only audit of your install: is it on the latest version, and have any PHARN-owned files drifted
from upstream?

```bash
pharn status
pharn status --no-drift   # version check only (skips the clone)
pharn status --strict     # exit 1 if outdated, modified, or missing (for CI)
```

`status` is the read side of [`update`](update.md): it surfaces the same state `update` would overwrite,
but **never writes, deletes, or overwrites anything**. It is a report, not a guard.

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
   - **Locally modified (PHARN-owned)** — files present but whose contents differ. `pharn update` will
     overwrite these.
   - **Missing (expected but absent)** — expected files that aren't on disk. Re-run `pharn update` (or
     `pharn add`) to restore them.
   - If neither, reports **No drift**.

The comparison is always against `pharn-dev/pharn-oss@main` (the same ref the CLI installs from), not the
`commit` pinned in your config.

## What is intentionally excluded

`.claude/settings.json` is **never** flagged — it is your Claude Code configuration, which the install
preserves (never overwrites). The copied-verbatim trusted docs, `.cjs` hooks, `pharn-contracts/`, and
`.dev/floor/` checkers **are** compared, so an edit to any of those surfaces shows up as drift.

## Exit code

Exits `0` by default, even when drift or an available update is found (it is a report). Pass `--strict`
to exit `1` whenever anything is outdated, modified, or missing — useful as a CI gate.

## Related

- [update](update.md) — apply the fixes `status` reports (overwrite drift, restore missing)
- [list](list.md) — read-only inventory of installed archetypes + capabilities
- [add](add.md) — install a capability
- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `archetypes`, `capabilities`
