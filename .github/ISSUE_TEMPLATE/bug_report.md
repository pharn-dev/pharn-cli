---
name: Bug report
about: Something in the pharn CLI (init wizard, module install, config output) behaves wrong
title: "[bug] "
labels: bug
assignees: ""
---

## What happened

A clear description of the bug.

## Which part of the CLI

- **Command**: <!-- pharn init | pharn add | pharn update -->
- **Step / area**: <!-- e.g. prereqs check, fresh-check, custom-mode wizard, vendor-consent, install/clone, pharn.config.json output -->
- **`pharn` version** (`npx pharn --version`, or `pharnVersion` in `pharn.config.json`):
- **Skills version** (`.claude/SKILLS_VERSION`, or `skillsVersion` in `pharn.config.json`):

## Steps to reproduce

1.
2.
3.

## Expected behavior

What you expected to happen.

## Actual behavior

What actually happened. Paste the relevant CLI output (run with `PHARN_DEBUG=1` for full error detail, and redact any secrets/PII).

## Environment

- Node.js version (`node --version`):
- npm version (`npm --version`):
- OS:
- Install method: <!-- npx pharn | global install | npm run dev -->
- Target project: <!-- fresh Next.js scaffold? which Next.js version? -->

## Additional context

Anything else that helps — your stack choices, the generated `pharn.config.json`, or whether a network/manifest fetch was involved.
