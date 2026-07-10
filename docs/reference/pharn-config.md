# pharn.config.json

Written to the project root on a successful `pharn init`, and updated by `pharn add` / `pharn update`.
Source: [`pharn-config.ts`](../../src/lib/pharn-config.ts) and
[`install-archetype.ts`](../../src/steps/install-archetype.ts).

PHARN skills in your project read this file at runtime (e.g. to discover the installed
archetypes/capabilities and the pinned commit).

## Top-level fields (archetype install)

| Field           | Type           | Description                                                                    |
| --------------- | -------------- | ------------------------------------------------------------------------------ |
| `pharnVersion`  | string         | Version of the PHARN CLI that ran the install                                  |
| `skillsVersion` | string         | The repo's `SKILLS_VERSION` at the installed commit                            |
| `repo`          | string         | Source repo (`pharn-dev/pharn-oss`)                                            |
| `commit`        | string \| null | Pinned commit SHA of the install; `null` if the SHA was unavailable            |
| `installedAt`   | string         | ISO timestamp of the install / last update                                     |
| `archetypes`    | array          | Detected project archetypes (`ssr` / `backend` / `spa` / `lib`)                |
| `capabilities`  | array          | Installed capabilities, each `{ name, role }` (`role` is `griller` or `lens`)  |
| `layout`        | string         | Install layout mirrored from the clone: `flat` or `pharn` (absent → `flat`)    |
| `modules`       | array          | Always `[]` for an archetype install (the install unit is capabilities)        |
| `models`        | object         | Per-stage model routing ([`model-routing.ts`](../../src/lib/model-routing.ts)) |
| `seam`          | object         | Seam-resolution policy ([`seam-config.ts`](../../src/lib/seam-config.ts))      |

`isArchetypeConfig` treats the presence of a `capabilities` array as the marker of an archetype install.

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
    { "name": "a11y", "role": "griller" },
    { "name": "security", "role": "griller" },
    { "name": "n-plus-one", "role": "lens" }
  ],
  "layout": "flat",
  "modules": []
}
```

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

`init` shows the previous `skillsVersion` before asking.

## Related

- [init command](../commands/init.md)
- [add command](../commands/add.md)
- [update command](../commands/update.md)
