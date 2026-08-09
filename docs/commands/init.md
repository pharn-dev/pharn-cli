# pharn init

Interactive setup wizard. Default command when you run `pharn` with no subcommand.

```bash
pharn init
# equivalent
pharn
```

`init` detects your project's **archetype(s)** and installs the PHARN **capabilities** that apply to them. It fetches nothing you did not ask for: only the capabilities matching your project, plus the fixed product surfaces (commands, hooks, docs, contracts, floor), are copied. There is no module catalog and no `manifest.json` fetch — capabilities are the install unit.

> The `--archetype` flag is a **deprecated no-op** kept for one release: archetype detection is now the default, so `pharn init --archetype` behaves identically to `pharn init`.

## `init` is interactive-only

`init` always asks which capabilities to install, and — only when any of its write targets already
exist — whether to overwrite them, so it needs a terminal. Off a TTY (CI, a pipe, a script) it **exits 1**
with a usage error instead of prompting into a stream nobody is reading:

```console
$ echo "" | pharn init
▲ pharn init is interactive — run it in an interactive terminal. There is deliberately no --yes
  for init: it confirms before overwriting existing files, and auto-confirming that in a pipeline
  is what the prompt exists to prevent.
$ echo $?
1
```

The refusal happens **before the clone**, so a non-interactive `init` costs no network round-trip and
leaves your project untouched.

There is deliberately **no `--yes` for `init`** — unlike [`pharn update`](update.md), which has one. The
second of init's prompts is the destructive overwrite confirmation, and auto-confirming file overwrites
in a pipeline is precisely the hazard that prompt exists to prevent.

A directory with no `.git` still gets its own, more useful error first (see **Prerequisites** below) —
the interactivity check never masks it.

## Flow

```mermaid
sequenceDiagram
  participant User
  participant CLI as pharn_init
  participant Prereqs
  participant Detect as detect_archetype
  participant Fetch as fetch_pharn_oss
  participant Resolve as resolve_capabilities
  participant Summary
  participant Conflict as write_target_check
  participant Install

  User->>CLI: pharn init
  CLI->>Prereqs: git (.git present)
  Prereqs-->>CLI: ok or exit
  CLI->>Detect: package.json + file-tree signals
  Detect-->>User: "Detected archetypes" note
  CLI->>Fetch: clone pharn-dev/pharn-oss (degit)
  CLI->>Resolve: capability index vs detected archetypes
  CLI->>Summary: capabilities selected + skipped (with reason)
  Summary-->>User: install / cancel
  CLI->>Conflict: which write targets already exist?
  Conflict-->>User: overwrite warning (only if any) · default No
  CLI->>Install: copy capabilities + product surfaces, write config
  Install-->>User: next steps
```

## Archetypes and capabilities

- **Archetype** — a closed set describing what your project is: `ssr`, `backend`, `spa`, or `lib` (the frameworkless base). Detection merges two untrusted-but-name-only fact sources — your `package.json` dependency **names** and **file-tree** structural signals (e.g. a `.tsx` file → `spa`) — then applies the archetype rule once. It is deterministic: the same project always yields the same archetypes. A wholly signal-less project resolves to `lib`.
- **Capability** — one griller or lens (an auditor PHARN ships). Each declares `applies: 'universal'` (always selected) or a set of archetypes. A capability is **selected** iff it is universal or its `applies` set intersects your detected archetypes; otherwise it is **skipped**, with the reason shown.

## Steps

### 1. Banner and intro

Shows the PHARN logo and CLI version.

### 2. Prerequisites

- **`.git` present** — checked up front, before anything else (universal, framework-agnostic). Hard-fails if absent.

### 3. Detect archetypes

Reads `package.json` dependency names and walks the project tree (bounded, symlink-safe, `node_modules`/`.git`/`dist`/`build` skipped) for structural signals, then reduces both to an `Archetype[]`. The detected set is shown in a "Detected archetypes" note. Only names are tested against fixed in-code allowlists — no discovered file body is read (other than `package.json`) and no untrusted value is executed, interpolated, or logged.

### 4. Fetch PHARN

Clones `pharn-dev/pharn-oss` into a temp dir via degit. If the fetch fails, the CLI exits — re-run with `PHARN_DEBUG=1` for details. The temp clone is always cleaned up (even on cancel or error).

### 5. Resolve capabilities

Parses the capability index from the fetched clone and selects the capabilities that apply to your archetypes (universal + archetype-matched), in the index's declared order. Skipped capabilities are kept with a reason (e.g. `applies to [backend]; detected [ssr]`).

### 6. Summary

Lists the **selected** capabilities (name, role, and why — `universal` or the matched archetype) and the **skipped** ones (with reason). Then:

| Action       | Result                                                    |
| ------------ | --------------------------------------------------------- |
| Yes, install | Copy the capabilities + product surfaces and write config |
| Cancel       | Exit 0; nothing written                                   |

After you choose **install**, `init` checks which of its **actual write targets** (the selected capability dirs, product `pharn-*` commands, `.cjs` hooks, `pharn-contracts/`, the floor checkers, the constitution, and `pharn.config.json`) already exist in your project. If any do, it lists them (capped at 10, then "…and N more") and asks you to confirm before overwriting — default **no**. If none do, there is no prompt (zero friction). `.claude/settings.json` is never overwritten, so it is excluded from the check. The target set is derived from the fetched clone's layout + your resolved selection (`lib/install-manifest.ts`), so it is exact — not a git-history heuristic.

### 7. Install

| Action                     | Behavior                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy capabilities          | Each selected griller/lens dir (with its `evals/`) → the mirrored project path                                                                  |
| Copy product surfaces      | `pharn-*.md` commands (not `pharn-dev-*`), `.cjs` hooks, the trusted docs, `pharn-contracts/`, and `.dev/floor/` (minus test files)             |
| Preserve settings          | An existing `.claude/settings.json` is **never** overwritten (a note tells you to wire the hooks by hand if needed)                             |
| Mirror the layout          | Whichever layout the fetched clone uses — flat, or the relocated `pharn/` — is mirrored verbatim; the CLI never rewrites copied file contents   |
| Pin commit SHA             | Best-effort (the SHA the tree was pinned to; `null` if unavailable)                                                                             |
| Write `pharn.config.json`  | `skillsVersion` (from the repo's `SKILLS_VERSION`), `commit`, `archetypes`, `capabilities`, `layout`, `models`, `seam`, `modules: []`           |
| Write `pharn.records.json` | A sha256 of every file the install wrote, so [`pharn update`](update.md) can keep your later edits ([reference](../reference/pharn-records.md)) |

The install copies pharn-oss's canonical `CONSTITUTION.md` verbatim — there is no privacy-posture / constitution-variant question in the archetype flow. Only capability contents are copied; the CLI never executes or parses them (your Claude Code runs them later).

On success, the CLI reports the capability count and suggests opening Claude Code and running `/pharn-spec` — intent capture for your first feature, which feeds `/pharn-plan`.

## Legacy configs

`init` always writes an **archetype** config, and every command is archetype-only. A pre-archetype **module**-based `pharn.config.json` (one with `modules[]` but no `capabilities[]`, from a much older release) is no longer supported: `add`, `remove`, `list`, `update`, and `status` detect it up front and exit with a message to re-run `pharn init` — there is **no** module/manifest fallback (live pharn-oss ships no `manifest.json`). The config schema is additive, so a legacy config's now-unused fields (`modules`, `constitution`, `stackAnswers`, `installedSkills`) still parse; only the absence of `capabilities[]` triggers the rejection.

## Related

- [pharn.config.json](../reference/pharn-config.md)
- [pharn.records.json](../reference/pharn-records.md)
- [add command](add.md)
- [Troubleshooting](../troubleshooting.md)
