# pharn.config.json

Written to the project root on successful `pharn init` install, and updated by `pharn add` / `pharn update`. Source: [`pharn-config.ts`](../../src/lib/pharn-config.ts) and [`install.ts`](../../src/steps/install.ts).

PHARN skills in your project read this file at runtime (e.g. to discover the installed module set or pinned commit).

## Top-level fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `pharnVersion` | string | Version of the PHARN CLI that ran the install |
| `skillsVersion` | string | `skillsVersion` from the repo's `manifest.json` at the installed commit |
| `repo` | string | Source repo (`pharn-dev/pharn-oss`) |
| `commit` | string \| null | Pinned commit SHA of the install; `null` if the GitHub API was unavailable |
| `constitution` | string | Chosen variant: `gdpr-strict`, `standard`, or `minimal` |
| `modules` | array | Installed modules (resolved, incl. dependencies), each `{ name, version }` |
| `installedAt` | string | ISO timestamp of the install / last update |
| `stackAnswers` | object | _schemaVersion 2 only._ Wizard answers, `questionId → value` (including `"skip"`) |
| `installedSkills` | array | _schemaVersion 2 only._ Per-technology skills copied into `.claude/skills/`, each `{ skill, from }` (`from` is the repo-relative source path) |
| `vendorSkills` | array | _schemaVersion 2 only._ Vendor official skills you consented to (external fetch is [Coming soon](../roadmap.md)) |

The three `schemaVersion 2` fields are **additive** — installs against an older (`schemaVersion 1`) manifest omit them entirely, and existing configs stay valid.

## Example

```json
{
  "pharnVersion": "0.2.0",
  "skillsVersion": "0.69.0",
  "repo": "pharn-dev/pharn-oss",
  "commit": "daa06788…",
  "constitution": "standard",
  "modules": [
    { "name": "pharn-core", "version": "0.2.0" },
    { "name": "pharn-stack-react", "version": "0.1.1" },
    { "name": "pharn-stack-nextjs", "version": "0.30.0" },
    { "name": "pharn-pipeline", "version": "0.5.0" },
    { "name": "pharn-review", "version": "0.4.0" },
    { "name": "pharn-audits", "version": "0.11.1" }
  ],
  "installedAt": "2026-06-11T00:00:00.000Z"
}
```

The `modules` array lists the **resolved** set: your explicit selections plus every transitive dependency, in install order (dependencies before dependents).

### schemaVersion 2 example (added fields)

```json
{
  "stackAnswers": {
    "database": "supabase",
    "orm": "drizzle",
    "auth": "better-auth",
    "email": "resend",
    "payments": "skip"
  },
  "installedSkills": [
    { "skill": "drizzle", "from": "pharn-skills-orm/skills/drizzle" },
    { "skill": "better-auth", "from": "pharn-skills-auth/skills/better-auth" },
    { "skill": "resend", "from": "pharn-skills-email/skills/resend" }
  ],
  "vendorSkills": ["supabase"]
}
```

`stackAnswers` records every answered question (including `"skip"`); `installedSkills` records only what was actually copied. Both are used by `pharn add` (dedupe / conflict detection) and `pharn update` (skill re-resolution).

## Overwrite behavior

| Command | Existing `pharn.config.json` | Prompt | If declined |
| ------- | ---------------------------- | ------ | ----------- |
| `init` | present | "Overwrite existing pharn.config.json?" (default no) | Cancel install (exit 0) |
| `add` / `update` | required | none — updated in place | n/a |

`init` shows the previous `skillsVersion` before asking.

## Related

- [init command](../commands/init.md)
- [add command](../commands/add.md)
- [update command](../commands/update.md)
