# PLAN — models-pharn-oss-owned (pharn-oss owns the `models` schema; init copies it, update migrates it)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: roadmap Phase 2.0 (token-reduction roadmap, approved by the maintainer 2026-09-25).
  The `models` block in `pharn.config.json` stops being a CLI-owned schema. `pharn init` copies
  pharn-oss's own root `models` block instead of writing a hardcoded default, `pharn update`
  migrates the block the CLI used to write, the CLI's own model/effort/stage enums are retired in
  favour of a copy of pharn-oss's checker rules that a parity test pins to that checker, and
  `pharn status` shows the resolved per-stage values under a truthful label.
- layer(s): the CLI itself (`src/lib`, `src/steps`, `src/commands`), tests, docs
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Why (P7 — a real failure, measured)

Pre-check P2 (maintainer, 2026-09-25, pharn-cli 0.5.0; unchanged in 0.6.0). Re-verified this run
against pharn-oss `main` @ `767bf61` (SKILLS_VERSION 6.22.0), local clone equal to `origin/main`:

- `src/lib/model-routing.ts` hardcodes `MODEL_IDS` (`opus-4-8`, `sonnet-5`, `fable-5`, `haiku-4-5`),
  `EFFORT_LEVELS` (`low`, `high`, `max`), `PIPELINE_STAGES` (7 dev stages) and
  `DEFAULT_MODEL_ROUTING`; `src/steps/install-archetype.ts:229` writes that default into every
  user's config.
- pharn-oss's checker, which ships into every install as `pharn/floor/check-model-config.mjs`, REDs
  that default **three times** — measured: `missing required default stage entry`, and `stage
  "plan"` / `stage "review"` `model "opus-4-8" is not an alias {sonnet, opus, haiku, fable,
  inherit} nor a claude-* id` (exit 1). pharn-oss's own root block is GREEN (12 stages).
- `claude --model sonnet-5` → 404 `unrecognized_model` (maintainer's pre-check).
- The block disagrees with the installed command frontmatter (pharn-oss: plan = `opus`/`high`; the
  CLI: `opus-4-8 · max`), so `pharn status` prints a table that nothing applies.

## Discovery — verified this run (P6)

- pharn-oss's checker (`pharn/floor/check-model-config.mjs`, 424 lines, dependency-free, runs
  `main()` at import and `process.exit`s): `validate` reads `models.stages` only; `models` or
  `stages` absent/null → GREEN by design; `default` required inside `stages`; stage keys ⊆
  `PRODUCT_STAGES` (11: spec, plan, grill, build, regress, verify, ship, loop, review,
  memory-promote, ac-test) ∪ {`default`}; `model` ∈ {sonnet, opus, haiku, fable, inherit} or
  `/^claude-[a-z0-9][a-z0-9-]*$/`; `effort` ∈ {low, medium, high, xhigh, max}; extra keys inside an
  entry or beside `stages` are ignored; resolution is `Object.hasOwn(stages, s) ? stages[s] :
  stages.default`. It passes this repo's eslint unchanged (measured).
- pharn-oss's root `pharn.config.json` carries `models.stages` for all 11 stages + `default`; the
  codeload tarball the CLI already downloads contains it. Nothing in pharn-oss reads the block at
  run time; Claude Code applies each command's static `model:`/`effort:` frontmatter, and the
  checker's `agreement` mode holds the two equal (pharn-oss `LIMITS.md` §8).
- Two defaults were ever written by this CLI (`git log -- src/lib/model-routing.ts`): `74c5653`
  (2026-07-07) … `a8131a2~1` wrote `review: fable-5/max`; `a8131a2` (#57, 2026-07-23) onward writes
  `review: opus-4-8/high`. Both: `default: sonnet-5/high`, `plan: opus-4-8/max`. Every published
  release (0.3.0+) carries the second.
- `readPharnConfig` validates `models` strictly and THROWS `ModelRoutingError`; every command
  refuses to run on a bad block, and the new pharn-oss format would itself be refused.
- `update` returns "Already up to date" at the same skills version before fetching, so a
  migration that only runs past that return would never reach a current install.
- `pharn.records.json` keys are compared, never path-joined (`install-records.ts` header); `add`
  and `remove` spread/prefix-filter `files`, `update` rebuilds it from the manifest.
- THREAT-MODEL §1: pharn never executes the files it installs. §3.1: every network-derived field is
  validated at its ingest boundary before it reaches the config write.

## The validation choice (task item 3) — a pinned copy, not delegation

**Chosen: keep a local copy of pharn-oss's `validate`/`resolve` rules, pinned to pharn-oss's checker
by a parity test.** Delegating to the installed `pharn/floor/check-model-config.mjs` would mean
the CLI EXECUTES a file from the user's project (or, at `init`, from the downloaded clone):

1. THREAT-MODEL §1 (human-only) states "pharn never executes them". Delegation contradicts a
   trusted doc this loop may not edit.
2. It would change a real security property: `pharn status --strict` runs in CI on pull requests,
   and today it only reads and hashes. Executing `pharn/floor/*.mjs` there runs whatever a PR put in
   that file.
3. At `init` the checker exists only in the untrusted clone; running it would execute downloaded
   code before the user has seen anything.

One owner per rule is kept by construction: the CLI keeps **no rule of its own** (`MODEL_IDS`,
`EFFORT_LEVELS`, `PIPELINE_STAGES` are deleted outright). The copy lives in its own file
(`src/lib/model-config.ts`, one axis: pharn-oss's models rules), and the parity test makes pharn-oss
the owner of every rule in it: the vendored checker is byte-pinned (sha256 + upstream commit), the
stage/alias/regex/effort constants are READ OUT of its source and compared, and its verdicts and RED
lines are compared with the copy's over a corpus. A divergent copy cannot pass. This is the repo's
existing pattern for an upstream rule: the capability-index frontmatter fence ("upstream's own rule,
ported literally, differential-tested") and the seam lockstep test.

**The residual, named (LIMITS §3e):** released CLIs read `main` HEAD. If pharn-oss widens its rules
(a new stage, a new alias) without a `MIN_CLI` bump, an older CLI's copy rejects the new block. The
blast radius is bounded the §3e way: the block is **not applied** and the rejection is **named**
(with "upgrade pharn"); the install/update otherwise completes, and the next `pharn update` after an
upgrade restores it. The lever is upstream's `MIN_CLI`.

## Design

### The block's rules — `src/lib/model-config.ts` (pure; the pinned copy)

`PRODUCT_STAGES` (the 11 keys, upstream's order), `MODEL_ALIASES`, `MODEL_ID_RE`, `EFFORT_LEVELS`,
`checkModelsBlock(value)` → `no-stages` | `valid {stages}` | `invalid {reds[]}` (a literal port of
`stagesOf` + `validateStages`, same RED kinds, same detail text, same order), and
`resolveStageModel(stages, stage)` (the own-property pick).

### What `init` writes — `src/lib/upstream-models.ts` + `src/steps/install-archetype.ts`

`readUpstreamModels(repoDir)` reads the clone's root `pharn.config.json` through `readBoundedFile`
(the clone holds no symlinks: `tar-extract.ts` rejects them) → `absent` (no file, or no/null `models`)
| `ok {block}` | `invalid {reds}` (unreadable, not JSON, not an object, or the pinned copy REDs it).
`init` writes the block **verbatim** (a JSON deep copy) on `ok`, writes **no** `models` key on
`absent` (never invents one), and on `invalid` writes none and warns, naming each RED. The written
block's hash goes into `pharn.records.json` under the key `pharn.config.json#/models`, so a later
`update` can tell pharn's block from the user's. The outro's "Models per stage" becomes the resolved
view under the truthful label below.

### How `update` treats the block — `src/lib/models-update.ts` (pure) + `src/commands/update.ts`

The CLI's knowledge of its OWN old format lives here (it did own that format): the id map
`opus-4-8→opus`, `sonnet-5→sonnet`, `fable-5→fable`, `haiku-4-5→haiku`, and the two historical
defaults. `decideModelsUpdate` **reuses `decideFileAction`** (lib/update-decision.ts) with the
block's hash as the "file" hash — so the rows are the per-file rows by construction, not a copy:

| row | the user's block                                        | default                           | `--force`                      |
| --- | ------------------------------------------------------- | --------------------------------- | ------------------------------ |
| 1   | absent (`models` key missing)                           | write pharn-oss's — `restored`    | same                           |
| 2   | equal to pharn-oss's                                    | no-op — `ok`                      | same                           |
| 3   | byte-equal to a default an older pharn wrote            | replace with pharn-oss's — `updated` | same                        |
| 3   | equal to the recorded hash (pharn wrote it)             | replace with pharn-oss's — `updated` | same                        |
| 4-6 | edited / no record / no usable records                  | KEPT (`modified`/`unrecorded`/`unverifiable`) | back up `pharn.config.json`, then replace |

"Byte-equal" is `JSON.stringify` of the parsed block — the exact serialization pharn wrote, key order
included; indentation is not an edit. A historical default is proof of authorship that needs no
records file, so it is fed to the table as the record.

A KEPT block in the old format is **converted, never reset**: a top-level `default` moves into
`stages.default` (unless `stages.default` exists, or `stages` is not an object — then it stays and is
named), each old id maps to its alias, everything else is copied verbatim. The converted block is then
checked with the pinned copy, and each remaining RED is reported by name ("could not convert — left
as is"). Nothing is dropped, nothing is guessed. A converted or kept block carries its previous record
forward, never a fresh one, so the next run still reads it as the user's.

When pharn-oss's block is absent or fails the pinned copy, the user's block is kept (converted if it
is in the old format) and the failure is named. The block's outcome never withholds the
`skillsVersion` bump — it is configuration, not bytes of a version, and a customised block is a
supported steady state. The same-version early return is skipped while the block still holds
something to convert (`needsModelsConversion`), so a current install is migrated; once converted it
no longer re-opens the gate. `update` prints a `MODELS` note for every outcome except `ok`.

### What `status` shows — `src/lib/model-config-format.ts` + `src/commands/status.ts`

Every product stage, resolved (its own entry, or `default` marked as such), under the label: Claude
Code applies each `/pharn-*` command's own `model:`/`effort:` frontmatter, not this block; the block
is the source of truth that frontmatter is held to — `node <floor>/check-model-config.mjs agreement`
checks the two. An old-format block says `pharn update` converts it; an invalid block lists its REDs
(through `terminalSafe`). Absent → no note (unchanged). `--strict` does not gate on this section:
pharn-oss's checker owns that verdict.

### The config loader — `src/lib/pharn-config.ts`

`models` is read and written back **verbatim** and no longer validated at load, so the old format
(which `update` must be able to load to migrate), pharn-oss's format, and a future pharn-oss format
all load, and no unrelated command refuses to run over a block this CLI does not own.
`ModelRoutingError` leaves `isConfigValidationError`. `models` stays in `CLI_OWNED_KEYS`: pharn still
WRITES the key (init copies it, update manages it), so a re-run `init` rewrites it rather than
carrying a stale one — pharn-oss owns what goes inside.

## Files

- `src/lib/model-config.ts` — new, lib: the pinned copy of pharn-oss's models rules (validate, resolve).
- `src/lib/model-config-format.ts` — new, lib: the resolved-per-stage display lines (pure).
- `src/lib/models-update.ts` — new, lib: the old format (ids, historical defaults), conversion, and
  the update decision (reusing `decideFileAction`).
- `src/lib/upstream-models.ts` — new, lib: `readUpstreamModels(repoDir)`, the fetch-boundary read.
- `src/lib/model-routing.ts` — deleted (its enums are retired).
- `src/lib/model-routing-format.ts` — deleted (replaced by `model-config-format.ts`).
- `src/types.ts` — the CLI-owned model types go; `models?: unknown`, documented as pharn-oss's.
- `src/lib/pharn-config.ts` — no load-time `models` validation; comments.
- `src/lib/install-records.ts` — the models record key (`pharn.config.json#/models`) and the hash
  that fills it — the store's own vocabulary, which `init` already imports (grill, P3); the header
  names the one non-path key.
- `src/lib/proxy-env.ts` — a comment names the old module; repointed.
- `src/steps/install-archetype.ts` — copy + record pharn-oss's block; truthful outro.
- `src/steps/overwrite-check.ts` — a comment names `ModelRoutingError`; corrected.
- `src/commands/update.ts` — the decision, the gate, the backup, the records, the `MODELS` note.
- `src/commands/status.ts` — the `MODELS` note.
- `src/commands/list.ts` — a comment names the `models` error; corrected.
- `tests/fixtures/pharn-oss/check-model-config.mjs` — new: pharn-oss's checker, byte-for-byte
  (`767bf61`), the parity reference.
- `tests/model-config.test.ts` — new: the copy's rules.
- `tests/model-config-parity.test.ts` — new: sha256 pin, constants read from the checker's source,
  verdict + RED-line + resolve parity over a corpus (the checker run as a subprocess).
- `tests/model-config-format.test.ts` — new: the display.
- `tests/models-update.test.ts` — new: conversion + every decision row.
- `tests/upstream-models.test.ts` — new: the clone read.
- `tests/model-routing.test.ts` — deleted.
- `tests/model-routing-format.test.ts` — deleted.
- `tests/init-archetype.test.ts` — the block copied verbatim + recorded; none when upstream has none;
  none + a named warning when it is invalid; the truthful outro.
- `tests/update.test.ts` — the rows end to end on a real tree, the same-version migration, `--force`
  backing up the config, conversion reporting.
- `tests/status.test.ts` — the resolved view, the label, the old-format and invalid notes.
- `tests/pharn-config.test.ts` — a bad or old-format `models` block loads verbatim.
- `tests/list.test.ts` — its config-error stand-in moves from `ModelRoutingError` to `SeamConfigError`.
- `tests/overwrite-check.test.ts` — its throwing-config stand-in moves from `models` to `seam`.
- `tests/install-records.test.ts` — the models record key is a valid store key.
- `docs/reference/pharn-config.md` — the `models` section rewritten (pharn-oss's schema, what each
  command does, the truthful label); the table row; `init` re-run wording.
- `docs/reference/pharn-records.md` — the `pharn.config.json#/models` key.
- `docs/commands/init.md` — what init writes for `models`.
- `docs/commands/update.md` — the `models` rows and the old-format migration.
- `docs/commands/status.md` — the `MODELS` section.
- `docs/commands/add.md` — a bad `models` block no longer stops the command.
- `docs/commands/list.md` — same.
- `docs/roadmap.md` — the two `models` rows.
- `docs/troubleshooting.md` — the `models` error entry replaced.
- `docs/contributing.md` — module list and test table.
- `CLAUDE.md` — "This CLI still owns the `pharn.config.json` schema" amended: every key except
  `models`; the architecture notes follow the code.
- `CHANGELOG.md` — `[Unreleased]`.

### Not touched

- `CONSTITUTION.md`, `THREAT-MODEL.md`, `ARCHITECTURE.md`, `LIMITS.md` — human-only; see the
  reconciliations below.
- `src/lib/update-decision.ts` — reused as is.
- `.claude/settings.json` handling, `seam` — unchanged.

## Contracts satisfied

- pharn-oss `pharn/floor/check-model-config.mjs` (`validate`, `resolve`) — the schema, cited and
  pinned; not restated as a CLI contract (P4).
- The per-file update decision (`lib/update-decision.ts`) — reused, not re-implemented.
- THREAT-MODEL §3.1 — the new network-derived field is validated at its ingest boundary.

## Evals to write (P1)

- Parity: for every corpus config, the copy's verdict and RED lines equal the checker's
  (`node check-model-config.mjs validate --config <file>`), and `resolve` output is equal for every
  product stage + `default` + inherited names (`constructor`, `toString`, `__proto__`).
- Parity: the checker's `PRODUCT_STAGES` keys, `MODEL_ALIASES`, `MODEL_ID_RE`, `EFFORT_ENUM`,
  evaluated from its source, equal the copy's constants; the vendored file's sha256 equals the pin.
- Both historical defaults: the checker REDs them (the failure this fixes); `update` replaces them.
- An edited old-format block → converted: ids mapped, `default` moved, values kept; an unmappable
  model / unknown stage / conflicting `default` → reported by name, left verbatim.
- `init`: upstream block copied byte-for-byte (JSON) + recorded; absent → no `models` key; invalid →
  no key + a warning naming the RED; the written block passes the checker.
- `update`: rows 1-6 and `--force` on a real tree; the same-version run migrates, and the next one
  returns "Already up to date"; `--force` backs up `pharn.config.json`; a kept block never withholds
  the version; the models record survives `planUpdate`'s manifest-keyed rebuild.
- `status`: all 11 stages resolved with `(default)` marks; the label; old-format and invalid notes.
- `readPharnConfig`: bad and old-format `models` blocks load and round-trip verbatim.

## Guarantee audit (P0)

- "The CLI's models rules are pharn-oss's" → floor: content-hash (the vendored checker's sha256
  pin) + enum equality (constants read out of its source) + exit-code equality over a corpus.
  Beyond the corpus the structural equivalence is advisory. That the vendored copy equals LIVE
  upstream is advisory (checked when it is refreshed); drift is the named §3e residual.
- "`init` writes pharn-oss's block, never an invented one" → floor: presence test + the pinned
  enum/regex check at the ingest boundary.
- "`update` never overwrites a block the user edited without `--force`" → floor: sha256 equality
  (block vs record) and exact string equality (block vs a historical default), through
  `decideFileAction`.
- "Nothing unconvertible is dropped or guessed" → floor: the conversion maps only members of a fixed
  4-entry table and moves one key; every other value is copied verbatim; what remains is the pinned
  checker's RED set, printed.
- "`--force` loses nothing" → floor: `createBackup` of `pharn.config.json` before any write.
- "The status label is truthful" → advisory (wording), pinned by a test. That Claude Code applies
  frontmatter is pharn-oss's claim (its LIMITS §8), cited.

## Trust audit (P2)

- The clone's root `pharn.config.json` (untrusted): bounded, non-blocking read; parsed as data;
  checked by the pinned copy before it can reach the config write; written with `JSON.stringify`.
  Extra keys inside the block are carried verbatim and are inert (nothing reads them). A valid block's
  printed values are enum/regex members (a safe charset); RED details for invalid input go through
  `terminalSafe`.
- The user's `models` block (local, hand-editable, untrusted): hashed, compared, converted and shown —
  never path-joined. Conversion builds objects with own-property semantics, so a `__proto__` key stays
  data.
- The `pharn.config.json#/models` record key: compared, never path-joined (the store's rule).

## Determinism audit (P5)

- Every branch is a membership or equality test: key presence, hash equality, historical-default
  string equality, legacy-id table membership, the pinned enums. The terminal fallback is "keep the
  user's block and name what is wrong" — never a guessed mapping, never a silent drop.

## Doc reconciliations for the human (never agent-edited)

- `CONSTITUTION.md` P3: "this CLI owns the `pharn.config.json` schema" — now true for every key
  except `models`, whose schema pharn-oss owns (the maintainer's decision). P3's enforceable clause
  (one axis per file, no sibling imports) still holds: pharn-oss's rules live in their own file.
  `testResults`/`ship` were already upstream-owned keys in the same file.
- `THREAT-MODEL.md` §3.1: lists `models` among the local-origin fields ("the `models`/`seam`
  defaults"). It is now a fourth network-derived field, validated at ingest by `checkModelsBlock`.

## Grill fold-ins (GRILL.md, all advisory; folded under the plan-approval delegation)

- The record key and its hash live in `install-records.ts`, not `models-update.ts` (P3).
- The parity corpus must reach every RED kind the checker's validate path can emit, read from its own
  `red("…")` call sites (P0).
- `docs/contributing.md` gets the refresh procedure for the vendored checker (P0).
- Both halves of the same-version migration are tested; a block whose only leftover cannot move does
  not keep the gate open (P1).
- The `update` MODELS note and the `init` warning use `terminalSafe` too (P2).
- The docs say that a reordered old default reads as edited (P5), and that a re-run `init` still
  replaces an edited block (P7, an inherited asymmetry left as a follow-up).

## Open questions (HALT)

None. The maintainer's brief (2026-09-25) fixed the ownership decision, the id map, the migration
rules and the release steps; the one open choice (delegate vs. pinned copy) is decided above with its
reasons, under the plan-approval delegation.
