# PLAN — publish-tarball-path

The 0.6.0 release run failed in the `publish` job: `npm publish "pkg/pharn-dev-pharn-0.6.0.tgz"`.
npm treats an argument as a local file only when it starts with `./`, `../`, `/` or `~/`; a bare
`pkg/x.tgz` matches the GitHub `owner/repo` shorthand, so npm ran
`git ls-remote ssh://git@github.com/pkg/pharn-dev-pharn-0.6.0.tgz.git` and died on
`Permission denied (publickey)`. Nothing reached the registry (npm still lists 0.5.0 as latest).

## Files

- `.github/workflows/publish.yml` — publish `./pkg/pharn-dev-pharn-${VERSION}.tgz` (explicit file path)
- `tests/publish-workflow.test.ts` — pins that every `.tgz` passed to `npm publish`/`npm install` in
  publish.yml is an explicit file path (publish.yml runs only on a Release, so no PR check executes it)
