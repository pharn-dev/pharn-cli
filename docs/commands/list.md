# pharn list

Show which PHARN **archetypes** and **capabilities** `pharn.config.json` records as installed in this
project. PHARN's commands run every capability whose **directory** is on disk, so a capability
directory with no entry in the config — one an older `pharn` left behind when it dropped the entry, or
one you created by hand — is not listed here but still runs. Delete such a directory by hand
(`pharn update` and a re-run `pharn init` now delete the directory of a capability they drop; see
[Dropped capabilities are deleted](update.md#dropped-capabilities-are-deleted)). **Read-only** — it never writes files, never clones the repo, and never fetches
over the network.

```bash
pharn list           # human-readable inventory
pharn list --json    # machine-readable JSON (for scripts / CI)
```

`--json` is `list`'s **only** option. Any other flag is refused with
``Unsupported option for `list` `` on stderr and exit **1** — including `pharn list --strict`, which
previously parsed, was dropped, and exited 0 no matter what it found. An extra positional is refused
the same way. See
[Unsupported option for this command](../troubleshooting.md#unsupported-option-for-this-command).

`--json` takes no value: `pharn list --json=false` is refused with `Option takes no value`, exit **1**.
Pass `--json` bare for JSON, or leave it out for the human-readable output.

## Behavior

1. Reads `pharn.config.json`. A config that is present but **invalid** (an out-of-enum
   `capabilities[].source`, an unknown archetype, unparseable JSON) gets its own named error and exit
   1 — under `--json` it is written as plain text to stderr, so no clack chrome reaches a `2>&1`
   consumer. If none exists — or it is a pre-archetype (module) config — it exits with
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
      — copy-paste-drift  (manual)
```

A capability you installed by hand with [`pharn add`](add.md) is marked `(manual)` — it is preserved
across [`pharn update`](update.md) rather than re-derived from your archetypes, unless upstream has
removed the capability from the index (then `update` drops the entry and reports it). Automatically-selected
capabilities, and entries written before the field existed, render unmarked. The next `update` infers
a legacy entry's source: one your archetypes still select becomes `auto`; one they do not select becomes
`manual` and follows the same preserve-or-drop rule. See
[`capabilities[].source`](../reference/pharn-config.md#capabilitiessource--selection-provenance).

Nothing is ever written, fetched, or cloned — and `list` never takes the project lock, so it is safe to
run while an `init`/`add`/`remove`/`update` is in flight. To see what more you could add, use `pharn add
<capability>`; for version currency and drift, use [`pharn status`](status.md).

## JSON output

`pharn list --json` prints the inventory as **one JSON object** on stdout and nothing else; on failure
stdout is empty, the reason goes to stderr and the exit code is 1. It is unversioned: it has no
`schemaVersion`. Its keys and a real example are in the
[JSON output reference](../reference/json-output.md#list).

## Related

- [add](add.md)
- [status](status.md)
- [pharn.config.json](../reference/pharn-config.md)
