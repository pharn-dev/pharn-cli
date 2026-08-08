# pharn.config.json

Written to the project root on a successful `pharn init`, and updated by `pharn add` / `pharn update`.
Source: [`pharn-config.ts`](../../src/lib/pharn-config.ts) and
[`install-archetype.ts`](../../src/steps/install-archetype.ts).

PHARN skills in your project read this file at runtime (e.g. to discover the installed
archetypes/capabilities and the pinned commit).

## Top-level fields (archetype install)

| Field           | Type           | Description                                                                    |                                                                     |
| --------------- | -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `pharnVersion`  | string         | Version of the PHARN CLI that ran the install                                  |                                                                     |
| `skillsVersion` | string         | The repo's `SKILLS_VERSION` at the installed commit                            |                                                                     |
| `repo`          | string         | Source repo (`pharn-dev/pharn-oss`)                                            |                                                                     |
| `commit`        | string \| null | Pinned commit SHA of the install; `null` if the SHA was unavailable            |                                                                     |
| `installedAt`   | string         | ISO timestamp of the install / last update                                     |                                                                     |
| `archetypes`    | array          | Detected project archetypes (`ssr` / `backend` / `spa` / `lib`)                |                                                                     |
| `capabilities`  | array          | Installed capabilities, each `{ name, role, source? }` — see below             |                                                                     |
| `layout`        | string         | Install layout mirrored from the clone: `flat` or `pharn` (absent → `flat`)    |                                                                     |
| `modules`       | array          | Always `[]` for an archetype install (the install unit is capabilities)        |                                                                     |
| `models`        | object         | Per-stage model routing ([`model-routing.ts`](../../src/lib/model-routing.ts)) |                                                                     |
| `seam`          | object         | Seam-resolution policy ([`seam-config.ts`](../../src/lib/seam-config.ts))      |                                                                     |

`isArchetypeConfig` treats the presence of a `capabilities` array as the marker of an archetype install.

### `capabilities[].source` — selection provenance

Each entry records **how it got there**, which decides who owns it on the next `pharn update`:

| `source`   | Set by                                                            | What `pharn update` does with it                        |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `auto`     | `pharn init`, or `pharn update` when selected for your archetypes | Owns it — drops it if your archetypes stop selecting it |
| `manual`   | `pharn add`, or `pharn update` when inferring legacy provenance   | **Preserves it**, selected or not                       |
| _(absent)_ | a CLI older than this field                                       | Inferred once, on the next `pharn update` (see below)   |

`source` is **optional** — a config written before the field existed simply omits it and still loads.
Absence is never read as a default: it means _provenance unknown_, and only `pharn update` may resolve
it, because that is the one command holding a fresh capability index. On the first update after
upgrading, a source-less entry is inferred **once** — in the resolved set → `auto`, outside it →
`manual` — and written back explicitly. That second half is a **reconstruction, not a recovered fact**:
such an entry was either added by hand, or auto-selected by an older index and since de-selected
upstream, and nothing offline distinguishes the two. Tagging it `manual` is the fail-safe direction —
it is then kept if the capability still exists upstream, and dropped (with a named report line) if it
does not. `pharn remove` warns about re-adds for a literal `auto` only, and stays silent on an absent
value rather than guess.

A `source` present but outside `{auto, manual}` is a hand-edit error: `pharn` reports it by name
(`capabilities[2].source`) and exits, rather than falling back to "run `pharn init`". Deleting the
field is a valid fix — the next update sets it.

> Re-running `pharn init` on an existing project is an explicit **start-over**: it rewrites
> `capabilities` from scratch, so every entry becomes `auto` and previous `manual` tags are lost.
> `init` warns before overwriting `pharn.config.json` and defaults to **No**. Use `pharn update` to
> refresh an existing install; `init` is for installing one.

A sibling file, [`pharn.records.json`](pharn-records.md), holds a sha256 per installed file. It is
written by the same operations that write this config and is **stamped** with this file's
`skillsVersion` + `commit`; if the two disagree, `pharn update` treats the store as unavailable —
present files that differ are skipped (`unverifiable`), but **missing** files are still restored.
Re-run `pharn update` once both files agree, or pass `--force` to back up and overwrite differences.
The hash map lives there rather than here so this file stays small and hand-editable.

Note that `skillsVersion` / `commit` describe the last **complete** install: a `pharn update` that
skipped any file deliberately leaves them at their previous values (see [update](../commands/update.md)).

## Example

```json
{
  "pharnVersion": "0.2.0",
  "skillsVersion": "1.0.0",
  "repo": "pharn-dev/pharn-oss",
  "commit": "daa06788…",
  "installedAt": "2026-06-11T00:00:00.000Z",
  "archetypes": ["ssr", "backend"],
  "capabilities": [
    { "name": "a11y", "role": "griller", "source": "auto" },
    { "name": "security", "role": "griller", "source": "auto" },
    { "name": "n-plus-one", "role": "lens", "source": "manual" }
  ],
  "layout": "flat",
  "modules": []
}
```

## Model routing

The `models` block routes each dev-loop stage to a model + effort. It is **written on every fresh
install** and is **user-owned afterwards** — edit it in `pharn.config.json` and re-run your stages;
`pharn` never migrates it. Source of truth: [`model-routing.ts`](../../src/lib/model-routing.ts).

The block is a required `default` plus per-stage overrides under `stages`. `default` is the fallback
for every stage without its own entry (`grill`, `build`, `regress`, `verify`, `ship`); a stage with no
entry — including an empty `stages` — resolves to `default`.

Defaults written at install:

| Stage     | Model      | Effort |
| --------- | ---------- | ------ |
| `default` | `sonnet-5` | `high` |
| `plan`    | `opus-4-8` | `max`  |
| `review`  | `opus-4-8` | `high` |

**Why `review` is `opus-4-8`/`high`, not `fable-5`/`max`.** Review is the fan-out stage — a backend
install ships ~22 lenses, so its cost multiplies per lens; a premium model at `max` effort across that
fan-out is the worst-case token multiplier, and it would apply silently. `opus-4-8`/`high` is the
spend-safe default. Cross-model review on `fable-5`/`max` has proven catch value, so it is a
**documented opt-in** for release audits — set it explicitly under `models.stages.review`:

```json
{
  "models": {
    "default": { "model": "sonnet-5", "effort": "high" },
    "stages": {
      "plan": { "model": "opus-4-8", "effort": "max" },
      "review": { "model": "fable-5", "effort": "max" }
    }
  }
}
```

Valid `model` ids: `opus-4-8`, `sonnet-5`, `fable-5`, `haiku-4-5`. Valid `effort` levels: `low`,
`high`, `max`. A hand-edit with an unknown model, effort, or stage key is rejected loudly on the next
command — see [troubleshooting](../troubleshooting.md); `pharn` never silently falls back.

## Legacy fields (pre-archetype configs still load)

The schema is **additive** (P7): a `pharn.config.json` written by an older, module-based CLI still loads,
and its now-unused fields are preserved on read.

| Field             | Type   | Note                                                             |
| ----------------- | ------ | ---------------------------------------------------------------- |
| `constitution`    | string | Legacy constitution variant (`gdpr-strict`/`standard`/`minimal`) |
| `installedSkills` | array  | Legacy per-technology skills, each `{ skill, from }`             |
| `stackAnswers`    | object | Legacy wizard answers, `questionId → value`                      |

The module/manifest install path itself has been **removed**, so `add` / `update` / `remove` / `list` /
`status` no longer operate on a pre-archetype config — they exit with a message pointing you to re-run
`pharn init`.

## Overwrite behavior

| Command          | Existing `pharn.config.json` | Prompt                                               | If declined             |
| ---------------- | ---------------------------- | ---------------------------------------------------- | ----------------------- |
| `init`           | present                      | "Overwrite existing pharn.config.json?" (default no) | Cancel install (exit 0) |
| `add` / `update` | required (archetype)         | none — updated in place                              | n/a                     |

For the files PHARN installs (as opposed to this config), `update` never overwrites one you have
edited unless you pass `--force` — see the [update decision table](../commands/update.md#the-decision-table).

`init` shows the previous `skillsVersion` before asking.

## Related

- [init command](../commands/init.md)
- [add command](../commands/add.md)
- [update command](../commands/update.md)
- [pharn.records.json](pharn-records.md)
