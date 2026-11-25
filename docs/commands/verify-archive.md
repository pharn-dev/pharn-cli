# pharn verify-archive

Check a **local** pharn-oss `.tar.gz` the way `pharn init` and `pharn update` check a download, without
installing anything. It exists so that pharn-oss CI can find out that a commit would install before
that commit is tagged as a release. It makes **no network request**, needs no project and takes no lock.
Its only write is one temporary directory, which it removes whether the check passes or fails.

```bash
pharn verify-archive pharn-oss.tar.gz                           # does an install accept these bytes?
pharn verify-archive pharn-oss.tar.gz --expect-version 7.25.6   # ...and is SKILLS_VERSION 7.25.6?
```

## The archive must have one top-level directory

`pharn` reads archives shaped like GitHub's codeload tarballs: a pax global header, then everything under
one root directory (`pharn-oss-<sha>/`). A plain `git archive HEAD` puts its entries at the top level. The
extractor refuses a file it reads that has no directory above it (`tar entry has no path below the archive
root`), and the check fails with a message that names the fix. Build the archive with a prefix:

```bash
git archive --prefix=pharn-oss/ --format=tar.gz -o pharn-oss.tar.gz HEAD
```

The prefix is required on purpose. The install path removes the first path component and requires every
installed entry to share it. A mode that accepted a rootless archive would run a selection the install
path never runs, so a pass would no longer mean that an install accepts the bytes. codeload builds its
tarballs with `git archive` too, so a prefixed local archive goes through the same checks a download does.

## What it checks

It runs the extractor and manifest checks an install runs, in the same order:

1. It reads the file only if it is a regular file of at most **32 MiB** (the download cap). It never
   blocks on a FIFO. A symlink to a file is followed.
2. **First pass:** it unpacks only the four files `pharn` reads itself (`pharn-install.json`,
   `SKILLS_VERSION`, `MIN_CLI`, `.claude/settings.json`). It skips every other entry without writing it,
   whatever its type, so a symlink outside the install list is not a failure.
3. **Tree checks:**
   - `pharn-install.json` must be present (see above).
   - With `--expect-version`, `SKILLS_VERSION` must equal the given version. This is the check an install
     makes against a release tag.
   - `MIN_CLI`, if present, must be a valid version.
4. **The manifest** is validated by the install's one parser: schema, layout, capabilities, file paths
   and destinations.
5. **Second pass:** it unpacks only the paths the manifest lists. Each must be a regular file with a safe
   path, appear once, and not follow a pax or GNU long-name header.
6. **Every listed file's sha256** must match the manifest. A listed file that is missing or altered fails
   the check.
7. **The capability index** is built from the manifest, as an install builds it. If a capability's
   `applies` holds a token this `pharn` does not know, an install skips that capability with a warning.
   `verify-archive` prints the same warning on stderr and still passes.

### Where it differs from an install

- An install warns about an unusable `MIN_CLI` and carries on. `verify-archive` **fails**, because a
  release whose `MIN_CLI` no `pharn` can read has a packaging bug.
- It does not compare `MIN_CLI` with its own version.
- It does not detect archetypes, select capabilities or look at any project, so the destination checks
  (symlinks, records, overwrites) are not run.

## Output and exit codes

On a pass it exits **0** and prints one line naming the file, the number of files `pharn-install.json`
lists, the capability count, `SKILLS_VERSION` and `MIN_CLI`, for example:

```text
pharn-oss.tar.gz: 616 files listed in pharn-install.json, all present and matching their sha256; 35 capabilities; SKILLS_VERSION 7.25.5, as expected; MIN_CLI 0.14.0.
```

It exits **1** in these cases:

| Case                                                    | Message (stderr)                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| The path does not exist                                 | `Cannot verify <path>: it does not exist.`                                                |
| It is a directory, a FIFO or another non-file           | `Cannot verify <path>: it is not a regular file.`                                         |
| It is larger than 32 MiB                                | `Cannot verify <path>: it is larger than 32 MiB.`                                         |
| It is empty                                             | `Cannot verify <path>: it is empty.`                                                      |
| The archive is refused (an entry, the manifest, a hash) | `⚠ Archive <name> refused: <the rule and the entry>`, plus the `PHARN_DEBUG` hint         |
| No root directory (a plain `git archive`)               | `⚠ Archive <name> refused: tar entry has no path below the archive root: …`, then the fix |
| No `pharn-install.json` under one root directory        | `⚠ Archive <name> refused: it holds no pharn-install.json under a single top-level …`     |
| `--expect-version` differs                              | `⚠ Archive <name> refused: it ships SKILLS_VERSION <found>, not <expected> (--expect-…)`  |

`PHARN_DEBUG=1` prints the original error with its stack, as it does for every other command. Paths are
printed with control characters escaped.

## Options

- `--expect-version <version>`: also require the archive's `SKILLS_VERSION` to equal this version, as a
  release install does against its tag. Give it as `X.Y.Z`: a leading `v` is refused. A repeated value is
  refused too.

`verify-archive` takes no other option. `--json` and every other command's options are refused with
``Unsupported option for `verify-archive` `` (exit **1**), and so is a second path.

## For pharn-oss CI

Build the archive from **the same commit that will be tagged**: what passes is that commit's bytes. Pin
the `pharn` version, so the check does not change under you when a new `pharn` ships.

On a pull request or a push, check the commit against its own `SKILLS_VERSION`:

```bash
git archive --prefix=pharn-oss/ --format=tar.gz -o "$RUNNER_TEMP/pharn-oss.tar.gz" HEAD
npx --yes @pharn-dev/pharn@0.22.0 verify-archive "$RUNNER_TEMP/pharn-oss.tar.gz" --expect-version "$(cat SKILLS_VERSION)"
```

In a release job, before the tag is pushed, check the commit against the tag you are about to create
(`TAG=v7.25.6`, for example):

```bash
git archive --prefix=pharn-oss/ --format=tar.gz -o "$RUNNER_TEMP/pharn-oss.tar.gz" HEAD
npx --yes @pharn-dev/pharn@0.22.0 verify-archive "$RUNNER_TEMP/pharn-oss.tar.gz" --expect-version "${TAG#v}"
```

`pharn` needs Node 24.2.0 or newer.

## Related

- [init](init.md) and [update](update.md), which run the same checks on a download
- [Troubleshooting](../troubleshooting.md#verify-archive-says-the-archive-has-no-top-level-directory)
