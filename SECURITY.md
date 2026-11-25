# Security Policy

Taking security seriously is part of PHARN, not an afterthought. `pharn` is the installer that fetches and installs PHARN, so it sits at a trust boundary: it pulls remote content over the network and writes it into a user's project. We welcome coordinated disclosure of any vulnerability in this repository.

## What `pharn` is, and its security surface

This repository **is `pharn`** — an ESM-only Node CLI (`"type": "module"`, NodeNext, `engines.node >= 24.2.0`) that detects a project's **archetype(s)**, downloads `pharn-dev/pharn-oss` as a tarball from `codeload.github.com` and extracts it into a temp directory with its own reader (`src/lib/tar-extract.ts`), takes the install set and the capability index from that tree's `pharn-install.json` (a tree without one is refused, and every file it declares is held to its sha256 before anything is written — `src/lib/upstream-manifest.ts`), copies the resolved capabilities plus fixed product surfaces into the user's project, and writes `pharn.config.json` and `pharn.records.json`. Everything it installs lands under two roots: `pharn/` (the capability dirs `pharn/pharn-pipeline/grillers/` and `pharn/pharn-review/`, `pharn/pharn-contracts/`, `pharn/pharn-core/`, the floor at `pharn/floor/`, the trusted docs `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`, `pharn/THREAT-MODEL.md` and `pharn/LIMITS.md`, and `pharn/features/README.md`) and `.claude/` (the `pharn-*` commands, hooks and agents, and `.claude/settings.json` only when the project has none). `isPharnOwnedPath` (`src/lib/install-surfaces.ts`) holds every manifest destination to those two roots. There is **no fetch, unpack, or cache dependency**: `pharn` spawns no `git` binary and keeps no tarball cache, so every fetch is a fresh download into a fresh temp directory, removed on success, cancel and error alike. There is no module catalog, no `manifest.json` fetch, and no wizard questionnaire. It has a small, thin dependency set — **two** runtime dependencies (`@clack/prompts`, `picocolors`) — no bundled runtime services, and no telemetry. Its security-relevant surface is exactly the two things that cross a trust boundary: **remote input** (the pharn-oss tarball and its extraction, the lightweight release, commit-SHA and `SKILLS_VERSION` fetches, and every name read from the untrusted tree) and **file-system writes** (everything it copies into the project — the `.claude/` surfaces, the `pharn/` capability dirs and product surfaces, and upstream's Apache-2.0 `LICENSE` at the one deliberate source-differs-from-destination mapping, `pharn/LICENSE` — plus the `pharn.config.json`, `pharn.records.json`, `pharn/.lock` and `pharn/.backup/<timestamp>/` files it writes, and the lines it appends to the project's `.gitignore` and `.prettierignore`). See `THREAT-MODEL.md` for the trust-boundary map — its §2 describes this fetch boundary in full — and `CLAUDE.md` for the command architecture.

The CLI's security model is **deterministic, not model-driven**: it never asks an AI to decide what is safe. Every value that arrives from the network or the fetched tree is validated against strict regex/enum allowlists (`src/lib/validate.ts`), rejected for `..` and control characters, and every copy is confined with a `safeJoin` guard plus symlink walks over the destination at the write sites (`src/lib/install-capabilities.ts`) so nothing can escape its intended target — checks that hold regardless of what the fetched content says. Preserve that shape: a security fix that relies on "the content will be well-behaved" is not a fix.

## Supported versions

`pharn` is published to npm as [`@pharn-dev/pharn`](https://www.npmjs.com/package/@pharn-dev/pharn) and is typically run via `npx @pharn-dev/pharn init`. We patch security issues against the **latest** published version only; `npx @pharn-dev/pharn@latest ...` always resolves to a supported release.

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < Latest | :x:                |

Because the CLI is normally invoked through `npx`, most users run the latest version automatically. If you have a pinned or globally installed copy, update it (`npm i -g @pharn-dev/pharn@latest`) or invoke `npx @pharn-dev/pharn@latest` to pick up fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, report privately through one of these channels:

1. **GitHub Security Advisories (preferred)** — use [private vulnerability reporting](https://github.com/pharn-dev/pharn-cli/security/advisories/new) to open a confidential report. No email is exposed and the report stays embargoed until a fix ships.
2. **Email** — if you cannot use GitHub advisories, email `support@pharn.dev` with `[PHARN SECURITY]` in the subject.

Please include as much of the following as you can — it speeds up triage:

- The type of issue (e.g. path traversal, command injection, SSRF, supply-chain, insufficient input validation).
- Full paths of the source file(s) involved (step, lib, command, or config).
- The location of the affected code (tag/branch/commit or a direct URL).
- The published `pharn` version and Node.js version, if relevant.
- Any configuration or stack choices required to reproduce.
- Step-by-step reproduction instructions.
- Proof-of-concept, if you have one.
- Impact — how an attacker might exploit the issue.

## Response timeline

- **Initial acknowledgement** — within 3 business days of your report.
- **Preliminary assessment and severity** — within 7 days.
- **Resolution target** — critical issues within 30 days; other issues within 90 days.

We will keep you informed throughout, coordinate disclosure timing with you, and credit you in the advisory unless you ask to remain anonymous.

## Scope

Scope follows the surface described above: everything that touches remote input or the user's file system.

### In scope

- **Remote-input validation** bypasses in `src/lib/validate.ts` or `src/lib/upstream-manifest.ts` — the regex/enum allowlists active in the archetype flow (`CAPABILITY_NAME_RE`, `COPY_FILENAME_RE`, `VERSION_RE`, `COMMIT_RE`, `RELEASE_TAG_RE`, the `role`/`applies` enums via `assertRole`/`assertAppliesToken`), the `..` checks, control-character rejection (`assertSafeString`), or the network guards on the lightweight fetches. Every fetch goes through one bounded GET (`fetchCapped` in `src/lib/fetch-capped.ts`): `redirect: 'error'`, a hard deadline over the request **and** the body read (`withDeadline` in `src/lib/deadline.ts`, which settles at the deadline even if the body never ends), and a byte cap counted as the body streams. The lightweight fetches are sized at an 8 s deadline each: the release resolve in `src/lib/release.ts` (1 MiB for the release object, 1 KiB for the tag's commit), `fetchCommitSha` in `src/lib/repo.ts` (1 KiB) and `fetchRemoteSkillsVersion` in `src/lib/skills-version.ts` (256 KB). The repo download itself (`fetchRepo` in `src/lib/repo.ts`) carries the **same three guards, separately sized**: a 60 s deadline (`CLONE_TIMEOUT_MS`, sized to cover a streamed multi-megabyte body rather than a one-line response) and a body cap (`MAX_ARCHIVE_BYTES`, 32 MB), counted over the stream because codeload sends no `content-length`. Report ways around any of them (see `THREAT-MODEL.md §2` for the boundary, `§4b` for what it does and does not bound).
- **Archive parsing** in `src/lib/tar-extract.ts` — the hand-written ustar reader `pharn` uses instead of a tar dependency, and the highest-value target here, because it parses attacker-controlled header bytes. In scope: anything that gets an entry written outside the destination, gets a non-regular entry created, gets an entry written that pharn did not select, or gets past a bound. **It selects, then judges.** `src/lib/repo.ts` passes the paths to write: the ones `pharn-install.json` lists, plus the four files the CLI reads itself (`CLONE_READ_FILES`: the manifest, `SKILLS_VERSION`, `MIN_CLI`, `.claude/settings.json`), in two streamed passes (the CLI-read files, then — once the manifest has validated — the listed paths). Every other entry is skipped and **never written**, whatever its type or name: a symlink, hard link, device, pax header, long or `:` name elsewhere in pharn-oss no longer refuses the install, because nothing unselected touches disk. Every header is still framing-checked, because the walk cannot find the next one without it: header-checksum verification, the `ustar` magic, octal-only numeric fields (a GNU base-256 field fails the octal test; only ASCII space is trimmed), and an end-of-archive marker followed only by zeros. An entry at a selected path gets the full floor: a regular file only (typeflag `0`/NUL; a symlink, hard link, device, directory or any other type there is refused), strict UTF-8 with no control or format character, `prefix` + `name` reassembly **before** any path rule runs, rejection of absolute paths, `..` segments, empty or `.` segments and any `\` or `:`, a single-leading-component strip, a same-root check across every selected entry and both passes, a refusal when the path appears twice, and `safeJoin` containment at each write. That is what makes **the clone invariant** true — the tree `fetchRepo` returns holds only regular files and directories, and only the listed and CLI-read files, in a private temp dir — and the clone-side readers rely on it rather than re-checking for links. A listed file the archive does not ship as a regular file at its path is missing from the tree, and the manifest's raw sha256 check (`verifyUpstreamManifest`) refuses the tree. **`pax` records are never honoured: pharn reads only the ustar fields.** A per-file extended header (typeflag `x`, and GNU `L`/`K`) rewrites the next entry's path or size, so it is skipped together with the entry it modifies; when that entry's ustar name is a selected path, it is **refused**, and when the record renamed a listed file away from its ustar name, that file is missing and the sha256 check refuses. A **global** header (typeflag `g`; every codeload tarball opens with one) is skipped, payload unread; its defaults are never consulted, and the walk is framed by the ustar `size` alone. Reports that get a `pax` record honoured, or an unselected entry written, are in scope. Bounds, passed in by `fetchRepo`: `MAX_HEADERS` (200 000 headers of any type), `MAX_SCANNED_BYTES` (1 GiB of decompressed stream — the compression-bomb bound; the tar is streamed through `zlib.createGunzip`, never held whole) and `MAX_WRITTEN_BYTES` (128 MB, the sum of the selected files' sizes, checked at each header before its payload is read), on top of the 32 MB download cap.
- **Path traversal** or unintended file-system writes from `src/lib/install-capabilities.ts` / `src/lib/install-manifest.ts` / `src/lib/diff.ts` / `src/commands/remove.ts` (copying resolved capability dirs and fixed product surfaces, `pharn.config.json` write) or from any capability / product-filename that escapes its intended target (`safeJoin` in `src/lib/validate.ts`, plus destination symlink walks in `install-capabilities.ts`).
- **Server-side request forgery (SSRF)** or redirect abuse in the release, commit-metadata or `SKILLS_VERSION` fetches (the `fetch()` calls above use `redirect: 'error'`; report ways around it).
- **Supply-chain** issues in how pharn-oss is fetched — the default verified-release resolve (`--ref latest`, the default of `pharn init` since 0.15.0; `src/lib/release.ts`: the latest release's tag, the tag's commit through the full tag ref, and the check that the fetched tree's `SKILLS_VERSION` equals the tag; it fails closed and never floats), the SHA-pinned `codeload.github.com` tarball download it feeds (`src/lib/repo.ts`), the opt-in `main` channel (`--ref main`, or an install that records no `ref`) with its one commit-SHA resolve **and its degraded mode** — when the SHA cannot be resolved the fetch floats `refs/heads/main` instead and records `commit` as absent (`LIMITS.md` §3b) — or the resolution of the repo coordinates (`src/lib/constants.ts`). Note the standing residual rather than re-reporting it: provenance is by-SHA, **not cryptographic** (`LIMITS.md §1b`), so a compromised upstream serving a valid-**shaped** tree at the resolved SHA passes every check above.
- **Untrusted-content injection** — a poisoned pharn-oss tree (a malicious `pharn-install.json` entry, a symlink or other non-file entry at a listed path, or unexpected directory entries) that leads the CLI to write outside the project or copy unintended content.
- Logic in the archetype install pipeline (`src/commands/init.ts`, `src/steps/archetype-summary.ts`, `src/steps/overwrite-check.ts`, `src/steps/install-archetype.ts`, and the other commands) that could be abused to skip a consent prompt or overwrite files without confirmation.
- **The forward-compatibility gate** in `src/lib/min-cli-gate.ts` and `readMinCli` (`src/lib/skills-version.ts`) — an optional `MIN_CLI` file read out of the **untrusted clone** and version-parsed to decide whether to refuse execution. It fails open by design (absent or malformed means "no constraint"); report ways to make a well-formed newer value fail to refuse, or a malformed one to crash rather than warn.
- **Local-but-user-editable sidecar parsing** — `src/lib/pharn-config.ts` (every `capabilities[]` entry's `name` is validated against `CAPABILITY_NAME_RE` and its `role` against the role enum at ingest, because `pharn remove` path-joins that name into a recursive delete — which additionally accepts only a strict child of the role subtree via `safeChildJoin`), `src/lib/install-records.ts` (whose own header declares the store untrusted input: a defensive parser, a key-segment rule, and the invariant that a record key never drives a write; only orphan detection, a read, and `pharn uninstall`, a delete of a file still at its recorded hash, turn a key into a path, each behind `safeJoin`, a symlink walk and a regular-file check) and `src/lib/project-lock.ts` (which parses a JSON payload written by another process and feeds its `pid` to `process.kill`). Report ways to get a crafted store or lock file to write or delete outside the project, signal an unintended process, or get an overwrite or delete past the check that the file still has its recorded hash.
- **Control-character or escape-sequence injection** into terminal output from upstream names — `src/lib/unknown-capabilities.ts` strips them before display; report ways past it.

### Out of scope

- Vulnerabilities in the **PHARN skills, hooks, or runners** that `pharn` installs — report those against the skills repository (e.g. its own `SECURITY.md`), not here.
- Vulnerabilities in **third-party AI tools** the installed stack targets (Claude Code, Codex, Cursor).
- Issues in **vendor libraries** the docs reference (Stripe, Drizzle, Supabase, etc.) — report those upstream.
- Vulnerabilities in the CLI's **own npm dependencies** that are fixed by an upstream patch — please report to that project (and feel free to flag it to us so we can bump the floor).
- Social engineering, or attacks requiring physical access to a user's machine.
- Denial of service that does not exploit a specific vulnerability (e.g. simply pointing the CLI at a huge repository).

## Security best practices for users

`pharn`'s input validation and consent prompts are defense-in-depth, not a guarantee. When using the CLI:

1. **Run it in an existing, version-controlled project** so you can diff exactly what `init` wrote (the `.claude/` surfaces, the capability dirs and product surfaces, and `pharn.config.json`) before committing.
2. **Review the archetype summary** before accepting install — capabilities are selected deterministically from your project signals and the fetched index; cancel if the set looks wrong.
3. **Prefer `npx @pharn-dev/pharn@latest`** so you run the current, supported release rather than a stale pinned copy.
4. **Inspect the installed `.claude/` commands and hooks** before running them through your AI tool — installation copies in remote content.
5. **Set `PHARN_DEBUG=1`** if a fetch or install step fails unexpectedly, and report anything that looks like the CLI fetching or writing somewhere it should not.

## Acknowledgements

We appreciate the security research community. Anyone who reports a valid issue in good faith will be credited in the resulting advisory, unless they ask to remain anonymous.

Thank you for helping keep PHARN and its users safe.
