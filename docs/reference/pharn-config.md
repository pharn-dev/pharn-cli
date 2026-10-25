# pharn.config.json

Written to the project root on a successful `pharn init`, and updated by `pharn add`, `pharn remove` and `pharn update`.
Source: [`pharn-config.ts`](../../src/lib/pharn-config.ts) and
[`install-archetype.ts`](../../src/steps/install-archetype.ts).

It is the CLI's record of what it installed. PHARN's commands in your project do **not** read
`capabilities` to decide which grillers and lenses run: they scan the capability directories on disk
(`pharn-pipeline/grillers/`, `pharn-review/`, under `pharn/` in that layout). So a capability's
directory, not its entry here, is what makes it run — which is why `pharn remove` and
[`pharn update`](../commands/update.md#dropped-capabilities-are-deleted) delete the directory of a
capability they drop. At run time `/pharn-ship` and `/pharn-loop` read the `models` block (see
[Models](#models)).

## Top-level fields (archetype install)

| Field           | Type           | Description                                                                                                   |     |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------- | --- |
| `pharnVersion`  | string         | Version of the PHARN CLI that ran the install                                                                 |     |
| `skillsVersion` | string         | The repo's `SKILLS_VERSION` at the installed commit                                                           |     |
| `repo`          | string         | Source repo (`pharn-dev/pharn-oss`)                                                                           |     |
| `commit`        | string \| null | Pinned commit SHA of the install; `null` if the SHA was unavailable                                           |     |
| `ref`           | string         | `"latest"` to follow verified releases (`--ref latest`); absent → the tip of main                             |     |
| `installedAt`   | string         | ISO timestamp set by `init`, and by `update` when it writes the config; `add` and `remove` leave it unchanged |     |
| `archetypes`    | array          | Project archetypes (`ssr` / `backend` / `spa` / `lib`): detected, or given with `pharn init --archetype`      |     |
| `capabilities`  | array          | Installed capabilities, each `{ name, role, source? }` — see below                                            |     |
| `layout`        | string         | Install layout your files are at: `flat` or `pharn` (absent → `flat`)                                         |     |
| `modules`       | array          | Always `[]` for an archetype install (the install unit is capabilities)                                       |     |
| `models`        | object         | pharn-oss's per-stage model/effort block ([Models](#models))                                                  |     |
| `seam`          | object         | Seam-resolution policy ([`seam-config.ts`](../../src/lib/seam-config.ts))                                     |     |

`isArchetypeConfig` treats the presence of a `capabilities` array as the marker of an archetype install.
A `capabilities` that is present but **not** an array (for example `"capabilities": "x"` or `null`) is a
hand-edit error, not a legacy install: `pharn` names it and exits 1 instead of telling you to re-run
`pharn init`, which would overwrite the file. An absent `capabilities` is still the pre-archetype
config described [below](#legacy-fields-pre-archetype-configs-still-load).

Any top-level key **not** on this page is yours, and every command keeps it — see
[Keys pharn does not own](#keys-pharn-does-not-own).

`layout` is written only by `pharn init` and `pharn update`, each recording the layout of the clone it
actually copied from. `pharn add` never writes the field — it
[refuses](../commands/add.md#layout-mismatch) a clone whose layout disagrees with the recorded one,
because it installs a single capability and cannot migrate the rest of your tree.

### `archetypes` — checked when the config loads

`archetypes` decides which capabilities `pharn update` selects, so `list`, `status`, `update`, `add`
and `remove` check it when they load the config. It must be an array, and each entry must be one of `"ssr"`,
`"backend"`, `"spa"` or `"lib"` — exactly what `pharn init` writes. Anything else is a hand-edit error:
a string such as `"archetypes": "ssr"`, an entry that is not a string, or an unknown name such as
`"bogus"` or `"SSR"`. `pharn` names the field or the entry (`archetypes[1]`) and the value it found,
then exits 1 before any download. It does not fall back to "run `pharn init`", and it never drops an
unknown entry and continues with fewer archetypes. Characters a terminal would interpret are shown as
`\uXXXX` escapes. Under `--json` the message goes to stderr and stdout stays empty.

These are accepted: an absent `archetypes` (read as none), an empty array, and a repeated entry
(selection treats a repeat as one).

`pharn init` is not refused: as with any other config it cannot read, it carries nothing over from the
old file and writes the archetypes it detects.

### `skillsVersion` and `commit` — checked when the config loads

These two fields are the install's stamp: `status` and `update` compare `skillsVersion` with
pharn-oss, `add` gates on it, and [`pharn.records.json`](pharn-records.md) is stamped with both. So
in an archetype config, `list`, `status`, `update`, `add`, `remove` and `uninstall` check them when
they load the config:

- `skillsVersion` must be a version such as `"3.0.2"` (a prerelease suffix such as `"3.0.2-rc.1"` is
  allowed) — the shape `pharn` reads from pharn-oss's `SKILLS_VERSION`.
- `commit` must be a full 40-character lowercase hex commit SHA, or `null` (what `pharn` writes when
  it could not resolve the SHA). An absent `commit` is accepted.

Anything else — `"1.0"`, `"v3.0.2"`, a short SHA such as `"abc123"`, a number — is a hand-edit
error. `pharn` names the field and the value it found and exits 1 before any download, the same way
as for `archetypes` (unsafe characters escaped, a long value cut short, stderr under `--json`).
Restore the value by hand: `pharn.records.json`, if you have one, carries the same pair. A
pre-archetype config is not checked.

### `capabilities[].source` — selection provenance

Each entry records **how it got there**, which decides who owns it on the next `pharn update`:

| `source`   | Set by                                                            | What `pharn update` does with it                                                 |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `auto`     | `pharn init`, or `pharn update` when selected for your archetypes | Owns it — drops it if your archetypes stop selecting it                          |
| `manual`   | `pharn add`, or `pharn update` when inferring legacy provenance   | **Preserves it** while it still exists upstream; drops it (named) if it does not |
| _(absent)_ | a CLI older than this field                                       | Inferred once, on the next `pharn update` (see below)                            |

`source` is **optional** — a config written before the field existed simply omits it and still loads.
Absence is never read as a default: it means _provenance unknown_, and only `pharn update` may resolve
it, because that is the one command holding a fresh capability index. On the first update after
upgrading, a source-less entry is inferred **once** — in the resolved set → `auto`, outside it →
`manual` — and written back explicitly. That second half is a **reconstruction, not a recovered fact**:
such an entry was either added by hand, or auto-selected by an older index and since de-selected
upstream, and nothing offline distinguishes the two. Tagging it `manual` is the fail-safe direction —
it is then kept if the capability still exists upstream, and dropped (with a named report line) if it
does not. `pharn remove` warns about re-adds for a literal `auto` only, and stays silent on an absent
value rather than guess.

A `source` present but outside `{auto, manual}` is a hand-edit error: `pharn` reports it by name
(`capabilities[2].source`) and exits, rather than falling back to "run `pharn init`". Deleting the
field is a valid fix — the next update sets it.

> Re-running `pharn init` on an existing project **rewrites this file** from its own fields, and
> carries over what `pharn update` would keep. A `manual` entry upstream still ships is installed
> again and stays `manual`. An entry of any `source` whose capability upstream ships but this pharn
> cannot read is kept exactly as it was (and listed in `frozenCapabilities`). A `manual` entry
> upstream no longer ships is dropped and named; an entry with **no** `source` is re-resolved from
> the archetypes like an `auto` one. [Keys pharn does not own](#keys-pharn-does-not-own) are copied
> across. Everything else pharn owns is written fresh — notably `seam` is reset to pharn's default and
> `models` to pharn-oss's current block (or removed, when it ships none or this pharn rejects it), so
> hand-tuning of either does not survive in the live file. `init` warns before overwriting
> `pharn.config.json` and defaults to **No**, and before rewriting it copies the existing file
> (a regular file, not a symlink) to `pharn/.backup/<timestamp>/` — the prompt marks it
> `(will be rewritten — backed up first)` — so that tuning is recoverable from the backup. Use
> `pharn update` to refresh an existing install; `init` is for installing one.

A sibling file, [`pharn.records.json`](pharn-records.md), holds a sha256 per installed file. It is
written by the same operations that write this config and is **stamped** with this file's
`skillsVersion` + `commit`; if the two disagree, `pharn update` treats the store as unavailable —
present files that differ are skipped (`unverifiable`), but **missing** files are still restored.
Re-run `pharn update` once both files agree, or pass `--force` to back up and overwrite differences.
The hash map lives there rather than here so this file stays small and hand-editable.

Note that `skillsVersion` / `commit` describe the last **complete** install: a `pharn update` that
skipped any file deliberately leaves them at their previous values (see [update](../commands/update.md)).
When the only skipped files were ones you edited (`modified` / `unrecorded`), it also writes
`pendingSkillsVersion` — the version it applied to everything else — which lets
[`pharn add`](../commands/add.md) run at that version; the next complete `pharn update` removes it. A
value that is not a `x.y.z` version is ignored.

`frozenCapabilities` lists (`role:name`, sorted) the installed capabilities the last `pharn update`
(or re-run `pharn init`) kept because it could not read them upstream. While it is non-empty, `pharn update` re-fetches even
at the same skills version, so they are re-checked on every run. A capability that can be read again
stays listed while any of its files had to be skipped (one you edited, say), so the next run checks it
again; the field is removed once none are left. If you `pharn remove` one, the next update drops it
from the list. A value that is not a list of
`role:name` keys is ignored.

## Example

```json
{
  "pharnVersion": "0.4.0",
  "skillsVersion": "3.0.2",
  "repo": "pharn-dev/pharn-oss",
  "commit": "daa06788…",
  "installedAt": "2026-06-11T00:00:00.000Z",
  "archetypes": ["ssr", "backend"],
  "capabilities": [
    { "name": "a11y", "role": "griller", "source": "auto" },
    { "name": "security", "role": "griller", "source": "auto" },
    { "name": "n-plus-one", "role": "lens", "source": "manual" }
  ],
  "layout": "pharn",
  "modules": [],
  "models": { "stages": { "…": "…" } },
  "seam": {
    "resolutionOrder": [
      "official-skill",
      "pinned-docs",
      "model",
      "fetch",
      "ask"
    ],
    "modelConfidenceThreshold": "high",
    "haltOnUnknown": true
  }
}
```

## Models

The `models` block is **pharn-oss's**, not this CLI's: pharn-oss owns its schema and its defaults —
every other field on this page is pharn's. It declares a model and an effort for each PHARN product
stage. Two things use it, and they are not the same thing:

- **Orchestrated runs read it.** `/pharn-ship` and `/pharn-loop` run the stages their routing policy
  routes as subagents, and they read `models.stages` at run time to choose the **model** each subagent
  is requested on. As of pharn-oss 6.55.0, `/pharn-ship` routes plan, grill, test and build (quick mode:
  plan, test and build), and `/pharn-loop` routes spec, plan, test and build. The policy is pharn-oss's,
  in its `pharn/floor/stage-agent-core.mjs`, and can change.
- **Direct invocation does not.** A `/pharn-<stage>` you run yourself uses that command's own static
  `model:` / `effort:` frontmatter. The block is the source of truth that frontmatter is **held to**:
  pharn-oss's checker, `node pharn/floor/check-model-config.mjs agreement` (`.dev/floor/` in the
  legacy flat layout), lists each difference. Nothing in an installed project runs it automatically.

What the block does **not** reach: **effort** is never routed (the Agent tool takes none), so a routed
stage runs at the effort it inherits. A stage the policy keeps inline, a stage whose resolved model is
`inherit` or a full `claude-*` id, and a run with no usable block all run on the model of the session
that runs the orchestrator, and the run says why. Routing records what was **requested**; nothing
observes what a stage actually ran on, and a green `agreement` check means two files agree. pharn-oss
states the bounds in its `LIMITS.md` §8.

What editing changes:

- **A `/pharn-*` command's frontmatter.** That file is then `modified`: `pharn status` lists it as
  differing, and `pharn update` **skips** it (your edit stays) and withholds the `skillsVersion` bump
  for as long as the skip stands. `pharn update --force` backs the file up and overwrites it. This
  changes what a direct invocation uses.
- **Only `models.stages`.** No file drifts: `pharn.config.json` is not one of the files `status` compares,
  `pharn update` keeps an edited block whole and never withholds the version over it, and a re-run
  `pharn init` resets it to pharn-oss's block (backing the previous file up to `pharn/.backup/` first). This changes the model orchestrated runs request, while
  a direct invocation keeps the frontmatter's, so `agreement` reports the difference.

pharn-oss's block, as of pharn-oss 6.55.0:

```json
{
  "models": {
    "stages": {
      "default": { "model": "sonnet", "effort": "high" },
      "spec": { "model": "opus", "effort": "high" },
      "plan": { "model": "opus", "effort": "high" },
      "grill": { "model": "opus", "effort": "high" },
      "build": { "model": "sonnet", "effort": "high" },
      "regress": { "model": "sonnet", "effort": "high" },
      "verify": { "model": "sonnet", "effort": "high" },
      "ship": { "model": "sonnet", "effort": "high" },
      "loop": { "model": "sonnet", "effort": "high" },
      "review": { "model": "opus", "effort": "high" },
      "memory-promote": { "model": "opus", "effort": "high" },
      "ac-test": { "model": "opus", "effort": "high" }
    }
  }
}
```

The rules are those of pharn-oss's checker (`check-model-config.mjs validate`):

| Rule        | What pharn-oss accepts                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape       | `models.stages` maps a stage name to `{ "model": …, "effort": … }`                                                                          |
| `default`   | Required, **inside** `stages` — what every stage without its own entry resolves to                                                          |
| Stage names | `default`, or a product stage: `spec`, `plan`, `grill`, `build`, `regress`, `verify`, `ship`, `loop`, `review`, `memory-promote`, `ac-test` |
| `model`     | An alias — `sonnet`, `opus`, `haiku`, `fable`, `inherit` — or a full id matching `claude-[a-z0-9][a-z0-9-]*`                                |
| `effort`    | `low`, `medium`, `high`, `xhigh` or `max`                                                                                                   |

A config with no `models` block, or a block with no `stages`, declares nothing, and pharn-oss's
checker passes it by design.

### What each command does with it

- **`pharn init`** copies pharn-oss's block **verbatim** from the root `pharn.config.json` of the
  commit it installs, and prints it resolved per stage. If pharn-oss ships no block, `init` writes
  **none** — it never invents one. If pharn-oss ships a block this pharn cannot accept, `init` writes
  none and says why (see below). A re-run `init` replaces your block with pharn-oss's, as it rewrites
  every other key pharn writes.
- **`pharn update`** treats the block like a file: pharn-oss's block replaces one pharn wrote, and one
  you changed is kept. It also converts the format earlier releases wrote. See
  [update](../commands/update.md#the-models-block).
- **`pharn status`** prints every product stage beside the model and effort it resolves to — marked
  `(default)` when the stage has no entry of its own — under the label above, and lists by name
  anything pharn-oss's rules reject. See [status](../commands/status.md).
- **`add`, `remove` and `list`** leave the block exactly as it is.

No command refuses to run over this block: `pharn` does not validate it when it loads the config,
because it is not `pharn`'s schema. `pharn` checks it where it copies, converts or shows it, with a
**copy** of pharn-oss's rules. A test in the pharn repository runs pharn-oss's checker beside that
copy over a corpus of cases and fails on any difference. If pharn-oss's rules move ahead of the copy in your pharn
(a new stage, a new alias), `pharn` does not apply the newer block, names what it could not accept, and
upgrading `pharn` fixes it. pharn-oss can also require the upgrade with `MIN_CLI` (see
[`pharn is too old for the current pharn-oss`](../commands/update.md#pharn-is-too-old-for-the-current-pharn-oss)).

### The format `pharn` wrote before 0.7.0

Releases up to 0.6.0 wrote a block of their own: a top-level `default`, and model ids — `opus-4-8`,
`sonnet-5`, `fable-5`, `haiku-4-5` — that neither Claude Code nor pharn-oss's checker accepts. The
first `pharn update` with 0.7.0 or later fixes it, even when your skills version is current: an
unedited block is replaced with pharn-oss's, and an edited one is converted and kept. See
[update](../commands/update.md#the-models-block).

## Seam resolution

The `seam` block records how PHARN should resolve an unfamiliar integration point. It is **written on
every fresh install** and **user-owned afterwards** — `pharn` never migrates it — and it is validated
on every command, so a bad hand-edit fails loudly rather than being ignored. Source of truth:
[`seam-config.ts`](../../src/lib/seam-config.ts).

The installed default:

```json
{
  "seam": {
    "resolutionOrder": [
      "official-skill",
      "pinned-docs",
      "model",
      "fetch",
      "ask"
    ],
    "modelConfidenceThreshold": "high",
    "haltOnUnknown": true
  }
}
```

| Field                      | Type    | Meaning                                                                       |
| -------------------------- | ------- | ----------------------------------------------------------------------------- |
| `resolutionOrder`          | array   | The steps to try, in order. Must contain `ask`, anywhere in the list.         |
| `modelConfidenceThreshold` | string  | How sure the model must be before its answer counts. Requires a `model` step. |
| `haltOnUnknown`            | boolean | Stop rather than guess when nothing in the order resolves.                    |

Five hand-edits are rejected by name: an unknown sibling key, an unknown step, a **duplicate** step, a
`resolutionOrder` that does not contain `ask`, and a `modelConfidenceThreshold` set without a `model`
step in the order.

## Keys pharn does not own

Every field on this page is **pharn's** to write, including the
[legacy fields](#legacy-fields-pre-archetype-configs-still-load) it no longer writes — `models` too,
though pharn-oss defines what goes inside it. Any **other** top-level key is **yours**: `pharn` does not
interpret or validate it, and every command that writes this file keeps it. Upstream PHARN documents
four that you add by hand:

| Key           | Read by                                                        | What it sets                                                                                                |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `testResults` | `/pharn-test`, and `/pharn-verify`'s acceptance-criteria check | The JSON report format of each test gate                                                                    |
| `ship`        | `/pharn-ship` (`ship.requireAttestation`)                      | `true`: the ship stage asks for a named person's attestation                                                |
| `gates`       | `/pharn-regress`, `/pharn-verify` and `/pharn-test`'s red run  | `gates.exclude`: ids of discovered gates to leave out of discovery                                          |
| `budget`      | `/pharn-verify`'s `instruction-growth` gate                    | `budget.instructionGrowthBytes`: how many bytes the always-loaded instruction files may grow (default 2048) |

```json
{
  "testResults": { "test": "vitest-json", "test:e2e": "playwright-json" },
  "ship": { "requireAttestation": false },
  "gates": { "exclude": ["e2e"] },
  "budget": { "instructionGrowthBytes": 2048 }
}
```

Without `testResults`, `/pharn-loop` stops with `blocked: no-test-runner`. The shape of these keys is
upstream's to define. The pharn-oss README documents `testResults`
([Per-test results](https://github.com/pharn-dev/pharn-oss#per-test-results)) and `gates.exclude`
([Excluding a gate](https://github.com/pharn-dev/pharn-oss#excluding-a-gate-6360)): each id must be one
of the gates PHARN discovers, anything else stops the run with an error, and an excluded gate is not
evidence either way, so commit the list before the run. The README does **not** describe
`budget.instructionGrowthBytes`; pharn-oss's `LIMITS.md` §3e says the `instruction-growth` gate compares
the bytes added since a base commit with that key, read from `pharn.config.json` at that base, default 2048. Because `pharn` does not own these keys it does not check them, so a typo in one is not reported
by any `pharn` command.

How each command keeps them:

- `pharn add`, `pharn remove` and `pharn update` edit this file in place, so a key they do not write
  stays where it is.
- `pharn init` writes the file afresh from its own fields, then **copies every key pharn does not own
  across from the config it replaces**, unchanged, after its own. It does this for any file that
  parses as a JSON object, including one the other commands refuse: a config missing its `modules`
  array (the case where they tell you to run `pharn init`), or one with an invalid `seam` block. A
  file that is **not valid JSON** carries nothing over. Move it aside first
  ([troubleshooting](../troubleshooting.md#the-config-is-not-valid-json)), then copy your keys back.

`init` **never** carries over a key pharn owns. It writes `pharnVersion`, `skillsVersion`, `repo`,
`commit`, `installedAt`, `archetypes`, `capabilities`, `layout` and `modules` fresh. `models` becomes
pharn-oss's block again (or is left out, when pharn-oss ships none) and `seam` goes back to its
default, so a hand-edit in either does not survive a re-run `init` — unlike `pharn update`, which
keeps an edited `models` block.
`pendingSkillsVersion`, `frozenCapabilities` and the legacy fields below are dropped. (`capabilities`
is rewritten too, but the entries you added with `pharn add` are kept as `manual` — see the
[init command](../commands/init.md#6-summary).)

## Legacy fields (pre-archetype configs still load)

The schema is **additive** (P7): a `pharn.config.json` written by an older, module-based CLI still loads,
and its now-unused fields are preserved on read. They are still pharn's fields, though, so a re-run
`pharn init` drops them rather than [carrying them over](#keys-pharn-does-not-own).

Two fields are nonetheless **load-bearing**, and deleting either makes the file unreadable: a config
without a string `skillsVersion` or without a `modules` array is treated as absent, and every command
answers _"No pharn.config.json found. Run `pharn init` first."_ `modules` is always `[]` on an archetype
install, which makes it easy to mistake for removable — it is not.

| Field             | Type   | Note                                                             |
| ----------------- | ------ | ---------------------------------------------------------------- |
| `constitution`    | string | Legacy constitution variant (`gdpr-strict`/`standard`/`minimal`) |
| `installedSkills` | array  | Legacy per-technology skills, each `{ skill, from }`             |
| `stackAnswers`    | object | Legacy wizard answers, `questionId → value`                      |
| `isMultiTenant`   | bool   | Legacy multi-tenancy answer; nothing writes or reads it today    |

The module/manifest install path itself has been **removed**, so `add` / `update` / `remove` / `list` /
`status` no longer operate on a pre-archetype config — they exit with a message pointing you to re-run
`pharn init`.

## Overwrite behavior

| Command          | Trigger                                                                                  | Prompt                                                                                                             | If declined                                 |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `init`           | any of the install's write targets already exists (the set includes `pharn.config.json`) | lists the conflicting paths (at most 10, then "…and N more") and asks **Continue and overwrite?** — default **no** | Cancel install (exit 0); nothing is written |
| `add` / `update` | an archetype config is required                                                          | none — the config is updated in place                                                                              | n/a                                         |

A project with **no** conflicting path gets no prompt at all. The target set is derived from the
fetched clone's layout plus your resolved capability selection, and `.claude/settings.json` is never
overwritten — so it is excluded from the check. The [`init` summary step](../commands/init.md#6-summary)
itemises what the set contains.

When `pharn.config.json` is itself one of the conflicting paths, the prompt also names the
`skillsVersion` that config currently records, so you can see which version you are about to replace.
That value is read from your local config only — never fetched — and if the file cannot be read or
does not carry a plain version string, the clause is omitted and the prompt is otherwise unchanged.

`init` reaches that prompt only in an interactive terminal: off a TTY it exits **1** before fetching
anything, and it deliberately has no `--yes`.

For the files PHARN installs (as opposed to this config), `update` never overwrites one you have
edited unless you pass `--force` — see the [update decision table](../commands/update.md#the-decision-table).
Both `update --force` and `pharn add` copy every file they are about to overwrite into
`pharn/.backup/<timestamp>/` first, preserving its project-relative path. A re-run `pharn init` copies
this config there too before rewriting it (and marks it in its prompt), together with the installed
files it would otherwise lose — see [re-running `init`](../commands/init.md#6-summary).

## Related

- [init command](../commands/init.md)
- [add command](../commands/add.md)
- [update command](../commands/update.md)
- [pharn.records.json](pharn-records.md)
