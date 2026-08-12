# PLAN — `remove` prunes its capability's records

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e
- increment: `pharn remove` prunes the removed capability's entries from `pharn.records.json` (key-prefix filter over the store), closing the last write path that leaves records describing bytes that no longer exist.
- layer(s): `src/commands/` (one verb per file — `remove`), consuming `src/lib/install-records.ts` unchanged (ARCHITECTURE.md §4)
- constitution_refs: [P1, P3, P4, P5, P6, P7]

## Live-state verification (P6 — read this run, not from memory)

Base `21db522`, working tree clean. `npm run check` GREEN on the untouched base: prettier clean,
`eslint src tests scripts --max-warnings 0` clean, both tsc configs clean, **40 test files / 643 tests
passed**.

Anchors re-verified against live bytes (line numbers are this run's, names are the contract):

| Anchor                       | Live location                     | Status                                                                                     |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| zero records interaction     | `src/commands/remove.ts` (239 ln) | **Confirmed** — imports only fs/prompts/picocolors/confirm/layout/capability-address/picker/validate/pharn-config; no `install-records` reference anywhere |
| `deleteCapabilityDir`        | `remove.ts:66-76`                 | Confirmed — holds the role→dir ternary at `:71` (`target.role === 'griller' ? paths.grillers : paths.lenses`) |
| named delete site            | `remove.ts:135-148`               | Confirmed — `paths` at `:136`, `existed` at `:137`, note at `:138`, `writePharnConfig` at `:142` |
| picker delete site           | `remove.ts:218-228`               | Confirmed — `paths` at `:218`, delete loop at `:219`, `writePharnConfig` at `:224`          |
| `capabilityRecordPaths` walk | `install-records.ts:245-265`      | Confirmed — `if (!existsSync(root)) return []` at `:253`; walks the **DEST**                |
| `recordsBaseline`            | `install-records.ts:163-180`      | Confirmed — shape `(read, {skillsVersion, commit}) => {records, note}`; `records: null` on absent / invalid / stamp-mismatch |
| `readRecords` / `writeRecords` | `install-records.ts:86` / `:183` | Confirmed — `writeRecords` is a plain `writeFile` (`:198`, no tmp+rename) with `sortRecords` (`:196`) |
| `RECORDS_SCHEMA_VERSION` gate | `install-records.ts:99-104`      | Confirmed — exact match, `1`                                                                |
| the add mirror               | `add.ts:434-438`                  | Confirmed — `recordsBaseline(readRecords(cwd), {skillsVersion: config.skillsVersion, commit: config.commit})` then `if (records === null) return; // absent/corrupt/stale → leave it alone` |
| `PharnConfig` stamp types    | `src/types.ts:116,118`            | Confirmed — `skillsVersion: string`, `commit: string \| null` — matches `recordsBaseline`'s param exactly, no coercion needed |
| `tests/remove.test.ts` mocks | `remove.test.ts:14-28`            | Confirmed — `@clack/prompts` + `../src/lib/pharn-config.js` **only**; `install-records` will run **real** against the tmp `cwd` |
| records-test precedent       | `tests/add.test.ts:362-518`       | Confirmed — `describe('runAdd — pharn.records.json')`, its `seedStore()` at `:394-402` uses the **real** `writeRecords`; this is the block to mirror |
| docs "who writes it" row     | `docs/reference/pharn-records.md:48` | Confirmed — currently reads "`remove` \| Does not touch it — the removed capability's entries are pruned by the next `update`" |

**Nothing in this brief diverged from live state.** Two clarifications the brief did not state, both
found by reading:

1. `tests/remove.test.ts` seeds `proj = join(tmp.path(), 'proj')` — a directory that **does not exist**
   until a `write()` call mkdirs it. A `seedStore()` here must `mkdirSync(proj, {recursive: true})`
   first (`add.test`'s version does not need to, since its `proj = tmp.path()` already exists). Pure
   test mechanics, no behavior consequence.
2. **No existing `remove.test` case seeds a store**, so none can see one appear or change —
   verified by reading all 364 lines, not assumed. Invariant 9 is therefore free by construction, and
   the new cases are additive.

## Files

- `src/commands/remove.ts` — extract `capabilityRelDir`; add `pruneCapabilityRecords`; call it at both delete sites — layer `commands/`
- `tests/remove.test.ts` — a new `describe('runRemove — pharn.records.json')` block pinning invariants 1–8 — layer `tests/`
- `docs/commands/remove.md` — one behavior bullet + one sentence: removal prunes the records, and never mints/blesses a store — layer `docs/`
- `docs/reference/pharn-records.md` — rewrite the `remove` row of "Who writes it"; extend "Pruning" — layer `docs/`
- `CHANGELOG.md` — one `Fixed` line — layer `docs/`
- `CLAUDE.md` — one clause appended to the `pharn remove` addressing paragraph (line 64) — layer `docs/`

Nothing else. `src/lib/install-records.ts` is **not** touched (its API suffices — verified above; no
new exports). `update`, `status`, `add`, `warnIfAutoSelected`, the survivor filter, every exit code and
every user-visible string on the existing paths: byte-equivalent.

## The shape

```ts
// One source for the role→dir mapping — deleteCapabilityDir and the prune must
// agree by construction, not by two copies staying in sync.
function capabilityRelDir(paths: LayoutPaths, cap: InstalledCapability): string {
  return `${cap.role === 'griller' ? paths.grillers : paths.lenses}/${cap.name}`;
}

// Drop the removed capabilities' entries from pharn.records.json. A key-prefix
// filter over the STORE, never an fs walk: capabilityRecordPaths() enumerates the
// DEST dir and returns [] once it is gone — which is both after the delete and,
// in the "its files were already gone" case, before it too.
async function pruneCapabilityRecords(cwd, config, paths, targets): Promise<void> {
  const { records } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });
  if (records === null) return; // absent/corrupt/stale → leave it alone (add.ts:438)

  // The trailing slash is load-bearing: `lenses/a11y` must never eat
  // `lenses/a11y-extended`'s keys.
  const prefixes = targets.map((t) => `${capabilityRelDir(paths, t)}/`);
  const kept: FileRecords = {};
  let dropped = 0;
  for (const [key, hash] of Object.entries(records)) {
    if (prefixes.some((p) => key.startsWith(p))) dropped++;
    else kept[key] = hash;
  }
  if (dropped === 0) return; // nothing matched → the store stays byte-identical

  // The stamp does not move: `remove` alters neither skillsVersion nor commit, so
  // it re-writes the pair the config already holds (and still holds after the
  // config write below, which only touches capabilities/installedAt).
  await writeRecords(cwd, {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
    files: kept,
  });
}
```

`deleteCapabilityDir` becomes `const dir = safeJoin(cwd, capabilityRelDir(paths, target));` — its only
change, and it is net-negative duplication (the ternary now lives once).

**Ordering: delete dir → prune records → write config** (mirrors `add`'s records-before-config).
Stated as a comment at the call site, because it is a benignity argument, not an atomicity one
(`writeRecords` is a plain `writeFile`):

- prune fails after the delete → **today's exact status quo**: stale entries that the next `update`
  prunes via the manifest;
- config write fails after the prune → the entry is still listed with its files absent → the next
  `update` restores and re-records it (`missing → restore` in the 6-row table).

Neither direction corrupts, and because the stamp never moves, the two files cannot skew relative to
each other.

**Both call sites** (a single call per command, `targets` being a list):

- `removeNamed` — between `deleteCapabilityDir` (`:137`) and `writePharnConfig` (`:142`), as
  `await pruneCapabilityRecords(cwd, config, paths, [target])`. The **"already gone"** branch flows
  through the same line: `existed` is only used for the note, never to decide the prune. That branch
  is *why* the prefix design won and it gets its own test.
- `runRemovePicker` — between the delete loop (`:219`) and `writePharnConfig` (`:224`), as
  `await pruneCapabilityRecords(cwd, config, paths, targets)`.

### The one deviation from the brief, argued (§1 invited it)

The brief says "called at both delete sites … the picker's **per-pick** delete site". This plan calls
the helper **once per command with the full target list**, rather than once per pick inside the loop.
Both satisfy invariant 8's observable (every picked capability's keys are gone); the list form is
strictly better on three counts, and I am flagging it rather than silently choosing:

1. **One store write per command, matching the one config write.** Per-pick would `readRecords` +
   `writeRecords` N times for one user action — N-1 intermediate stores on disk, each a moment where a
   crash leaves a partially-pruned store (still benign, but needlessly so).
2. **It mirrors the file's existing plurality.** `warnIfAutoSelected(targets)` already takes the list
   and is already called once per command from both paths. The prune reads as its sibling.
3. **The prefix filter is naturally set-shaped** — one pass over the store against N prefixes, versus
   N passes over a shrinking store.

If you prefer the literal per-pick call, say so at the halt and I will move the call inside the loop
(the helper's body is unchanged either way — it just receives `[target]`).

## Contracts satisfied

This increment touches the **CLI**, not the `pharn-contracts` product layer, so no
`pharn-contracts` contract applies. The contract it does satisfy is the repo's own, cited not
restated: the `pharn.records.json` invariant `update` was pinned to in #76 — *records describe only
managed files; do not preserve records for dropped entries* (`docs/reference/pharn-records.md`
§Pruning; `CLAUDE.md:66`). `remove` is currently the sole write path that violates its converse.

## Evals to write (P1)

`tests/remove.test.ts`, one new `describe('runRemove — pharn.records.json')` mirroring
`add.test.ts:362-518`. The store is seeded with the **real** `writeRecords` against a real tmp dir
(never through a mock), and asserted by reading the **real bytes** — `sortRecords` makes whole-file
byte comparison meaningful, so "byte-identical" is asserted as `readFileSync(...) === before`, not as
a deep-equal that could pass on a rewritten file.

Fixture: config `skillsVersion: '1.0.0'`, `commit: 'old'` (matching `archConfig()`); store stamped the
same so `recordsBaseline` returns records; seeded keys spanning a griller, a lens, and a
prefix-neighbour.

| #   | Invariant                       | Test name                                                                             |
| --- | ------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | keys under `relDir/` gone; siblings byte-identical | `drops every record under the removed capability and no other`         |
| 2   | prefix boundary                 | `the trailing slash is load-bearing — removing a11y keeps a11y-extended's records`      |
| 3   | stamp unchanged                 | `leaves the skillsVersion/commit stamp exactly where it was`                            |
| 4   | absent stays absent             | `does NOT mint a store when none exists — absent stays absent`                          |
| 5   | baseline-invalid → byte-identical **and** removal proceeds | `leaves a stale-stamped store byte-identical while the removal itself completes` |
| 6   | "already gone" branch prunes    | `prunes the records even when the capability's files were already gone`                 |
| 7   | no-match → skip the write       | `writes nothing when the capability has no records`                                     |
| 8   | picker path                     | `the picker prunes every pick in one store write`                                       |
| 9   | everything else byte-equivalent | the existing 364-line `remove.test.ts` suite, **unmodified**, stays green               |

Collision fixture for #2: capability `a11y` (griller) vs. `a11y-extended` (griller) — both under
`pharn-pipeline/grillers/`, so the prefix is the only thing separating them. A naive
`startsWith(relDir)` without the slash passes every other test and fails exactly this one.

For #5 the same test asserts **both** halves — store `readFileSync` unchanged **and**
`writePharnConfig` called with the entry dropped — because the two concerns are independent and a test
that only checked the store would pass on a `remove` that had silently stopped removing.

For #7 the seeded store holds only another capability's keys; the assertion is the whole file's bytes,
which is what makes "skip the write" observable at all (a write of an identical map would also produce
identical bytes via `sortRecords` — so this test pins the *outcome*, and the `dropped === 0` early
return is what makes it true by construction rather than by luck).

## Guarantee audit (P0)

| Claim                                                             | Reduction                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "the removed capability's records are pruned"                     | **floor** — a total string-prefix filter over the parsed store's own keys; no I/O, no classification. Pinned by tests 1, 2, 6, 8                                                       |
| "a sibling capability's records survive"                          | **floor** — same filter, `key.startsWith(relDir + '/')` is exact-prefix membership (P5). Pinned by tests 1, 2                                                                          |
| "`remove` never mints a store"                                    | **floor** — `recordsBaseline(...).records === null → return` before any write, the `add.ts:438` predicate verbatim; `absent` is one of its three null-producing kinds. Pinned by test 4 |
| "`remove` never blesses a corrupt/stale store"                    | **floor** — same predicate; `invalid` and stamp-mismatch are the other two null kinds. Pinned by test 5                                                                                |
| "the stamp is unchanged"                                          | **floor** — the written pair is `config.skillsVersion` / `config.commit`, the same pair the baseline compared against; there is no other value in scope. Pinned by test 3              |
| "no store write when nothing matched"                             | **floor** — `dropped === 0 → return` before `writeRecords`. Pinned by test 7                                                                                                           |
| "a record key never becomes a filesystem path"                    | **floor, preserved by construction** — the prune only ever `startsWith`-compares keys as strings; the sole path built is `safeJoin(cwd, capabilityRelDir(...))`, from **config** values, in the unchanged `deleteCapabilityDir` (`docs/reference/pharn-records.md:84`) |
| "prune-then-config failure is benign"                             | **advisory** — a reasoned argument about crash windows, not a deterministic check. Labeled as such in the code comment; both directions were enumerated above and neither corrupts. `writeRecords` is a plain `writeFile`, so **no atomicity is claimed** |
| "`remove` stays zero-network / no clone"                          | **floor, structural and unchanged** — `remove.ts` imports no repo module; this increment adds only `../lib/install-records.js`, which imports `node:fs`, `node:path`, `hash`, `validate`, `layout`, `types` — **no network module**. The existing test comment at `remove.test.ts:30-33` still holds |

## Trust audit (P2)

`pharn.records.json` is **local but hand-editable → untrusted** (`install-records.ts:20-26`). Taint
propagation through this increment:

- **In:** `readRecords` already validates every key against `RECORD_KEY_RE` + a `..` check and every
  value against `SHA256_RE`, and hard-fails the **whole** store on any violation (`:131-145`). The
  prune therefore only ever sees keys that already passed the allowlist.
- **Through:** keys are used for **string comparison only** (`startsWith`). No key is joined, resolved,
  opened, or written to. The `docs/reference/pharn-records.md:84` invariant — "a record key is never
  used to build a filesystem path" — holds by construction, and this increment gives it a second
  consumer without weakening it.
- **Out:** the written store contains a **subset** of the keys that were read, plus a stamp sourced
  from `pharn.config.json` (which `loadArchetypeConfigOrExit` already validated). No new value enters
  the store, so the output's taint is strictly ≤ the input's.
- **Fail-closed:** every unparseable/mismatched input degrades to "leave the file alone", which is the
  status quo — the safe terminal (P5).

## Determinism audit (P5)

Every branch this increment adds is a membership/equality test, none is a classification:

| Branch                       | Test                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| prune or leave alone         | `records === null` — the tri-state `ReadRecordsResult` resolved by `recordsBaseline`     |
| key dropped or kept          | `key.startsWith(prefix)` — exact string prefix membership                                 |
| write or skip                | `dropped === 0` — an integer compare                                                      |
| griller dir or lens dir      | `cap.role === 'griller'` — the existing enum test, now in one place instead of two        |

No fallback ends in a guess: the terminal for "cannot read the store" is **do nothing and change
nothing**, which is exactly what `add` already does and is what the user's next `update` will report.

## Non-goals (P7 — named, not silently skipped)

- `src/lib/install-records.ts` — untouched; no new exports (its API sufficed, verified).
- `update`'s manifest-keyed pruning, `status`, `add`, `diff.ts` — untouched.
- The #76 auto-warning + source-preserving survivor filter, the #78 no-prompt / no-op-`--yes`
  semantics — byte-equivalent.
- **No cross-layout orphan sweep.** The store has been manifest-keyed at the current layout by
  construction since #74, and any historical orphan keys have been pruned by every `update` since. A
  `doctor`-style sweep is a different tool on a different axis, not `remove`'s (P3, P7).
- **No store minting, ever** — absent stays absent.
- No tombstones, no change to what `update` may resurrect.

## Risks

1. **`configLayout` vs. the store's actual keys.** The prune addresses the store at
   `configLayout(config)`, exactly as `deleteCapabilityDir` addresses the filesystem. If a project's
   store were keyed at the *other* layout, the prefix would match nothing and the prune would be a
   silent no-op — the **status quo**, not a regression, and the very drift `add`'s layout gate (#79)
   and `update`'s clone-layout recording (#74) exist to prevent. Named here, not fixed here (that is
   the orphan-sweep non-goal).
2. **A partially-pruned store on a crash mid-picker** is impossible in the list form (one write); it
   would be possible in the per-pick form. A further reason for the deviation argued above.
3. **Coverage.** `pruneCapabilityRecords` has 4 branches; tests 1–8 hit all of them (null-return: 4+5;
   dropped===0: 7; the filter both ways: 1+2; both call sites: 1+8). No line should land uncovered.

## Open questions (HALT)

1. ~~Per-command list call vs. literal per-pick call in the picker loop~~ — **RESOLVED at the plan
   gate: the list form** (one call after the delete loop, one store write per command). Build to the
   shape in §The shape as written.
2. ~~`CHANGELOG.md` placement~~ — **resolved during discovery, not an open question.** `CHANGELOG.md`
   already carries `## [Unreleased]` → `### Fixed` (`:8-10`); the new bullet is appended there. No new
   heading.
