# PLAN — add-version-gate (`pharn add` must not close `pharn update`'s version gate, H2)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn add` refuses to operate against a fetched clone whose `SKILLS_VERSION` differs
  from the project's recorded `config.skillsVersion`, naming both versions and `pharn update` as the
  one resolution — so `add` can no longer stamp a new `skillsVersion` over an install still holding
  the old version's bytes, which is what makes `update`'s `config.skillsVersion === latest`
  early-return lie.
- layer(s): the CLI itself (`src/commands/add.ts`) — not a pharn-oss capability layer
- constitution_refs: [P0, P1, P4, P5, P6, P7]

## Discovery — VERIFIED against live state this run (P6)

HEAD `135406a` (`feat: pharn update is drift-safe by default (#74)`), working tree **clean**,
`package.json` version `0.4.0` (unreleased). Baseline gates on untouched `main`:

| Gate               | Result                                                       |
| ------------------ | ------------------------------------------------------------ |
| `npm run check`    | ✅ exit 0 — 38 test files, **544 tests** passed              |
| `npm run lint:md`  | ✅ 0 issues in 0 files (23 files linted)                     |

`ARCHITECTURE.md` content-hash is **byte-identical** to the one the previous increment
(`update-drift-safe`) pinned — the spec has not drifted.

### Anchor confirmations

| Anchor (from the brief)                                                      | Verdict            | Evidence read this run                                                                                       |
| ---------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| The offending write is `skillsVersion: version` in `resolveArchetypeAdd`'s `writePharnConfig` | ✅ **exact** | `src/commands/add.ts:333` — line number has **not** drifted                                                  |
| `update`'s gate is `config.skillsVersion === latest` with `&& !force`         | ✅ **exact**       | `src/commands/update.ts:95-96` — `const current = config.skillsVersion === latest;` / `if (current && !force)` |
| Named path: parse → fetch → `resolveArchetypeAdd` in `try` / `cleanup` in `finally` / exits after | ✅ confirmed | `add.ts:55-118` — `repo.cleanup()` at `:104`, `process.exit(1)` at `:109`                                     |
| Picker path: TTY gate → fetch → `resolveAddPicker` → per-pick loop threading `cfg` | ✅ confirmed  | `add.ts:128-185` (`cleanup` `:166`, exits `:171,:177`); loop `:229-266`                                       |
| Typed outcomes `AddResult` / `PickerAddOutcome` exist                        | ✅ confirmed       | `add.ts:274-277` and `:187-192` — both already carry a `{ kind: 'error'; message: string }` arm               |
| `readSkillsVersion(repoDir)` — sync, validated, **throws** on missing/invalid | ✅ confirmed       | `src/lib/skills-version.ts:23-35` — `ManifestValidationError` + `assertSafeString(…, VERSION_RE)`             |
| `PharnConfig.skillsVersion` is a **required** `string` (no `undefined` case)  | ✅ confirmed       | `src/types.ts:100`; ingest guard `src/lib/pharn-config.ts:43`                                                 |
| `recordsBaseline` stamp semantics = store must match the config it sits beside | ✅ confirmed     | `src/lib/install-records.ts:163-180`                                                                          |
| Existing mock harness (`vi.mock` repo / skills-version / prompts, `stubProcessExit`, tmp dirs) | ✅ confirmed | `tests/add.test.ts:7-44`, `tests/helpers.ts:1-33`                                                             |
| **No version gate exists in `add` in any form**                               | ✅ confirmed       | full read of `src/commands/add.ts` (366 lines) — no comparison of `config.skillsVersion` anywhere              |
| degit cannot clone an arbitrary older `config.commit`                        | ✅ confirmed       | `src/lib/repo.ts` doc comment; independently re-confirmed in `update-drift-safe`'s PLAN (degit 3.6.1 `selectRef`) |

**No anchor drift. No pre-existing gate. Baseline green.** No HALT condition from §8 triggered.

### Two live findings the brief did NOT name (both change the test plan)

1. **The existing `runAdd — pharn.records.json` describe block is built on the very skew this gate
   forbids.** `tests/add.test.ts:312` sets `readSkillsVersion.mockReturnValue('1.1.0')` while its
   `config()` (`:287`) records `skillsVersion: '1.0.0'`. **All 6 tests in that block would refuse**
   under the gate. They must be re-based onto a matching version (`1.0.0`), which is *not* a
   weakening — the block tests record-store merging, not version skew, and re-basing makes it test
   the merge at the only version state `add` will now accept. One test's assertion changes meaning
   and becomes invariant 4's pin:
   - `:333` *"re-stamps the store to match the config written beside it"* — today asserts
     `skillsVersion === '1.1.0'`. After the gate the store must follow the **commit** refresh, with
     `skillsVersion` unchanged. That is exactly the legal *same-version-different-commit* case, so
     this test becomes the invariant-4 pin rather than being deleted.
   - The first describe block (`runAdd (archetype)`) already mocks `readSkillsVersion → '1.0.0'`
     against an `archConfig()` of `skillsVersion: '1.0.0'` (`:76`, `:98`) — **matching**, so all 11
     of its tests pass the gate untouched. This is a useful signal: the equal-version path is
     already the harness's default.
2. **`readSkillsVersion` throws**, so the gate cannot be called outside the existing `try` blocks
   without breaking invariant 3 (cleanup-in-`finally`, exit-after). Placement must be **inside** each
   path's existing `try`. This directly rules out the naive "call it right after `fetchRepo()`"
   reading of option (A) and shapes the recommendation below.

### Doc sweep — `grep -rn "skillsVersion" docs/ README.md CLAUDE.md` (18 hits, each classified)

| Line                                | States/implies add's version-refresh? | Action                       |
| ----------------------------------- | ------------------------------------- | ---------------------------- |
| `docs/commands/add.md:20`           | **YES** — "(also refreshing `skillsVersion` and `commit`)" | **Rewrite** (in whitelist) |
| `docs/commands/status.md:39`        | **Implied** — "capabilities can also be re-added with `pharn add`" as a fix for missing files; silently false on an outdated install | **Open question (a)** — outside whitelist |
| `docs/reference/pharn-config.md:3`  | No — "updated by `pharn add` / `pharn update`" stays true (`add` still updates `commit` + `capabilities`) | none                         |
| `docs/reference/pharn-records.md:46`| No — the `add` row ("only extends an already readable store") stays true | none                        |
| `CLAUDE.md:64` (`pharn add` addressing) | No — never claims a version refresh; but does not mention the gate either | **Open question (b)** — addition, not a fix |
| Other 13 hits (`getting-started`, `init`, `update`, `status:29,68`, `list`, `pharn-config` table/example, `pharn-records`, `troubleshooting`, `README:74`, `CLAUDE:54,60,66,68`) | No — all describe `init`/`update`/`status`/config shape | none |

`CHANGELOG.md` convention confirmed: `## [Unreleased]` section exists and is **empty**; released
sections use `### Changed` / `### Added` with bolded user-facing lead sentences.

## Files

- `src/commands/add.ts` — the gate + its single-sourced message — layer: CLI command (one verb)
- `tests/add.test.ts` — gate tests + re-base the records block onto a matching version — layer: spec (P1)
- `docs/commands/add.md` — Behavior step 3 corrected; the gate documented — layer: user docs (P4)
- `docs/commands/status.md` — one clause on line 39: `pharn add` re-adds only at the current version — layer: user docs (P4)
- `CLAUDE.md` — one sentence in the `pharn add` addressing paragraph naming the gate — layer: agent guidance
- `CHANGELOG.md` — one `### Fixed` entry under `## [Unreleased]` — layer: release record

No new files. No `tests/helpers.ts` change is needed — the gate is exercised entirely by re-pointing
the already-mocked `readSkillsVersion`, so no shared fixture is required (and the whitelist's "never
modify existing helpers" is respected by not touching it at all).

## The gate (the one axis)

A single local helper in `add.ts`, called **once per command**, inside each path's existing `try`:

```
versionGate(repoDir, config) -> string | null
  fetched := readSkillsVersion(repoDir)        // already-validated, VERSION_RE
  return fetched === config.skillsVersion ? null : MESSAGE(config.skillsVersion, fetched)
```

Insertion points (both inside the existing `try`, so `finally { repo.cleanup() }` and
exit-after-cleanup are structurally preserved):

- **named** — `add.ts:87-105`: `result = gate ? { kind: 'error', message: gate } : await resolveArchetypeAdd(…)`
- **picker** — `add.ts:156-167`: `outcome = gate ? { kind: 'error', message: gate } : await resolveAddPicker(…)`

Both reuse the **existing** `{ kind: 'error' }` arm → `log.error` + `process.exit(1)`, so no typed
outcome is added and no exit-code contract changes.

### Options considered

| Option | Placement | Verdict |
| ------ | --------- | ------- |
| **(A) shared local guard, inside each path's `try`** | `add.ts:87-105` + `:156-167` | ✅ **RECOMMENDED.** One helper, two call sites, fires before `parseCapabilityIndex`, before `groupMultiselect`, before any write. `readSkillsVersion`'s throw lands in the existing `catch`. Invariants 1–3, 6 hold **structurally**, not by inspection. |
| (B) gate inside `resolveArchetypeAdd` as a new typed outcome | `add.ts:290` | ❌ **Violates invariant 1c.** In the picker it runs *per pick*, i.e. **after** `groupMultiselect` has already rendered — the user picks, then gets refused N times. Avoidable only by *also* gating `resolveAddPicker`, which is option (A) with extra steps. Rejected. |
| (C) gate as the first statement of `resolveAddPicker` + of `resolveArchetypeAdd` | two sites | ❌ Duplicates the call (violates 6's spirit) and still runs per-pick inside the loop. Strictly worse than (A). |
| (D) pre-flight `fetchRemoteSkillsVersion()` **before** the clone | `add.ts:72` / `:141` | ❌ **Rejected (P7).** It would make `add` issue a `raw.githubusercontent.com` request it has never made — a new network path in the trust boundary — for a *performance* gain (skipping a clone), not a correctness one. The clone-derived gate must stay authoritative regardless (TOCTOU: upstream can release between the probe and the clone), so (D) is **pure addition** on top of (A), and it adds a new failure mode (raw unreachable while github.com is fine). "Additions are triggered by a real need, never a hypothetical" — the need here is speed, and the brief's axis is correctness. Not proposed. |

**No alternative to the version gate is strictly better.** Commit-pinning is impossible (degit,
re-confirmed); a tarball extractor or `mode: 'git'` would each add a new network path + extractor to
the trust boundary and require a `THREAT-MODEL.md` rewrite — a scope renegotiation this axis does
not justify.

### Ordering decision: **gate-first** (before the already-installed no-op and before `all-installed`)

Option (A) places the gate before `resolveArchetypeAdd` / `resolveAddPicker` are entered at all, so
a benign re-add of an already-installed capability on a stale install **refuses** rather than
answering "already installed". Chosen because:

1. It is the only ordering under which invariant 2 ("nothing written on refusal") is **structural** —
   there is no code path from the gate to a write. Noop-first would make it a property of inspection.
2. The no-op answer is not free of the stale clone: `resolveArchetypeAdd` resolves against
   `parseCapabilityIndex(repoDir)` — the **new** version's index — before it can reach the
   already-installed check (`add.ts:290-312`). Answering "unknown capability, here are the valid
   ones" from a version the project is not on is the same category of lie this PR removes.
3. One rule, one message, no "sometimes `add` works on a stale install" surface to document.

Pinned by a test (`refuses an already-installed capability too`).

### Refusal message (single-sourced, direction-agnostic)

Emitted through the existing `log.error(\`⚠ ${message}\`)`:

```
Skills version mismatch: pharn.config.json records v<recorded>, but the fetched
pharn-dev/pharn-oss is at v<fetched>. `pharn add` installs only at the version your project is
already on — run `pharn update` first, then re-run `pharn add`.
```

Fires on `!==`, never `<`: a clone **older** than the config (rollback, hand-edit) produces the same
symmetric "mismatch … records X, … is at Y" wording with no guessed direction (invariant 5).

## Evals to write (P1)

Every test lands in `tests/add.test.ts` inside the existing harness (`vi.mock` of
repo/skills-version/prompts, `stubProcessExit`, `useTmpDir`). Mapped 1:1 to the brief's invariants:

| # | Invariant | Test |
| - | --------- | ---- |
| 1a/1b/1d | named path refuses, names both versions + `pharn update`, exits non-zero | `refuses a named add when the clone's skills version differs (names both versions and update)` — `readSkillsVersion → '2.0.0'` vs config `1.0.0`; expect `ProcessExit(1)`, and the `log.error` arg matches `/1\.0\.0/`, `/2\.0\.0/`, `/pharn update/` |
| 1c/1d | picker refuses **before any prompt** | `refuses the picker before rendering the multi-select` — TTY true; expect `ProcessExit(1)` **and** `expect(prompts.groupMultiselect).not.toHaveBeenCalled()` |
| 2 | nothing written on refusal | `writes nothing on refusal` — `expect(installCapabilityDirs).not.toHaveBeenCalled()`, `expect(writePharnConfig).not.toHaveBeenCalled()`; plus a real-fs variant in the records block asserting the seeded `pharn.records.json` bytes are **byte-identical** after a refused add |
| 3 | cleanup ordering | the two refusal tests assert cleanup is **reached** (`expect(cleanup).toHaveBeenCalled()` on the mock-clone spy). The **ordering** is structural, not test-proven — the gate sits inside the existing `try`, so `finally { repo.cleanup() }` precedes every exit. (Grill F4: under `stubProcessExit` a thrown `exit` always runs `finally`, so no test in this harness can prove the ordering.) |
| 4 | equal-version add unchanged, incl. same-version-different-commit | the 11 existing `runAdd (archetype)` tests pass **untouched** (already 1.0.0 vs 1.0.0) + the re-based `re-stamps the store to match the config written beside it` now pins `skillsVersion` **unchanged at `1.0.0`** while `commit` refreshes to `'a'.repeat(40)` |
| 5 | direction-agnostic | `refuses when the clone is OLDER than the config` — `readSkillsVersion → '0.9.0'` vs config `1.0.0`; same message shape, same exit(1) |
| 6 | single-sourced message | structural: one `versionGate` helper, two call sites. Pinned behaviorally by both refusal tests asserting the **same** message shape. |
| 7 | fail-closed / deterministic | `readSkillsVersion` throwing (invalid/missing `SKILLS_VERSION`) still exits(1) with cleanup — `readSkillsVersion.mockImplementation(() => { throw … })` |

Plus **two** ordering pins, one per path (grill F3 — the ordering decision covers both, so both are
pinned):

- named — `refuses an already-installed capability too (gate before the no-op)`
- picker — `refuses before the all-installed outcome` (everything installed **and** a mismatched
  version → `ProcessExit(1)`, `groupMultiselect` never called, and `outro` never called with
  "All available capabilities are already installed.")

### Known limit, labeled (P7, grill F5)

The gate leaves **no way to `add` a capability to a deliberately-pinned older install** — the brief
excludes an add-side `--force`, and `pharn update` is the only offered resolution. This is a
deliberate trade (a stale-version `add` is the bug being fixed), and it is stated plainly in
`docs/commands/add.md` and the CHANGELOG entry rather than left implicit.

## Guarantee audit (P0)

| Claim | Reduction |
| ----- | --------- |
| "`add` refuses when the clone's `SKILLS_VERSION` differs from the recorded one" | **FLOOR** — string equality (`===`), a membership test and not a heuristic (P5). **Honest about the two sides (grill F1):** the clone value IS `VERSION_RE`-validated (`readSkillsVersion` → `assertSafeString`); the config value is only **type**-checked at ingest (`pharn-config.ts:43` — `typeof === 'string'`, deliberately, per the same reasoning `install-records.ts:105-110` records). A hand-edited unparseable `skillsVersion` therefore compares **unequal** and refuses — the fail-closed direction — so the equality test is sound without the config side being regex-validated. |
| "nothing is written on refusal" | **FLOOR** — structural: the gate short-circuits *before* `resolveArchetypeAdd` / `resolveAddPicker` are entered, and those are the only functions in `add.ts` that call `installCapabilityDirs`, `writeRecords`, or `writePharnConfig`. Pinned by test. |
| "the picker never prompts on refusal" | **FLOOR** — structural: `groupMultiselect` is called only inside `resolveAddPicker` (`add.ts:216`), which the gate prevents being entered. Pinned by `not.toHaveBeenCalled()`. |
| "the temp clone is always cleaned up" | **FLOOR** — `finally { repo.cleanup() }`, unchanged; the gate lives inside the `try`. |
| "after this PR, `pharn update`'s early-return is truthful" | **ADVISORY.** The gate closes the *`add`-manufactured* skew only. A hand-edited config, a third-party tool, or a `pharn update` run that legitimately withheld the bump can still produce a config whose `skillsVersion` outruns the bytes on disk. `update`'s own gate is **not** hardened here (explicitly out of scope) — so this is labeled advisory, backstopped by `pharn status`, which reports drift truthfully regardless. **Stated as a limit, not sold as a guarantee (P0/P7).** |

## Trust audit (P2)

`SKILLS_VERSION` from the degit clone is **untrusted remote content**. It enters through
`readSkillsVersion`, which `safeJoin`-contains the path and `assertSafeString(…, VERSION_RE)`-validates
the bytes before returning. The gate consumes only that already-validated string, compares it with
`===`, and **interpolates it into a message** — it never becomes a path, a ref, a fetch, or a config
write on the refusal path. Taint therefore reaches **stderr text only** and terminates there; on the
accept path it flows exactly where it already flowed before this PR (`writePharnConfig`,
`writeRecords`), with no new sink.

## Determinism audit (P5)

The single new branch is `fetched === config.skillsVersion` — an exact string-equality membership
test over a `VERSION_RE`-validated clone value and a type-checked config value (grill F1; see the
guarantee audit above for why the asymmetry is safe). It has no third outcome and no fallback that
ends in a guess: unequal → hard-fail with a named resolution (`pharn update`); `readSkillsVersion`
unable to produce a value → throws → existing `catch` → `exit(1)`. No heuristic, no direction
inference, no network beyond the fetch that already happened.

## Open questions — RESOLVED at GATE 1 (human, 2026-08-07)

All three were answered before any code was written; none remains open.

- **(a) `docs/commands/status.md:39`** — "Missing … capabilities can also be re-added with
  `pharn add`" becomes conditionally false on an outdated install.
  → **RESOLVED: include the one-clause edit.** The whitelist is deliberately widened by one line in
  one file so no doc contradicts the code in this PR (P4).
- **(b) `CLAUDE.md`, the `pharn add` addressing paragraph** — not false today, but silent about the
  new gate that future agents will read it for.
  → **RESOLVED: add one sentence.** A deliberate whitelist widening (an addition, not a correction).
- **(c) Refusal presentation** — reuse the existing `{ kind: 'error' }` arm, or add a distinct typed
  outcome?
  → **RESOLVED: reuse the existing `error` arm.** Rendered as `⚠ <message>` via `log.error` +
  `process.exit(1)`. No new typed outcome on `AddResult` / `PickerAddOutcome`, no exit-code contract
  change — the minimal shape that satisfies every invariant.

**Plan approved as written at GATE 1** (option (A), gate-first ordering, the test plan above).
