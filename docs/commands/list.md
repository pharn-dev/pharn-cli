# pharn list

Show which PHARN **archetypes** and **capabilities** are installed in this project (one with a
`pharn.config.json`). **Read-only** — it never writes files, never clones the repo, and never fetches
over the network.

```bash
pharn list           # human-readable inventory
pharn list --json    # machine-readable JSON (for scripts / CI)
```

## Behavior

1. Reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config — it exits with
   a hint to run `pharn init` first.
2. Prints **INSTALLED (archetype)**, entirely from the config and offline:
   - your skills version;
   - the detected `archetypes`;
   - the installed `capabilities`, grouped by role (grillers, lenses).

Capabilities are grouped by role with a per-role count, one capability per line:

```text
  Skills version            v1.2.3
  Archetypes                backend, lib

  CAPABILITIES
    grillers (2)
      — architecture
      — comprehension
    lenses (1)
      — copy-paste-drift
```

Nothing is ever written, fetched, or cloned. To see what more you could add, use `pharn add
<capability>`; for version currency and drift, use [`pharn status`](status.md).

## JSON output

`pharn list --json` prints a single JSON object and nothing else (no spinner, intro, or outro), suitable
for scripting:

```json
{
  "mode": "archetype",
  "skillsVersion": "1.0.0",
  "archetypes": ["ssr"],
  "capabilities": [{ "name": "a11y", "role": "griller" }]
}
```

Diagnostics (a missing config, or a pre-archetype config that is no longer supported) go to **stderr**,
and the exit code is non-zero on failure — so stdout always parses cleanly.

## Related

- [add](add.md)
- [status](status.md)
- [pharn.config.json](../reference/pharn-config.md)
