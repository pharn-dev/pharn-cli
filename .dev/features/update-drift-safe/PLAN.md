# PLAN — update-drift-safe (recorded install hashes, skip-by-default, `--force` + backup)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn update` never silently destroys a local modification — it compares each expected
  file against a per-file sha256 recorded at install time and SKIPS anything it cannot prove is
  pristine, unless `--force` (which backs the file up first).
- layer(s): the CLI itself (`src/lib`, `src/commands`, `src/steps`) — not a pharn-oss capability layer
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery — VERIFIED CONTEXT re-checked against live state (P6)

Every claim below was read from disk this run; none is asserted from memory.

| Claim (from the brief)                                                       | Verdict           | Evidence                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config records `skillsVersion`, `commit`, `capabilities`, `installedAt`, `layout`, `models`; **no per-file hashes anywhere** | ✅ confirmed      | `src/types.ts:98-134` (`PharnConfig`), `src/steps/install-archetype.ts:60-83`; no hash field in the schema or in `docs/reference/pharn-config.md`            |
| `status` byte-compares disk vs a **fresh clone of @main** via `collectExpectedInstallPaths`         | ✅ confirmed      | `src/commands/status.ts:85-99` → `src/lib/diff.ts:26-71` → `src/lib/install-manifest.ts:69-121`; `REF = pharn-dev/pharn-oss@main` (`status.ts:16`)          |
| DEAD END — a baseline clone at `config.commit` is impossible with degit@3.6.1                        | ✅ confirmed      | `node_modules/degit` is 3.6.1; `selectRef` matches only a ref **name** or a hash-prefix of a listed **ref tip**, else throws `MISSING_REF` ("could not find commit hash for …"). The `cloneWithGit` fallback fires **only** when `transport === 'ssh'` — our https `pharn-dev/pharn-oss` never reaches it. `src/lib/repo.ts:38-42` says the same. **Not reintroduced.** |
| `update` early-returns on same version; ONE confirm; `installCapabilities` (whole-dir `cpSync`); rewrites config | ✅ confirmed      | `src/commands/update.ts:62-65`, `:79-83`, `:103`, `:113-119`; `installCapabilities` copies whole dirs (`src/lib/install-capabilities.ts:107,169,179`)        |
| `update` IGNORES the `layout` returned by `installCapabilities` (latent bug)                         | ✅ confirmed      | `update.ts:103` discards the return value; `:113-119` spreads `...config`, so the OLD `config.layout` survives. See **Follow-up ticket (d)**.                |
| `status` prints "`pharn update` will overwrite these."                                              | ✅ confirmed      | `src/commands/status.ts:154`; the same claim in prose at `docs/commands/status.md:12` and `:28-29`                                                           |
| Flags via minimist `boolean` array + USAGE; vitest; docs in `docs/commands/`                         | ✅ confirmed      | `src/index.ts:35-43`, `:13-32`; `tests/*.test.ts` + `tests/helpers.ts`; `package.json` `check` = format:check + lint + typecheck + test                       |

Two **additional** live findings the brief did not name (both change the design):

1. **`tests/install-manifest.test.ts:270-301` pins a mirror invariant**: "the files `installCapabilities`
   actually writes == manifest keys ∪ `.claude/settings.json`". If the record store were written
   **inside** `installCapabilities`, that invariant breaks and the copy routine would own two axes of
   change (P3). → the shared record routine **computes** records; the config-writing caller
   **persists** them. See HALT (b).
2. **`.claude/settings.json` is excluded from the manifest** (user-owned). Today `update` re-runs
   `installCapabilities`, which would re-create `settings.json` if the user deleted it. A per-file
   update driven by the manifest will **never** touch `settings.json`. Deliberate and more correct
   (init still writes it when absent) — recorded here as a consequence, not a silent change.

### `.pharn-backup/` and the record store vs. detection + the conflict set (checked, per brief)

- **`detect-archetype` file-tree scan** (`src/lib/detect-archetype.ts` + `classifyEntry` in
  `src/lib/archetype.ts`): signals fire only on `.tsx`/`.jsx`, `next.config.*`, `route.ts` under an
  `app/` ancestor, `.sql` under a DB dir, and the dirs `api/` (top level or under `pages`/`app`) and
  `migrations/`. Every PHARN-owned file is `.md`, `.json`, `.cjs`, or `.mjs` (verified over a real
  install: `find test-next … ! -name '*.md'` yields only `evals/expected/*.json`), and backup copies
  sit under `.pharn-backup/<ts>/…` so no path is top-level. **Cannot contribute a signal** → no change
  to `detect-archetype.ts` (which is out of scope anyway). `pharn.records.json` is likewise inert.
- **Conflict set** (`conflictingWriteTargets`): derived from `collectExpectedInstallPaths` (clone-
  derived) **plus** `pharn.config.json` only. Neither `pharn.records.json` nor `.pharn-backup/` is
  clone-derived, so both are excluded **by construction** — `install-manifest.ts` needs **no change**.
  A new test pins that exclusion so it cannot regress.

## The decision table (the one axis of this increment)

Pure function `decideFileAction({ diskHash, latestHash, recordedHash, recordsAvailable, force })`,
evaluated top-down; the **first** matching row wins.

| #   | disk        | records     | condition                       | action (default)   | label          | with `--force`     |
| --- | ----------- | ----------- | ------------------------------- | ------------------ | -------------- | ------------------ |
| 1   | missing     | any         | —                               | **WRITE**          | `restored`     | WRITE (no backup: nothing to back up) |
| 2   | present     | any         | `diskHash === latestHash`       | **NO-OP** + refresh record | `ok`   | NO-OP              |
| 3   | present     | available   | `diskHash === recordedHash`     | **WRITE**          | `updated`      | WRITE              |
| 4   | present     | available   | record exists, `diskHash !== recordedHash` | **SKIP** | `modified`     | backup → WRITE     |
| 5   | present     | available   | **no** record for this path     | **SKIP**           | `unrecorded`   | backup → WRITE     |
| 6   | present     | unavailable | —                               | **SKIP**           | `unverifiable` | backup → WRITE     |

- Row 2 precedes the record rows: a file already byte-identical to upstream is never a skip, even when
  records are absent — and its record is refreshed, which is how a degraded install self-heals.
- `unrecorded` = a user-owned file colliding with a newly-added upstream path (or a file installed by
  a pre-upgrade CLI). `unverifiable` = the whole record store is absent/corrupt (pre-upgrade install).
- Exit code is **0** even with skips. `update` **never deletes**. No per-file prompts, no diffs, no
  `--dry-run` (`pharn status --strict` remains the preview).

## Records after a run

Written for every file whose outcome was `restored`, `updated`, or `ok` → `record := latestHash`.
Skipped files keep their previous entry (or stay absent). With `--force`, a forced overwrite is a
write → its record is refreshed too. Stale entries for paths no longer in the manifest are **inert**:
the update loop iterates the *manifest* and looks records up by manifest-derived key, so an orphan key
is never read (cleaning them in `pharn remove` is **follow-up (e)**, not this PR).

## Files

**Amended after `/pharn-dev-grill` — see `## Post-grill amendments` below for why each entry changed.**

Source:

- `src/lib/update-decision.ts` — **NEW.** The pure decision function (`decideFileAction`, declared
  return shape) + the pure whole-run planner over hash maps. Zero I/O. — layer: `lib` (one axis: the
  update policy)
- `src/lib/install-records.ts` — **NEW.** The record store: path, `readRecords` (strict validation →
  a named-degraded result when absent/corrupt), `writeRecords`, `mergeRecords`, `buildRecords`
  (hashes the **written dest** bytes), `capabilityRecordPaths`. — layer: `lib`
- `src/lib/backup.ts` — **NEW.** `.pharn-backup/<YYYYMMDD-HHMMSS>/` copier: pre-flights every source,
  preserves relative paths, `safeJoin`-contained + `lstat`-guarded at both ends, uniquifies a
  colliding timestamp dir, and **aborts before any original is touched** if a backup write fails.
- `src/lib/apply-update.ts` — **NEW (grill #17).** The per-file write executor: `lstat` the dest,
  `mkdir` parents, `copyFileSync`, and persist records for what was written even on a mid-loop throw.
  Keeps `commands/update.ts` to orchestration + reporting (P3).
- `src/lib/hash.ts` — **NEW (grill m5).** The one canonical `sha256File`.
- `src/lib/install-manifest.ts` — **CHANGED (grill, CONFIRMED P2).** Adds an `lstat`-based
  symlink rejection for every source root/doc, because this increment promotes the manifest from a
  read-only mirror into the driver of every update WRITE.
- `src/commands/update.ts` — apply the plan per file, print the grouped summary (incl. a `forced`
  count and the printed backup path), write records-then-config, record the clone's detected `layout`
  (the **(d) fix**), and withhold the version bump when the run skipped anything (**A1**).
- `src/commands/status.ts` — DRIFT section copy only (carve-out); logic untouched, still read-only.
- `src/index.ts` — `--force` into the minimist `boolean` array + command-scoped USAGE text +
  forwarded to `runUpdate`.
- `src/steps/install-archetype.ts` — record after install (init), written beside `pharn.config.json`.
- `src/commands/add.ts` — record the added capability's files (merged into an already-readable store).
- `package.json` — version `0.3.2` → `0.4.0` (no dependency changes).

Tests (P1 — every one of these is a writable build target):

- `tests/update-decision.test.ts` — **NEW.**
- `tests/install-records.test.ts` — **NEW.**
- `tests/backup.test.ts` — **NEW.**
- `tests/apply-update.test.ts` — **NEW.**
- `tests/update.test.ts` — converted to a real-fs fixture (grill #3) + extended.
- `tests/install-manifest.test.ts` — extended (exclusions + the mirror re-pinned against the new writer).
- `tests/init-archetype.test.ts` — extended (**CONFIRMED P1**: init records every manifest path).
- `tests/add.test.ts` — extended (**CONFIRMED P1**: add appends without clobbering prior entries).
- `tests/index.test.ts` — extended (`--force` parses and reaches `runUpdate`).
- `tests/status.test.ts` — extended (the new DRIFT copy).

Docs:

- `docs/commands/update.md` — decision table, `--force`, backup dir + retention + restore procedure,
  both degraded labels, the record store, the withheld-bump contract.
- `docs/commands/status.md` — the reworded DRIFT copy **plus** lines 12, 26-27 and 50 (grill #25/#29).
- `docs/commands/init.md` — "also writes `pharn.records.json`".
- `docs/commands/add.md` — "also merges into `pharn.records.json`".
- `docs/reference/pharn-records.md` — **NEW.** The record-store reference page.
- `docs/reference/pharn-config.md` — cross-link + the sidecar's relationship to the config.
- `docs/troubleshooting.md` — exit-code rows for "completed with skips" (0) and a backup abort (1).
- `docs/getting-started.md` — the new artifact in the "what lands in your project" narrative.
- `docs/contributing.md` — the new src/ + tests/ rows.
- `docs/README.md` — the reference-page index row.
- `README.md` — commands-table row + the artifact mention.
- `CLAUDE.md` — the update/status/install-capabilities paragraphs this increment falsifies.
- `CHANGELOG.md` — the behavior change under `0.4.0`.

### Explicitly not touched

`src/lib/repo.ts`, `src/lib/diff.ts`, `src/lib/install-capabilities.ts`,
`src/lib/detect-archetype.ts`, `src/commands/init.ts`, `src/commands/list.ts`,
`src/commands/remove.ts`, the user's `.gitignore`, and `package.json` dependencies.

## Post-grill amendments (A1–A10)

`/pharn-dev-grill` ran 7 independent axis interrogators + adversarial verification and raised 60
findings (5 CONFIRMED, 3 REFUTED, 38 PLAUSIBLE-unverified, 14 minor) — full log in `GRILL.md`. The
design survived; these amendments close what it found. Each is recorded here **before** the build, so
the built increment matches an amended plan rather than drifting from an unamended one.

- **A1 — the convergence hole (CONFIRMED blocking; found independently by 3 of 7 axes).** As planned,
  the first update on any existing install would skip the changed files (`unverifiable`) and **still**
  record `skillsVersion := latest`, after which the same-version early-return would make the run
  unrepeatable. **Fix:** advance `skillsVersion` **and** `commit` only when the run skipped **nothing**
  (one membership test, `skipped.length === 0`, P5). A partial run records what is live
  (`capabilities`, `layout`, `installedAt`, records) but leaves the version provenance describing the
  last **complete** state — so the record stays TRUE and the next `update` still has work to do.
- **A2 — `--force` bypasses the same-version early-return (PLAUSIBLE #1/#16).** The human-authored
  status copy promises "`--force` overwrites edits too"; with the gate untouched that string is false
  for an up-to-date install. **This knowingly crosses the brief's "must NOT touch update's version
  gate" line** — flagged at the post-build gate, not slipped in. It is a two-token change
  (`&& !force`) plus adapted note/confirm copy for the same-version force path. HALT (c) is
  unaffected: the **default** path still early-returns.
- **A3 — write ordering + partial-failure contract (#12, #13, #34).** Records are written **first**,
  then the config (config-first + a failed records write would leave stale records that mislabel
  pharn's own bytes as the user's edits forever). Records for files already written are persisted even
  when the per-file loop throws mid-way, replacing the "no partial installs" property the whole-dir
  `cpSync` used to provide.
- **A4 — dest-side symlink guard (CONFIRMED important).** Every write/backup `lstat`s its destination
  and refuses a symlinked dest or parent. Honest framing: this closes a gap that **already ships**
  today via recursive `cpSync`; the increment inherits it rather than creating it.
- **A5 — source-root symlink pre-flight in the manifest (CONFIRMED important).**
  `collectExpectedInstallPaths` gains `installCapabilityDirs`' `isSymlink(from)` rejection, since it
  now drives writes rather than a read-only comparison.
- **A6 — the two missing test surfaces (CONFIRMED blocking).** `tests/init-archetype.test.ts` and
  `tests/add.test.ts` are now build targets. The `add` hazard is concrete: `add.ts:217-221` already
  documents a "thread the config forward or the writes clobber down to the last one" bug, and a
  records store merged the same way inherits it.
- **A7 — `copyFileSync` does not create parents (#18).** Every write `mkdir`s its parent chain first;
  pinned by a row-1 restore of a file whose directory was deleted.
- **A8 — backup-dir collision (#14).** An existing `.pharn-backup/<ts>/` is never written into; the
  run uniquifies (`-2`, `-3`, …) so a second `--force` in the same second cannot destroy the only
  surviving copy of the user's edits.
- **A9 — a live falsehood this increment fixes (REFUTED-then-inverted).** `installCapabilities` copies
  every trusted doc with `force: true`, so `pharn update` **already** clobbers a hand-edited
  `CONSTITUTION.md` while `docs/commands/update.md:25` and the `update.ts:137` outro both claim it is
  untouched. After this change a modified `CONSTITUTION.md` is a row-4 SKIP and the claim becomes
  true; the docs are corrected either way.
- **A10 — a corrupt store is named, not silently collapsed (#15, m12).** An unreadable/invalid
  `pharn.records.json` still fails closed to SKIP, but is **reported by name** ("`pharn.records.json`
  is unreadable — delete it or re-run `pharn init`") rather than being indistinguishable from a
  legacy install — the same lesson `readPharnConfig` already encodes for `models`/`seam`.
  Additionally the store is `{schemaVersion, files:{}}` (so the hex sweep ranges over `files` only and
  a future additive key cannot read as corrupt, #31), is **stamped** with the `skillsVersion`/`commit`
  its hashes describe (a stamp disagreeing with the config → records-unavailable, so a CLI-downgrade
  round-trip fails closed instead of mislabeling upstream bytes as user edits, #33), and is rewritten
  as a fresh map keyed by the manifest just applied — carrying forward only surviving keys, which
  self-prunes and **supersedes follow-up (e)** (m10).

Also adopted from the grill: a named `unreadable` SKIP label for a dest that is a directory or
unreadable (m6, replacing a raw crash); the `forced` summary count + the printed backup path (#37);
the guarantee-audit relabelings (#22 ordering-is-advisory, #23 "without `--force`", #24 the
`content-hash` primitive-list divergence); and the documentation sweep (#25–#29, m7–m9).

## Contracts satisfied

- `ARCHITECTURE.md §2` primitive #2 (**content-hash** — identity of content, not of id) — the recorded
  per-file sha256 is exactly that primitive, applied to the installed tree. Cite, not restate (P4).
- `ARCHITECTURE.md §5` "a re-fetch that changes content **requires re-review** … it never silently
  replaces" — this increment makes `update` obey that sentence for installed files.
- `pharn.config.json` schema stays **additive** (P7): the records live in a sidecar; a config without
  one still loads, and an install without a store degrades to `unverifiable` (fail-closed), never an error.

## Evals to write (P1)

`vitest`, reusing `tests/helpers.ts` (`useTmpDir`, `stubProcessExit`, `CANCEL`):

- `tests/update-decision.test.ts` → every row 1–6 × `force ∈ {false, true}`; precedence (missing beats
  identical; identical beats records); records-absent with a differing disk → `unverifiable`.
- `tests/install-records.test.ts` → `buildRecords` hashes the **dest**, not the source; round-trip
  read/write; absent store → `null`; corrupt JSON → `null`; non-64-hex value → `null` (fail-closed);
  merge preserves untouched entries; refresh semantics for written / identical / skipped / absent.
- `tests/backup.test.ts` → backup dir created with relative paths preserved; a failing backup aborts
  **before** any original is touched (the original bytes are still there); `safeJoin` containment.
- `tests/update.test.ts` (extend) → skip-by-default with label grouping in the summary + exit 0;
  `--force` writes the backup **before** the overwrite (ordering asserted); missing file restored;
  records refreshed; config **and** records both written on success.
- `tests/install-manifest.test.ts` (extend) → `pharn.records.json` and `.pharn-backup/` are in neither
  `collectExpectedInstallPaths` nor `conflictingWriteTargets`.
- `tests/index.test.ts` (extend) → `--force` parses and reaches `runUpdate`; absent → `false`.
- `tests/status.test.ts` (extend) → the new drift hint strings.

## Guarantee audit (P0)

| Claim                                                                                        | Reduction                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `update` never overwrites a file whose bytes differ from what pharn recorded writing          | **FLOOR — content-hash** (sha256 equality, `ARCHITECTURE.md §2` #2) + membership branch                                                        |
| …and when no record exists, it still does not overwrite                                       | **FLOOR — membership** (`recordsAvailable === false` / key absent → SKIP; the fail-closed terminal, P5)                                        |
| A corrupt or hand-edited record store cannot cause an overwrite                                | **FLOOR — regex/enum** (`SHA256_RE` over every value + shape check; any failure → records-unavailable → SKIP)                                   |
| Recorded hashes describe what actually landed on disk                                          | **FLOOR — content-hash of the DEST bytes after write** (never the source)                                                                     |
| No backup write escapes the project root                                                       | **FLOOR — path containment** (`safeJoin`, CONSTITUTION P0)                                                                                     |
| Every file `--force` overwrites has a pre-overwrite copy in `.pharn-backup/<ts>/`               | **ADVISORY** — deterministic control-flow ordering, demonstrated by a P1 test and made fail-closed (any backup failure aborts the run before a single original is touched). It is **not** reducible to a §2 primitive; labeled honestly, not sold as floor. |
| The record store makes the install **authentic**                                               | **STRUCK.** It is a local "what we wrote" baseline. It says nothing about upstream authenticity (`LIMITS.md §1b` stands). Never claim otherwise. |

## Trust audit (P2)

- **`pharn.records.json` (local, user-editable → untrusted).** Read defensively: JSON parse in a
  `try`, top-level object shape, **every value** against `SHA256_RE`; any failure → treated as
  **absent** (records-unavailable → SKIP), never a crash and never a permissive default. Critically,
  a records **key is never path-joined**: the update loop iterates the manifest and looks up
  `records[rel]` by a *manifest-derived* key, so a hostile key cannot drive a filesystem access.
- **The fetched clone (untrusted).** Unchanged posture: the expected set still comes from
  `collectExpectedInstallPaths` (validated names, `safeJoin`), file contents are hashed and copied
  **verbatim**, never parsed or executed. Per-file `copyFileSync` replaces whole-dir `cpSync` at the
  same `safeJoin`-contained dest paths; the manifest already skips symlinks
  (`install-manifest.ts:46`), so no symlink is materialized.
- **`.pharn-backup/<ts>/`** — every source is a project-relative manifest path and every destination is
  `safeJoin(projectRoot, '.pharn-backup/<ts>/' + rel)`; taint does not propagate anywhere new (bytes
  are copied, never interpreted).

## Determinism audit (P5)

Every branch in the decision function is a hash equality or a presence test — no classification, no
judgment. The terminal fallback for "cannot prove it is pristine" is **SKIP + a named label in the
report**, i.e. it ends in *telling the human*, never a guess. `--force` is the human's explicit answer
to that report (the flag **is** the "ask"). Timestamps come from the clock, so the backup dir name is
the only non-pure value — isolated in `backup.ts` behind an injectable `now`, keeping tests
deterministic.

## Consequences recorded honestly (P7)

- `update` no longer writes `.claude/settings.json` under any circumstance (it is user-owned and
  excluded from the manifest). `init` still writes it when absent.
- `update` still never deletes; a file dropped upstream stays on disk (unchanged behavior).
- A record entry for a path no longer in the manifest (e.g. after `pharn remove`) is inert — never read.

## Trusted-doc reconciliations this increment surfaces (human-owned; the agent MUST NOT edit them)

Both files are hook-protected (`protect-trusted-paths.cjs`) and human-only. Reported, not touched:

1. **`THREAT-MODEL.md §4c`** — "**No stored content-hash of installed files.** `status`/`diff`
   re-derive the expected byte set live … not against a per-file hash pinned in `pharn.config.json`."
   After this increment a per-file hash **is** stored (in a sidecar, not in `pharn.config.json`), and
   it gates `update`. `status`/`diff` remain live-derived, so the section is half-stale.
2. **`LIMITS.md §1b`** — "it stores **no signature and no per-file content-hash**." The *governing*
   claim (trust in the remote is provenance, not cryptographic) **stays true** — a recorded hash is a
   local record of what pharn wrote, not proof of upstream authenticity — but the parenthetical is
   now inaccurate.

## Versioning

`docs/RELEASING.md` flow: bump `package.json` + `CHANGELOG.md` → merge → cut a GitHub Release. This is
a **behavior change** (`update` stops overwriting by default) plus a **new flag**, so it warrants a
**minor** bump: `0.3.2 → 0.4.0`. Proposed in-PR (bump + CHANGELOG entry); the Release/tag itself stays
with the human release flow. If you prefer bumps to happen only at release time, say so at the gate and
I will land the CHANGELOG entry under "Unreleased" and leave `package.json` alone.

## HALT #1 — resolved at the plan gate

- **(a) Record-store location → SIDECAR `pharn.records.json`.** A CLI-owned file at the project root,
  git-committed, excluded from the install manifest and the conflict set. Keeps the hand-edited
  `pharn.config.json` (`models` / `seam`) clean instead of burying it under 300–600 hash entries.
  Cross-file atomicity is impossible, and **both orderings fail safe**: records-first → a failed config
  write leaves correct records; config-first → records absent/stale → SKIP, the fail-closed default.
- **(b) Record write-point → SHARED.** `lib/install-records.ts` **computes** records (hashing the
  written dest bytes); the config-writing callers (`steps/install-archetype.ts`, `commands/add.ts`,
  `commands/update.ts`) **persist** them. Records are deliberately NOT written inside
  `installCapabilities` — that would break the mirror invariant pinned at
  `tests/install-manifest.test.ts:270` and give the copy routine two axes of change (P3).
- **(c) Same-version early-return → KEEP AS-IS** + follow-up ticket. One axis per PR; the honest
  consequence is documented and the status MISSING hint is reworded to stop over-promising.
- **(d) Dropped `installCapabilities` layout return → FIXED IN THIS PR** (human override of the
  brief's "follow-up ticket only"). See **The (d) fix** below.
- **(e) Status DRIFT copy → the human authored it verbatim** (below).
- **(f) Scope → the file list, test list, and decision table above, as written.**

### (e) The exact DRIFT copy (human-authored; `status.ts` + `docs/commands/status.md`)

```text
  DIFFERS FROM pharn-oss@main (PHARN-owned)
  CONSTITUTION.md
  `pharn update` keeps files you've edited and cleanly
  upgrades the rest; `--force` overwrites edits too
  (backed up to .pharn-backup/ first).

  MISSING (expected but absent)
  .claude/hooks/set-writes-scope.cjs
  Restored by `pharn update` on the next version bump;
  capabilities can also be re-added with `pharn add`.
```

**Carve-out note (recorded, not hidden):** this renames the section TITLE
(`LOCALLY MODIFIED (PHARN-owned)` → `DIFFERS FROM pharn-oss@main (PHARN-owned)`), which is one line
wider than the brief's "only the DRIFT hint string(s)" carve-out. It is the more honest label —
`status` compares against `@main`, so a file can differ because **upstream moved**, not only because
the user edited it. Human-approved at this gate; called out in the PR description. `status` logic
stays read-only and otherwise untouched.

### The (d) fix — the expected set is derived at the CLONE's layout, and that layout is recorded

The brief said to build the expected map "at the recorded `config.layout` — same as today". **That is
not what today does**, and the discrepancy IS bug (d): `installCapabilities` mirrors
`layoutPaths(detectLayout(repoDir))` — the **clone's** layout (`src/lib/install-capabilities.ts:121`)
— while `update.ts:113` re-spreads the old `config.layout`. So on a `flat`-recorded project against a
`pharn`-layout clone, today's `update` writes bytes under `pharn/…` and records `flat`, after which
`status`, `remove`, and `diff` all address the wrong tree.

The fix, therefore:

- the expected file map is derived at **`detectLayout(repo.dir)`** (where the copy actually lands — an
  exact match for today's write behavior, so **no file outcome changes**), and
- that same layout is **recorded** in `pharn.config.json`, so the record matches the bytes.

Consequences, recorded honestly (P7) — surfaced to the human at the gate and accepted:

- On a `flat → pharn` migration, every `pharn/…` path is absent → **row 1 (restore)** → the whole tree
  installs under `pharn/`. That is byte-identical to what `update` does today; the only change is that
  the config now tells the truth about it.
- `update` never deletes, so the old `flat` files remain on disk as unowned leftovers (also true
  today). They are no longer in the manifest, so `status` ignores them and their stale records are
  inert. Documented in `docs/commands/update.md`, not silently swallowed.
- Test: `tests/update.test.ts` pins that the written config's `layout` equals the clone's detected
  layout, and that a same-layout run leaves it unchanged.

## Versioning — resolved

Bump `package.json` `0.3.2 → 0.4.0` **in this PR** plus a `CHANGELOG.md` entry (behavior change + new
flag = minor, per `docs/RELEASING.md`). Cutting the `v0.4.0` GitHub Release stays a human step.

## Open questions (HALT)

- None blocking. Remaining confirmations are folded into the plan-approval gate: the versioning
  choice (see **Versioning**) and acknowledgement of the two consequences + two trusted-doc
  reconciliations recorded above.
