# Getting started

PHARN does not create a Next.js app from scratch. You scaffold with `create-next-app`, initialize git, then run PHARN in that directory.

## Prerequisites

| Requirement | How PHARN checks |
| ----------- | ---------------- |
| Next.js | `next` in `package.json` `dependencies` or `devDependencies` |
| Git | `.git` directory exists in the project root |

If either check fails, the CLI prints fix instructions and exits. See [Troubleshooting](troubleshooting.md).

PHARN works best on **fresh** projects. The wizard may warn when:

- The repo has **6 or more** commits — checked first; repos with 6+ commits do not also see the 2+ warning
- The repo has **2–5** commits (designed for fresh scaffolds)
- There are **0** commits but more than **3** custom files outside known Next.js paths

You can continue after any warning by confirming.

## Running the CLI

The npm package name is **`pharn-cli`**. It installs two equivalent commands: **`pharn`** (preferred) and **`pharn-cli`**.

```bash
npx pharn init
# same entry point
npx pharn-cli init
```

## Quick start

```bash
npx create-next-app@latest my-app
cd my-app
npx shadcn@latest init
git init && git add -A && git commit -m "init"
npx pharn init
```

`pharn` with no subcommand runs `init` (same as `pharn init`).

## The wizard

The wizard adapts to the manifest the CLI fetches. Newer manifests (`schemaVersion 2`) drive the per-tech questions from the manifest itself; older pinned versions (`schemaVersion 1`) use the original three-question flow. The CLI picks the right flow automatically.

### Stack mode (schemaVersion 2)

First you choose a mode:

- **Default** — takes the recommended stack straight from the manifest and asks **no** per-technology questions.
- **Custom** — walks each section (database, ORM, auth, email, payments, …). Options that don't apply are hidden based on earlier answers, some options are relabeled for context, and anything marked **(coming soon)** is shown but not selectable.

Then, regardless of mode, the wizard asks:

1. **Methodology modules** — a multiselect of optional modules (`pharn-pipeline`, `pharn-review`, `pharn-audits`). `pharn-core` is always included.
2. **Stack pack** — a single choice (`pharn-stack-nextjs`, or none). The stack pack pulls in its React base automatically.
3. **Privacy posture** — picks your constitution variant (`gdpr-strict`, `standard`, or `minimal`).
4. **Vendor skills** — for technologies whose skill is published by the vendor (e.g. Supabase), the wizard records your consent to use it. Automatic fetching of those official skills is **Coming soon** ([roadmap](roadmap.md)); for now your choice is recorded in `pharn.config.json` and you install them by hand.

For each answered technology, the CLI copies only the matching skill folder into `.claude/skills/<skill>/` — never the sibling options you didn't pick.

### Three questions (schemaVersion 1)

Against an older pinned manifest, `pharn init` asks just the three module/stack-pack/posture questions above.

Dependencies are resolved from the repo's `manifest.json`, so selecting a stack pack or any module also installs whatever it depends on.

## What you get

After a successful install, your project's `.claude/` contains the selected modules merged together:

| Artifact | Description |
| -------- | ----------- |
| `commands/`, `skills/`, `rules/`, `hooks/` | The slash commands and logic for your chosen modules |
| `skills/<skill>/` | The per-technology skills selected in the wizard (schemaVersion 2) |
| `ai_docs/`, `templates/`, … | Stack-pack reference docs and templates |
| `memory-bank/` | Markdown files that persist project context across sessions |
| `CONSTITUTION.md` | Your chosen constitution variant |
| `pharn.config.json` | `skillsVersion`, commit SHA, installed modules, constitution variant, and (schemaVersion 2) your stack answers + installed skills |

See [pharn.config.json](reference/pharn-config.md) for the exact schema.

## After init

1. Open **Claude Code** in the project directory.
2. Run **`/pharn-plan`** to plan your first feature.

The day-to-day loop: `/pharn-plan → /pharn-grill → /pharn-build → /pharn-verify → /pharn-review → /pharn-ship`.

## Next steps

- Review what was written: [pharn.config.json](reference/pharn-config.md)
- Add a module later: [add command](commands/add.md)
- Refresh to the latest skills: [update command](commands/update.md)
