# Getting started

PHARN does not scaffold your app. You create your project (e.g. with `create-next-app`), initialize git, then run PHARN in that directory.

## Prerequisites

| Requirement          | How PHARN checks                                                                                                    | When                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Git                  | A `.git` directory exists in the project root                                                                       | Always — checked up front, before detection              |
| Interactive terminal | `process.stdin`/`stdout` are TTYs (not for `init --dry-run` or `init --yes`)                                        | Right after the git check, before any fetch              |
| Node                 | **24.2.0 or newer**: `engines.node` declares it, and `init` / `update` refuse on an older Node, writing nothing     | First thing in `init` and `update`, before the git check |
| Node (floor)         | The same 24.2.0 applies to the installed `pharn/floor/*.mjs` (`import.meta.main`); they refuse to run on older Node | When you run `/pharn-*` pipeline commands                |

`.git` is required for every install. So is a real terminal, for a plain `pharn init`: it **exits 1**
rather than rendering a prompt into a dead stream. Two forms need none. `pharn init --dry-run` previews
the install and writes nothing. `pharn init --yes` installs without prompts, but only into a project
where none of its files exists yet: it never answers the overwrite confirmation, so anywhere it would
overwrite something it exits 1 instead (a re-install always does — use `pharn update`). (`pharn update`
also refuses off a TTY, and `update --yes` is the supported way through in CI.) `pharn init` then detects your project's archetype(s) from
`package.json` dependency names plus a bounded file-tree scan — there is no stack-pack selection and no
package prerequisite to satisfy. See [Troubleshooting](troubleshooting.md).

PHARN installs **into your existing project**. Just before writing, `pharn init` checks which of its
install targets (the paths in [What you get](#what-you-get), except `pharn.records.json`) already exist in
your project. If any do, it lists them and asks you to confirm before overwriting — default **no**; if
none do, there is no prompt at all. Your
`.claude/settings.json` is never overwritten, so it is not part of the check. When your project has
none, `init` copies pharn-oss's and lists the hook commands it wires, so you can review what Claude
Code will run.

## Running the CLI

The npm package name is **`@pharn-dev/pharn`**. It installs a single command, **`pharn`**.

```bash
npx @pharn-dev/pharn init
```

## Quick start

```bash
npx create-next-app@latest my-app
cd my-app
[ -d .git ] || { git init && git add -A && git commit -m "init"; }
npx @pharn-dev/pharn init
```

`create-next-app` already runs `git init` and makes the first commit (unless git is missing or you pass
`--disable-git`), so the git line runs only when `.git` is absent. `pharn init` needs a git repository at
the project root.

`pharn` with no subcommand runs `init` (same as `pharn init`).

## The install flow

`pharn init` is archetype-driven — there is no questionnaire:

1. **Detect archetypes.** The CLI merges your `package.json` dependency names with a bounded,
   symlink-safe file-tree scan (names only, never file bodies) into an archetype set — `ssr`, `backend`,
   `spa`, `lib` (a project may match several, e.g. Next + Express → `ssr` + `backend`) — and shows what
   triggered each one (e.g. `backend ← src/app/api/`). Detection is **JS/TS-shaped**: a Python, Go or
   Rust project without a root `package.json` resolves to `lib` and receives the universal capabilities,
   the correct outcome. The rules are in [Detect archetypes](commands/init.md#3-detect-archetypes); if
   detection gets your project wrong, pass the archetypes yourself: `pharn init --archetype backend` (see
   [`init`](commands/init.md#choosing-the-archetypes-yourself---archetype)).
2. **Fetch + resolve.** It downloads the newest **verified release** of `pharn-dev/pharn-oss` — a tag
   pharn-oss creates only after its post-merge CI passed — as a tarball, and selects the capabilities
   whose `applies` is `universal` or intersects your detected archetypes — skipping the rest with a
   reason. If no release can be resolved it exits 1, writes nothing, and names `--ref main` (see
   [No verified release could be resolved](troubleshooting.md#no-verified-release-could-be-resolved)).
   `pharn init --ref main` installs the tip of `main` instead — every merge, before its checks have
   finished — for contributors.
   If the fetched version declares a `MIN_CLI` newer than your CLI, the run
   stops here with a named error and writes nothing.
3. **Confirm + install.** After a summary (selected + skipped), it copies the selected capabilities plus
   the fixed product surfaces (commands, agents, hooks, contracts, `pharn-core`, floor checkers, the four trusted
   docs, upstream's `LICENSE` copy, and `pharn/features/README.md`) into the mirrored layout, then
   writes `pharn.records.json` and `pharn.config.json`.

To add a capability the detection didn't select — or remove one it did — use
[`pharn add`](commands/add.md) / [`pharn remove`](commands/remove.md) afterward.

## What you get

After a successful install, your project contains the selected capabilities plus the fixed product
surfaces:

| Artifact                                                              | Description                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pharn/pharn-pipeline/grillers/<name>/`, `pharn/pharn-review/<name>/` | The installed grillers + lenses, each with its `evals/`                                                                         |
| `.claude/commands/`, `.claude/hooks/`                                 | The `pharn-*` product slash commands + the deterministic `.cjs`/`.mjs` floor hooks                                              |
| `.claude/agents/`                                                     | The `pharn-*` subagents (`pharn-review-lens` runs each `/pharn-review` lens); none from a pharn-oss older than 6.64.0           |
| `pharn/pharn-contracts/`, `pharn/floor/`                              | Inter-layer schemas + the floor checkers the commands invoke, as pharn-oss's `pharn-install.json` declares them (no test files) |
| `pharn/pharn-core/`                                                   | The agnostic mechanism skills the commands cite (the seam resolver + its evals)                                                 |
| `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`                      | Two of the four trusted spec docs, copied verbatim                                                                              |
| `pharn/THREAT-MODEL.md`, `pharn/LIMITS.md`                            | The other two                                                                                                                   |
| `pharn/LICENSE`                                                       | PHARN's Apache-2.0 license, copied so a repo you publish carries the grant. Your own root `LICENSE` is never touched            |
| `pharn/features/README.md`                                            | The product-loop boundary contract the installed commands cite by name                                                          |
| `pharn.config.json`                                                   | `skillsVersion`, commit SHA, detected archetypes, installed capabilities, and the layout                                        |
| `pharn.records.json`                                                  | Per-file sha256 — skips unproven present edits, restores missing; `--force` overwrites all but `unreadable`                     |

These are the paths `pharn` installs, exactly as the fetched pharn-oss's `pharn-install.json` declares
them (pharn-oss 7.21.0 or later); the CLI never rewrites a copied file's contents. How each is written,
and the `.claude/settings.json` rules, are in [`init`](commands/init.md#7-install).

As you run the workflow, PHARN writes one directory per increment, `pharn/features/<name>/`, holding that
increment's `SPEC.md`, `PLAN.md`, `AC-TESTS.md`, `GRILL.md`, `BUILD.md`, `REGRESSION.md`, `VERIFY.md`, then
`SHIP.md` + `BRIEFING.md` (`/pharn-ship`) or `LOOP.md` (`/pharn-loop`), a `RUN-REPORT.md`, and the
machine-readable records beside them (`AC-TESTS.lock.json`, `cost.json`, the `*-report.json` files). Those
are the durable record; commit them. `pharn/.run/` (runtime scratch) and `pharn/.backup/` are not, and
[`init`](commands/init.md#gitignore) adds them to your `.gitignore`; `pharn/.lock*` is a transient file, so
add it yourself if you like. An install made from a pharn-oss older than 7.0.0 may have a `.pharn/`
`.gitignore` line (replace it with `pharn/.run/` yourself) and a root `memory-bank/` or
`pharn.spec-template.md`, which `pharn` never moves: move them to `pharn/memory-bank/` and
`pharn/spec-template.md` (`git mv`), or merge by hand when the `pharn/` copy already exists.

See [pharn.config.json](reference/pharn-config.md) and
[pharn.records.json](reference/pharn-records.md) for the exact schemas. **Commit both** — they are
your project's PHARN state.

## After init

1. Open **Claude Code** in the project directory.
2. Run **`/pharn-spec`** to capture your first feature's intent — it pins the scope and feeds `/pharn-plan`. This is where every run begins: `/pharn-plan` gates on an **Approved**, un-drifted `SPEC.md` and halts without one, so there is no entry point further down the chain.

The pipeline is eight typed stages, each reading what the previous one produced:

| Stage   | Command          | Purpose                                                                                                                                         |
| ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec    | `/pharn-spec`    | Capture feature intent and scope. Stops for your approval.                                                                                      |
| Plan    | `/pharn-plan`    | Turn the approved spec into an implementation plan, mapping each acceptance criterion to a test (`AC-TESTS.md`).                                |
| Grill   | `/pharn-grill`   | Challenge the plan before code is written.                                                                                                      |
| Test    | `/pharn-test`    | Write each acceptance criterion's test before the build, run it, and require it to fail. `/pharn-build` refuses to start without that evidence. |
| Build   | `/pharn-build`   | Implement an approved increment.                                                                                                                |
| Regress | `/pharn-regress` | Look for regressions outside the just-built feature.                                                                                            |
| Verify  | `/pharn-verify`  | Verify behavior and PHARN floor requirements, including that every acceptance criterion's test now passes.                                      |
| Ship    | `/pharn-ship`    | Run stages 1-7 in order, then stop at the merge/fix/abandon gate.                                                                               |

You rarely run them by hand — **`/pharn-ship`** is itself the eighth stage and orchestrates the seven before it in one pass, keeping both human gates: approve the spec before code is written, decide merge/fix/abandon after verification. **`/pharn-loop`** runs the same chain unattended — the model approves the spec and iterates build → regress → verify until green, an iteration cap, or a terminal failure — commits a green result to a new local branch (never pushed or merged), and leaves the merge/fix/abandon decision to you after the run. From pharn-oss 7.7.0, a full `/pharn-loop` (not `--quick`) also runs **`/pharn-triage`** after the grill: it gives every grill finding one disposition (you can run `/pharn-triage` yourself after a full `/pharn-grill`). Since 7.8.0 a `replan` verdict sends the run back to `/pharn-plan` for at most two re-plan rounds, and since 7.9.0 a verdict that still escalates (`spec`, or `replan` with no round left) goes to **`/pharn-supervise`**, a fresh agent that decides `stop` or `proceed-at-risk` — the run goes on, and the escalated findings are named as known risk in the green commit and the run report. Since 7.10.0 it may instead amend the SPEC, once per run (`amend-spec`). The supervisor's decision is one model's judgment, not a check (pharn-oss's `pharn/LIMITS.md` §1d).

**Set up a test runner before your first feature.** `/pharn-test` writes each acceptance criterion's test before the build and requires it to fail, so it needs a `test` script (plus `test:e2e` or `e2e` for end-to-end criteria) whose reporter writes per-test JSON, named under `testResults` in `pharn.config.json`. Without one, `/pharn-test` stops and asks, and `/pharn-loop` ends with `blocked: no-test-runner`. Set the runner up as its own increment (a SPEC with `spec_kind: test-infra`); the reporter setup is in upstream's [Per-test results](https://github.com/pharn-dev/pharn-oss#per-test-results).

Two of the installed commands stand on their own, outside the pipeline and `/pharn-loop`: **`/pharn-review`** runs the review lenses in parallel over any code and merges their findings (no stage invokes it), and **`/pharn-memory-promote`** promotes one lesson into `pharn/memory-bank/` through a gated provenance check.

`/pharn-spec` fills PHARN's default SPEC template, or your own if you put one at `pharn/spec-template.md`. The write guard denies Claude Code's edit tools on that path, so edit it yourself; see upstream's [Your own SPEC template](https://github.com/pharn-dev/pharn-oss#your-own-spec-template).

## Next steps

- Review what was written: [pharn.config.json](reference/pharn-config.md)
- Add a capability later: [add command](commands/add.md)
- Refresh to the latest skills: [update command](commands/update.md)
- Prefer to ask instead of typing commands: the optional [`pharn-cli` agent skill](https://github.com/pharn-dev/skills) checks, previews and applies updates for you
