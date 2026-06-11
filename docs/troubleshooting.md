# Troubleshooting

## Exit codes

| Situation | Exit code |
| --------- | --------- |
| Prerequisite failure (no Next.js or no `.git`) | 1 |
| Module catalog / install failure | 1 |
| Unknown command | 1 |
| `add` / `update` with no `pharn.config.json` | 1 |
| User cancel at summary, or overwrite declined | 0 |
| Successful install | 0 |

## Prerequisites failed

### Next.js not found

```text
✗ Next.js not found.
  Run: npx create-next-app@latest
  Then re-run: npx pharn init
```

Ensure `next` appears in `package.json` `dependencies` or `devDependencies`. Exits with code **1**.

### Git not found

The CLI message says "git not found" but the check is for a **`.git` directory**, not the `git` binary:

```text
✗ git not found.
  Run: git init && git add -A && git commit -m 'init'
  Then re-run: npx pharn init
```

Exits with code **1**.

## Fresh-project warnings

Not errors. Confirm to continue or cancel to exit cleanly (code 0).

Checks run in order; only the first matching rule applies:

| Warning | Cause |
| ------- | ----- |
| Significant history | 6+ commits on `HEAD` (stops here; no 2+ warning) |
| Existing commits | 2–5 commits |
| Customized scaffold | 0 commits but > 3 unrecognized files |

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
