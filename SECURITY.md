# Security Policy

PHARN is an audit-grade methodology — taking security seriously is part of the brand, not an afterthought. `pharn` is the bootstrapper that fetches and installs that methodology, so it sits at a trust boundary: it pulls remote content over the network and writes it into a user's project. We welcome coordinated disclosure of any vulnerability in this repository.

## What `pharn` is, and its security surface

This repository **is `pharn`** — an ESM-only Node CLI (`"type": "module"`, NodeNext, `engines.node >= 20`) that detects a project's **archetype(s)**, downloads `pharn-dev/pharn-oss` as a tarball from `codeload.github.com` and extracts it into a temp directory with its own reader (`src/lib/tar-extract.ts`), derives the capability index from that tree's frontmatter, copies the resolved capabilities plus fixed product surfaces into the user's project — the `.claude/` command/hook surfaces, the mirrored capability dirs (`pharn-pipeline/grillers/`, `pharn-review/`), and the trusted docs / `pharn-contracts/` / `.dev/floor/` product surfaces at the project root (or all of it under `pharn/`) — and writes `pharn.config.json`. There is **no fetch, unpack, or cache dependency**: `pharn` spawns no `git` binary and keeps no tarball cache, so every fetch is a fresh download into a fresh temp directory, removed on success, cancel and error alike. There is no module catalog, no `manifest.json` fetch, and no wizard questionnaire. It has a small, thin dependency set — **three** runtime dependencies (`@clack/prompts`, `minimist`, `picocolors`) — no bundled runtime services, and no telemetry. Its security-relevant surface is exactly the two things that cross a trust boundary: **remote input** (the pharn-oss tarball and its extraction, the lightweight `SKILLS_VERSION` / commit-SHA fetches, and every name read from the untrusted tree) and **file-system writes** (everything it copies into the project — the `.claude/` surfaces, the mirrored capability dirs, and the root/`pharn/` product surfaces — plus the `pharn.config.json` it writes). See `THREAT-MODEL.md` for the trust-boundary map — its §2 describes this fetch boundary in full — and `CLAUDE.md` for the command architecture.

The CLI's security model is **deterministic, not model-driven**: it never asks an AI to decide what is safe. Every value that arrives from the network or the fetched tree is validated against strict regex/enum allowlists (`src/lib/validate.ts`), rejected for `..` and control characters, and every copy is confined with a `safeJoin` guard plus symlink rejection at the write sites (`src/lib/install-capabilities.ts`) so nothing can escape its intended target — checks that hold regardless of what the fetched content says. Preserve that shape: a security fix that relies on "the content will be well-behaved" is not a fix.

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

- **Remote-input validation** bypasses in `src/lib/validate.ts` or `src/lib/capability-index.ts` — the regex/enum allowlists active in the archetype flow (`CAPABILITY_NAME_RE`, `COPY_FILENAME_RE`, `VERSION_RE`, the `role`/`applies` enums via `assertRole`/`assertAppliesToken`), the `..` checks, control-character rejection (`assertSafeString`), or the network guards on the lightweight fetches (`fetchRemoteSkillsVersion` in `src/lib/skills-version.ts`: `redirect: 'error'`, 8s timeout, 256 KB body cap; `fetchCommitSha` in `src/lib/repo.ts`: `redirect: 'error'`, 8s timeout). The repo download itself (`fetchRepo` in `src/lib/repo.ts`) carries the **same three guards, separately sized**: `redirect: 'error'`, an `AbortController` timeout (`CLONE_TIMEOUT_MS`, 60 s — sized to cover a streamed multi-megabyte body rather than a one-line response), and a body cap (`MAX_ARCHIVE_BYTES`, 32 MB) enforced as a **running count over the stream**, because codeload sends no `content-length`. Report ways around any of them (see `THREAT-MODEL.md §2` for the boundary, `§4b` for what it does and does not bound).
- **Archive parsing** in `src/lib/tar-extract.ts` — the hand-written ustar reader `pharn` uses instead of a tar dependency, and the highest-value target here, because it parses attacker-controlled header bytes. In scope: anything that gets an entry written outside the destination, gets a non-regular entry created, or gets past a bound. Its floor is the typeflag allowlist (ACCEPT regular files and directories; SKIP `pax` global/extended headers, advancing past the padded payload with **no** path rules applied; REJECT symlinks, hard links, devices, FIFOs, and any unknown type), `prefix` + `name` reassembly **before** any path rule runs, rejection of absolute paths and `..` segments, a single-leading-component strip, a same-root check across every entry, `safeJoin` containment at each write, header-checksum verification, and rejection of the GNU base-256 numeric encoding. Two bounds are passed in by `fetchRepo`: `MAX_ENTRIES` (20 000 entries) and `MAX_EXTRACTED_BYTES` (128 MB) — the latter enforced **twice**: as `gunzipSync`'s `maxOutputLength` over the decompressed stream, and again over the bytes of accepted entries. That decompressed cap is what bounds a compression bomb, which neither a response header nor the archive's own size would. Extraction is deliberately **strict: every unexpected entry throws** rather than being silently skipped.
- **Path traversal** or unintended file-system writes from `src/lib/install-capabilities.ts` / `src/lib/install-manifest.ts` / `src/lib/diff.ts` / `src/commands/remove.ts` (copying resolved capability dirs and fixed product surfaces, `pharn.config.json` write) or from any capability / product-filename that escapes its intended target (`safeJoin` in `src/lib/validate.ts`, plus symlink rejection in `install-capabilities.ts`).
- **Server-side request forgery (SSRF)** or redirect abuse in the `SKILLS_VERSION` or commit-metadata fetches (the `fetch()` calls above use `redirect: 'error'`; report ways around it).
- **Supply-chain** issues in how pharn-oss is fetched — the one commit-SHA resolve and the SHA-pinned `codeload.github.com` tarball download it feeds (`src/lib/repo.ts`), **including its degraded mode** — when the SHA cannot be resolved the fetch floats `refs/heads/main` instead and records `commit` as absent (`LIMITS.md` §3b) — or in the resolution of the repo coordinates (`src/lib/constants.ts`). Note the standing residual rather than re-reporting it: provenance is by-SHA, **not cryptographic** (`LIMITS.md §1b`), so a compromised upstream serving a valid-**shaped** tree at the resolved SHA passes every check above.
- **Untrusted-content injection** — a poisoned pharn-oss tree (malicious capability frontmatter, symlink-planted paths, or unexpected directory entries) that leads the CLI to write outside the project or copy unintended content.
- Logic in the archetype install pipeline (`src/commands/init.ts`, `src/steps/archetype-summary.ts`, `src/steps/overwrite-check.ts`, `src/steps/install-archetype.ts`, and the other commands) that could be abused to skip a consent prompt or overwrite files without confirmation.

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
