# PLAN — core-387-verify-archive (Linear CORE-387, epic CORE-380)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: a new read-only command `pharn verify-archive <file.tar.gz> [--expect-version X.Y.Z]` that runs the
  install path's own `extractPharnArchive` (both passes, manifest validation, every listed file's sha256) over a LOCAL
  archive, with no network, no project, no lock, into one private temp dir it always removes; exit 0 with a short
  summary, exit 1 naming the entry and rule.
- base: `origin/feat/core-386-unpack-listed-paths-only` @ ecd7422f (CORE-386, PR #448; stacked, merged forward with
  `git merge`, never rebased). Branch `feat/core-387-verify-archive`.
- layer(s): CLI source (`src/commands/verify-archive.ts` new, `src/lib/cli-args.ts`, `src/index.ts`,
  `src/lib/repo.ts`, `src/lib/skills-version.ts`), tests, docs. No trusted doc changes; no protected file.
- version: 0.22.0 (minor: a new command) + a CHANGELOG `[0.22.0]` section.
- constitution_refs: [P0, P2, P3, P4, P5, P7]

## Why

pharn-oss v7.25.3–v7.25.5 shipped archives no pharn could install, and nothing in pharn-oss CI could tell before the
tag. CORE-386 made the extractor take a buffer (`extractPharnArchive(archive, dir, checkTree?)`) precisely so a local
file can go through the exact walk a download does. This increment exposes it as a command pharn-oss CI can run on a
`git archive` of the commit about to be tagged.

## Decisions

1. **Root directory: REQUIRED (no rootless mode). The documented pharn-oss CI command is**
   `git archive --prefix=pharn-oss/ --format=tar.gz -o pharn-oss.tar.gz HEAD`.
   Why: the 386 extractor's selection key strips everything up to the first `/` (codeload's `pharn-oss-<sha>/`), and
   its path rules require one shared root. A plain `git archive HEAD` has top-level entries (`pharn-install.json`
   has no `/`, so it is never selected, and `.claude/settings.json` keys as `settings.json`). Accepting that would
   need a second path-selection branch in the security-sensitive extractor that the install path never takes, so a
   pass would no longer prove "the install would accept these bytes" — the point of the command. `--prefix` makes
   the local archive codeload-shaped (pax global header, one root dir, same tar writer: codeload is `git archive`),
   so the exact install walk runs. The install path's rules are untouched.
   A rootless archive (or any archive without a manifest under one root) fails with a verify-specific message that
   names the `--prefix` command, instead of the install path's "older than 7.21.0" text: the command's `checkTree`
   (which `extractPharnArchive` runs after pass 1, before the manifest parse) checks that pass 1 wrote
   `pharn-install.json`. The Done-when line "a git archive --format=tar.gz HEAD of pharn-oss main" is satisfied by
   that line plus `--prefix=pharn-oss/`; the docs and the PR say so plainly.
2. **Option `--expect-version <version>`** (verify-archive only, value option, repeated → refused by the existing
   rule). VERSION_RE-validated in `parseCliArgs` (bad value → `Invalid value for --expect-version …`, exit 1, before
   anything runs). When given, the tree's SKILLS_VERSION must equal it — the release check `fetchAt` runs for a
   release, at the same point (after pass 1, before the manifest parse). No leading `v` is accepted (strict; docs show
   `${TAG#v}`).
3. **Shared helper, not a copy:** `skills-version.ts` gains `assertSkillsVersion(repoDir, expected, refusal)`
   (reads with `readSkillsVersion`, throws `ManifestValidationError(refusal(found))` on a mismatch). `fetchAt`
   calls it with its current message (byte-identical), the command with its own.
4. **No `--json`** (P7): pharn-oss CI gates on the exit code; the one-line summary and the stderr reason are enough.
   Recorded as a possible follow-up, not built.
5. **Temp dir lifecycle lives in `repo.ts`** (`verifyLocalArchive(archive, checkTree)`): `mkdtemp` is banned outside
   repo.ts/tar-extract.ts by the clone-producer eslint rule, and repo.ts owns the exit/fatal-signal cleanup registry
   (`liveClones` + `installCleanupHandlers`). It creates `pharn-verify-*`, registers it, calls
   `extractPharnArchive`, and removes + deregisters it in a `finally` (pass and fail). The tree is never returned.
6. **Input read:** `readBoundedFile(path, MAX_ARCHIVE_BYTES)` (bounded-read.ts unchanged: `O_NONBLOCK`, fstat
   regular-file, cap, read-to-EOF-under-cap). `MAX_ARCHIVE_BYTES` (32 MiB, the download cap) is exported from
   repo.ts. A symlinked input file is followed (the user's own file), as for the config.
7. **Output and errors** (all through `CliError`, exit 1; the path printed via `escapeUnsafe`, and `logError`'s
   strip on top):
   - missing/unreadable/not-a-file/too-large/empty input → `CliError.error` (a precondition the user fixes; one line):
     `Cannot verify <path>: it does not exist.` / `… <path> is not a regular file` / `… is larger than 32 MiB`.
   - archive refusal (`TarExtractError`, `ManifestValidationError` incl. `UpstreamManifestError`, and the
     expect-version mismatch) → `CliError.failure(err, { message: 'Archive <name> refused: <err.message>' })`, so
     PHARN_DEBUG=1 dumps the original error as every fetching command does; without it, the one PHARN_DEBUG hint.
   - anything else (an fs error writing the temp tree) → `CliError.failure(err)` likewise.
   - pass → clack `intro('pharn verify-archive')`, `log.success('<name>: <N> files listed in pharn-install.json, all
     present and matching their sha256; SKILLS_VERSION <v>')` (+ `, as expected` with the option), `outro` dim
     "Nothing was installed; the temporary directory was removed." Ref-free (no tag/sha claims).
8. **No Node-floor gate, no MIN_CLI gate, no lock, no proxy notice**: nothing is installed and nothing fetched.

## Files

- `src/commands/verify-archive.ts` — NEW: `runVerifyArchive({ file, expectVersion })`: bounded read, the checkTree
  (manifest present → else the `--prefix` refusal; then `assertSkillsVersion` when asked), `verifyLocalArchive`,
  summary/errors. Imports only lib/ (P3).
- `src/lib/repo.ts` — export `MAX_ARCHIVE_BYTES`; new exported `verifyLocalArchive(archive, checkTree)`; `fetchAt`'s
  release check calls `assertSkillsVersion` (same message).
- `src/lib/skills-version.ts` — `assertSkillsVersion(repoDir, expected, refusal)`.
- `src/lib/cli-args.ts` — `verify-archive` in COMMANDS (`args: '<file.tar.gz>'`, a summary and page text);
  `expect-version` in OPTIONS (`uses: verify-archive`); `Invocation` variant; parse: the positional is required
  (`verify-archive needs the path of a .tar.gz archive`, refused), VERSION_RE check.
- `src/index.ts` — dispatch case (dynamic import, as the others).
- `tests/commands/verify-archive.test.ts` — NEW, via `useHarness` + tar-fixture: pass on a good archive; pass with an
  unlisted symlink, hard link and pax header (the v7.25.5 shape) and nothing of them left anywhere; fail naming the
  entry for a listed file whose bytes differ from its sha256; a symlink at a listed path (`unsupported type '2'` +
  path); no manifest (and the rootless archive) → the `--prefix` message; `--expect-version` match and mismatch;
  input that is a directory, a FIFO (`execFileSync('mkfifo')`, the pattern tests/bounded-read.test.ts already uses;
  POSIX-only, skipped on win32), oversize (sparse file via `truncateSync` over 32 MiB), empty, nonexistent;
  path with a control character printed escaped; `fetchStub` never called in any case; the temp dir (TMPDIR pointed
  at a watched dir via `watchClones`) empty after pass and after fail; PHARN_DEBUG=1 prints the original error.
- `tests/support/tar-fixture.ts` — `codeloadArchive` gains an optional third `opts` (`extra` raw entries spliced after
  the root dir, `replace` raw entries for a listed path, `rootless: true`), memo key includes opts; existing callers
  unchanged.
- `tests/cli-args.test.ts` — new cases: the command parses with its positional; missing positional refused; extra
  positional refused; `--expect-version` valid / invalid / repeated / on another command refused; help text bodies
  updated where they assert the full usage (no title renamed or removed).
- `tests/index.test.ts` — dispatch case for verify-archive (mock + loaded chunk), added, none renamed.
- `tests/skills-version.test.ts` — `assertSkillsVersion` match/mismatch/missing.
- `tests/repo.test.ts` — `verifyLocalArchive`: removes its dir on pass and on refusal; never fetches.
- `tests/dist-smoke.test.ts` — the bundle runs `verify-archive` on a fixture archive (exit 0) and on a missing file
  (exit 1), and `--help` lists it (body of the existing help case if it enumerates commands).
- `docs/commands/verify-archive.md` — NEW, matching the other command pages: usage, options, behavior, exit codes,
  messages, and "For pharn-oss CI" with the exact lines:
  `git archive --prefix=pharn-oss/ --format=tar.gz -o "$RUNNER_TEMP/pharn-oss.tar.gz" HEAD` and
  `npx --yes @pharn-dev/pharn@0.22.0 verify-archive "$RUNNER_TEMP/pharn-oss.tar.gz" --expect-version "$(cat SKILLS_VERSION)"`.
- `docs/README.md` — the command list gains verify-archive.
- `README.md` — the command list gains verify-archive.
- `docs/troubleshooting.md` — exit-code table row + "verify-archive says the archive has no root directory".
- `docs/architecture.md` — one short flow entry for verify-archive.
- `docs/contributing.md` — module tree line + test-map row.
- `AGENTS.md` — the CLAUDE.md mirror, same edits.
- `CLAUDE.md` — command list, module map (`commands/verify-archive`), test-suite list (minimal).
- `package-lock.json` — 0.22.0.
- `package.json` — 0.22.0 (`npm version --no-git-tag-version 0.22.0`).
- `CHANGELOG.md` — `## [0.22.0]` with an `Added` entry (the 386 `[Unreleased]`/0.21.6 section untouched).
- `.dev/features/core-387-verify-archive/SHIP.md` — stage artifact (each stage scopes its own artifacts).

## Evals / tests (P1)

The command suite above is the eval: each refusal asserted by exit code 1 and the named entry/rule on stderr; each
pass by exit code null/0 and the summary; the no-network property by `fetchStub` call count 0; the cleanup property
by an empty watched TMPDIR.

## Guarantee audit (P0)

- "verify-archive runs the same checks as an install" → floor: it calls the one `extractPharnArchive` (no copy);
  differences named: no MIN_CLI gate, no capability-index parse, no Node floor (docs say so).
- "no network" → test (fetch stub never called); structurally the command imports no fetch module.
- "no write outside one temp dir, always removed" → `finally` in `verifyLocalArchive` + the exit/fatal-signal
  registry; tested on pass and fail. SIGKILL residual: same as fetchRepo's (named, LIMITS-level, unchanged).
- "bounded input read, no FIFO hang" → `readBoundedFile` (existing floor, existing tests).
- "a pass on a `--prefix` git archive means codeload's archive of that commit passes" → advisory: same tar writer
  (git archive), but codeload could differ (e.g. export-subst); the v7.25.5 live check covers the real codeload shape.

## Trust audit (P2)

The archive and its path are untrusted. The path is escaped (`escapeUnsafe`) where printed; archive-derived text
reaches messages only through the extractor's/manifest's own escaping plus `logError`'s strip. Nothing from the
archive is executed; the tree is deleted before the command returns.

## Risks

- FIFO test: resolved — tests already create FIFOs with `execFileSync('mkfifo')` (bounded-read, detect-archetype).
- Help-text assertions in cli-args / dist-smoke tests change bodies (never titles; TI01/TI02).
- 386 branch moving: merged forward before commit and before the PR.
- Large sparse oversize file on tmpfs: `truncateSync` makes it sparse, cheap.

## Open questions (HALT)

None blocking; GATE 1 is the lead's.

## GATE 1 amendments (lead decision under the user's delegation, 2026-11-25)

Approved as written, plus:

1. **The install's other two pure reads run too.** In the checkTree after pass 1, `readMinCli(dir)` (the reader the
   min-cli gate uses) checks MIN_CLI's validity only: absent passes, and a present-but-malformed or unreadable file is
   a refusal naming its reason. This is stricter than install, which warns, on purpose: for a release a broken
   handshake is a packaging bug. No comparison is made against this CLI's version. After the extract,
   `manifestCapabilityIndex(manifest)` (the pure function behind `parseCapabilityIndex`) builds the capability index.
   Capabilities it reports as `unknown` are printed with the shared `unknownCapabilitiesWarning` and the command still
   passes, because install installs past them (it skips them with a warning). The summary gives the capability count
   and MIN_CLI. Neither read touches the network or a prompt.
2. **The docs' CI section** shows a SKILLS_VERSION form for PR/push jobs and a tag form for release jobs
   (`--expect-version "${TAG#v}"`), and says the archive must be built from the same commit that will be tagged.
3. **The PR body** carries the exact pharn-oss CI snippet, for CORE-384.
