# Security Policy

PHARN is an audit-grade methodology — taking security seriously is part of the brand, not an afterthought. `pharn-cli` is the bootstrapper that fetches and installs that methodology, so it sits at a trust boundary: it pulls remote content over the network and writes it into a user's project. We welcome coordinated disclosure of any vulnerability in this repository.

## Supported versions

`pharn-cli` is published to npm as [`pharn-cli`](https://www.npmjs.com/package/pharn-cli) and is typically run via `npx pharn init`. We patch security issues against the **latest** published version only; `npx pharn@latest ...` always resolves to a supported release.

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < Latest | :x:                |

Because the CLI is normally invoked through `npx`, most users run the latest version automatically. If you have a pinned or globally installed copy, update it (`npm i -g pharn-cli@latest`) or invoke `npx pharn@latest` to pick up fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, report privately through one of these channels:

1. **GitHub Security Advisories (preferred)** — use [private vulnerability reporting](https://github.com/pharn/pharn-cli/security/advisories/new) to open a confidential report. No email is exposed and the report stays embargoed until a fix ships.
2. **Email** — if you cannot use GitHub advisories, email `support@pharn.dev` with `[PHARN SECURITY]` in the subject.

Please include as much of the following as you can — it speeds up triage:

- The type of issue (e.g. path traversal, command injection, SSRF, supply-chain, insufficient input validation).
- Full paths of the source file(s) involved (step, lib, command, or config).
- The location of the affected code (tag/branch/commit or a direct URL).
- The published `pharn-cli` version and Node.js version, if relevant.
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

`pharn-cli` is an ESM-only, stdlib-plus-thin-dependency Node CLI (`@clack/prompts`, `degit`, `minimist`, `picocolors`). Its security-relevant surface is everything that touches remote input or the user's file system.

### In scope

- **Remote-input validation** bypasses in `src/lib/validate.ts` or `src/lib/manifest.ts` — the regex allowlists (`MODULE_NAME_RE`, `VERSION_RE`, `INSTALL_PATH_RE`), the `..` checks, control-character rejection, the `schemaVersion === 1` gate, or the body-size / timeout limits.
- **Path traversal** or unintended file-system writes from `src/lib/install-modules.ts` / `src/steps/install.ts` (copying module `installs` into `.claude/`, `pharn.config.json` write) or from any module name / `installs` path that escapes its intended target (the `safeJoin` guard).
- **Server-side request forgery (SSRF)** or redirect abuse in the manifest / commit-metadata fetches (fetches use `redirect: 'error'`; report ways around it).
- **Supply-chain** issues in how modules are cloned via `degit`, or in the resolution of the repo coordinates (`src/lib/constants.ts`).
- **Untrusted-content injection** — a malicious `manifest.json` or `module.json` that leads the CLI to clone unintended content or write outside the project.
- Logic in the wizard pipeline (`src/steps/*`, `src/commands/*`) that could be abused to skip a consent prompt or overwrite files without confirmation.

### Out of scope

- Vulnerabilities in the **PHARN skills, hooks, or runners** that `pharn-cli` installs — report those against the skills repository (e.g. its own `SECURITY.md`), not here.
- Vulnerabilities in **third-party AI tools** the installed stack targets (Claude Code, Codex, Cursor).
- Issues in **vendor libraries** the docs reference (Stripe, Drizzle, Supabase, etc.) — report those upstream.
- Vulnerabilities in the CLI's **own npm dependencies** that are fixed by an upstream patch — please report to that project (and feel free to flag it to us so we can bump the floor).
- Social engineering, or attacks requiring physical access to a user's machine.
- Denial of service that does not exploit a specific vulnerability (e.g. simply pointing the CLI at a huge repository).

## Security best practices for users

`pharn-cli`'s input validation and consent prompts are defense-in-depth, not a guarantee. When using the CLI:

1. **Run it in an existing, version-controlled project** so you can diff exactly what `init` wrote (`.claude/` and `pharn.config.json`) before committing.
2. **Review the vendor skills** the wizard offers before accepting them — vendor selection is opt-in and nothing is selected by default; only accept vendors you recognize.
3. **Prefer `npx pharn@latest`** so you run the current, supported release rather than a stale pinned copy.
4. **Inspect the cloned `.claude/` skills** before running them through your AI tool — installation fetches remote content.
5. **Set `PHARN_DEBUG=1`** if a manifest or clone step fails unexpectedly, and report anything that looks like the CLI fetching or writing somewhere it should not.

## Acknowledgements

We appreciate the security research community. Anyone who reports a valid issue in good faith will be credited in the resulting advisory.

Thank you for helping keep PHARN and its users safe.
