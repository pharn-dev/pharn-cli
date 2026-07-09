# Troubleshooting

## Exit codes

| Situation | Exit code |
| --------- | --------- |
| Prerequisite failure (no `.git`, or a selected stack pack's required package is missing) | 1 |
| Module catalog / install failure | 1 |
| Unknown command | 1 |
| `add` / `update` with no `pharn.config.json` | 1 |
| User cancel at summary, or overwrite declined | 0 |
| Successful install | 0 |

## Prerequisites failed

### Stack-pack prerequisite missing

When you select a stack pack, every package it declares as a prerequisite must already be in your `package.json` (`dependencies` or `devDependencies`). If any are missing, the CLI prints each one's `reason` and exits with code **1**. The exact wording is defined by the manifest (PHARN owns it), so it may differ from the example below, and multiple missing packages are listed together. For `pharn-stack-nextjs`, for instance:

```text
✗ pharn-stack-nextjs targets Next.js. Run: npx create-next-app@latest
  Then re-run: npx pharn init
```

Install the package and re-run — or pick a different stack pack, or **None**. The check is conditional on your choice: a no-pack (or non-Next) install has no package prerequisite. The same gate runs for [`pharn add <stack-pack>`](commands/add.md) (its hint says `npx pharn add …`), so a pack can't bypass it by being added after init.

### Git not found

The CLI message says "git not found" but the check is for a **`.git` directory**, not the `git` binary:

```text
✗ git not found.
  Run: git init && git add -A && git commit -m 'init'
  Then re-run: npx pharn init
```

Exits with code **1**.

### Monorepos / workspaces

`pharn init` checks the **current directory** for a `.git` directory, reads the `package.json` there for any stack-pack prerequisites, and installs `.claude/` there. It does not walk up to a workspace root or into workspace packages. In a monorepo, run it from the directory that contains both `.git` and the app's `package.json`. Split layouts (`.git` at the root, the app's `package.json` in `apps/web/`) are unsupported in v1.

## Fresh-project warnings

Not errors. Confirm to continue or cancel to exit cleanly (code 0).

Checks run in order; only the first matching rule applies:

| Warning | Cause |
| ------- | ----- |
| Significant history | 6+ commits on `HEAD` (stops here; no 2+ warning) |
| Existing commits | 2–5 commits |
| Customized scaffold | 0–1 commits but > 3 unrecognized files |

## Module catalog could not be loaded

Symptoms:

- Spinner stops with "Failed to load module catalog"
- Message references `github.com/pharn-dev/pharn-oss`
- Exit code 1

The wizard fetches `manifest.json` from `raw.githubusercontent.com/pharn-dev/pharn-oss/main/manifest.json`. Check network access to GitHub and that the repo is reachable.

## Install failed

Symptoms:

- Spinner stops with "Failed to install skills"
- Exit code 1

Causes include a degit clone failure (network/GitHub), a module declaring an `installs` path it doesn't ship, or an unknown constitution variant. Set `PHARN_DEBUG=1` and re-run for the full stack trace:

```bash
PHARN_DEBUG=1 npx pharn init
```

## Overwrite declined

If you decline overwriting `pharn.config.json`, the wizard cancels with exit 0 and nothing is fetched.

## `add` / `update` say to run init first

```text
No pharn.config.json found. Run `pharn init` first.
```

Both commands operate on an already-installed project. Run `pharn init` to create `pharn.config.json`.

## A command rejects an invalid config (does NOT say "run init")

```text
models.default has invalid model "gpt-4" (expected one of opus-4-8, sonnet-5, fable-5, haiku-4-5)
```

If `pharn.config.json` **exists but was hand-edited into an invalid state**, `add` / `status` /
`update` / `remove` / `list` print the loud, specific error above (naming the offending field) and
exit non-zero — they do **not** say to run `pharn init` (the file is there; re-running init would
offer to clobber your edits). Fix the named field and re-run. The `models` / `seam` blocks reject an
out-of-enum value, an unknown key (e.g. a typo'd `stgaes` / `haltOnUnknwon`), a duplicate
`resolutionOrder` step, or a `modelConfidenceThreshold` with no `model` step to gate.

## Unknown command

```text
Unknown command: ...
```

Run `pharn --help`. Valid commands: `init`, `add`, `update`.

## Local development issues

| Problem | Fix |
| ------- | --- |
| `pharn` not found after editing CLI | `npm run build:install-local` from `pharn-cli/` |
| Type errors in tests | `npm run typecheck` |
| Stale dist | `npm run build` |

See [Contributing](../CONTRIBUTING.md).

## Related

- [Getting started](getting-started.md)
- [init command](commands/init.md)
- [pharn.config.json](reference/pharn-config.md)
