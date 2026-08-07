# PLAN — capability selection provenance (`source: auto | manual`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Add `source: 'auto' | 'manual'` to each `pharn.config.json` capability entry and make
  `pharn update` write `resolved(archetypes) ∪ manual` through a pure, table-driven merge that names
  every membership change — instead of replacing `capabilities` wholesale and silently dropping
  manual adds / resurrecting removals.
- layer(s): pharn CLI (`src/lib` decision core + `src/commands` seam) — this repo builds the
  installer, not a pharn-oss capability, so ARCHITECTURE.md §4's module tree does not apply; the
  applicable discipline is §2 (the floor) + §7 (gate kinds).
- constitution_refs: [P0, P1, P3, P5, P6, P7]

## Verified base state (P6 — read this run, not from memory)

| Anchor                                                   | Brief said            | Verified                                                    |
| -------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| HEAD                                                      | `9919277`             | ✅ `9919277`, tree clean                                     |
| `versionGate` in `add.ts` (#75)                           | present               | ✅ `src/commands/add.ts:74`                                  |
| `resolveCapabilities` call in `applyUpdate`               | `update.ts:178`       | ✅ `update.ts:178`; wholesale replace at `:179–182`          |
| config write at end of `applyUpdate`                      | present               | ✅ `update.ts:269–276` (`capabilities` passed verbatim)      |
| `readPharnConfig` spread, no capabilities validator       | verified              | ✅ `pharn-config.ts:53–57`; only `models`/`seam` validated   |
| `isConfigValidationError` closed 2-class union            | verified              | ✅ `pharn-config.ts:101–105`                                 |
| `addDir` lstat-guards + silently skips a missing cap dir  | verified (a trap)     | ✅ `install-manifest.ts:117` — `return`, no throw, 0 paths   |
| `list --json` strips to `{name, role}`                    | `list.ts:68`, `:18`   | ✅ both exact                                                |
| resurrection test                                         | `update.test.ts:205`  | ✅ exact line                                                |
| a `source`-like field already exists anywhere             | HALT if so            | ✅ none — every `source` hit is prose / `sourceDir`          |
| green baseline (`npm run check`, `npm run lint:md`)       | required              | ✅ 552 tests / 38 files pass; markdownlint 0 issues          |

**Two places the brief is wrong about live state** (both material):

1. **`add` has TWO entry-construction sites, not one.** Besides `resolveArchetypeAdd`
   (`add.ts:347–350`), the picker threads a mirrored config forward at `add.ts:278–286`, rebuilding
   `{ name: parsed.name, role: parsed.role! }`. That mirror is what the *next* pick's
   `resolveArchetypeAdd` spreads into its `writePharnConfig`, so tagging only the first site would
   persist every non-final pick **untagged**. Both sites must write `source: 'manual'`.
2. **`init`'s entries are constructed in `lib/install-capabilities.ts`, not at the write site** —
   `install-archetype.ts:42–43` receives them from `installCapabilities`. Tagging at the config-write
   site is still possible (map over the array when building the `config` object), so
   `install-capabilities.ts` stays **off** the whitelist as the brief hoped. The later uses of the
   untagged local (`collectExpectedInstallPaths` at `:90`, the role counts at `:97–98`) ignore
   `source`, so they are unaffected.

## Files

- `src/types.ts` — `InstalledCapability` gains `source?: 'auto' | 'manual'`; new
  `CapabilitySource` type — layer: types
- `src/lib/merge-capabilities.ts` — **NEW.** The pure merge decision table + report model — layer:
  lib (decision core)
- `src/lib/pharn-config.ts` — `CapabilitySourceError` + a `source`-only ingest check; join
  `isConfigValidationError`'s union — layer: lib (ingest boundary)
- `src/commands/update.ts` — call the merge at the selection→manifest seam; carry `changes` on
  `UpdateOutcome`; render the CAPABILITIES note — layer: command
- `src/commands/add.ts` — both entry-construction sites tag `source: 'manual'` — layer: command
- `src/commands/remove.ts` — the literal-`'auto'` warning at both remove paths — layer: command
- `src/steps/install-archetype.ts` — the config-write site tags `source: 'auto'` — layer: step
- `src/commands/list.ts` — `source` in the `--json` output type (`:18`) + the projection (`:68`) —
  layer: command _(approved at HALT 1)_
- `src/lib/capability-groups.ts` — `renderCapabilityLines` annotates `manual` entries — layer: lib
  (display SoT) _(whitelist amended at HALT 1)_
- `tests/merge-capabilities.test.ts` — **NEW**, the row-by-row decision-table suite — layer: test
- `tests/update.test.ts` — union, report, acceptance scenario, records — layer: test
- `tests/add.test.ts` — both entry-construction sites tag `manual` — layer: test
- `tests/remove.test.ts` — the literal-`auto` warning + `source` preservation — layer: test
- `tests/init-archetype.test.ts` — init tags every entry `auto` — layer: test
- `tests/pharn-config.test.ts` — the `source` ingest enum check — layer: test
- `tests/list.test.ts` — `source` in `--json` — layer: test
- `tests/capability-groups.test.ts` — the `(manual)` human annotation — layer: test
- `docs/reference/pharn-config.md` — the `source` field + re-init note — layer: docs
- `docs/commands/update.md` — the union replaces the wholesale re-resolve — layer: docs
- `docs/commands/add.md` — `add` writes `manual` — layer: docs
- `docs/commands/remove.md` — the `auto` warning — layer: docs
- `docs/commands/list.md` — `source` in the output — layer: docs
- `CLAUDE.md` — the update paragraph + the add/remove clauses — layer: docs
- `CHANGELOG.md` — the user-facing entry — layer: docs

**Not touched** (whitelist honored): `src/lib/update-decision.ts`, `src/lib/resolve-capabilities.ts`,
`src/lib/install-capabilities.ts`, `src/lib/install-manifest.ts`, `src/commands/status.ts`,
`src/lib/backup.ts`, `src/lib/apply-update.ts`, `src/lib/install-records.ts`,
`src/lib/capability-picker.ts`.

## The merge — location, signature, ordering

**Location: a new module `src/lib/merge-capabilities.ts`** (not an extension of
`resolve-capabilities.ts`). Two reasons, the second decisive:

- **P3, one axis.** `resolve-capabilities.ts` owns _archetypes × index → selection_. The merge owns
  _selection × previous config → next membership + report_. Different change reasons.
- **Testability, verified in the live harness.** `tests/update.test.ts:40` mocks
  `../src/lib/resolve-capabilities.js` with a factory returning **only** `{ resolveCapabilities }`.
  A merge exported from that module would resolve to `undefined` inside `update.ts` in every existing
  update test, forcing the mock to be widened — and then the acceptance scenario (invariant 6) would
  exercise a **mocked** merge. A separate module stays unmocked and runs for real.

```ts
export type CapabilitySource = 'auto' | 'manual';

export interface CapabilityChange {
  cap: InstalledCapability; // the entry, with its NEXT source
  reason: 'added' | 'dropped-unselected' | 'dropped-gone' | 'kept-manual';
}

export interface CapabilityMerge {
  capabilities: InstalledCapability[]; // every entry carries an explicit `source`
  changes: CapabilityChange[]; // empty ⇒ nothing to report
}

export function mergeCapabilities(
  selection: Selection,
  previous: readonly InstalledCapability[],
): CapabilityMerge;
```

No index parameter: `selection.selected ∪ selection.skipped` **is** full-index membership (verified —
`resolve-capabilities.ts:45–64` pushes every entry into exactly one of the two).

**Ordering rule (deterministic, P5):** `selection.selected` in index order, then the preserved
not-resolved manual entries in their **previous config order**. Idempotent by construction: run 2
reads back that exact array, the resolved prefix re-derives in the same index order, and the manual
tail is re-selected from the tail in the same order → byte-identical.

**Identity key:** `` `${role}:${name}` `` (the same pair `add`/`remove`/the picker already treat as
identity).

## The decision table (every cell; the doc-comment + `tests/merge-capabilities.test.ts` mirror it)

`in resolved?` = the key is in `selection.selected`. `in index?` = in `selected ∪ skipped`.
`selected ⊆ index`, so `in index?` is only a live question on not-resolved rows (`—` = entailed).

| #   | in resolved? | previous source | in index? | next entry            | reported as          |
| --- | ------------ | --------------- | --------- | --------------------- | -------------------- |
| 1   | yes          | not-present     | —         | ADD, `source: auto`   | `added`              |
| 2   | yes          | `auto`          | —         | KEEP, `auto`          | — (silent)           |
| 3   | yes          | `manual`        | —         | KEEP, `manual` (**sticky**) | — (silent)     |
| 4   | yes          | absent (legacy) | —         | KEEP, tag `auto`      | — (silent)           |
| 5   | no           | `auto`          | any       | DROP                  | `dropped-unselected` |
| 6   | no           | `manual`        | yes       | KEEP, `manual`        | — (silent)           |
| 7   | no           | `manual`        | no        | DROP                  | `dropped-gone`       |
| 8   | no           | absent (legacy) | yes       | KEEP, tag `manual`    | `kept-manual`        |
| 9   | no           | absent (legacy) | no        | DROP                  | `dropped-gone`       |

Nine cells, three outcomes (ADD / KEEP / DROP), no third state, membership tests only (P5). Legacy
inference is applied **first** (∈ resolved → `auto` row 4; ∉ resolved → `manual` rows 8/9), then the
manual rules run — which is why row 9 lands on the same `dropped-gone` as row 7 rather than inventing
an outcome.

**Idempotence proof:** after one run every surviving entry has an explicit `source`. Row 4's entry
becomes row 2 next run; row 8's becomes row 6. Both silent. Rows 1/5/7/9 have no entry left to
re-fire. So `merge(merge(x)) = merge(x)` and the second report is empty.

**Row 5 is where resurrection is *reported, not prevented*.** A user-removed universal capability is
gone from `previous`, so it re-enters via **row 1** and is named `added`. That is the named limit
(no tombstones).

**Hard rule honored:** absent `source` is resolved **only** inside this function — it is the only
place holding the fresh index. `remove` (offline) branches on the literal `'auto'` and nothing else.

## Report copy (rendered by `reportOutcome`, before the SKIPPED note)

One `note(lines.join('\n'), 'CAPABILITIES')` — the same clack surface the summary already uses. Only
non-empty buckets render; **zero changes ⇒ the note is not emitted at all** (invariant 3's "zero
report noise").

```text
  ADDED — newly selected for your archetypes
  griller:a11y

  REMOVED — no longer selected for your archetypes
  lens:stale-lens

  REMOVED — no longer exists upstream (was a manual add)
  lens:gone-lens

  KEPT — your manual add, not selected by your archetypes
  lens:n-plus-one

  Removed capabilities' files are left on disk — pharn update never deletes.
```

`remove`'s warning (offline, literal `'auto'` only), via `log.warn` before the outro:

```text
a11y (griller) is selected automatically for your archetypes, so the next `pharn update` will
reinstall it (and will name it in its report).
```

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — not a finding producer; the report's `reason` is an **enum**
  (`added | dropped-unselected | dropped-gone | kept-manual`) and its rendered text is fixed CLI copy,
  never ingested free text. Cited for the enum-gated / free-text split it defines (P4 — cited, not
  restated).
- `pharn.config.json` schema — owned by this CLI (CLAUDE.md, P3). Extended additively (P7).

## Evals to write (P1) — mapped 1:1 to the ten invariants

`tests/merge-capabilities.test.ts` (**new**) — one `it` per table row, named `row N`:

- rows 1–9 → each cell's next entry + `changes` reason (**the 100%-coverage target**)
- `merge(merge(x)) = merge(x)` → identical array + empty `changes`
- ordering → resolved-in-index-order then manual tail in previous order
- empty previous / empty selection → no crash, no phantom entries

| Inv | Eval (case → expected)                                                                                                                                        | File                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `source: "nope"` in config → `CapabilitySourceError` naming `capabilities[i].source`, propagates (not the "run init" lie); absent `source` loads; valid round-trips | `pharn-config.test.ts`                                                   |
| 2   | after update `capabilities` = resolved ∪ manual in the defined order; second run (`--force`) → byte-identical array **and** no CAPABILITIES note                  | `update.test.ts` + `merge-capabilities.test.ts`                          |
| 3   | each reason renders its exact heading + `role:name`; **zero membership change → `note` never called with `'CAPABILITIES'`**                                       | `update.test.ts`                                                         |
| 4   | manual cap file byte-changed upstream → `updated`; manual cap file user-edited → `skipped` + MODIFIED report; manual cap paths present in `pharn.records.json`     | `update.test.ts`                                                         |
| 5   | manual ∩ resolved → still `manual` in the written config (sticky)                                                                                                 | `merge-capabilities.test.ts` (row 3) + `update.test.ts`                  |
| 6   | **acceptance:** `archetypes:["lib"]` + legacy `{name:"n-plus-one",role:"lens"}` (no `source`), files + records seeded, clone has it unselected → entry survives as `manual`, files at clone bytes, records kept, report names it | `update.test.ts`                                                         |
| 7   | `add` → `source:"manual"` (named path **and** the picker's multi-pick, pinning the second site); `init` → every entry `source:"auto"`                              | `add.test.ts`, `init-archetype.test.ts`                                  |
| 8   | remove `'auto'` → the warning fires; remove absent-`source` → **no** warning; remove `'manual'` → no warning; survivors keep their `source` verbatim; no network module imported | `remove.test.ts`                                                         |
| 9   | `list --json` still emits exactly `{name, role}` given a `source`-carrying config; `isArchetypeConfig` unchanged                                                   | existing `list.test.ts` (assert, do not widen)                           |
| 10  | gone-upstream entry contributes **zero** manifest paths **and** is dropped with its report line (pins both halves of the silent-`addDir` trap); dropped entry's files still on disk | `update.test.ts`                                                         |

**Existing tests rewritten (named, not deleted):** `tests/update.test.ts:205` _"re-resolves the
RECORDED archetypes against the fresh index"_ — currently a mock-call assertion
(`toHaveBeenCalledWith(['ssr'], {capabilities: []})`) that pins the re-resolve but says nothing about
the write. Rewritten to keep the re-resolve assertion **and** add the union assertion on the written
config, so it pins the fix rather than the bug. Fixture updates: `add.test.ts:122`, `add.test.ts:201`,
`init-archetype.test.ts:129`, `remove.test.ts:108` gain the `source` field in their expected arrays.
`tests/helpers.ts` — **no change needed** (it exports `stubProcessExit`/`useTmpDir`/`CANCEL` only;
capability fixtures are local to each test file).

## Guarantee audit (P0)

| Claim                                                             | Reduction                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A manual entry is never dropped while it exists upstream           | **floor: enum + set membership** — rows 3/6, `Set` lookups over `role:name`; no heuristic             |
| Every membership change is reported                                | **floor: set difference** — `changes` is emitted by the same pass that decides; a row cannot KEEP/ADD/DROP without appending its enum reason |
| `source` is `auto`/`manual` or absent — never anything else        | **floor: enum check** at ingest (`CapabilitySourceError`), the models/seam pattern                    |
| A gone-upstream manual entry is dropped, not left phantom          | **floor: index membership** (`selected ∪ skipped`), row 7/9                                          |
| Merge is idempotent                                                | **floor: content equality** — pinned by a direct `merge(merge(x))` test                              |
| `update` never deletes a dropped entry's files                     | **floor: absence of a delete call** — `apply-update.ts` untouched; test asserts the files remain      |
| Legacy inference recovers the user's true intent                   | **ADVISORY** — it is the best deterministic reconstruction available offline, not a recovered fact. A legacy entry that was `auto` **and** upstream de-selected it reads as `manual` and is preserved. Labeled in `CHANGELOG.md` + `docs/reference/pharn-config.md`; the fail-safe direction is preserve-not-delete. |
| Resurrection of a removed capability is **prevented**              | **NOT CLAIMED** — explicitly a named limit; it is *reported* (row 1). No tombstones this increment.   |

## Trust audit (P2)

The fetched clone is untrusted. This increment ingests **no new** untrusted field: `source` is read
only from `pharn.config.json` (a **local, CLI-owned** file). The merge consumes `Selection`, already
produced from the `parseCapabilityIndex` fetch boundary's typed output — names reaching the merge are
`CAPABILITY_NAME_RE`-validated upstream, and the merge only compares and re-emits them; it performs no
I/O and joins no paths. Taint therefore does **not** widen: the merge's outputs feed
`collectExpectedInstallPaths`, which `safeJoin`-guards every read exactly as today. Report lines
render `role:name` from that same validated set into fixed CLI copy — never into an instruction.

## Determinism audit (P5)

Every branch in the merge is a `Set`/`Map` membership test over `` `${role}:${name}` `` or an exact
string compare against the two-value `source` enum. Nine rows, three outcomes, no default-else that
guesses: an unrecognized `source` cannot reach the merge because ingest **hard-fails** on it first
(fail-closed). `remove`'s branch is a single literal `=== 'auto'`; absent stays silent — the
"unknown provenance" case is treated as unknown, never guessed.

## Open questions — RESOLVED at HALT 1 (human-selected)

1. **Re-`init` on an existing project** → **accepted as an explicit start-over + one doc sentence.**
   `init` already routes through `confirmWriteTargets`, whose conflict set includes
   `pharn.config.json` and defaults to **No**, so the overwrite is already gated by an informed
   confirmation. Teaching `init` to merge would be a second axis (P3) and a speculative addition (P7).
   Documented in `docs/reference/pharn-config.md` + `docs/commands/add.md`.
2. **`list` annotation** → **expose `source` in BOTH `--json` and the human view** (the human's
   choice over my "skip" recommendation). `--json` gains the field at `list.ts:18` + `:68` — declared
   an **additive** JSON change in `CHANGELOG.md` and `docs/commands/list.md`. The human view
   annotates **`manual` entries only** — `auto` and legacy-absent render exactly as today, so the
   steady state stays quiet:

   ```text
       grillers (2)
         — architecture
         — comprehension  (manual)
   ```

   **Whitelist amendment (renegotiated + approved at HALT 1):** the human view is rendered by
   `renderCapabilityLines` in `src/lib/capability-groups.ts:75`, which was **not** on the original
   may-edit list. It — plus `tests/capability-groups.test.ts` — is now in scope. Post-processing the
   rendered lines inside `list.ts` was rejected: it would duplicate display knowledge the module is
   explicitly the single source of truth for (P3). Invariant 9 is therefore restated: `status` is
   untouched and `isArchetypeConfig` is unchanged; `list`'s JSON shape change is additive + declared.
3. **`CapabilitySourceError` lives in `src/lib/pharn-config.ts`** — confirmed. It is an *ingest*
   concern and, unlike `models`/`seam`, there is no separate `capabilities` lib module to own it.
   `isConfigValidationError` widens to
   `ModelRoutingError | SeamConfigError | CapabilitySourceError`.
4. **Plan approved as written** (with 1–3 applied).
