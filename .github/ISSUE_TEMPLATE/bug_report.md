---
name: Bug report
about: A pharn command (init, add, remove, update, list, status, uninstall) behaves wrong
title: '[bug] '
labels: bug
assignees: ''
---

## What happened

A clear description of the bug.

## Which part of the CLI

- **Command and options**: <!-- e.g. pharn init --dry-run, pharn update --force, pharn status --strict -->
- **Area**: <!-- e.g. archetype detection, capability selection, download/extract, overwrite prompt, backup, drift report, pharn.config.json / pharn.records.json -->
- **`pharn` version** (`npx @pharn-dev/pharn --version`, or `pharnVersion` in `pharn.config.json`):
- **Skills version** (`skillsVersion` in `pharn.config.json`) and channel (`ref` in `pharn.config.json`; absent means `main`):
- **Archetypes and layout** (`archetypes` and `layout` in `pharn.config.json`, or the `pharn list` output):

## Steps to reproduce

1.
2.
3.

## Expected behavior

What you expected to happen.

## Actual behavior

What actually happened. Paste the relevant CLI output (run with `PHARN_DEBUG=1` for full error detail, and redact any secrets/PII).
If it is about what an `update` would change, the output of `pharn update --dry-run` (or `pharn status`) helps most.

## Environment

- Node.js version (`node --version`):
- npm version (`npm --version`):
- OS:
- Install method: <!-- npx @pharn-dev/pharn | global install | npm run dev -->
- Target project: <!-- what kind of project (framework, monorepo?), and was PHARN installed before? -->

## Additional context

Anything else that helps — your `pharn.config.json`, whether a proxy is involved, or whether the download from GitHub failed.
