# Troubleshooting

## Exit codes

| Situation | Exit code |
| --------- | --------- |
| Prerequisite failure (no `.git`) | 1 |
| Capability fetch / install failure | 1 |
| Unknown command | 1 |
| `add` / `update` / `remove` / `list` / `status` with no `pharn.config.json` (or a pre-archetype config) | 1 |
| User cancel at summary, or overwrite declined | 0 |
| Successful install | 0 |

## Prerequisites failed

`pharn init` has one prerequisite — a git repository. There is no stack-pack or package prerequisite:
archetype detection reads `package.json` names and the file tree, and installs whatever capabilities
apply.

### Git not found

The CLI message says "git not found" but the check is for a **`.git` directory**, not the `git` binary:

```text
✗ git not found.
  Run: git init && git add -A && git commit -m 'init'
  Then re-run: npx pharn init
```

Exits with code **1**.

### Monorepos / workspaces

`pharn init` checks the **current directory** for a `.git` directory, reads the `package.json` there for archetype detection, and installs into that directory. It does not walk up to a workspace root or into workspace packages. In a monorepo, run it from the directory that contains both `.git` and the app's `package.json`. Split layouts (`.git` at the root, the app's `package.json` in `apps/web/`) are unsupported in v1.

## Fresh-project warnings

Not errors. Confirm to continue or cancel to exit cleanly (code 0).

Checks run in order; only the first matching rule applies:

| Warning | Cause |
| ------- | ----- |
| Significant history | 6+ commits on `HEAD` (stops here; no 2+ warning) |
| Existing commits | 2–5 commits |
| Customized scaffold | 0–1 commits but > 3 unrecognized files |

## Capabilities could not be fetched

Symptoms:

- Spinner stops with "Failed to fetch PHARN" / "Failed to fetch capabilities"
- Message references `github.com/pharn-dev/pharn-oss`
- Exit code 1

`init` / `add` / `update` degit-clone `pharn-dev/pharn-oss`; `update` and `status --no-drift` also fetch the root `SKILLS_VERSION` from `raw.githubusercontent.com`. Check network access to GitHub and that the repo is reachable.

## Install failed

Symptoms:

- Spinner stops with "Failed to install capabilities"
- Exit code 1

Causes include a degit clone failure (network/GitHub), or a selected capability missing at its expected path (`<subtree>/<name>/<name>.md`) in the fetched repo. Set `PHARN_DEBUG=1` and re-run for the full stack trace:

```bash
PHARN_DEBUG=1 npx pharn init
```

## Overwrite declined

If you decline overwriting `pharn.config.json`, the wizard cancels with exit 0 and nothing is fetched.

## `add` / `update` say to run init first

```text
No pharn.config.json found. Run `pharn init` first.
```

All non-`init` commands operate on an already-installed project. Run `pharn init` to create `pharn.config.json`.

### Legacy (pre-archetype) config

```text
This project uses the legacy module layout (pre-archetype), which is no longer supported. Re-run `pharn init` to reinstall with the archetype/capability model.
```

If your `pharn.config.json` predates the archetype model (it has `modules` but no `capabilities`), the module/manifest install path it relied on has been removed (live pharn-oss ships no `manifest.json`). Re-run `pharn init` to reinstall using archetype detection.

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

Run `pharn --help`. Valid commands: `init`, `add`, `remove`, `update`, `list`, `status`.

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
