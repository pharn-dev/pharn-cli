# Getting started

PHARN does not scaffold your app. You create your project (e.g. with `create-next-app`), initialize git, then run PHARN in that directory.

## Prerequisites

| Requirement          | How PHARN checks                                      | When                                        |
| -------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Git                  | A `.git` directory exists in the project root         | Always — checked up front, before detection |
| Interactive terminal | `process.stdin`/`stdout` are TTYs                     | Right after the git check, before any fetch |
| Node                 | `engines.node` declares `>=20` (CI exercises Node 24) | By npm/npx when the package is resolved     |

`.git` is required for every install. So is a real terminal: `pharn init` **exits 1** rather than
rendering a prompt into a dead stream, and there is deliberately no `--yes` for it — its second prompt
is the destructive overwrite confirmation. (`pharn update` behaves the same way, and `update --yes` is
the supported way through in CI.) `pharn init` then detects your project's archetype(s) from
`package.json` dependency names plus a bounded file-tree scan — there is no stack-pack selection and no
package prerequisite to satisfy. See [Troubleshooting](troubleshooting.md).

PHARN installs **into your existing project**. Just before writing, `pharn init` checks which of its
actual install targets (the selected capability dirs, the product commands/hooks, the contracts, core
and floor dirs, all four trusted docs, pharn's `LICENSE` copy, `pharn/features/README.md`, and
`pharn.config.json`) already exist in your project. If any do, it lists them and asks you to confirm
before overwriting — default **no**; if none do, there is no prompt at all. Your
`.claude/settings.json` is never overwritten, so it is not part of the check.

## Running the CLI

The npm package name is **`@pharn-dev/pharn`**. It installs a single command, **`pharn`**.

```bash
npx @pharn-dev/pharn init
```

## Quick start

```bash
npx create-next-app@latest my-app
cd my-app
npx shadcn@latest init
git init && git add -A && git commit -m "init"
npx @pharn-dev/pharn init
```

`pharn` with no subcommand runs `init` (same as `pharn init`).

## The install flow

`pharn init` is archetype-driven — there is no questionnaire:

1. **Detect archetypes.** The CLI merges your `package.json` dependency names with a bounded,
   symlink-safe file-tree scan (names only, never file bodies) into an archetype set — `ssr`, `backend`,
   `spa`, `lib` (a project may match several, e.g. Next + Express → `ssr` + `backend`). It shows what it
   detected. Detection is **JS/TS-shaped**: the signals are npm dependency names plus `next.config.*`,
   `app/` route handlers, `.tsx`/`.jsx`, `migrations/` and `.sql`. A Python, Go or Rust project produces
   no signal, resolves to `lib`, and receives the universal capabilities only — the correct outcome, not
   a failure.
2. **Fetch + resolve.** It downloads `pharn-dev/pharn-oss` as a tarball at a pinned SHA and selects the
   capabilities whose `applies` is `universal` or intersects your detected archetypes — skipping the rest
   with a reason. If the SHA cannot be resolved (offline, rate-limited) the fetch floats `main` instead
   and records `commit: null`. If the fetched version declares a `MIN_CLI` newer than your CLI, the run
   stops here with a named error and writes nothing.
3. **Confirm + install.** After a summary (selected + skipped), it copies the selected capabilities plus
   the fixed product surfaces (commands, hooks, contracts, `pharn-core`, floor checkers, the four trusted
   docs, upstream's `LICENSE` copy, and `pharn/features/README.md`) into the mirrored layout, then
   writes `pharn.records.json` and `pharn.config.json`.

To add a capability the detection didn't select — or remove one it did — use
[`pharn add`](commands/add.md) / [`pharn remove`](commands/remove.md) afterward.

## What you get

After a successful install, your project contains the selected capabilities plus the fixed product
surfaces:

| Artifact                                                              | Description                                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pharn/pharn-pipeline/grillers/<name>/`, `pharn/pharn-review/<name>/` | The installed grillers + lenses, each with its `evals/`                                                              |
| `.claude/commands/`, `.claude/hooks/`                                 | The `pharn-*` product slash commands + the deterministic `.cjs` floor hooks                                          |
| `pharn/pharn-contracts/`, `pharn/floor/`                              | Inter-layer schemas + the floor checkers the commands invoke (minus the floor's own test files and `test-fixtures/`) |
| `pharn/pharn-core/`                                                   | The agnostic mechanism skills the commands cite (the seam resolver + its evals)                                      |
| `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`                      | Two of the four trusted spec docs, copied verbatim — see the layout note below                                       |
| `THREAT-MODEL.md`, `LIMITS.md`                                        | The other two, at the project **root** — where upstream keeps them and where the installed commands cite them        |
| `pharn/LICENSE` (flat: `PHARN-LICENSE`)                               | PHARN's Apache-2.0 license, copied so a repo you publish carries the grant. Your own root `LICENSE` is never touched |
| `pharn/features/README.md`                                            | The product-loop boundary contract the installed commands cite by name (project root in both layouts)                |
| `pharn.config.json`                                                   | `skillsVersion`, commit SHA, detected archetypes, installed capabilities, and the layout                             |
| `pharn.records.json`                                                  | Per-file sha256 — skips unproven present edits, restores missing; `--force` overwrites all but `unreadable`          |

`.claude/*` is **layout-invariant** — commands, hooks and `settings.json` sit at those paths either
way, and an existing `.claude/settings.json` is never overwritten. Everything else follows the fetched
version: the CLI **mirrors** whichever layout `pharn-dev/pharn-oss` ships and never rewrites a copied
file's contents, so the paths above are the `pharn` layout it installs today. The legacy **flat**
layout puts the same surfaces at the project root instead — `pharn-pipeline/grillers/`,
`pharn-review/`, `pharn-contracts/`, `.dev/floor/`, `PHARN-LICENSE` — and upstream ships no root
`pharn-core/`, so that one surface is simply absent there. The **four trusted docs** are the same set
in both layouts, but their prefix is per-**doc**, not per-layout: upstream's relocation moved
`CONSTITUTION.md` and `ARCHITECTURE.md` under `pharn/` and left `THREAT-MODEL.md` and `LIMITS.md` at
the repo root, so a `pharn` install lands them exactly that way and a flat install lands all four at
the root. Each doc is copied only if the fetched version ships it — a clone that predates one simply
does not get it, and `init` says which docs it wrote and warns about any it did not. Which layout you
got is recorded as `layout` in `pharn.config.json`.

See [pharn.config.json](reference/pharn-config.md) and
[pharn.records.json](reference/pharn-records.md) for the exact schemas. **Commit both** — they are
your project's PHARN state.

## After init

1. Open **Claude Code** in the project directory.
2. Run **`/pharn-spec`** to capture your first feature's intent — it pins the scope and feeds `/pharn-plan`. This is where every run begins: `/pharn-plan` gates on an **Approved**, un-drifted `SPEC.md` and halts without one, so there is no entry point further down the chain.

The pipeline is seven typed stages: `/pharn-spec → /pharn-plan → /pharn-grill → /pharn-build → /pharn-regress → /pharn-verify → /pharn-ship`. You rarely run them by hand — **`/pharn-ship`** is itself the seventh stage and orchestrates the six before it in one pass, and **`/pharn-loop`** runs the same chain but iterates build → regress → verify until green, an iteration cap, or a terminal failure. Both keep the two human gates: approve the spec before code is written, decide merge/fix/abandon after verification.

Two of the ten installed commands sit outside the pipeline: **`/pharn-review`** runs the review lenses in parallel over any code and merges their findings (no stage invokes it), and **`/pharn-memory-promote`** promotes one lesson into `memory-bank/` through a gated provenance check.

## Next steps

- Review what was written: [pharn.config.json](reference/pharn-config.md)
- Add a capability later: [add command](commands/add.md)
- Refresh to the latest skills: [update command](commands/update.md)
