# pharn list

Show what PHARN modules and skills are installed in this project (one with a `pharn.config.json`) and what is still available to add. **Read-only** — it never writes files and never clones the repo.

```bash
pharn list           # human-readable inventory
pharn list --json    # machine-readable JSON (for scripts / CI)
```

## Behavior

1. Reads `pharn.config.json`. If none exists, exits with a hint to run `pharn init` first.
2. Fetches `manifest.json` to learn the latest versions and the available catalog. (No clone — only the same lightweight fetch `pharn update` uses.)
3. Prints **INSTALLED**:
   - your skills version, flagged `→ vX (update available, run pharn update)` when the manifest is newer;
   - each installed module with its version, flagged `→ vX` when the manifest has a newer one;
   - any individually installed technology skills (schemaVersion 2).
4. Prints **AVAILABLE TO ADD**:
   - optional modules and stack packs you don't have yet — the same set `pharn add` offers;
   - on a `schemaVersion 2` manifest, every `category:skill` you haven't installed.

   A group with nothing left shows `(all installed)`.

Nothing is ever written, and the repo is never cloned.

## JSON output

`pharn list --json` prints a single JSON object and nothing else (no spinner, intro, or outro), suitable for scripting:

```json
{
  "skillsVersion": "0.69.0",
  "latestSkillsVersion": "0.70.0",
  "installed": {
    "modules": [{ "name": "pharn-core", "version": "0.1.0", "latest": "0.1.0" }],
    "skills": [{ "skill": "prisma", "from": "pharn-skills-orm/skills/prisma" }]
  },
  "available": {
    "modules": [{ "name": "pharn-review", "version": "0.4.0", "description": "…" }],
    "skills": [{ "category": "orm", "skill": "drizzle", "install": "pharn-skills-orm/skills/drizzle" }]
  }
}
```

Diagnostics (such as a missing config or a failed fetch) go to **stderr**, and the exit code is non-zero on failure — so stdout always parses cleanly.

## Related

- [add](add.md)
- [update](update.md)
- [pharn.config.json](../reference/pharn-config.md)
