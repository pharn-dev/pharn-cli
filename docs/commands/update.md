# pharn update

Update the modules already installed in your project to the latest skills version.

```bash
pharn update
```

## Behavior

1. Reads `pharn.config.json`. If none exists, exits with a hint to run `pharn init` first.
2. Fetches the latest `manifest.json` and compares its `skillsVersion` and per-module versions against what's pinned in your config.
3. If nothing changed, reports "Already up to date" and exits.
4. Otherwise shows a diff (skills version + per-module version changes) with a pointer to `CHANGELOG.md`, and asks for confirmation.
5. On confirm, re-fetches your installed modules at the latest version, copies them into `.claude/`, and updates `pharn.config.json`.

For `schemaVersion 2` installs, `update` also re-resolves your `installedSkills` against the new manifest. A recorded skill whose source path no longer exists upstream (moved or renamed) is **reported and skipped** — never guessed at a new location — and dropped from `installedSkills`. Your `stackAnswers` are left untouched.

`CONSTITUTION.md` is left untouched — it is human-edited only. Review breaking changes in [pharn-oss `CHANGELOG.md`](https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md) before updating.

## Related

- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion` and `modules` fields
- [add](add.md)
