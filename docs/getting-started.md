# Getting started

PHARN does not scaffold your app. You create your project (e.g. with `create-next-app`), initialize git, then run PHARN in that directory.

## Prerequisites

| Requirement | How PHARN checks                              | When                                        |
| ----------- | --------------------------------------------- | ------------------------------------------- |
| Git         | A `.git` directory exists in the project root | Always — checked up front, before detection |

`.git` is required for every install. `pharn init` then detects your project's archetype(s) from
`package.json` dependency names plus a bounded file-tree scan — there is no stack-pack selection and no
package prerequisite to satisfy. See [Troubleshooting](troubleshooting.md).

PHARN installs **into your existing project**. Just before writing, `pharn init` checks which of its
actual install targets (the selected capability dirs, the product commands/hooks, `pharn-contracts/`,
the floor checkers, the constitution, and `pharn.config.json`) already exist in your project. If any
do, it lists them and asks you to confirm before overwriting — default **no**; if none do, there is no
prompt at all. Your `.claude/settings.json` is never overwritten, so it is not part of the check.

## Running the CLI

The npm package name is **`@pharn-dev/pharn`**. It installs a single command, **`pharn`**.

```bash
npx @pharn-dev/pharn init
```

## Quick start

```bash
npx create-next-app@latest my-app
cd my-app
npx shadcn@latest init
git init && git add -A && git commit -m "init"
npx @pharn-dev/pharn init
```

`pharn` with no subcommand runs `init` (same as `pharn init`).

## The install flow

`pharn init` is archetype-driven — there is no questionnaire:

1. **Detect archetypes.** The CLI merges your `package.json` dependency names with a bounded,
   symlink-safe file-tree scan (names only, never file bodies) into an archetype set — `ssr`, `backend`,
   `spa`, `lib` (a project may match several, e.g. Next + Express → `ssr` + `backend`). It shows what it
   detected.
2. **Fetch + resolve.** It degit-clones `pharn-dev/pharn-oss` at a pinned SHA and selects the
   capabilities whose `applies` is `universal` or intersects your detected archetypes — skipping the rest
   with a reason.
3. **Confirm + install.** After a summary (selected + skipped), it copies the selected capabilities plus
   the fixed product surfaces (commands, hooks, contracts, floor checkers, and the canonical
   constitution) into the mirrored layout and writes `pharn.config.json`.

To add a capability the detection didn't select — or remove one it did — use
[`pharn add`](commands/add.md) / [`pharn remove`](commands/remove.md) afterward.

## What you get

After a successful install, your project contains the selected capabilities plus the fixed product
surfaces:

| Artifact                                                  | Description                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pharn-pipeline/grillers/<name>/`, `pharn-review/<name>/` | The installed grillers + lenses (flat layout; or the same under `pharn/`)                |
| `.claude/commands/`                                       | The `pharn-*` product slash commands                                                     |
| `.claude/hooks/`                                          | The deterministic `.cjs` floor hooks                                                     |
| `pharn-contracts/`, `.dev/floor/`                         | Inter-layer schemas + the floor checkers the commands invoke                             |
| `CONSTITUTION.md`                                         | The canonical PHARN constitution, copied verbatim                                        |
| `pharn.config.json`                                       | `skillsVersion`, commit SHA, detected archetypes, installed capabilities, and the layout |
| `pharn.records.json`                                      | Per-file sha256 — skips unproven present edits, restores missing; `--force` overwrites   |

See [pharn.config.json](reference/pharn-config.md) and
[pharn.records.json](reference/pharn-records.md) for the exact schemas. **Commit both** — they are
your project's PHARN state.

## After init

1. Open **Claude Code** in the project directory.
2. Run **`/pharn-spec`** to capture your first feature's intent — it pins the scope and feeds `/pharn-plan`. That's the recommended first step; for a small, well-scoped change you can go straight to **`/pharn-plan`**.

The day-to-day loop: `/pharn-plan → /pharn-grill → /pharn-build → /pharn-regress → /pharn-verify → /pharn-review → /pharn-ship` (begin with `/pharn-spec` to capture intent — it feeds `/pharn-plan`).

## Next steps

- Review what was written: [pharn.config.json](reference/pharn-config.md)
- Add a capability later: [add command](commands/add.md)
- Refresh to the latest skills: [update command](commands/update.md)
