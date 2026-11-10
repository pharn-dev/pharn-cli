# PLAN — `init` / `update` keep a project's Prettier gate off the files pharn installs

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: when the project uses Prettier, `pharn init` and `pharn update` make sure its root `.prettierignore` covers the files pharn writes, appending only what is missing; the dry runs preview it, `status` notes a gap, `uninstall` leaves the lines.
- layer(s): `src/lib` (a shared ignore-file core, a new `.prettierignore` axis), `src/steps` (init apply), `src/commands` (update / status / uninstall), the plan/report/render libs, tests, docs. Release **0.17.0** (new behaviour, minor).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]
- base: main c1c55a6

## Live state (read this run, P6)

- **Measured failure (2026-11-10).** pharn-oss formats its files for its own Prettier config (printWidth 140). A project gating on `prettier . --check` under its own config goes red on 250 files under `pharn/pharn-review/`; `/pharn-loop` stopped at S14 (gates-red-at-entry). `prettier --write pharn/` makes those files `modified`, so `update` then skips them.
- **Also measured this run:** `pharn.config.json` as pharn writes it (`JSON.stringify(…, 2)`) fails `prettier --check` (prettier 3.9.10 collapses `"archetypes": ["ssr", "backend"]` onto one line). Every `init`/`update` rewrites it, so formatting it by hand does not stick.
- `src/` never mentions prettier or `.prettierignore` (grep).
- `src/lib/gitignore.ts` (0.16.0) is the pattern to follow: `parsePattern` (trailing-space trim, CR, `!`, leading `/`/`**/`, trailing `/`, `/*`, `/**`), latin1 1:1 decode + BOM-aware line split, `gitignoreAddition` (EOL follows the file, separator, comment once), `readPlan` (lstat symlink refusal, `readBoundedFile`, `refused {symlink|not-a-file|unreadable}`), `applyGitignore` (re-plan under the lock, `writeFileAtomic`, `failed {code}` returned), `gitignoreLines` (one wording, preview tense), `gitignoreReport` (JSON projection, null → key absent). Wired into `init-plan.ts`, `init-report.ts`, `steps/install-archetype.ts`, `update-plan.ts`, `update-report.ts`, `update-render.ts`, `commands/update.ts` (incl. the same-version re-open `gitignoreMissing`), `commands/init.ts`.
- The install manifest (`collectExpectedInstallPaths`) is file-keyed. Its directory surfaces come from `layoutPaths` (grillers, lenses, contracts, core, floor); `orphans.ts` already builds the both-layouts surface sets (`SURFACE_DIRS`, `SURFACE_FILES`, `CAPABILITY_SUBTREES`) and `isInstallRootPath`.
- Prettier 3 reads `.gitignore` as well as `.prettierignore` by default, so `pharn/.run/` and `pharn/.backup/` are already out of its way once 0.16.0's `.gitignore` lines exist.

## Behaviour (the spec this plan builds)

### Does the project use Prettier? (membership test, P5)

True when ANY of these holds at the project root:

1. `.prettierignore` exists (lstat; any type — a refusal is reported below);
2. `package.json` (read with `readJsonBounded`) has a top-level `prettier` key, or `prettier` as an own key of `dependencies` or `devDependencies`;
3. a Prettier config file exists (lstat, never read): `.prettierrc`, `.prettierrc.{json,json5,yaml,yml,toml,js,cjs,mjs,ts,cts,mts}`, `prettier.config.{js,cjs,mjs,ts,cts,mts}` — Prettier's documented list.

Otherwise the plan is `none` and nothing is read further or written. Residual (documented): a monorepo that configures Prettier only in a workspace package is not detected.

### Entries (derived, never a second list)

`prettierignoreEntries(keys)` takes the project-relative paths pharn writes and reduces each one:

- inside a whole-directory surface of EITHER layout (capability subtrees, contracts, core, floor — the same `layoutPaths` sets `orphans.ts` uses, moved to one shared export) → that directory, written `/<dir>/`;
- the pharn layout's features README (`pharn/features/README.md`) → `/pharn/features/` (Q1);
- any other install-root path (`isInstallRootPath`: trusted docs, LICENSE dest, flat `features/README.md`, `.claude/commands/pharn-*.md`, `.claude/hooks/*.cjs|mjs`) → the file itself, `/<path>`;
- plus pharn's two root state files, `/pharn.config.json` and `/pharn.records.json` (Q2).

Keys that are not install-root paths, `MODELS_RECORD_KEY`, and any key whose segments fail a strict charset (`[A-Za-z0-9._-]`, no leading `!`/`#`/space, no glob metacharacters) are dropped, so no record key can inject a pattern. Output is de-duplicated and sorted. Every entry is anchored with a leading `/` (a slash-less `pharn-review/` would float to every depth).

**Which keys:**

- `init` (real + dry run): the manifest keys ∪ the records `init` carries (kept/frozen + orphans) — i.e. the keys of the records store the run writes.
- `update` (real + dry run): the keys of the records store the run writes (manifest ∪ frozen ∪ carried orphans, minus retired root docs).
- `update`'s same-version early return and `status`: the keys of the usable records baseline. No usable store → no check (Q5 residual).

Because the applied set and the re-open set are both "the keys of the store", a run that appends leaves nothing pending, so the re-open is bounded.

### Covered test

`gitignore.ts`'s parser, shared. An entry is covered when a pattern names it exactly (anchored or not), when a floating bare basename matches (directories only, as today), when a negation names it (the user's call), **or** when a non-negated pattern names an ANCESTOR directory of it (`pharn/`, `/pharn`, `pharn/**`, `pharn/*`) — new, so a project that already ignores `pharn/` gets no lines. A file entry is never covered by a directory-only pattern for the same path (`/pharn.config.json/`).

### Writing (identical to gitignore.ts)

Append-only (old bytes are the prefix, latin1, never re-encoded), EOL from the file's first line ending, a separator when it lacks a final newline, one comment `# Files installed and rewritten by pharn (added by pharn)` once per file, a new file created with the comment + entries (LF). Symlinked `.prettierignore` → `refused symlink`; not a regular file → `not-a-file`; unreadable/oversize → `unreadable`; failed write → `failed {code}`. All returned, never thrown, printed as a warning naming the lines to add by hand.

### Shared core (P3)

New `src/lib/ignore-file.ts` holds the parts both files need: pattern parsing, BOM-aware lines, the addition builder, the bounded plan read and the atomic append. `gitignore.ts` keeps its exported API and behaviour byte-for-byte (its existing tests run unchanged) and delegates. New `src/lib/prettierignore.ts` owns detection, entry derivation and its own wording.

### Where

- `init`: `runInstallArchetype`, right after `applyGitignore`, under the lock; outro line `✔ .prettierignore updated → N path(s)` (or `created`).
- `update`: `applyPlannedUpdate`, after `applyGitignore`, under the lock; `log.info` line.
- Same-version `update`: a pending addition (create/append, never a refused file) re-opens the early return, one header-note line, like `gitignoreMissing`.
- Dry runs: one `PLAN` line (`.prettierignore: would add N path(s): …`, capped at 10 listed), JSON additive `prettierignore: {action, entries[, reason]}` (init top level) / `plan.prettierignore` (update), ABSENT when nothing changes — the existing byte pins hold, `schemaVersion` stays 1.
- `status` (Q4): an advisory `PRETTIER` note after DRIFT when the plan is not `none` (lists the missing lines, says `pharn update` adds them, or names the refusal); `--json` additive top-level `prettierignore` (same projection, `null` when nothing to say). Not a `--strict` input.
- `uninstall` (Q3): leaves the block; its UNTOUCHED line names `.prettierignore` beside `.gitignore`.
- `add`/`remove`: out of scope. `add` can add a capability dir under an already-covered subtree, so nothing new is needed; `remove` only deletes.

### `pharn/features/**` decision (Q1, documented)

Covered, in the pharn layout. Its artifacts are written by PHARN's stages and several are hash-pinned (the SPEC body hash, `AC-TESTS.lock.json`); a `prettier --write` there breaks the pins, and an unformatted artifact written mid-run turns `/pharn-verify`'s gate red. The flat layout's `features/` is a generic root name that may be the user's own code, so there only `features/README.md` is covered.

## Files

- `src/lib/ignore-file.ts` — NEW shared ignore-file core (parse, lines, addition, bounded plan read, atomic append) — lib
- `src/lib/gitignore.ts` — delegate to ignore-file.ts, API and behaviour unchanged — lib
- `src/lib/prettierignore.ts` — NEW: detection, entry derivation, plan/apply/pending/lines/report — lib
- `src/lib/install-surfaces.ts` — NEW: the both-layouts surface sets, moved out of `orphans.ts` (shared, P3) — lib
- `src/lib/orphans.ts` — import the moved sets — lib
- `src/lib/init-plan.ts` — init dry-run plan field — lib
- `src/lib/init-report.ts` — init `--json` key — lib
- `src/commands/init.ts` — init dry-run text — command
- `src/steps/install-archetype.ts` — init apply + outro — step
- `src/lib/update-plan.ts` — update plan field — lib
- `src/lib/update-report.ts` — update `--json` key — lib
- `src/lib/update-render.ts` — update text — lib
- `src/commands/update.ts` — update apply + same-version re-open — command
- `src/commands/status.ts` — PRETTIER note — command
- `src/lib/status-report.ts` — status `--json` key — lib
- `src/commands/uninstall.ts` — UNTOUCHED wording — command
- `tests/ignore-file.test.ts` — NEW
- `tests/prettierignore.test.ts` — NEW
- `tests/gitignore.test.ts` — read-only check: must pass unmodified
- `tests/init-dry-run-json.test.ts` — wiring
- `tests/init-report.test.ts` — wiring
- `tests/init-archetype.test.ts` — wiring
- `tests/update-dry-run-json.test.ts` — wiring
- `tests/update-report.test.ts` — wiring
- `tests/update.test.ts` — wiring + re-open
- `tests/status.test.ts` — wiring
- `tests/status-report.test.ts` — wiring
- `tests/status-json.test.ts` — wiring
- `tests/uninstall.test.ts` — wiring
- `tests/commands-integration.test.ts` — Prettier's own matcher over a real install
- `docs/commands/init.md` — user docs
- `docs/commands/update.md` — user docs
- `docs/commands/status.md` — user docs
- `docs/commands/uninstall.md` — user docs
- `docs/troubleshooting.md` — user docs
- `CLAUDE.md` — architecture paragraph
- `CHANGELOG.md` — 0.17.0 entry
- `package.json` — version 0.17.0
- `package-lock.json` — version 0.17.0
- `tests/release-consistency.test.ts` — add the existing `v0.16.2` tag to KNOWN_TAGS (release flow; added during build)

## Evals to write (P1)

- detection: each of the three signals alone → used; none → `none`, file untouched; `prettier` in `peerDependencies` only → not used; malformed/oversize `package.json` → not used by that signal.
- entries: pharn-layout manifest → subtree dirs + `/pharn/features/` + loose files + 2 state files, sorted, anchored; flat → `/features/README.md` not `/features/`; hostile record keys (`../x`, `a\nb`, `*`, `!x`, outside install root) dropped.
- covered: exact, anchored, floating basename, negation, ancestor `pharn/` / `/pharn/**`, dir-only pattern does not cover a file; second run writes nothing (bytes + mtime).
- append-only: prefix preserved incl. non-UTF-8 bytes and BOM; CRLF follows; separator when no final newline; comment once.
- refusals: symlink (never written through), directory, FIFO, oversize, failed write (`failed {code}`), never thrown.
- gitignore.ts: existing suite unchanged and green after the extraction.
- init: real run creates/appends; no Prettier → no file; `init --dry-run --json` key present/absent; `--yes` does not refuse over `.prettierignore`.
- update: real run appends; same-version re-open fires once then early-returns; refused file does not re-open; `--dry-run --json` `plan.prettierignore` present/absent with the default bytes unchanged.
- status: note + JSON key; not a `--strict` failure.
- uninstall: `.prettierignore` byte-identical after.
- integration (commands-integration): a Prettier project's `.prettierignore` after `init --yes` covers every manifest file (each manifest key is ignored by the written patterns).

## Guarantee audit (P0)

- "pharn never writes through a symlinked `.prettierignore`" → floor: lstat refusal + `writeFileAtomic` (exclusive temp + rename).
- "append-only" → floor: the write is `Buffer.concat([old, append])` of the bytes just read; tested as a prefix check.
- "an entry already covered is not added" → floor: membership over normalized fixed strings; ADVISORY beyond the recognised spellings (an unrecognised broader pattern gives a redundant, harmless line).
- "record keys cannot inject patterns" → floor: `isInstallRootPath` + charset regex before any key becomes a line.
- "the project's Prettier gate stays green over pharn's files" → **ADVISORY**. pharn writes ignore lines; it does not run Prettier, cannot see a gate that passes `--ignore-path` elsewhere or a nested config, and does not reformat anything.
- "the same-version re-open is bounded" → floor-backed argument: applied set = re-open set = store keys; residual: a write that keeps failing re-opens every run (stated, as for `.gitignore`).

## Trust audit (P2)

- `.prettierignore`, `package.json`, Prettier config names: project content, possibly hostile. Read bounded, compared against fixed literals; config files are lstat-only, never read; their text never reaches a terminal.
- Record keys (project content) become ignore lines only after the install-root + charset gates; the clone's manifest keys pass the same gates.
- Output lines printed to the terminal are built from the gated entries only.

## Open questions — RESOLVED at GATE 1 (2026-11-10, human)

- Q1: cover `pharn/features/` (pharn layout); flat covers only `features/README.md` — **approved**.
- Q2: cover `pharn.config.json` and `pharn.records.json` — **approved**.
- Q3: `uninstall` leaves the `.prettierignore` block — **approved**.
- Q4: `status` note is advisory, not a `--strict` input — **approved**.
- Q5: same-version `update` re-opens to add missing lines (store-derived, bounded) — **approved**.
- Plan: **approved as written**.
