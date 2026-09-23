# PLAN — release 0.5.1

- increment: Cut `@pharn-dev/pharn@0.5.1` — bump `package.json` / `package-lock.json` version,
  fold the post-0.5.0 `@clack/prompts` runtime bump into `CHANGELOG.md`, refresh compare links,
  then open the PR and cut the `v0.5.1` GitHub Release (which triggers `publish.yml`).
- layer(s): repo-meta — version + release notes only. No `src/**` / `tests/**` changes in this
  increment (the clack type narrowing already landed on `main` via #193).
- constitution_refs: [P7]

## Files

- `package.json` — `"version": "0.5.0"` → `"0.5.1"` — layer repo-meta
- `package-lock.json` — root package version stamp `0.5.0` → `0.5.1` — layer repo-meta
- `CHANGELOG.md` — new `## [0.5.1] — 2026-09-24` section documenting the `@clack/prompts`
  `^1.7.0` → `^1.8.1` bump; repoint `[Unreleased]` / add `[0.5.1]:` compare links — layer repo-meta
