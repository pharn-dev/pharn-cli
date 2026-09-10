# Changelog

All notable changes to `pharn` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **`smol-toml` forced off the vulnerable range with an npm `overrides` entry.**
  [GHSA-7w5x-hrqm-74c2](https://github.com/advisories/GHSA-7w5x-hrqm-74c2) / CVE-2026-85730 reports an
  infinite loop in `smol-toml`'s `parse()` for versions `<= 1.7.0`: a value inside an array or inline
  table followed by an unterminated comment resets the parser's cursor instead of ending the scan, and
  `parse()` never returns. `package.json` now declares `overrides: { "smol-toml": "~1.7.1" }`, which
  resolves to `1.7.2`.

  There was **no upstream upgrade path**. `smol-toml` arrives transitively through
  `markdownlint-cli2@0.23.2` — the latest release — which pins it to **exactly `1.7.0`**, so
  `npm audit fix --force` proposed `markdownlint-cli2@0.21.0`: a downgrade across two minors of the
  tool behind `npm run lint:md` and the required CI check `Markdown lint`. The override keeps
  `markdownlint-cli2` at `0.23.2`. The range **permits** future `1.7.x` patches without a
  `package.json` edit, but a range pins nothing: the committed lockfile still fixes `1.7.2` until
  something regenerates it, which is a Dependabot pull request rather than a property of the
  specifier.

  **Scope, stated honestly.** `smol-toml` is a transitive **dev** dependency, and npm never installs a
  published package's `devDependencies` for its consumers — `@pharn-dev/pharn` ships only `dist/`
  (`files`). This clears the alert for **contributors' installs and CI**; it is not a fix to anything
  users of the published CLI ever ran. This repo's markdownlint config is `.markdownlint-cli2.jsonc`,
  so `parse()` was never invoked on any input here and the practical exposure was already nil — the
  change removes a known-vulnerable version from the toolchain rather than closing a live path.

- **The override is pinned by a test, because nothing else enforces it.** There is no `npm audit` step
  in CI, so a `markdownlint-cli2` bump or a regenerated lockfile could drop back below the patch line
  with every gate still green. `tests/dependency-overrides.test.ts` asserts the declared range cannot
  admit a vulnerable version and that **every** `smol-toml` entry in the committed lockfile resolves at
  or above `1.7.1`, reusing `compareVersionCore` (`src/lib/semver.ts`) rather than re-deriving a
  comparator. Both checks are pure functions over a parsed lockfile, so the suite also plants a `1.7.0`
  tree — including one nested under another package — and demonstrates the check **rejects** it; a
  matcher that silently stopped matching, or a comparator read in the wrong direction, would otherwise
  leave every assertion green.

## [0.4.0] — 2026-09-10

### Added

- **CI now runs the bundle it just built.** The `Build` job executes
  `node dist/index.js --version && node dist/index.js --help` after `npm run build`. Nothing ran
  `dist/index.js` before, so the bundle's two load-time assumptions — `src/version.ts`'s
  `require('../package.json')` and the three dependencies left as bare imports — were shipped
  unexercised, and drift in either would have reached users as `ERR_MODULE_NOT_FOUND`.

- **A single-writer lock, so two `pharn` runs cannot corrupt the drift baseline.** `init`, `add`,
  `remove` and `update` now take an advisory lock (`.pharn.lock` at the project root, carrying pid,
  host, command and start time) across their write phase, and a second process **refuses** with a
  named message and exit 1 rather than queueing.

  The failure it prevents is subtler than a torn file. Process A overwrites a file; process B, which
  planned against the pre-A snapshot, overwrites it again and persists records claiming its own hash;
  A then persists ITS records and config last, recording a hash for bytes B replaced.
  `pharn.records.json` then disagrees with disk **under a matching stamp** — exactly the state the
  stamp check exists to detect — so `update` silently loses its ability to tell "pharn wrote this"
  from "you edited this". The stamp only catches an interleave that _splits_ one process's
  records/config pair.

  **`list` and `status` never take the lock and are never blocked by one**, so `pharn status --strict`
  stays runnable in CI while an update is in flight.

  A lock whose holder was `SIGKILL`ed does not wedge the project: it is broken when it is malformed,
  older than six hours, or names a dead pid **on this host**. A lock from another host is only retired
  by age, because a pid means nothing across machines — and a lock is never deleted by a process that
  does not own it.

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

- **`pharn update --force`** — overwrite the skipped files anyway. Each is copied, with its relative
  path preserved, to `.pharn-backup/<YYYYMMDD-HHMMSS>/` **before** anything is overwritten; if any
  backup write fails the run aborts with every original still intact, and a colliding timestamp
  directory is uniquified rather than reused. The directory is never gitignored or pruned for you.
  `--force` also bypasses the same-version early-return, so it works on an up-to-date install — which
  is exactly what `pharn status` now tells you to do about locally-changed files.

### Changed

- **BREAKING (argv): an option a command does not take is now refused, not silently ignored.** Options
  were declared globally, so a flag belonging to another command parsed, was dropped, and the run
  exited **0**. `pharn status --json | jq` received the human-readable box-drawing output plus a
  **success** exit code, and `pharn list --strict` exited 0 no matter what it found — a CI gate that
  could never go red. Each command now has an allowlist, and an option outside it prints
  `Unsupported option for \`status\`: "--json"` to stderr with the usage text and exits **1**.

  Accepted per command: `init` → `--archetype` (the deprecated no-op); `update` → `--force`,
  `--yes`/`-y`; `list` → `--json`; `status` → `--strict`, `--no-drift`; `add`, `remove`/`rm` → none.
  `--help`/`-h` and `--version`/`-v` work everywhere.

  **The sharpest change is the no-command-word form.** `pharn --json`, `pharn --force` and
  `pharn --strict` each ran a **full `init`** while ignoring the option; all three now exit 1. A
  reader skimming "flag validation" will not expect that, so it is called out here rather than left
  to the table.

  Two smaller flips. `pharn remove --yes` was documented as a deliberate no-op — it now exits 1;
  `remove` still has no `--yes` for the same reason as before (its named path never confirms and its
  picker's one confirm is the destructive gate), the flag is simply refused instead of dropped. And
  `--help` no longer excuses a misapplied sibling: `pharn status --help --json` refuses, matching the
  existing rule that `pharn --help --bogus` refuses. `pharn status --help` alone is unchanged.

  Only the option **name** is checked; value shape is out of scope, so `pharn list --json=false` is
  still accepted and still prints human-readable output.

- **A bundled unknown flag is named once.** minimist reports a short bundle once per unknown letter,
  so `pharn status -xz` printed `Unknown option: "-xz", "-xz"`. It now prints it once.

- **`add` and `update` now take the single-writer lock BEFORE the download, not after it.** A second
  `pharn` run that is going to be refused used to pay for the full ~2.5 MB pharn-oss tarball first,
  then discover the lock. It now refuses immediately.

  The saving is stated precisely: what this closes is **the tarball download**, not every round-trip.
  `pharn update` checks the remote `SKILLS_VERSION` before it prompts, and that small guarded request
  still happens on a refused run — closing it too would mean holding the lock across the confirm.

  The lock is now held across the download as well as the write. That widens the refusal window by
  seconds, and it is a deliberate trade: `fetchRepo` is bounded **by construction** (an 8s cap on the
  SHA resolve, 60s on the download, plus entry/byte caps on the extraction), so the added hold has a
  ceiling. It also removes a real race — two concurrent `update`s used to both complete their
  downloads before either learned who had won.

  **`pharn init` is deliberately unchanged, and that is not an oversight.** Both of its prompts (the
  archetype summary and the destructive-overwrite confirmation) sit _between_ its fetch and its
  install, so the only slot before the fetch is also before both prompts. A prompt has no ceiling —
  `init` hard-fails off a TTY, so it is always a human at a keyboard — and a walked-away `init` would
  refuse every other `pharn` command in the project for up to six hours. A bounded download may go
  under the lock; an unbounded prompt may not. The cost is named rather than hidden: a second writer
  racing `pharn init` still pays the download before being refused.

  A failed download no longer strands the lock: the fetch moved inside the locked section and its
  failure now unwinds through the release instead of calling `process.exit`, which skips `finally`.

- **The "what you get" tables now describe the layout an install actually produces.** `README.md` and
  `docs/getting-started.md` both led with `pharn-contracts/`, `.dev/floor/` and a root
  `CONSTITUTION.md`. Every install today resolves to the `pharn` layout, which writes
  `pharn/pharn-contracts/`, `pharn/floor/` (a **renamed** directory, not `.dev/floor` relocated) and
  `pharn/CONSTITUTION.md` — so a new user who looked for `.dev/floor/` after `pharn init` found
  nothing and could reasonably conclude the install was broken. Both tables are now `pharn`-first,
  with the legacy `flat` paths named in a note under each, and both gained the rows they were
  missing: `features/README.md` (installed by every run, listed in neither table), plus
  `ARCHITECTURE.md`, the trusted-doc set and `pharn.records.json` in `README.md`. The trusted-doc row
  is deliberately conditional: `PHARN_TRUSTED_DOCS` names four documents, upstream ships only
  `CONSTITUTION.md` and `ARCHITECTURE.md` under `pharn/`, and each copy is existence-guarded — so a
  `pharn` install lands two of the four today and a flat install lands all four at the project root.
  `docs/commands/init.md` and `docs/commands/status.md` lost the same flat-only paths from prose that
  applies to every install.

  A new `tests/docs-install-tables.test.ts` derives the required path set from `layoutPaths('pharn')`
  and the layout-invariant constants, so renaming one of those constants fails a gate until both docs
  follow. It pins the path **set** only — descriptions are still unverified prose.

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
  `degit`, which resolved the same ref _again_ and matched the result only against current ref tips —
  so an upstream push landing between the two resolves failed the whole command, with a valid
  SHA-named tarball sitting unreadable in the cache. codeload serves any commit, tip or not.

  **Stricter extraction.** The bundled extractor was called with neither `strict` nor `onwarn`, so a
  malformed entry was silently dropped and the clone still succeeded. `pharn` now **rejects**:
  symlinks, hardlinks, devices and fifos are refused outright, header checksums are verified, `..`
  and absolute paths are rejected, every entry must share one root, and every write goes through
  `safeJoin`.

  **Bounded, at last.** The clone previously had no pharn-imposed timeout or body cap. It now has a
  60s timeout, a cap counted over the streamed bytes (codeload sends no `content-length`), and a
  separate cap on the _decompressed_ size, so a compression bomb is bounded by something.

  **No more shared cache.** Every fetch downloads into a fresh temp dir. The old cross-project cache
  reused entries by filename rather than a verified digest, and — when ref resolution failed — took
  the ref→commit mapping out of that same cache, meaning it could decide which commit `pharn`
  believed it had fetched. Caches already on disk are inert; `docs/troubleshooting.md` says where to
  delete them.

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

### Removed

- **Proxy support, which `pharn` never implemented itself.** `degit` read `process.env.https_proxy`
  on its own, so a user who set exactly that lowercase spelling had a proxied clone. Node's global
  `fetch` reads no proxy environment variable on any platform, so that no longer works. Your
  `pharn update` and `status --no-drift` were already unproxied — they were always plain `fetch` — so
  this makes one boundary consistent rather than newly broken, **but it does break a setup that
  worked.** It is a named limit (`LIMITS.md` §3a), and every network-bearing command warns before
  fetching when it finds a proxy variable set, so the failure is explained rather than silent.

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

- **`pharn update` now warns about a configured proxy before its first fetch, not its second.** The
  notice sat inside the lock, above the tarball download — but `update` reaches the network long
  before that, checking the remote `SKILLS_VERSION` on the very first thing it does. So a proxy-only
  user (direct egress blocked) got a bare "Failed to check for updates" with no warning at all, and
  the already-up-to-date early return fetched and returned having said nothing. It is now emitted
  once at the top of the run, above both fetches.

  The placement was justified by a comment reading "a refused run performs no fetch". That is true of
  `pharn add`, which makes no fetch before its lock; it was never true of `update`, whose own lock
  comment says the opposite three paragraphs later. A lock refusal and a cancelled confirm now print
  the notice too, and in both cases a fetch really did happen.

  The suite asserted the bug — a case pinned the early return's silence "because it never clones" —
  so the fix inverts that assertion rather than only adding one. Nothing about the network changed:
  `pharn` still does not use a proxy (`LIMITS.md` §3a), and this only makes the failure explained
  instead of silent.

- **A stale record store no longer reports two identical values as a difference.**
  `pharn.records.json` is ignored when its `skillsVersion` **or** its `commit` disagrees with
  `pharn.config.json`, but the warning interpolated only `skillsVersion` on both sides — so a
  commit-only mismatch read "a different install state (skills v3.0.1) than pharn.config.json
  (skills v3.0.1)". The records were dropped for real, and the stated reason contradicted itself.
  The note now names only the field(s) that actually differ (`skillsVersion`, `commit`, or both),
  prints each SHA in full — the stamp is deliberately not format-checked, so a short prefix could
  reproduce the same identical-looking pair — and says what it costs: every file differing from
  upstream becomes `unverifiable` instead of a clean upgrade.

- **`pharn status --no-drift` now warns about a configured proxy before it fetches, as `init` and
  `add` already did.** The notice sat inside the drift branch, justified by "`--no-drift` never clones" — true,
  but never clones is not never fetches: that path still reads `SKILLS_VERSION` over the wire. So the
  one user the notice exists for, on a proxy-only network where direct egress is blocked, got an
  unexplained timeout from the single path that skipped it. The notice is now emitted once above the
  branch, ahead of every fetch the command can make. The test suite had promoted the same mistaken
  reasoning into an assertion and was pinning the silence; that assertion is inverted.

- **The tar reader no longer discards PAX headers, which could land a file at a truncated path.**
  `src/lib/tar-extract.ts` sorted typeflags `x` and `g` into a SKIP bucket that stepped over the
  padded payload and threw the records away. Those records **override the ustar header that follows
  them**, and two of them decide what the reader does: `path=` replaces prefix+name, and `size=`
  replaces how many bytes the entry occupies.

  A writer emits `path=` exactly when the real path does not fit ustar — and writes that path
  **truncated to the 100-byte `name` field** in the header it cannot represent. The truncated path is
  relative, rooted and `..`-free, so it passed every other rule in the module: the file was written
  to a wrong-but-contained location with nothing logged. Measured, not theorised — against the old
  reader, an archive whose `path=` asked for a 144-character name extracted without complaint to a
  100-character one. A discarded `size=` is worse still: it mis-frames every following header, so the
  reader would start parsing attacker-controlled file _content_ as tar headers.

  Now a per-file `x` header is **refused outright** — the decision reads the typeflag byte alone, so
  no malformed payload can suppress it — and a global `g` header is refused when it sets a `path`,
  `linkpath` or `size` default, or when its records do not parse cleanly. `g` cannot take the same
  blanket rule: every codeload archive opens with one, so refusing them all would fail 100% of real
  fetches on the first block; the one GitHub sends carries only `comment=<sha>` and is still skipped.
  The error names the typeflag and the record keywords, so an upstream change that starts emitting
  PAX is diagnosable in one read. GNU's `L`/`K` long-name typeflags already fell to the
  unsupported-type refusal and now have a test pinning it.

  **Latent, not exploitable today.** The live archive (1,968 entries) contains **zero** `x` headers
  and one `g` carrying only a comment; the longest path it writes is 97 characters. But its longest
  raw `name` field is **exactly 100** — already at the field ceiling — so the margin was one
  character, not a comfortable distance. Extraction of every real archive is unchanged.

  `SECURITY.md`'s `tar-extract.ts` bullet is updated in the same change rather than after it: the
  sentence it carried was _correct about the old parser_, so landing the fix alone would have put a
  disclosure policy that misdescribes its own reader on `main` for the length of the gap.

- **A corrupt `pharn.config.json` is no longer reported as a missing one — and the fix stops the CLI
  prescribing a command that would destroy it.** A config with a stray comma used to print
  "No pharn.config.json found. Run `pharn init` first.", whose two halves are both false: the file is
  right there, and `init` rewrites it wholesale — resetting hand-edited `models`/`seam` blocks and
  re-stamping every capability `source: 'auto'`, discarding the manual-`pharn add` provenance only
  that file remembers. `readPharnConfig` had collapsed "no file" and "unparseable file" into the same
  `null`.

  Unparseable now raises a named `ConfigParseError` — joining the `ModelRoutingError` /
  `SeamConfigError` / `CapabilitySourceError` family that both `loadConfigOrExit` and `list --json`
  already report loudly — which names the file's full path, says it is not valid JSON, gives the line
  and column when V8 supplies one, and offers a remedy that keeps your bytes (repair by hand, or move
  the file aside before re-initialising). The parse error's own text is never printed: V8 echoes raw
  file content into some of its messages, so only the two integers it computed are extracted, and
  control characters in the reported path are escaped rather than emitted — a project directory whose
  name carries an escape sequence cannot rewrite the terminal through the error line. Absent,
  unreadable, and wrong-shape configs are unchanged and still point at `pharn init`.

  `docs/troubleshooting.md` documents the new diagnostic and the move-aside recovery, and its
  "run init first" section now states that it covers only a config that is absent or unreadable.

- **Breaking a stale lock is now a single-winner operation.** The break deleted the lock file with
  `rmSync(…, { force: true })` and never re-checked that the bytes it removed were the ones it had
  just judged stale — so two runs that both found the same corpse could interleave
  (`B: rm → B: create → C: rm → C: create`) and **both end up holding the lock**, with C's delete
  landing on B's freshly-created, live one. That is the one path in the file that did not verify;
  acquiring has always been an atomic `O_EXCL` create, and releasing already re-read before unlinking.

  The break is now `rename` → re-verify → create. `rename(2)` hands the file to exactly one process
  (the loser gets `ENOENT`), the moved bytes are compared against the ones that were judged, and only
  then does the unchanged exclusive create take the lock — the rename decides who may _break_,
  `O_EXCL` still decides who _holds_. A loser refuses with the usual named message and exit 1, never
  retries; a process that finds it moved a **live** lock puts it back with `link(2)`, which is
  create-or-fail and so can never clobber a lock a third process took in the gap.

  Reaching the old defect needed a pre-existing stale lock plus two writers inside the window between
  one process's delete and its create, so no released version is known to have hit it.

  Two side effects worth naming. The renamed corpse is removed on every in-process path, and a later
  break also sweeps corpses older than six hours, so a run killed mid-break cannot leave a growing
  pile of `.pharn.lock.*` files in your project. And a `.pharn.lock` that is a **directory** no longer
  wedges the project: `force` does not imply `recursive`, so the old delete threw on every run and
  refused forever — it is now moved aside (never recursively deleted) and the run proceeds.

- **The README no longer oversells the network floor.** Its Security section applied one fetch's caps —
  an 8s timeout and a 256KB body cap — to _all_ remote input. That pair belongs to the `SKILLS_VERSION`
  read alone: the commit-SHA resolve has no body cap, and the tarball uses a 60s timeout and a 32MB
  streamed cap, plus 128MB decompressed and 20,000 entries in the extractor. Only `redirect: 'error'`
  was ever universal. The caps are now stated per fetch, agreeing with `THREAT-MODEL.md` §3. Docs only —
  no behavior changed; the code was always right.

- **`SECURITY.md` no longer describes a fetch `pharn` does not perform.** It said the CLI
  `degit`-clones pharn-oss, listed `degit` among four runtime dependencies (there are three —
  `degit` went when the fetch moved to a `codeload` tarball), and claimed that clone had **no**
  pharn-imposed timeout or body cap, while `src/lib/repo.ts` sets `CLONE_TIMEOUT_MS` (60 s),
  `MAX_ARCHIVE_BYTES` (32 MB), `MAX_EXTRACTED_BYTES` (128 MB), `MAX_ENTRIES` (20 000) and
  `redirect: 'error'`. So the policy pointed researchers at a removed dependency and away from
  `src/lib/tar-extract.ts`, the hand-written ustar reader that parses attacker-controlled bytes —
  now its own **In scope** bullet. `THREAT-MODEL.md` and `LIMITS.md` were already right; this
  reconciles the last document that was not.

- **`THREAT-MODEL.md` and `LIMITS.md` are installed again — every `pharn` install was silently
  dropping both.** The trusted-doc set named them `pharn/THREAT-MODEL.md` and `pharn/LIMITS.md`,
  paths that have **never existed** in pharn-oss: its relocation moved `CONSTITUTION.md` and
  `ARCHITECTURE.md` under `pharn/` and left these two at the repo root. Both the copy routine and the
  install manifest existence-guard each doc, so the two simply vanished — no error, no warning, and
  `pharn status` could not flag it either, because it derives what it expects from the same set.

  The cost was not two absent files. Measured over one real install of `pharn-oss@main`, **108 of the
  copied files cite these docs** — product commands, floor checkers and contracts — and they cite them
  by their bare name (`THREAT-MODEL.md` 118 times, `LIMITS.md` 68 times, neither ever with a `pharn/`
  prefix), the form that resolves against the project root. Every one of those pointers landed on
  nothing, including the ones to `LIMITS.md`, the document that states what PHARN does **not**
  guarantee.

  The fix is the mirror the CLI already promises: each doc is installed where upstream keeps it, so
  the prefix is per-**doc**, not per-layout. A flat install still lands all four at the root.
  Upstream's own `protect-trusted-paths.cjs` — a hook this CLI installs — already spelled them the
  same way. That the 108 citations now resolve is **advisory**: the floor is only that the files exist
  at the project root; nothing parses a citation.

  **Existing installs do not self-heal.** `pharn status` will now correctly report the two docs as
  `missing` (and `pharn status --strict` will exit 1) on any project installed by an earlier version,
  but a plain `pharn update` returns `Already up to date` without restoring them — its same-version
  early-return sits in front of the per-file `missing → restore` rule. Use `pharn update --force`
  (which copies anything it overwrites to `.pharn-backup/<timestamp>/` first) or re-run `pharn init`.

- **`pharn init` reports which docs it actually wrote.** The outro printed
  `PHARN commands + hooks + docs written → .claude/` unconditionally — wrong twice over: docs never
  went to `.claude/`, and the line read as success even when the existence guard had written nothing.
  It now prints the commands/hooks line and a separate `N trusted docs written → <paths>` naming
  them, and warns about any doc the fetched repo did not ship. Naming them rather than counting them
  is the point: a count would hide exactly the silence that let this ship.

- **Ctrl+C at the overwrite prompt no longer orphans the fetched clone.** `pharn init` fetches
  pharn-oss into a temp dir, shows the archetype summary, then — when install targets already exist —
  asks a destructive-overwrite confirmation. That second prompt called `process.exit(0)` on Ctrl+C,
  from inside the `try` whose `finally` disposes of the clone. Node does not run `finally` on
  `process.exit`, so the multi-megabyte `$TMPDIR/pharn-*` directory was left behind — on **any**
  re-install, since an existing `pharn.config.json` alone makes the conflict set non-empty.

  `confirmWriteTargets` now returns `proceed` / `decline` / `cancel` instead of exiting, mirroring the
  archetype summary one prompt earlier, and `init` takes the exit **after** the cleanup.
  User-visible behavior is byte-identical: the same "Cancelled. Nothing was changed." and the same
  exit 0. `docs/commands/init.md`'s promise that the clone is always cleaned up is now true on this
  path too.

  `confirmWarning` (`src/lib/confirm.ts`) is removed — this stage was its only caller, and every
  helper it offered ends in an exit, which is the one thing this stage must not do.

- **An interrupted `pharn` no longer leaks its temp clone — or claims to have succeeded.** Disposal
  hung entirely off a `finally` in each caller, and two real exits never reach one. Node does not run
  `finally` on `process.exit`, and while a spinner is up — which is exactly the multi-megabyte clone
  window — `@clack/core` raw-modes stdin, so **Ctrl-C arrives as a keypress, not a signal**, and clack
  calls `process.exit(0)`. The clone leaked and the cancelled run **exited 0**, looking successful to
  any calling script. In a piped run, `@clack/prompts`' own `SIGINT` listener printed and returned,
  swallowing the signal entirely.

  `fetchRepo` now registers each clone in a process-wide set drained by `exit`, `SIGINT` and
  `SIGTERM` handlers (installed once, not once per fetch). The signal handlers re-raise after
  cleaning up, so the exit status is truthful: **130** for `SIGINT`, **143** for `SIGTERM`. This is a
  backstop **underneath** each caller's `finally`, not a replacement — `docs/commands/init.md`'s
  promise that "the temp clone is always cleaned up (even on cancel or error)" is now true.

- **Comments and the roadmap no longer describe a `degit` clone `pharn` does not perform.** Six
  sites still named the fetch by its removed dependency: `src/lib/constants.ts` ("the CLI
  degit-clones the whole repo"), both `COMMIT_RE` comments in `src/lib/validate.ts` (the 40-hex form
  attributed to `degit`, the validated sha called a "degit ref"), the `Trust (P2)` headers of
  `src/lib/dest-drift.ts` and `src/lib/symlink-guard.ts` ("a degit clone's temp dir"), and the
  user-facing `docs/roadmap.md` row **Degit-clone `pharn-dev/pharn-oss` … Shipped**. Each now names
  what actually runs: one commit resolve, then a `codeload.github.com/…/tar.gz/<sha>` download
  extracted by `src/lib/tar-extract.ts`. The two trust headers keep their **UNTRUSTED**
  classification and only re-source it, so a reader auditing them is pointed at the hand-written
  ustar reader that parses attacker-controlled bytes rather than at a dependency that no longer
  exists. Three more sites in the tests came with it, because a test comment is spec here too:
  `tests/validate.test.ts`'s `COMMIT_RE` header is a deliberate mirror of the source comment, so it
  is reworded in the _same words_ rather than paraphrased; `tests/init.test.ts`'s proxy-notice
  section was still headed "the degit proxy notice" and explained itself in the present tense; and
  its non-TTY case promised that "no `~/.degit` tarball is paid for", naming a cache that no longer
  exists at all. Comments and docs only — no behavior changed, no assertion touched. The
  deliberately past-tense mentions stay as they are, in `src/lib/tar-extract.ts`,
  `src/lib/proxy-env.ts`, `docs/troubleshooting.md`'s migration section, and
  `tests/init.test.ts`'s own account of why the notice is no longer platform-gated.

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

- **The config reference no longer documents a prompt that was deleted.**
  [`docs/reference/pharn-config.md`](docs/reference/pharn-config.md)'s "Overwrite behavior" table
  still quoted `init` as asking _"Overwrite existing pharn.config.json?"_ and claimed it showed the
  previous `skillsVersion` first. Neither had been true since that single-file guard was replaced by
  `confirmWriteTargets`, which derives the install's **actual** write targets and prompts only when
  some already exist — the string survived nowhere but that one doc line, and nothing in the init
  path read a `skillsVersion` at all. The rows now describe the real trigger, the capped listing, the
  real question (**Continue and overwrite?**, default no), and the fact that a conflict-free project
  is never prompted.

- **`pharn init` names the `skillsVersion` you are about to overwrite again.** The deleted prompt's
  one genuinely useful feature is restored: when `pharn.config.json` is among the conflicting paths,
  the warning reads "currently at skills v2.3.4" before listing them. It is read from your local
  config only — no network — and **any** failure to read it (absent, unreadable, truncated JSON, a
  hand-edited value that is not a plain version) is treated as "nothing to show": the clause is
  omitted and the prompt is otherwise identical. That is deliberate rather than defensive.
  `init` is the command you run to _repair_ a broken `pharn.config.json`, and the strict reader the
  other commands share throws by design on a bad `models` / `seam` / `capabilities[].source` block —
  so reading through it here would have made a repairable config abort the one command that repairs
  it. A conflict-free install still prompts for nothing and reads nothing.

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
- **The missing-repository prerequisite failure now prints on stderr, like every other fatal.** It was
  rendered through `@clack/prompts`' `cancel()`, which writes to **stdout** — so the one error a
  first-time user is most likely to hit exited `1` with an empty stderr, while every other fatal in the
  CLI already went through the shared reporter. A run that captured the two streams separately, or
  gated on stderr alone, saw no cause at all. It now uses `logError`, and `tests/prereqs.test.ts` pins
  the stream rather than only the exit code.

  The message also dropped its literal `✗`: `log.error` supplies its own glyph, so carrying one meant
  rendering two in a row.

- **`isMultiTenant`'s doc comment no longer describes behaviour that does not exist.** It claimed the
  field was "written on every fresh install" and that Principle 2 was stripped from `CONSTITUTION.md`
  when it was false. Both were true of the module/wizard flow, which has been removed — nothing in
  `src/` has written or read the field since. The field stays declared so an older config carrying it
  still type-checks on read (P7); the comment now says so, and warns against adding a reader without
  restoring the writer.

### Security

- **A symlinked `features/` directory in a fetched repo can no longer copy files from outside the
  clone into your project.** `features/README.md` is the first root-relative file the install copies
  that has an intermediate directory, and the existing leaf-only symlink check does not see a
  symlinked _parent_: `existsSync` returns true, the leaf is not itself a link, and the copy reads
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
  write-protects `THREAT-MODEL.md` at the _user's_ project root are upstream changes still to land.

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

[Unreleased]: https://github.com/pharn-dev/pharn-cli/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/pharn-dev/pharn-cli/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/pharn-dev/pharn-cli/releases/tag/v0.3.0
[0.2.0]: https://github.com/pharn-dev/pharn-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/pharn-dev/pharn-cli/releases/tag/v0.1.0
