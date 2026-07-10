# pharn update

Re-fetch the capabilities installed in your project at the latest skills version.

```bash
pharn update
```

## Behavior

1. Reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config — it exits with
   a hint to run `pharn init` first.
2. Fetches the latest `SKILLS_VERSION` from `pharn-dev/pharn-oss@main` (a lightweight check, no clone)
   and compares it to your recorded `skillsVersion`.
3. If they match, reports "Already up to date" and exits.
4. Otherwise shows the version bump with a pointer to `CHANGELOG.md`, and asks for confirmation.
5. On confirm, clones the repo (SHA-pinned), **re-resolves your recorded `archetypes`** against the
   latest capability index, re-copies the resulting capabilities into the mirrored layout, and updates
   `pharn.config.json` (`skillsVersion`, `commit`, `capabilities`).

Because `update` re-resolves your archetypes against the latest index, a capability upstream added for
one of your archetypes since your last install is picked up, and one it removed is dropped — your
`archetypes` list itself is never changed.

`CONSTITUTION.md` is left untouched — it is human-edited only. Review breaking changes in
[pharn-oss `CHANGELOG.md`](https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md) before
updating.

## Related

- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `archetypes`, `capabilities`
- [add](add.md)
- [status](status.md)
