# Changelog

All notable changes to `pharn` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Documented why a leftover `degit` cache can be large, and how to size it.** `pharn` no longer
  writes one at all, but the directory earlier versions left behind grew by ~2.4 MB per distinct
  upstream commit and was never reclaimed: `degit` deletes a tarball only when an existing **ref's**
  mapped hash changes, and `pharn` passed the resolved SHA _as_ the ref — so every fetch wrote a
  self-mapped entry under a new key and the delete branch could never fire. `docs/troubleshooting.md`
  now says so, with a `du` command, and warns against deleting the whole shared directory if another
  tool uses `degit`.

- **The repo fetch no longer goes through `degit`.** `pharn` now resolves the branch head once over
  the GitHub API and downloads that exact commit's tarball from `codeload.github.com`, extracting it
  with its own ustar reader (`src/lib/tar-extract.ts`). **`degit` is removed from `dependencies`**,
  and with it the last dependency that fetched or unpacked untrusted remote content.

  **What this fixes beyond the saved round trip.** The old path handed the already-resolved SHA to
  `degit`, which resolved the same ref *again* and matched the result only against current ref tips —
  so an upstream push landing between the two resolves failed the whole command, with a valid
  SHA-named tarball sitting unreadable in the cache. codeload serves any commit, tip or not.

  **Stricter extraction.** The bundled extractor was called with neither `strict` nor `onwarn`, so a
  malformed entry was silently dropped and the clone still succeeded. `pharn` now **rejects**:
  symlinks, hardlinks, devices and fifos are refused outright, header checksums are verified, `..`
  and absolute paths are rejected, every entry must share one root, and every write goes through
  `safeJoin`.

  **Bounded, at last.** The clone previously had no pharn-imposed timeout or body cap. It now has a
  60s timeout, a cap counted over the streamed bytes (codeload sends no `content-length`), and a
  separate cap on the *decompressed* size, so a compression bomb is bounded by something.

  **No more shared cache.** Every fetch downloads into a fresh temp dir. The old cross-project cache
  reused entries by filename rather than a verified digest, and — when ref resolution failed — took
  the ref→commit mapping out of that same cache, meaning it could decide which commit `pharn`
  believed it had fetched. Caches already on disk are inert; `docs/troubleshooting.md` says where to
  delete them.

### Removed

- **Proxy support, which `pharn` never implemented itself.** `degit` read `process.env.https_proxy`
  on its own, so a user who set exactly that lowercase spelling had a proxied clone. Node's global
  `fetch` reads no proxy environment variable on any platform, so that no longer works. Your
  `pharn update` and `status --no-drift` were already unproxied — they were always plain `fetch` — so
  this makes one boundary consistent rather than newly broken, **but it does break a setup that
  worked.** It is a named limit (`LIMITS.md` §3a), and every network-bearing command warns before
  fetching when it finds a proxy variable set, so the failure is explained rather than silent.

### Fixed

- **`npm run check` now runs `lint:md`, and `CONTRIBUTING.md` names all six CI gates.** The quick-start
  told contributors that four commands were "exactly what CI runs". CI runs six, and the two it
  omitted — `Markdown lint` and `Build` — are required status checks on `main`, so a docs-only PR
  could pass every gate the file documented and still land a red required X with no local command
  that reproduced it. `check` now covers `format:check` + `lint` + `lint:md` + `typecheck` + `test`.

  **It is still not the whole of CI, and the docs now say so:** `check` skips `build`, and it runs
  `test` rather than `test:coverage`, so the coverage thresholds are not enforced locally.

  **Knock-on for maintainers:** `prepublishOnly` is `npm run check`, so a release now also requires
  markdownlint-clean docs.
- **`pharn remove` now tells one story about confirming.** It told three: the bare picker asks for one
  destructive confirmation (default No), `runRemove` accepted a `yes` option it never read, and both
  `CLAUDE.md` and `docs/commands/remove.md` asserted flatly that "capability removal has no
  confirmation prompt to skip". The dead parameter is deleted, the dispatcher passes the argument
  alone, and the docs now state the contract **per path**: the named `pharn remove a11y` deletes
  without asking, and the picker's single confirm is the destructive gate — always shown, always
  defaulting to No.

  **Nothing about removal changed** — what is deleted, what is pruned from `pharn.records.json`, the
  `delete → prune → config` order, the auto re-add warning, and every exit code are byte-identical.
  `--yes` / `-y` remains an [`update`](docs/commands/update.md) flag: `pharn remove --yes` still
  parses and is still ignored, exactly as before. Only the false sentences and the parameter that
  seemed to justify them are gone.

- **`npm run dev` now exists.** `README.md` and `docs/contributing.md` both told contributors to run
  the CLI from source with `npm run dev`, and `package.json` had no such script — the documented
  command failed with `npm error Missing script: "dev"`. Added as `tsx src/index.ts`, so
  `npm run dev -- init` forwards argv exactly like the built binary. Contributor-facing only: nothing
  about the published package changes (`files` is still `["dist"]`, and `dev` is not a CI gate).

- **The `models` block no longer claims an effect it does not have.** `pharn init` writes a per-stage
  model + effort block into `pharn.config.json`, and the reference doc invited you to "edit it and
  re-run your stages" while the init outro offered to "change per-stage routing anytime". **No stage
  `pharn init` installs consumes that block** — not one of the product `pharn-*` commands, no hook,
  and nothing under the installed floor — so setting `models.stages.review` to `fable-5`/`max` and
  running a review silently ran the session default. (The block _is_ read, to be displayed and
  validated; it is never read to pick a model.) The block is now marked **Coming soon** in
  [`docs/reference/pharn-config.md`](docs/reference/pharn-config.md) with a
  [roadmap](docs/roadmap.md) row, the init outro says the routing is recorded and unread, and
  `pharn status`'s MODELS note carries the same qualifier.

  **Nothing about the block's behavior changed** — it is still written on every fresh install, still
  validated loudly on a bad hand-edit, and still displayed. Only the claims moved.

- **`pharn init` now installs PHARN's Apache-2.0 `LICENSE`.** A `pharn`-initialized project contains
  roughly 450 Apache-2.0 files — hooks, floor checkers, contracts, docs — and Apache-2.0 §4(a)
  requires a redistributor to give recipients a copy of the license. Nothing in the install set
  carried one, so a user who committed and published such a repo republished all of it with no grant
  visible to anyone downstream. The license now lands at **`pharn/LICENSE`** (or `PHARN-LICENSE` at
  the root in the legacy flat layout), is drift-tracked by `pharn status`, and is restored by
  `pharn update` if deleted.

  **Your own `LICENSE` is never touched.** The destination differs from the source on purpose: every
  other copied doc uses the same path on both sides and is written with force and no prompt, so a
  plain `LICENSE` entry would have overwritten yours silently. This is the only file in the install
  whose destination is deliberately not its upstream path.

  This does not make an initialized repo license-compliant in general — no `NOTICE` is generated and
  no per-file attribution headers are added, because `pharn` copies file contents verbatim and never
  rewrites them; anything inline has to come from upstream. **Existing installs do not receive it
  immediately** either: a CLI-side change to the install set does not move upstream's
  `SKILLS_VERSION`, so a plain `pharn update` reports "Already up to date" while `pharn status`
  reports the file missing. Wait for the next upstream skills-version bump, or run
  `pharn update --force` now (casualties are copied to `.pharn-backup/<timestamp>/` first).

- **The floor's `test-fixtures/` are no longer installed into your project.** `pharn init` copies the
  deterministic floor checkers the product commands invoke at runtime, excluding `*.test.mjs` /
  `*.test.cjs` — but not the `test-fixtures/` subtree those tests read, so 16 files of dev test
  apparatus shipped with nothing installed that consumes them. Among them a **deliberately malformed
  capability** and a set of red failure fixtures, so a user browsing their installed floor could
  reasonably conclude the install was broken; `pharn status` also drift-tracked all 16 as product
  files, and `--strict` went red if you deleted them. The subtree is now excluded on both the copy
  side and the expected-file side together. Matched as a path **segment** relative to the floor dir, so
  a file merely named `my-test-fixtures.mjs` is unaffected. **Already-installed copies stay** — `pharn
  update` never deletes — but they drop out of the tracked set, so they are now ordinary files in your
  own tree: deleting `test-fixtures/` under your installed floor is safe, and `pharn` will neither
  restore it nor report it missing.

- **`pharn init` now installs upstream's `features/README.md`.** Seven of the ten installed product
  commands — `/pharn-spec`, `/pharn-plan`, `/pharn-grill`, `/pharn-build`, `/pharn-regress`,
  `/pharn-verify`, `/pharn-ship` — cite `features/README.md` **by name** as the normative statement of
  where product-loop artifacts go. All seven were installed; the file they cite was not, so every one
  of those pointers landed on nothing in your project. It is copied to the project **root in both
  layouts** (like `.claude/*`), is drift-tracked by `pharn status`, and is restored by `pharn update`
  if you delete it (and skipped if you edited it). It is deliberately **not** called a trusted doc: it
  is not write-protected by the installed hook, and the directory it describes is one your own agent
  writes into. **Existing installs do not receive it immediately:** a CLI-side change to the install
  set does not move upstream's `SKILLS_VERSION`, so a plain `pharn update` still reports "Already up
  to date" while `pharn status` reports the file as missing (and `--strict` exits 1). Two ways
  through: wait for the next upstream skills-version bump, after which a plain `update` restores it;
  or run `pharn update --force` now, which also overwrites the skip buckets — every casualty is copied
  to `.pharn-backup/<timestamp>/` first.

### Security

- **A symlinked `features/` directory in a fetched repo can no longer copy files from outside the
  clone into your project.** `features/README.md` is the first root-relative file the install copies
  that has an intermediate directory, and the existing leaf-only symlink check does not see a
  symlinked *parent*: `existsSync` returns true, the leaf is not itself a link, and the copy reads
  straight through to wherever the directory points. The lexical path guard cannot catch this — it
  never resolves links. The copy site now runs the same physical component walk the expected-file
  manifest already ran, so both agree and neither writes such a file.

  The **destination** is walked for the mirror-image reason: a project whose own `features/` is a
  symlink to an external directory took the copy straight through it, creating or overwriting a
  `README.md` outside the project root — and the pre-install overwrite prompt never warned, because
  the check for an existing file returns false for an absent leaf inside that link. Both directions
  are now measured and pinned by tests. No release shipped either unguarded copy; both holes were
  found and closed in the same change that introduced the path.

  A project that merely has a **regular file** named `features` is left alone rather than breaking the
  install: the copy is skipped (a copy there would fail anyway), and the record-writing pass, which is
  driven by what upstream ships rather than by what was written, now skips a path it cannot stat
  instead of failing after every other file is already on disk.

- **A `pharn`-layout install can now ship `THREAT-MODEL.md` and `LIMITS.md`.** The install placed only
  `pharn/CONSTITUTION.md` and `pharn/ARCHITECTURE.md`, treating the other two trusted docs as
  dev-only — while the same install shipped ten product commands, the floor checkers and the
  contracts, and those cite `THREAT-MODEL.md` / `LIMITS.md` by path. Every one of those pointers
  dangled in every install. Both docs are now part of the `pharn` trusted-doc set, so they are
  installed at `pharn/THREAT-MODEL.md` and `pharn/LIMITS.md`, compared by `pharn status`, and
  restored by `pharn update` under the same per-file rules as `CONSTITUTION.md` (missing → restore,
  unchanged → upgrade, locally modified → skip). **Nothing changes for existing installs yet:**
  upstream `pharn-dev/pharn-oss` does not ship those two paths at the time of writing, and every doc
  copy is existence-guarded at both readers — so a clone without them installs exactly as before,
  `status` reports nothing missing, and `update` restores nothing. This is the CLI half; the doc
  content, the repointed citations, and the `protect-trusted-paths.cjs` hook that currently
  write-protects `THREAT-MODEL.md` at the *user's* project root are upstream changes still to land.

- **`pharn.config.json` and `pharn.records.json` are now written atomically.** Both were written with
  a plain `writeFile`, so a write torn by power loss or `SIGKILL` left truncated JSON on disk. For the
  records store that fails closed — the reader names it invalid, every update decision degrades to
  `unverifiable`, and the version bump is withheld. For the config it was worse: `readPharnConfig`
  collapses malformed JSON to `null`, so every command reported **"No `pharn.config.json` found. Run
  `pharn init` first."** — about a file that was right there — and the prescribed re-init resets
  hand-edited `models`/`seam` blocks to defaults and re-stamps every capability `source: 'auto'`,
  destroying the manual-add provenance only that file remembers. Both writes now go through one
  helper that writes a sibling temp file and `rename`s it over the target, so the file is either
  replaced whole or left exactly as it was. The bytes are unchanged, and so are the file's permission
  bits — `rename` swaps in a new inode, so an existing regular file's mode is copied onto the temp
  first, and a `0600` config stays `0600` instead of becoming whatever your umask gives. A
  `pharn.config.json` that is a **symlink** is now replaced by a regular file rather than written
  through, matching how the rest of the CLI treats symlinks. **What this does not do,** and
  is not claimed anywhere: it does not make the two files a transaction (a crash between them still
  leaves the stamp mismatch `recordsBaseline` already reports by name), it adds no lock and does not
  serialize two concurrent `pharn` processes, and it does not `fsync` — surviving a power cut at the
  block layer is a different guarantee from never observing a torn file, and only the second is made.

- **One filename trust floor across both write paths.** `pharn init` hard-fails on a product-command
  or `.cjs` hook basename from the fetched repo that violates the copy allowlist (lowercase words
  joined by single hyphens, one of `.md`/`.cjs`/`.mjs`/`.json`, no control characters) — but
  `pharn update` copied that same file in without a murmur, because the install manifest that now
  drives its writes filtered only on shape (`endsWith` / `startsWith`). One clone, one repo, two
  different trust floors: `init` refused it, `update` installed it. The manifest's product-command
  and hook enumerations now run the same `assertSafeString` + `assertNoDotDot` pair, in the same
  order (`keep` first, so a `README.md`, a `pharn-dev-*` command, or anything nested still never
  reaches the validator). A clone carrying such a name is now refused by `update` — and by `status`,
  which hard-fails on it exactly as it already did on every other fetch-boundary validation error,
  rather than reporting it as drift. Deliberately **not** extended to capability directories,
  `pharn-contracts/`, `pharn-core/`, `.dev/floor/`, or the trusted docs: those are copied verbatim
  with no name check, so validating them in the mirror would break the manifest-to-installer mirror
  and reject legitimate `evals/` fixtures. No such filename exists upstream today — this closes a
  latent asymmetry, and no existing install changes meaning.

- **A benign upstream filename no longer makes `pharn` declare its own `pharn.records.json` corrupt.**
  The store's reader rejected any key containing `..` as a **substring** — including inside an
  ordinary basename such as `migration..v2.md` — or a backslash anywhere. Its writer applied no such
  rule: it records whatever paths the install manifest enumerated out of the fetched repo, whose
  capability contents, contracts and floor files are copied verbatim with their basenames never
  name-validated. So `pharn` could write a store its own next read called invalid, which is
  fail-closed but for nothing: every present file that differed from upstream degraded to
  `unverifiable` and was skipped, the `skillsVersion`/`commit` bump was withheld, and `pharn add` /
  `pharn remove` silently stopped maintaining the store — recoverable only with `--force` or by hand-
  editing the file. The reader now applies a path-**segment** rule: a key is invalid when it is empty,
  absolute, or has a segment exactly equal to `..` or `.`. Traversal and absolute keys are rejected
  exactly as before; a name that merely contains those characters is not. The key is validated on a
  normalized copy and stored verbatim, so it still matches the manifest lookup it exists for. No
  filename existed upstream that triggered this, so no installed store changes meaning — the accepted
  set only widens for names the writer could already produce.

- **A file under a symlinked parent directory is now classified `unreadable` — in `pharn update`'s
  plan and in `pharn status`'s drift report alike.** `lstat` refuses to dereference only the FINAL
  path component, so the disk classifier checked the leaf and resolved every ancestor: a project whose
  `.claude/hooks` (or `.claude/commands`) is a symlink into a dotfiles repo had those files hashed
  **through** the link. `status` then counted them ok — silently blessing bytes that live outside the
  install — while `update` planned a write and hit the write-side symlink refusal mid-loop, aborting
  with exit 1, partial writes, no config write, and the identical abort on every re-run. The
  classifier now runs the same physical component walk the write side does, so such a path becomes the
  per-file named skip it was always designed to be (exit 0, listed under `UNREADABLE` with the
  offending component named, the `skillsVersion` bump withheld). The write-side refusal stays exactly
  where it was, as the security backstop.

- **`pharn update --force` now names the backup directory when the run aborts part-way.**
  `createBackup` copies every about-to-be-overwritten file into `.pharn-backup/<timestamp>/` before a
  single original is touched, but that path used to travel out only inside a **successful** run — so a
  run that died after the backup (a file it could not write, a records or config write that threw)
  printed the error, exited 1, and never said where the copies went. The user's originals were already
  gone from the tree, the one pointer back to them was withheld at exactly the moment it was needed,
  and earlier runs may have left other timestamped directories beside the new one. The path is now
  carried out of the apply phase the instant the backup exists, so every exit reachable after it names
  the directory — with a line saying the run stopped part-way and some originals may already have been
  overwritten. It goes to **stderr** with the rest of the fatal output, so an operator redirecting
  stderr to a log finds it there. The success path is unchanged and both paths now print through one
  helper, so they cannot drift. Nothing is printed when no backup exists: a `createBackup` that itself
  throws leaves the tree intact with nothing to point at, and a run without `--force` only ever writes
  over files pharn wrote and proved pristine.

### Added

- **`pharn add` now backs up destination drift before it overwrites.** `add` was the only write path
  with none of the product's three edit-protections — no prompt (`init`'s overwrite confirmation), no
  per-file skip (`update`'s records table), no backup (`update --force`) — so it `cpSync`'d over
  whatever sat at the destination. The reachable sequence is one `update` itself manufactures and
  announces: a `dropped-unselected` capability's files are **left on disk** (update never deletes),
  you edit them, and a later `pharn add <name>` is not a config no-op because the entry is gone.
  `add` now enumerates the capability dir in the **clone**, compares each file's sha256 against the
  destination, and copies every **differing** file to `.pharn-backup/<timestamp>/` — the same
  directory `update --force` uses — **before** the first byte is written, printing the path as soon
  as it is created so it stays visible even if a later step throws. Byte-identical files are not
  drift (mirroring `update`'s `identical → no-op`), so re-adding an untouched capability stays
  silent, and a normal first-time `add` still produces no backup directory. A backup that cannot be
  written aborts the add with every original intact.

  `add` also now **refuses**, writing nothing, when a path it would copy sits under a **symlinked
  directory** in your project, naming the offending component. The copy is a recursive `cpSync` that
  guards only its source: measured on node v24.13.1, a symlinked intermediate directory under the
  capability dir is written straight **through**, replacing whatever it points at — outside your
  project included — while a symlinked leaf is silently replaced. Neither can be backed up, because
  saving a symlink means saving its target rather than the link, so refusing is the only outcome that
  leaves your files as they were. (`update` reaches the same answer by classifying such a path
  `unreadable` and skipping it.)

- **Forward-compatibility contract at the capability-index boundary.** pharn always fetches
  `pharn-dev/pharn-oss` at `main` HEAD and can never pin older content, so one routine grammar
  evolution upstream — a new capability directory without its markdown, a new `role`, a new `applies`
  token — used to abort `init` / `add` / `update` in every released CLI at once, with no rollback
  lever (`add` doubly so: its version gate names `pharn update`, whose own first act was the parse
  that threw). `parseCapabilityIndex` now **tolerates and reports**: any validation refusal raised
  while processing ONE capability skips that capability and records it in a new
  `CapabilityIndex.unknown` list, which every fetching command names with its reason. The posture is
  unchanged where it matters — `validate.ts`'s enums stay frozen, and nothing unparseable is ever
  selected, copied, enumerated by the install manifest, or written; a **structural** break (a missing
  subtree) still hard-fails. `update` keeps a frozen capability's `pharn.config.json` entry (reported
  as `KEPT`, never `REMOVED`) while excluding it from the manifest, and still bumps `skillsVersion`,
  so a following `pharn add` is not wedged. `status` excludes it from the drift comparison, so
  `--strict` cannot fail on drift no command can resolve. Named as `LIMITS.md` §3e.
- **Optional `MIN_CLI` version handshake.** pharn-oss may ship a root `MIN_CLI` file declaring the
  minimum CLI version its content requires; `init` / `add` / `update` refuse a too-old CLI **before
  any write**, with an actionable upgrade message, and clean the clone up. Deliberately fail-open in
  one direction: absent, unreadable, or malformed imposes **no** constraint (a warning at most), so
  one upstream typo in a one-line file cannot become the fleet outage the handshake exists to
  prevent. Only a well-formed value whose numeric core is greater refuses; a prerelease compares
  equal to its release.

- **`pharn/pharn-core/` is now installed.** The product `/pharn-build` command shipped by pharn-oss
  cites `pharn/pharn-core/seam-resolver/seam-resolver.md` at three points, and `init` has always
  written a `seam` block into `pharn.config.json` and installed `check-seam-config.mjs` with the
  floor — so the seam gate validated GREEN and then pointed the model at a file no code path ever
  copied. `init` and `update` now install `pharn/pharn-core/` (today the `seam-resolver` skill plus
  its `evals/`) as a **fixed product surface**, copied whole and verbatim exactly the way
  `pharn-contracts/` is: one layout path, one copy block guarded by `safeJoin` at both ends plus the
  `isSymlink` root reject and the `noSymlinks` filter, and one entry in the install manifest — which
  is what also gives it `status` drift coverage and `update`'s missing-file restore. It is **not**
  modeled as a capability: its frontmatter declares `role: skill`, deliberately outside the CLI's
  `ROLE_VALUES`, and the CLI never parses it — `pharn add`/`remove` cannot address it. The flat
  layout has no counterpart upstream (the directory postdates the `pharn/` relocation), so a flat
  clone copies nothing and a flat install is byte-for-byte unchanged.

- **The `degit` clone's proxy handling is no longer invisible.** `degit` reads
  `process.env.https_proxy` in its own constructor — unconditionally, with no option `pharn` could
  pass — and only that **lowercase** spelling appears anywhere in its bundle. So a user who exported
  `HTTPS_PROXY`, the spelling most tooling honors, was connecting **directly** on macOS and Linux with
  no signal anywhere; a user who exported `https_proxy` was having the clone interposed by a host
  `pharn` never mentioned. Both directions were silent. `init` / `add` / `update` / `status` now read
  the environment before starting the clone and print the applicable line — that the variable will be
  ignored (suppressed on Windows, where lookups are case-insensitive and it _is_ read), or that the
  clone **may be routed** through the named proxy and that `no_proxy` exclusions do not apply to it,
  since degit reads no such variable. The warning names whichever spelling you actually set, so a
  `Https_Proxy` typo is caught too, and several variants resolve deterministically rather than by
  environment order. Credentials in the value are redacted to `***`, an unparseable value degrades to
  `(set)` rather than echoing raw bytes, and the value is **never** written to `pharn.config.json` —
  it is git-committed, and proxy URLs routinely carry passwords.

  **The confident wording is gated on a measured degit version.** `pharn` pins `degit@3.6.6` exactly,
  but the published package ships no lockfile and marks degit external, so an `overrides` entry, a
  monorepo hoist, or a non-npm resolver can still seat another version. Every published release from
  `3.6.1` through `3.8.0` was therefore swept (nine in total) — deliberately wider than the pin — and
  all read only the lowercase name; `pharn` reads the version at runtime and states the negative
  assertion only for those. On any other version it hedges, naming both the measured range and what is
  installed — so an unexpected degit makes the notice more cautious rather than wrong.

  Deliberately **not** done: recording the proxy in the config or the install summary as a fact about
  the connection. degit skips the download entirely when the tarball is already cached and falls back
  to a spawned `git clone` on some failures, so "a proxy was in effect" is not derivable from the
  environment — hence "may be routed", never "was routed". The notices remain **advisory**: they
  report your environment against measured degit versions, never the transport that ran.
  `docs/troubleshooting.md` gains a "Proxy environment variables" section.

- **`pharn` now refuses argv it does not understand.** An unknown _command_ always exited 1, but an
  unknown _option_ was parsed into the arg map and silently dropped, and extra positionals were
  ignored outright. So `pharn status --sctrict` ran in the default exit-0 mode — a typo in a CI
  pipeline permanently disarmed the drift gate while every run stayed green — `pharn update --froce`
  ran un-forced, `pharn add a11y extra` dropped its third argument, and `pharn --hepl` fell through
  to `argv._[0] ?? 'init'` and started a real install. Every unrecognised option and every positional
  past a command's arity is now collected during parse and refused **before any command function
  runs**, printing the offenders (`JSON.stringify`-escaped, so a control-char argument is echoed as
  data — P2) and the usage text to **stderr** with exit 1. The same fail-closed shape
  `lib/seam-config.ts` already applies to an unknown config key, now at the argv boundary. Two
  consequences are deliberate and worth naming: a genuine `--help` / `--version` no longer excuses an
  unknown sibling (`pharn --help --bogus` refuses rather than printing usage), and flags stay parsed
  globally, so a flag belonging to another command still parses and is ignored (`pharn init --force`)
  — only _unrecognised_ options are refused. No flag's semantics moved: `--archetype` is still a
  parsing no-op, `--no-drift` still flips the drift default off, `update --yes` still skips only the
  confirm, and `remove --yes` is still the passthrough its own finding owns.

### Security

- **`degit` is pinned to the exact version its guarantees were measured against.** `degit` is the one
  dependency that fetches and tar-extracts untrusted remote content, so the extraction properties
  `THREAT-MODEL.md` §2/§4b and `LIMITS.md` §3b state are degit’s behaviour, not pharn’s — written as
  facts measured against `degit@3.6.6`. `package.json` nonetheless declared the caret range `^3.6.1`,
  and because lockfiles are not published, that range is what a consumer actually resolves. The drift
  was not hypothetical: the range had already floated this repo to `3.8.0` while every document still
  said `3.6.6`. The declaration is now the exact version `3.6.6`, and a new `tests/degit-pin.test.ts`
  ties it to `package-lock.json` and to every file stating a measured claim (`THREAT-MODEL.md`,
  `LIMITS.md`, `src/lib/repo.ts`), so a bump — a Dependabot PR included — goes red until each claim has
  been re-measured and re-written. The test proves those documents **name** the installed version; it
  cannot prove the measured prose is still **true** of those bytes, and says so in its header.

### Changed

- **The dev/CI `degit` and a consumer's now resolve the same measured version.** `package.json` used to
  declare `^3.6.1` and the published package ships no lockfile, so an install resolved the newest
  matching release while this repo's gates exercised whatever its own lockfile held — the two drifted
  apart, which is precisely how a claim about `degit` internals gets written against a version nobody
  runs. Closed by narrowing the declaration instead of chasing the float: see the `### Security` entry
  above. API compatibility across the span was verified — same callable default export, `.clone()` /
  `.on()` intact, still no runtime dependencies, and `engines.node >=20.0.0` against pharn's `>=20`.
  `src/lib/repo.ts`'s comments about degit's ref tiers, cache behavior, and warn sites name the pinned
  `degit@3.6.6` and record that every claim was re-verified across the wider measured span
  (3.6.1-3.8.0).

### Docs

- **The fetch boundary now tells the truth about `degit`.** `THREAT-MODEL.md` described the clone as an
  opaque delegation, and `src/lib/repo.ts` claimed degit "resolves the ref via `git ls-remote`". Measured
  against the installed `degit@3.6.6`: ref resolution is three tiers (pure-JS `listServerRefs`, then
  `getRemoteInfo2`, then a spawned `git ls-remote`), the first two falling through on empty `catch {}`
  while the third throws — so the git binary is a last resort rather than the mechanism, and its absence
  is harmless only while the pure-JS tiers succeed. More consequentially, `cache: false` selects the hash
  source and suppresses neither writing nor reuse — every fetch persists a SHA-named tarball into a
  shared, cross-project cache directory and a later fetch reuses whatever file sits at that path, keyed by
  **filename, not a verified digest**; a failed ref resolve then falls back to the commit hash stored in
  that same cache, so a poisoned cache can decide which commit pharn believes it fetched. degit also reads
  `process.env.https_proxy` on its own (lowercase only, so `HTTPS_PROXY` is ignored on POSIX but honored
  on Windows), and warns on fallbacks that `fetchRepo` drops by registering no listener. §2 gains the
  measured mechanics and §4b restates the residuals over them — including one claim made **upward** and
  then bounded: the bundled node-tar genuinely contains traversal entries (an escaping path is skipped
  with `TAR_ENTRY_ERROR`, absolute paths are stripped), but it does **not** reject malformed entries —
  degit passes neither `strict` nor `onwarn`, so `TAR_ENTRY_INVALID` is recoverable and the entry is
  silently dropped — and tripping the ratio cap degrades to `git clone` rather than halting the install.
  `LIMITS.md §3a` and `docs/troubleshooting.md` are corrected to match.
- **The trust map now matches the records era.** `LIMITS.md` and `THREAT-MODEL.md` still described the
  deleted module/manifest subsystem and a world with no stored file hashes, both of which stopped being
  true when `pharn.records.json` shipped. Three claims were corrected in place. `LIMITS.md §1d` said
  `update`, `remove`, and `status` all reconstruct by reading a manifest from `@main` — there is no
  manifest, and `remove` is fully offline, addressed from `pharn.config.json` alone; the section now
  splits those two cases and names what each leaves behind. `THREAT-MODEL.md §4c` said pharn stores no
  per-file content-hash; it does, and the honest residual is that the baseline covers only pharn-written
  files at a matching stamp — so an absent or skewed store makes `update` **skip** present files while
  still **restoring** absent ones. `LIMITS.md §1b` said the same thing one section earlier and now draws
  the real distinction: the hashes pharn stores are drift baselines taken from the written file, which
  authenticate nothing about upstream. No section numbers changed.

### Removed

- **Internal: the module-era symbols nothing calls are gone, and the security narration they left
  behind is corrected.** Four unused validators (`MODULE_NAME_RE`, `INSTALL_PATH_RE`,
  `WIZARD_VALUE_RE`, `PACKAGE_NAME_RE`), `shortDescription`, `toInstalledModules`, and all of
  `lib/constitution.ts` were retained after their callers (`install-modules.ts`, `wizard.ts`) were
  deleted; a fresh reference sweep found zero production callers for each. None is user-facing —
  `package.json` exposes only `bin`/`files`, never a library entry point — so there is no API
  change. The correction that does matter is documentation: `CLAUDE.md` and `docs/contributing.md`
  both listed `INSTALL_PATH_RE` among the allowlists that validate untrusted remote input, and it
  had validated nothing since the module install path was removed. Both now enumerate the
  allowlists that are actually enforced. Path containment itself never depended on it and is
  unchanged — `safeJoin` is the live gate. The four tests that pinned `assertSafeString`'s
  reject/pass ladder used `MODULE_NAME_RE` only as a sample pattern; they were rewritten against
  `CAPABILITY_NAME_RE` before the regex was deleted, so that function's coverage is intact.

### Fixed

- **`pharn update` no longer prescribes `--force` for skips `--force` cannot clear.** A destination
  that is not a readable regular file — a directory, a symlink, an unreadable file — is classified
  `unreadable` and skipped _before_ the per-file decision table, and `force` is not an input to that
  branch, so `--force` never reaches it. The skip report offered "Re-run with `--force` to overwrite"
  unconditionally anyway, and because any skip withholds the `skillsVersion` bump, the withheld-version
  warning repeated the same prescription — so a user who, say, symlinked `pharn/CONSTITUTION.md` to a
  company-wide copy was told to run a command that produced a byte-identical outcome, forever, while
  `pharn status --strict` stayed red in CI with nothing that could clear it. The `--force` advice is now
  printed only when a bucket `--force` actually overrides (`modified` / `unrecorded` / `unverifiable`)
  is among the skips, the withheld-version warning drops its `--force` clause when every remaining skip
  is unreadable, and an unreadable group now carries `pharn status`'s own wording — inspect the path by
  hand, because nothing pharn can run resolves it. Behaviour is unchanged: `--force` still covers
  exactly the same three buckets, skips still exit 0, and a run that skipped anything still withholds
  the version bump. One consequence worth naming: on a forced run `unreadable` is the only label that
  can still reach the skip report, so a forced run never prescribes `--force` at all.

- **`pharn add` records only the files it actually copied.** The records merge derived its path list
  from a walk of the **destination** directory, so any pre-existing file a user had put inside a
  leftover capability directory was recorded in `pharn.records.json` as pharn-written — and if
  upstream later shipped a file at that path, the record-equals-disk match would make `pharn update`
  classify the user's file as cleanly upgradeable instead of `modified`. The list now comes from the
  **clone** (what the copy wrote); the hashes are still taken at the destination, so a record can
  never disagree with what landed on disk.

- **`pharn add 123` / `pharn remove 7` no longer crash with a raw `TypeError`.** minimist converts a
  numeric-looking positional into a JavaScript number unless `_` is declared a string, so the value
  handed to `parseCapabilityArg` had no `.includes`, and the resulting stack escaped to the
  entry-point catch instead of the curated "valid capabilities" listing. `@types/minimist` declares
  `_: string[]`, so the type checker never saw it. Fixed at the argv boundary (`string: ['_']`), not
  at the dispatch sites — coercing there would map the bare `pharn add` / `pharn remove` case to the
  literal string `"undefined"` and defeat the interactive-picker branches.

- **Transport failures now name the host they could not reach.** Offline, `pharn update` and
  `pharn status --no-drift` printed undici's bare `⚠ fetch failed`, with the real
  `getaddrinfo ENOTFOUND raw.githubusercontent.com` diagnosis sitting unprinted in `err.cause`; the
  8s abort printed `⚠ This operation was aborted`. Neither named a host, a URL, or a next step. The
  two **network-origin** phases of the `SKILLS_VERSION` fetch — the connect and the streaming body
  read — are now wrapped as `Could not reach <url>: <message> (<cause>)`, with the original kept as
  `cause` so `PHARN_DEBUG=1` still dumps it. The wrap is attached to those two expressions only, so
  the three deliberate throws below them keep their own identity: an HTTP status, the body-cap
  refusal, and the `VERSION_RE` validation failure are still reported as what they are.

- **The `PHARN_DEBUG` hint now prints at every fatal error that came from an exception.** It lived at
  exactly two of the CLI's fatal exits while eight exception-derived ones — the failed clone in
  `init` / `add` / `update`, the failed version check in `update` / `status`, the mid-install failures
  — offered no next step at all, which is precisely where a user needs one. All of them now route
  through one reporter (`lib/report-error.ts`), and the hint follows a single axis: an exception was
  passed. A **policy refusal** still prints none — the `MIN_CLI` refusal, `add`'s version / layout
  gates, an unknown capability name, and the non-interactive-terminal messages have no stack behind
  them, and offering one would be a lie. Nine hand-rolled `if (process.env.PHARN_DEBUG)` blocks
  collapse into that one file, pinned by a test.

- **Error messages now go to stderr.** Every error-level message went through `@clack/prompts`'
  `log.error`, which writes to `process.stdout`, so `pharn update --yes > update.log 2> errors.log`
  exited 1 with **0 bytes** on stderr and left the operator grepping an empty file for the cause.
  Exit codes were always correct, so automation gating on the code was never affected — this is the
  stream contract. All ~24 sites now route through the shared reporter, which passes clack's
  `output` option, and the `PHARN_DEBUG` hint travels to stderr with its error rather than staying
  behind on stdout. Normal output is untouched: notes, summaries, spinners and `log.info` /
  `log.warn` stay on stdout, cancelling a prompt is still a stdout message and exit 0, and
  `pharn list --json` keeps emitting exactly one object on stdout with its diagnostics on stderr.
  `docs/troubleshooting.md` gains a "Streams" section.

- **`SKILLS_VERSION`'s 8s timeout and 256KB body cap now actually cover the body.** Both guards
  stopped at the header exchange. `fetch()` resolves as soon as headers arrive, so the timer was
  cleared before a single byte of body was read — a server that dribbles the response could hang
  `pharn update` and `pharn status --no-drift` for undici's 300s inter-chunk timeout with no pharn
  timer armed at all. The cap was worse than absent: it trusted the remote's own `content-length`
  (a chunked response omits it, and `Number(null)` is `0`, which passed the compare) and then
  re-checked the fully-buffered body with `String.length`, counting UTF-16 code units — so a body of
  3-byte characters cleared it at roughly three times its size. The fetch and the read now share one
  `try` whose `finally` clears the timer only after the read settles, and the body streams under a
  running **byte** counter that stops and cancels the read the moment the total exceeds 256 KB.
  `redirect: 'error'`, the error-message shapes, and the `VERSION_RE` validation of the result are
  unchanged, and every failure still throws — the consumers print it and exit 1. The
  `content-length` fast-fail is kept, now labeled for what it is: an advisory courtesy over an
  attacker-controlled header, backstopped by the counter. Both cap branches and the timer's scope
  are pinned by tests; before this the invariant CLAUDE.md, `SECURITY.md`, and `THREAT-MODEL.md` all
  named was protected by nothing (the coverage thresholds are global, so deleting the cap outright
  would have left CI green).

- **`pharn update` now warns on both layout-migration directions, not just flat→`pharn/`.** The outcome
  field recording an abandoned layout has always been direction-agnostic, but the report only tested it
  for `flat` — so a project recorded at the `pharn/` layout meeting a flat clone was migrated in
  silence, leaving the entire `pharn/` tree (contracts, floor scripts, trusted docs, and every
  capability) behind with nothing managing it and nothing said about it. That direction now prints its
  own warning naming what was left and how to clean it up. The flat→`pharn/` message is unchanged, and
  `update` still never deletes in either direction.

- **`pharn init` no longer misdetects a project whose framework build cache is large.** Archetype
  detection walks your file tree under a bounded entry budget, and that budget was being spent on
  generated output: a `.next/` directory of 55 000 files consumed the whole allowance before the walk
  reached `src/`, so a React project with no `package.json` framework dependency was detected as a
  frameworkless `lib` instead of `spa` — the same wrong answer on every machine, because the walk is
  sorted and `.next` sorts before `src`. Build and deploy caches are now skipped, which costs the
  walk nothing: `out`, `coverage`, `storybook-static`, `.next`, `.nuxt`, `.svelte-kit`, `.astro`,
  `.turbo`, `.vercel`, `.cache`, and `.parcel-cache` join the `node_modules`, `.git`, `dist`, and
  `build` that were already skipped. The tradeoff is a lost signal, never a false one: a source file
  you hand-authored inside one of those directories is no longer seen, and your `package.json`
  dependencies are what normally cover that case.

- **`pharn remove` now prunes the removed capability's entries from `pharn.records.json`.** It deleted
  the capability's files and dropped its config entry but left the record store alone, so until the
  next `pharn update` rewrote the store it was the one command that left records describing bytes that
  no longer existed. Those entries are now dropped as part of the removal. They are matched as a string
  prefix on the record key rather than by walking your filesystem, which is why this also works on the
  path where the capability's directory was already gone — there, the stale records were the only thing
  left to clean up. Nothing else in the store changes: sibling capabilities' entries are untouched, and
  the `skillsVersion`/`commit` stamp does not move, because `remove` changes neither. A store that is
  absent, unreadable, or stamped for a different install state is left exactly as found — `remove`
  never mints a store and never rewrites one it could not verify, the same rule `pharn add` follows —
  and the removal itself completes regardless.

- **`pharn status` no longer crashes on a path it cannot read, and no longer misreports what sits
  there.** The drift check read your project with its own bare `existsSync` / `readFileSync`, which
  went wrong four ways. A **directory** where a file belongs threw `EISDIR` out of the middle of the
  comparison, so status printed a raw errno naming no file and **the drift report for every other file
  was lost** — one bad path took down the whole run. A **symlink** was read _through_: pointing it at a
  file with other bytes listed the path under "differs", erasing the fact that a link — not an edit —
  was the cause, and pointing it at a **byte-identical** file made status count it as matching and say
  **nothing at all**, silently blessing a path that leads outside your install and can change under it
  tomorrow. A **dangling** symlink was reported as "missing", when the truth is a link squats on the
  path. And a path whose **parent is a regular file** was likewise reported "missing", when in fact it
  cannot exist. All four are now a fourth drift category, **Unreadable**, listed by name with the
  reason, while every other file still compares normally. `--strict` exits 1 on them like any other
  drift; a plain `pharn status` still exits 0, because it is a report. This is the same classification
  `pharn update` has always used to decide what it refuses to write over — so the read side and the
  write side can no longer disagree about what a symlink at a pharn-owned path means.
- **One canonical sha256.** `lib/hash.ts` has always claimed a single implementation "so the drift
  check (status), the install record store, and the update decision can never disagree" — while the
  drift check quietly kept a private copy. It now uses the shared one, and a test holds the claim.

- **`pharn init` and `pharn update` no longer report success having done nothing off a TTY.** Both
  commands confirm before they write, and when stdin was not a terminal that confirmation cancelled on
  stream end and routed through the graceful-cancel path — `process.exit(0)`. So `echo "" | pharn update`
  and `pharn update < /dev/null` **exited 0 having updated nothing**, and piped `pharn init` **exited 0
  having installed nothing** — after paying for a full clone, because the fetch precedes init's first
  prompt. A pipeline that "passes" having done nothing is the worst failure shape for automation.
  Both commands now **exit 1** with a usage error naming the way out, using the same TTY predicate the
  `pharn add` / `pharn remove` pickers have always used (`interactiveAllowed` — imported, not
  re-implemented; a static test pins that this repo has exactly one such predicate). Each gate sits
  **after** that command's promptless local step — `update`'s config load, `init`'s git prerequisite —
  so an uninitialized directory still gets _"run `pharn init`"_ and a directory with no `.git` still
  gets _"run `git init`"_, never a misleading message about a prompt they would not have reached. Each
  gate also sits **before any network call**, so a refused run costs zero round-trips and wastes no
  clone. **TTY behavior is deliberately unchanged:** a human choosing Cancel is still a user-initiated,
  graceful exit 0 — only EOF masquerading as that choice is now unreachable.

- **`pharn add` no longer installs at a layout your config does not record.** PHARN ships in two
  install layouts (the legacy flat one, and everything under `pharn/`). `add` copied at the _clone's_
  layout while `pharn remove`, `pharn list`, and `pharn status` all look at the layout recorded in
  `pharn.config.json` — so when the two disagreed, the capability landed where nothing would ever find
  it: invisible to `list`/`status`, and a later `remove` reported _"its files were already gone"_ while
  dropping only the config entry, orphaning the directory on disk. `add` now **refuses** when the
  clone's layout differs from your recorded one, naming both layouts and pointing at `pharn update --force`,
  and writes nothing — no capability directory, no `pharn.config.json`, no `pharn.records.json`.
  `add` deliberately does **not** record the clone's layout the way `update` does: `update` may only
  because it rewrites your whole install at that layout, while `add` writes a single capability.
  _Scope, honestly:_ the common flat→`pharn` migration window was already closed by the version gate
  in the previous release, since a pre-migration install also has a pre-migration `skillsVersion`.
  What this closes is the residual case — a config that reached the current version with a stale,
  absent, or hand-edited `layout`. Note that resolving such a same-version drift needs
  `pharn update --force`, as a plain `pharn update` returns early at a matching version.

### Added

- **`pharn update --yes` (`-y`) — a real flag, for CI and scripts.** It skips **the confirmation prompt
  and nothing else**: the version note still prints, the same per-file decision table applies, files you
  edited are still skipped rather than overwritten, the recorded version is still withheld when anything
  was skipped, and every exit code is unchanged. It means _"do not ask"_, not _"non-interactive mode"_ —
  so it works in a terminal too — and it composes with `--force` (`pharn update --yes --force` is the
  full CI re-apply). `--force` does **not** imply `--yes`: overwriting your edits is the most destructive
  thing `update` does, so it still asks. Because `--yes` is only consent, it is not a drift check — a run
  that skips your edited files still exits 0; use `pharn status --strict` when CI should fail on drift.
  The flag was previously parsed but consumed by nothing.

  There is deliberately **no `--yes` for `pharn init`**: init's second prompt is the destructive overwrite
  confirmation, and auto-confirming file overwrites in a pipeline is precisely the hazard that prompt
  exists to prevent — so non-interactive `init` refuses rather than offering a bypass.

- **`capabilities[].source` — selection provenance, so `pharn update` stops deleting what you added.**
  Each entry in `pharn.config.json` now records how it got there: `auto` (selected for your archetypes
  by `pharn init`) or `manual` (you asked for it by name with `pharn add`). The field is **optional** —
  a config written by an older CLI omits it and still loads.

- **`pharn list` shows provenance.** The human listing marks a hand-added capability `(manual)`;
  `--json` gains a `source` field on each capability, **omitted** (never defaulted) when the config
  does not record one. This is an additive JSON change — existing consumers are unaffected.

### Changed

- **The lint gate lost its soft tier and now covers the checked-in source surface.** `npm run lint`
  runs ESLint over `src/`, `tests/`, and `scripts/` with `--max-warnings 0`, so **any** warning from
  **any** rule now fails the gate, locally and in CI. Before this it linted `src/` only, and its one
  custom rule sat at `warn` — a severity nothing could ever fail on — while `tests/` and `scripts/`
  were typechecked but never linted. Closing it needed no code change: the tier was measurably empty.
  The flat config also now declares the platform it actually runs on — `globals.nodeBuiltin`, Node
  minus the CommonJS-only names, because this package is ESM — which is what let `scripts/` join the
  gate without editing a single script: their `console`/`process` were never wrong, the config simply
  declared no globals at all. Choosing `nodeBuiltin` over plain `node` keeps `__dirname`/`require` in
  an `.mjs` a lint error, since those do not exist in ESM and would otherwise crash at runtime.
  _Scope, honestly:_ the root config files (`eslint.config.mjs`, `vitest.config.ts`), `.dev/floor/`,
  and `.claude/hooks/` are **not** linted. And `--max-warnings 0` counts warnings that are actually
  **emitted** — it is not a defence against a rule set to `off`, a new `ignores` entry, or an inline
  `eslint-disable` comment.

### Fixed

- **`pharn update` no longer silently deletes capabilities you added by hand, or silently resurrects
  ones you removed.** `update` re-resolves your `archetypes` against the latest index, and it used to
  overwrite `capabilities` with that result **wholesale**. Two things went wrong, both without a word:

  - a capability installed with `pharn add` that your archetypes do not select was **dropped** from the
    config on the next update — its files orphaned on disk, invisible to `list`, `remove` and `status`;
  - because most capabilities are `universal`, a `pharn remove` was **undone** by the next update.

  `update` now writes the **union** — `resolve(archetypes, latest index) ∪ your manual entries` — so a
  manual add survives, and its files upgrade, restore, or skip-on-edit through the same per-file
  decision table as everything else. An entry that is both manual and re-selected stays manual, so a
  later archetype change cannot quietly drop it. A manual entry whose capability no longer exists
  upstream is dropped from the config (its files left alone) rather than kept as a phantom pointing at
  nothing.

- **Every capability membership change is now named.** When the list changes, `update` prints a
  `CAPABILITIES` section saying exactly what moved and why — `ADDED — newly selected for your
archetypes`, `REMOVED — no longer selected for your archetypes`, `REMOVED — no longer exists upstream
(was a manual add)`, or `KEPT — your manual add, not selected by your archetypes`. When nothing
  changed, nothing is printed.

  > **Named limit:** a removal is not a tombstone. If your archetypes still select a capability you
  > removed, the next `update` re-adds it — but it now **says so** under `ADDED` instead of restoring it
  > in silence. Preventing that (rather than reporting it) needs a `removed:` list, which is deliberately
  > not in this release.

- **`pharn remove` warns when a removal will not stick.** Removing an entry recorded as `auto` now warns
  that the next `pharn update` will reinstall it. The warning reads the stored field only, so `remove`
  still needs no network — which also bounds what it can tell you: removing a `manual` entry warns
  nothing, but that is **not** a promise the removal is permanent. The union's _manual_ half can no
  longer re-add it, yet the _resolved_ half still can — if your archetypes select that capability, the
  next `update` re-adds it as `auto`. It will be named under `ADDED` when that happens.

- **Existing installs migrate themselves, without losing anything.** An entry with no `source` (written
  before this release) is inferred exactly **once**, on your next `pharn update`: in the resolved set it
  becomes `auto`, outside it becomes `manual`. That second half is a **reconstruction, not a recovered
  fact** — an entry outside the resolved set was either added by hand, or auto-selected by an older
  index and since de-selected upstream, and nothing offline can tell those apart. It is tagged `manual`
  either way, which is the fail-safe direction: a still-existing capability is then kept, and one that
  has disappeared upstream is dropped **and named**. So no pre-existing `pharn add` is lost by the
  upgrade, and the preserved entries are named in that run's report. Absence is never treated as a
  default anywhere else: `pharn remove` stays silent on an absent `source` rather than give a legacy
  manual add a wrong "update will reinstall it" warning.

  A `source` present but outside `{auto, manual}` is reported by name (`capabilities[2].source`) and
  exits, instead of falling back to "run `pharn init`". Deleting the field is a valid fix.

- **`pharn add` no longer makes `pharn update` report "Already up to date" over a stale install.**
  `add` clones the tip of `pharn-dev/pharn-oss`, and it used to write that clone's `SKILLS_VERSION`
  into your `pharn.config.json` — even though every file it did not just copy still held the old
  version's bytes. Because `update` skips when your recorded `skillsVersion` already equals the
  latest, any `add` run after an upstream release silently closed that gate, and the skew only
  healed on the next release or via `update --force`. `add` now **refuses** when the fetched version
  does not match the one your project records, naming both versions and pointing at `pharn update`:

  ```text
  ⚠ Skills version mismatch: pharn.config.json records v1.0.0, but the fetched
    github.com/pharn-dev/pharn-oss is at v2.3.0. `pharn add` installs only at the version your
    project is already on — run `pharn update` first, then re-run `pharn add`.
  ```

  The refusal fires before anything is written and before the interactive picker renders — no
  capability directory is copied and neither `pharn.config.json` nor `pharn.records.json` is
  touched — and it exits non-zero. It fires on **any** difference, so a clone older than your config
  (a rollback, a hand-edited value) refuses the same way rather than guessing a direction. When the
  versions do match, `add` behaves exactly as before, still refreshing `commit` so a same-version
  upstream push is recorded. **Limit:** there is no way to add a capability to a deliberately-pinned
  older install — `add` has no `--force`, and `pharn update` is the only resolution.

## [0.4.0] — 2026-08-07

### Changed

- **`pharn update` is drift-safe by default — it no longer overwrites files you have edited.** Every
  install now records a sha256 per written file in a new sidecar,
  [`pharn.records.json`](docs/reference/pharn-records.md), and `update` compares each expected file
  against it: a file that is exactly what `pharn` wrote is upgraded, a file that is already identical
  to upstream is left alone, and anything it cannot prove is untouched is **skipped and listed** under
  one of three labels — `modified` (you changed it), `unrecorded` (no record for that path), or
  `unverifiable` (no usable record store, which is every install predating this release). Skips exit
  `0`; `update` still never deletes. Full decision table in
  [`docs/commands/update.md`](docs/commands/update.md).
- **A run that skipped anything no longer advances `skillsVersion` / `commit`.** Those fields describe
  the last _complete_ install, so `pharn status` keeps reporting the available update and the next
  `pharn update` still has work to do, instead of the same-version early-return stranding the skipped
  files permanently.
- **`pharn update` now records the layout of the clone it copied from.** It previously wrote files at
  the clone's layout while re-recording the stale `layout` from your config, so `status`, `remove`, and
  `list` could address a tree the files were no longer in. A `flat → pharn/` migration leaves the old
  top-level copies behind (update never deletes) and now warns about them.
- **`pharn status`'s drift section renames "LOCALLY MODIFIED" to "DIFFERS FROM …@main"** and describes
  the new behavior. The comparison is against upstream `HEAD`, so a file can differ because upstream
  moved — only `update` (which reads the records) can tell that from an edit of yours.

### Added

- **`pharn update --force`** — overwrite the skipped files anyway. Each is copied, with its relative
  path preserved, to `.pharn-backup/<YYYYMMDD-HHMMSS>/` **before** anything is overwritten; if any
  backup write fails the run aborts with every original still intact, and a colliding timestamp
  directory is uniquified rather than reused. The directory is never gitignored or pruned for you.
  `--force` also bypasses the same-version early-return, so it works on an up-to-date install — which
  is exactly what `pharn status` now tells you to do about locally-changed files.

### Fixed

- **`pharn update` no longer silently overwrites a hand-edited `CONSTITUTION.md`.** It always had,
  despite docs claiming the constitution was left untouched. `CONSTITUTION.md` is in the install
  manifest's trusted-doc set (`paths.docs` in `lib/install-manifest.ts`): `update` restores it when
  missing and upgrades it when still at the recorded hash, skipping it when locally modified
  (`modified`, same as any other manifest path); `add`/`remove` still never touch it.
- **The interactive `pharn add` picker now carries the full config forward between picks**, not just
  `capabilities` — previously `skillsVersion` / `commit` in its in-memory config drifted from what had
  just been written to disk.
- **Path-traversal hardening at both ends of the new write path (P2).** The install manifest now
  rejects a **symlinked source root** in the fetched clone (it previously resolved through one, and it
  now drives writes, not just comparisons), and every per-file write and backup refuses a
  **symlinked destination** or parent directory — `safeJoin` is lexical and `copyFileSync` follows
  symlinks, so a dangling destination symlink could otherwise be written through.

## [0.3.2] — 2026-07-24

### Security

- **The fetched commit SHA is validated before it is used or recorded.** `pharn init` / `add` /
  `update` record a `commit` provenance SHA resolved from the GitHub commits API. It is now checked
  against a strict full-40-hex-lowercase pattern (`COMMIT_RE`) at the fetch boundary
  (`src/lib/repo.ts`, `fetchRepo`) before it becomes the `degit` clone ref or is written to
  `pharn.config.json`, so a malformed or hostile value is rejected loudly instead of recorded as
  provenance. Degraded-mode `commit: null` (offline / rate-limited, `LIMITS.md §3b`) is unchanged.
  Closes the CodeQL `js/http-to-file-access` finding on `writePharnConfig`; the config-write sink and
  its per-field validators (`VERSION_RE` / `CAPABILITY_NAME_RE` / `COMMIT_RE`) are now named in
  `THREAT-MODEL.md §3.1`.

## [0.3.1] — 2026-07-24

First automated release via npm Trusted Publishing (OIDC); no functional
changes.

## [0.3.0] — 2026-07-24

### Added

- **Model routing is visible after install** — `pharn init`'s summary and `pharn status` now print a
  "Models per stage" block (`default` / `plan` / `review`, one line per configured entry) rendered from
  the `models` block actually written to `pharn.config.json`, plus a pointer to change it
  (`models.stages`). Documented under
  [`docs/reference/pharn-config.md`](docs/reference/pharn-config.md#model-routing).
- **Bare `pharn add` / `pharn remove` open an interactive picker** — run either with no argument in a
  terminal to get a grouped multi-select (grillers / lenses). `add` lists the capabilities you don't
  have yet (installed ones shown as an `Installed (N): …` summary, since `add` is additive-only) and
  installs each pick through the same per-capability path as `pharn add <name>`; `remove` lists what's
  installed and, after one confirmation, deletes each pick. Named-argument invocations are unchanged.
  Documented under [`docs/commands/add.md`](docs/commands/add.md) /
  [`docs/commands/remove.md`](docs/commands/remove.md).
- **`pharn remove <module | category:skill>`** — the inverse of `pharn add`. Removing a
  skill is a precise single-directory delete with no clone or network; removing a module
  clones once, computes the exact files that module contributed (so shared directories like
  `commands/` keep other modules' files), deletes only those, and prunes emptied directories.
  Refuses to remove `pharn-core` or a module with installed dependents, never touches
  `CONSTITUTION.md` / `memory-bank/`, and updates `pharn.config.json` to match. No arg opens
  an interactive picker; `--yes`/`-y` skips the confirmation and `rm` is an alias.
- **`pharn list`** — a read-only inventory of installed vs. available modules and
  `category:skill` skills, with update markers when the manifest is newer. Adds `--json`
  for scripting/CI (single object on stdout; diagnostics on stderr). Never writes or clones.
- **`pharn status`** — a read-only audit of the install: a version section (is `skillsVersion`
  / each module current?) and a drift section that clones `pharn-dev/pharn-oss@main` and
  byte-compares every PHARN-owned file against `.claude/`, reporting locally-modified and
  missing files. Never writes, deletes, or overwrites — the temporary clone is always cleaned
  up. `.claude/CONSTITUTION.md` and `.claude/memory-bank/` are excluded (hand-edited, anchored
  at the root, so `templates/` is still diffed). `--strict` exits 1 on any drift/outdated for
  CI; `--no-drift` skips the clone and checks the version only.
- Repo-health tooling: `CHANGELOG.md`, GitHub issue/PR templates, `CODEOWNERS`,
  Dependabot config, markdownlint for docs, an aggregate `npm run check` script, and
  an enforced test-coverage gate in CI.

### Changed

- **`pharn list` capabilities are readable at scale** — the human output now groups installed
  capabilities by role with a per-role count and prints **one capability per line** (dash-bulleted),
  instead of a single comma-joined string that re-wrapped mid-item inside the box at large capability
  counts. `pharn list --json` is unchanged (byte-identical). Documented under
  [`docs/commands/list.md`](docs/commands/list.md).
- **No-argument `add` / `remove` never prompt in a non-interactive context** — in CI or a pipe (stdin
  or stdout not a TTY), bare `pharn add` / `pharn remove` exit with a usage error instead of opening a
  prompt. `pharn remove` with no argument previously opened a single-select picker with no such guard;
  it now opens a multi-select with one confirmation and the non-TTY guard.
- **Spend-safe `review` default** — a fresh install now routes the `review` stage to `opus-4-8`/`high`
  instead of `fable-5`/`max`. Review fans out across lenses (a backend install ships ~22), so a premium
  model at `max` effort multiplied per lens was the worst-case token cost, applied silently. Cross-model
  review on `fable-5`/`max` has proven catch value and is now a documented opt-in (set
  `models.stages.review`). Existing configs are not migrated — `models` is user-owned after init.
- **`SECURITY.md` + `THREAT-MODEL.md`** — rewritten for the archetype/capability install flow
  (no module/manifest/wizard references); remote-input, validation, write-surface, and consent
  points now cite current files/functions; `degit` clone bounds documented as a labeled limit.
- **`pharn init` first-run hint now enters at `/pharn-spec`** — the post-install "Next steps" hint
  (`FIRST_FEATURE_COMMAND`) and the getting-started / `README` / `init` docs that state the entry point
  now lead with **`/pharn-spec`** (intent capture) instead of `/pharn-plan`, so the first-run norm no
  longer teaches users to skip intent capture; `/pharn-spec` feeds `/pharn-plan`. It reaches every
  install via the existing product-command (`pharn-*`) prefix copy — a constant, not a conditional —
  and the docs reword the earlier "optional" framing to "recommended first".
- **`pharn init` overwrite check** — replaced the git-history "fresh project" heuristic (and its
  broken `/docs/migrate` reference) with a concrete pre-install **write-target conflict check**: just
  before installing, `init` lists which of its _actual_ write targets already exist in your project
  (derived from the fetched clone's layout + the resolved selection via `lib/install-manifest.ts`) and
  confirms before overwriting — default **no**, with **no prompt at all** when nothing conflicts. It
  subsumes the old `pharn.config.json`-only overwrite prompt; `.claude/settings.json` (always preserved)
  is excluded. Deleting the old `steps/fresh-check.ts` — the CLI's only `git` caller — also removes the
  `core.fsmonitor` RCE surface entirely, with a guard test keeping it gone.
- **Renamed the npm package `pharn-cli` → `@pharn-dev/pharn`** and made it publish-ready — added `repository`,
  `bugs`, `homepage`, `keywords`, and `publishConfig` (public access + provenance); dropped the
  `pharn-cli` bin alias for a single `pharn` bin; and added a `prepack` build so `npm publish` always
  ships a freshly compiled `dist/`. No CLI behavior change and `version` is unchanged; the package now
  installs via `npx @pharn-dev/pharn@latest init`.
- The unscoped name `pharn` is **not publishable** — npm rejects it with E403 as too similar to
  existing packages (`yarn`, `charm`, `sharp`) — so the canonical name is the org-scoped
  **`@pharn-dev/pharn`** (the installed binary stays `pharn`). An earlier `@pharn-dev/pharn@0.2.0`
  was published then unpublished on 2026-07-22, burning `0.2.0` on that name; releases resume at
  `0.3.0`.
- Docs: surfaced the new optional `/pharn-spec` stage (intent capture before `/pharn-plan`) in
  getting-started and the `pharn-pipeline` module description, matching `pharn-oss`. No CLI code
  change — `/pharn-spec` ships transparently via the existing whole-module install from `main`.
- Docs: completed the getting-started day-to-day loop with `/pharn-regress` and refreshed the
  `pharn.config.json` example module versions to match the current `pharn-oss` manifest
  (`skillsVersion` 0.70.0).
- Docs: the root `README.md` Commands table and the `pharn -h` help text now document the
  already-implemented `add <category>:<skill>` form (install one technology skill, e.g.
  `orm:prisma`) alongside the whole-module `add <module>` form. No CLI code change.
- **Stricter `models` / `seam` validation in `pharn.config.json`.** The `models` and `seam` blocks now
  reject — naming the offender — an unknown/typo'd key (e.g. `stgaes`, `haltOnUnknwon`), a duplicate
  `resolutionOrder` step, and a `modelConfidenceThreshold` with no `model` step to gate. Previously
  such slips were silently ignored, leaving the intended setting quietly dead. The seam contract
  (`pharn-contracts/seam-config.md`) and its floor validator move to this strict posture in lockstep;
  offending keys are echoed JSON-escaped as data.

### Fixed

- **A hand-edited `pharn.config.json` now fails loudly instead of lying.** A present-but-invalid
  `models` / `seam` block previously made `add` / `status` / `update` / `remove` / `list` print
  `No pharn.config.json found. Run pharn init first.` — a lie that risked clobbering your edits. They
  now surface the validator's specific, offender-naming message and exit non-zero; `init` names an
  invalid existing config before offering to overwrite it, instead of silently treating it as absent.

## [0.2.0] — 2026-06-11

Realigned the CLI with the current `pharn-dev/pharn-oss`, which is now a
**module-based** repo (`pharn-core` + optional `pharn-pipeline`, `pharn-review`,
`pharn-audits`, and a `pharn-stack-nextjs` stack pack) described by a root
`manifest.json` and per-module `module.json` `installs` maps.

### Changed (breaking)

- **`pharn init` is now a module wizard.** It fetches the module catalog from
  `pharn-dev/pharn-oss`, then asks: which optional modules, which stack pack, and a
  privacy posture (constitution variant). It resolves dependencies + exclusivity from
  the manifest, clones the repo, copies each selected module's `installs` into
  `.claude/`, and materializes `memory-bank/` + the chosen `CONSTITUTION.md`. The old
  UI/db/auth/orm stack-scaffolder wizard and the vendor-skills consent flow were removed.
- **GitHub coordinates fixed** — `pharn/pharn` → `pharn-dev/pharn-oss`; first feature
  command `/ship-feature` → `/pharn-plan`.
- **`pharn.config.json` schema** — now records `skillsVersion`, `repo`, pinned `commit`,
  `constitution`, and the resolved `modules[]` (name + version), plus `installedAt`.

### Added

- **`pharn add <module>`** — adds a module (and its dependencies) to an existing project
  and updates `pharn.config.json`; never touches `CONSTITUTION.md`.
- **`pharn update`** — compares the pinned `skillsVersion`/module versions against the
  latest manifest, shows a diff, and re-fetches installed modules on confirmation.
- **Path-escape hardening** — module names, versions, and `installs` paths are validated
  against strict allowlists, and every copy is guarded by `safeJoin`.

## [0.1.0] — 2026-06-11

Initial published release. `pharn` bootstraps the PHARN stack into an existing
Next.js project. Exposes both `pharn-cli` and `pharn` bins.

### Added

- **`pharn init` wizard** — the default command. A `@clack/prompts` step pipeline that
  configures a stack and writes `pharn.config.json`:
  - **Prerequisite checks** — hard-fails if `next` isn't in `package.json` or the project
    isn't a git repository.
  - **Fresh-project check** — warns (via commit count and a custom-file heuristic) when the
    project isn't a fresh Next.js scaffold.
  - **Mode select** — `default-mode` (a canned stack) or `custom-mode` (the full wizard over
    every option defined in `src/types.ts`), followed by warnings and a summary the user can
    accept, cancel, or loop back to edit.
- **Skill installation** — clones the PHARN skills repo into `.claude/` via `degit`,
  prompting before overwriting an existing `.claude/` or `pharn.config.json`, then records
  `pharnVersion`, `skillsVersion`, and the chosen `stack` in `pharn.config.json`.
- **Vendor-skills flow** — fetches a remote, schema-versioned manifest, matches each vendor's
  `triggeredBy` features against the selected stack, shows commit-age hints, and presents an
  opt-in multiselect (nothing selected by default). Accepted/declined vendors are recorded
  under `vendorSkills`. Any network failure soft-fails and install proceeds.
- **Security-hardened remote input** — all remote strings (manifest, repo/branch/commit) are
  validated against strict regex allowlists, checked for `..` and control characters, and
  fetched with `redirect: 'error'`, an 8s timeout, and a 256KB body cap. The manifest
  `schemaVersion` must be exactly `1`.
- **`PHARN_DEBUG=1`** — surfaces full error output for skill-clone and vendor-manifest
  failures.
- **`pharn add` and `pharn update`** — stubbed; full behavior planned for a later release.

### Notes

- **v0.1 scope:** `init` only clones `.claude/` skills and serializes stack choices into
  `pharn.config.json`. It does not yet install npm packages or scaffold the stack — that is
  planned for v0.2 (see `docs/roadmap.md` and the `TODO(v0.2)` markers).

[Unreleased]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/pharn-dev/pharn-cli/releases/tag/v0.3.0
[0.2.0]: https://github.com/pharn-dev/pharn-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/pharn-dev/pharn-cli/releases/tag/v0.1.0
