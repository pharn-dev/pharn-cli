# PLAN — add-layout-gate (`pharn add` must refuse a clone whose layout the config does not record, M1)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn add` refuses to operate against a fetched clone whose `detectLayout` differs from
  the project's `configLayout(config)`, naming both resolved layouts and the resolution — so `add` can
  never again write a capability at a layout the config does not record, which is what let `remove`
  drop the config entry while the files stayed orphaned on disk.
- layer(s): the CLI itself (`src/commands/add.ts`) — not a pharn-oss capability layer
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

## Discovery — VERIFIED against live state this run (P6)

HEAD `a8e9aca` (`feat: record capability source provenance so update preserves manual adds (#76)`),
working tree **clean**, `package.json` version `0.4.0` (unreleased). Baseline gates on untouched
`main`:

| Gate              | Result                                            |
| ----------------- | ------------------------------------------------- |
| `npm run check`   | ✅ exit 0 — 39 test files, **595 tests** passed   |
| `npm run lint:md` | ✅ 0 issues in 0 files (23 files linted)          |

`ARCHITECTURE.md` content-hash `bca940a5…d729d3c4e` is **byte-identical** to the one both
`add-version-gate` (#75) and `capability-source-provenance` (#76) pinned — the spec has not drifted.

### Base-state markers (both required by the brief; both present)

| Marker                                       | Verdict      | Evidence read this run                                                                          |
| -------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| #75 — `versionGate`                          | ✅ present   | `src/commands/add.ts:74-78`; call sites `:118` (named) and `:183` (picker)                        |
| #76 — `source: 'manual'` tagging             | ✅ present   | **both** construction sites: `:289` (picker `cfg` mirror) and `:359` (`resolveArchetypeAdd`)      |
| **No layout gate exists in any form**        | ✅ confirmed | full read of `add.ts` (404 lines); `grep -c configLayout src/commands/add.ts` → **0** — `add.ts` does not import `configLayout` at all |

### Anchor confirmations (line numbers re-verified post-squash)

| Anchor (brief's hint)                              | Actual         | Evidence                                                                              |
| --------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `versionGate` helper                                | `:74` — **exact** | `function versionGate(repoDir: string, config: PharnConfig): string \| null`            |
| named call site                                     | `:118` — **exact** | inside the existing `try`; `finally { repo.cleanup() }` `:129`; `process.exit(1)` `:135` |
| picker call site                                    | `:183` — **exact** | inside the existing `try`; `finally { repo.cleanup() }` `:194`; `process.exit(1)` `:199` |
| `mergeCapabilityRecords` layout derivation          | `:396` — **exact** | `const paths = layoutPaths(detectLayout(repoDir));`                                     |
| `installCapabilityDirs` call (no `paths` arg → internal default) | `:347` | `installCapabilityDirs(repoDir, cwd, [{ name: cap.name, role: cap.role }]);`            |

**No anchor drift.** No §8 HALT condition triggered.

### `src/lib/layout.ts` — the two facts this plan rests on, quoted back

`configLayout` (`layout.ts:78-83`), doc comment verbatim:

> The layout an installed project was recorded with. Enum-safe membership (P5): exactly `'pharn'` →
> pharn; anything else (including a legacy config that omits the field, or a hand-edited garbage
> value) → `flat`, the safe legacy default.

```ts
export function configLayout(config: PharnConfig): Layout {
  return config.layout === 'pharn' ? 'pharn' : 'flat';
}
```

`detectLayout` (`layout.ts:51-53`) — `existsSync(safeJoin(rootDir, PHARN_CONTRACTS_DIR)) ? 'pharn' : 'flat'`,
keyed on the `pharn/pharn-contracts` leaf marker, "No `pharn/` contracts dir → `flat`, the safe
legacy default."

**Both semantics are unchanged from what the brief asserts.** Invariant 4's absent-layout pair is safe.

### The `configLayout` call sites this gate aligns `add` with (no edits there)

| Site                     | Code                                        |
| ------------------------ | ------------------------------------------- |
| `src/commands/remove.ts:136` | `const paths = layoutPaths(configLayout(config));` (named path)  |
| `src/commands/remove.ts:218` | `const paths = layoutPaths(configLayout(config));` (picker path) |
| `src/commands/status.ts:91`  | `layout: configLayout(config)` → fed to `diff.ts`                |
| `src/commands/update.ts:209` | `const previousLayout = configLayout(config);` (migration warning) |

`src/commands/add.ts:396` is the **only** consumer that addresses the project through
`detectLayout(repoDir)` instead. That asymmetry is the bug.

### Live reproduction — RE-RUN AND CONFIRMED THIS SESSION (network available)

Live `SKILLS_VERSION` read from `raw.githubusercontent.com` → **`2.3.4`** (matches the brief). In a
scratch dir with the brief's config verbatim (`layout: "flat"`, `skillsVersion: "2.3.4"`), using the
committed `dist/index.js` at `a8e9aca`:

```text
$ node dist/index.js add lens:trust-fence
└  ✔ Added trust-fence (skills v2.3.4)          # exit 0 — the version gate correctly PASSED
$ find . -maxdepth 3
./pharn/pharn-review/trust-fence                 # files at the CLONE's layout
$ grep layout pharn.config.json
"layout": "flat"                                 # config still says flat

$ node dist/index.js remove lens:trust-fence
└  ✔ Removed trust-fence (lens) (its files were already gone)
$ find . -maxdepth 3
./pharn/pharn-review/trust-fence                 # STILL THERE — orphaned
$ node -e "console.log(JSON.stringify(require('./pharn.config.json').capabilities))"
[]                                               # gone from config
```

**The brief's repro is exact, including the orphaning half.** Not taken on faith — reproduced here.

### Live finding the brief did NOT name (it changes the refusal message — see Open question (a))

**`pharn update` cannot resolve the drift the refusal will route users to.** `update.ts:104-107`:

```ts
const current = config.skillsVersion === latest;
if (current && !force) {
  outro(`Already up to date (skills v${config.skillsVersion}).`);
  return;
}
```

The layout-recording line (`update.ts:208`, `const layout = detectLayout(repoDir);`) is **downstream
of that early-return**. By construction the layout gate's entire residual population is
**version-matched** (a version mismatch fires `versionGate` first — the pinned ordering). So for
exactly the projects the new gate refuses, plain `pharn update` prints "Already up to date" and
**does not rewrite `layout`** — sending the user back to `add`, which refuses again. A closed loop.

`pharn update --force` **does** resolve it (it bypasses the early-return and reaches `:208`,
backing every clobbered file up to `.pharn-backup/<ts>/` first). So the resolution exists — but
naming bare `pharn update` in the refusal would be documenting a resolution that does not resolve,
which is the P4/P0 disease. This is the plan's one genuinely open decision.

### Docs sweep — `grep -rn "layout" docs/ CLAUDE.md README.md` (28 hits, each classified)

| Line                             | Claims/implies `add` works across layouts?                                  | Action                             |
| -------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| `docs/commands/add.md:21`        | **Partly** — "copies that capability's directory into the mirrored layout"; silent about *whose* layout | **Rewrite clause + new section** (in whitelist) |
| `docs/reference/pharn-config.md:21` | **Partly** — "`layout` … Install layout mirrored from the clone: `flat` or `pharn` (absent → `flat`)" — true for `init`/`update`, now false as a blanket statement for `add` | **Open question (b)** — one clause |
| `CLAUDE.md:62` (`pharn add` addressing) | No false claim, but silent about the new sibling gate future agents read it for | **One clause** (declared, in whitelist) |
| `docs/commands/remove.md:31`     | "addressed at your project's **recorded** layout" — already correct, and now provably consistent with `add` | none |
| `docs/commands/status.md:13-14,51-52` | Describes the `status`-vs-`update` layout disagreement — unrelated axis (L7) | none                               |
| `docs/commands/update.md:156-157` | `update` records the clone's layout — still true                            | none                               |
| `docs/commands/init.md:80,89,91` | `init` mirrors the clone layout — still true                                | none                               |
| Other 17 hits (`getting-started`, `roadmap`, `contributing`, `troubleshooting`, `docs/README`, `README:52,65,69,74`, `CLAUDE:7,54,56,58,60,64,66,68`, `pharn-config:83`) | No — all describe `init`/`update`/`status`/`remove`/config shape | none |

`CHANGELOG.md`: `## [Unreleased]` exists with an `### Added` block (#76's two entries). This PR adds
a **`### Fixed`** entry beside it.

### Test-harness facts — CONFIRMED, not assumed

Read `tests/add.test.ts` (526 lines) and `tests/helpers.ts` (32 lines):

- Mocked modules are exactly `@clack/prompts`, `repo`, `capability-index`, `install-capabilities`,
  `skills-version`, `pharn-config` (`:7-35`). **`layout.js` is NOT mocked** — the gate's
  `detectLayout` will run the real implementation. ✅ as the brief states.
- `describe('runAdd (archetype)')`: `archConfig` (`:69-82`) **omits `layout`** → `configLayout` →
  `'flat'`; `mockClone` (`:96`) sets `dir: '/repo'`, which does not exist → `existsSync` false →
  `detectLayout` → `'flat'`. **flat ≡ flat → all 15 tests stay silent.**
- `describe('runAdd — pharn.records.json')`: `config()` (`:421`) sets `layout: 'flat'` **explicitly**,
  `fetchRepo` (`:428`) sets `dir: '/repo'` → `'flat'`. **flat ≡ flat → all 7 tests stay silent.**
- **Predicted fixture churn: zero.** Verified as a build step before any new test is written (below).
- `useTmpDir()` (`helpers.ts:21-29`) yields **one** dir per test. The new tests need a project dir
  *and* a clone dir; both are taken as subdirs of that one tmp dir (`<tmp>/proj`, `<tmp>/clone`).
  **`tests/helpers.ts` therefore needs NO change** — declared, and it stays out of the diff.
- `installCapabilityDirs` is mocked, so its internal `paths` default is never exercised in tests.
  The **real** code that invariant 5 pins is `add.ts:396` (`layoutPaths(detectLayout(repoDir))` →
  `capabilityRecordPaths`, `install-records.ts:245-265`), which runs unmocked against the real fs.
  That is why the record-key assertion, not the installer-arg assertion, is the load-bearing one.

## Files

- `src/commands/add.ts` — one new local `layoutGate` helper + two call-site insertions immediately
  after the `versionGate` calls — layer: CLI command (one verb)
- `tests/add.test.ts` — the gate suite (new sibling `describe`) — layer: spec (P1)
- `docs/commands/add.md` — a `## Layout mismatch` section beside `## Version mismatch`, + Behavior
  step precision — layer: user docs (P4)
- `CLAUDE.md` — one clause in the `pharn add` addressing paragraph (`:62`) — layer: agent guidance
- `CHANGELOG.md` — one `### Fixed` entry under `## [Unreleased]` — layer: release record
- `docs/reference/pharn-config.md` — one clause on `:21` — layer: user docs (P4) — **declared at
  GATE 1 (Open question (b), resolved: include)**

No new files. No `tests/helpers.ts` change (see above). `src/lib/layout.ts`, `update.ts`, `remove.ts`,
`status.ts`, `diff.ts`, `install-capabilities.ts` — **untouched**.

## The gate (the one axis)

A single local helper in `add.ts`, mirroring `versionGate`'s shape exactly, called **once per
command**, inside each path's existing `try`:

```
layoutGate(repoDir, config) -> string | null
  clone  := detectLayout(repoDir)          // enum: 'flat' | 'pharn'
  recorded := configLayout(config)         // enum: 'flat' | 'pharn' (absent/garbage → 'flat')
  return clone === recorded ? null : MESSAGE(recorded, clone)
```

Insertion points, both immediately **after** the existing `versionGate` call, inside the same `try`:

- **named** — `add.ts:118-121` becomes `versionGate(...) ?? layoutGate(...)` feeding the same
  `{ kind: 'error', message }` arm
- **picker** — `add.ts:183-186`, identically

Concretely, the minimal shape at each site (one added line each, no restructuring):

```ts
const refusal = versionGate(repo.dir, config) ?? layoutGate(repo.dir, config);
```

The `??` chain **pins the ordering structurally** (invariant 3): `versionGate` is evaluated first and
short-circuits, so with both mismatched the version message is the one produced — it is not a
property of statement order that a later edit could silently invert.

Both reuse the **existing** `{ kind: 'error' }` arm → `log.error(⚠ …)` + `process.exit(1)`. No new
typed outcome, no exit-code contract change, `versionGate` byte-equivalent, `source` tagging
byte-equivalent, `resolveArchetypeAdd`/`resolveAddPicker` byte-equivalent, and `add.ts:347`/`:396`
(the layout-deriving call sites) byte-equivalent.

### Why NOT "record the clone's layout the way `update` does" (option A — rejected, argument not defeated)

I attempted to defeat the brief's rejection and **could not**. `update` may record the clone's layout
only because it rewrites the **entire** manifest tree at that layout (`update.ts:201-220` →
`collectExpectedInstallPaths({repoDir, capabilities, layout})` over every expected file). `add` writes
**one capability dir** (`add.ts:347`). Writing `config.layout = 'pharn'` from `add` would re-address
`remove.ts:136/:218`, `status.ts:91`→`diff.ts`, and `update.ts:209` for the **whole** install while
every other capability, doc, contract, and floor file still sat at flat paths — turning one orphaned
directory into every-file-reported-MISSING and every subsequent `remove` a silent "files were already
gone". That is strictly worse than the bug. The refusal is the only one-axis fix, and the only
component that can legitimately migrate the tree is `update`.

### Refusal message (single-sourced, enum-safe, direction-agnostic)

**Settled at GATE 1: bare `pharn update`** (see Open question (a) — human chose symmetry with #75's
message over naming `--force`):

```text
Install layout mismatch: pharn.config.json records the `flat` layout, but the fetched
github.com/pharn-dev/pharn-oss uses the `pharn` layout. `pharn add` installs only at the layout
your project is already recorded at — adding here would put files where `pharn remove` and
`pharn status` will never look for them. Run `pharn update` first, then re-run `pharn add`.
```

Both interpolated values come from the `Layout` enum (`'flat' | 'pharn'`), never from the raw
`config.layout` string — so this adds **no** unvalidated-config-string-to-terminal site (that ticket
stays separate). Symmetric wording, no guessed direction: a `pharn`-recorded project meeting a `flat`
clone (a rollback) reads the same way.

## Contracts satisfied

None of `pharn-contracts/{eval-format,finding-shape,seam-config}.md` govern this increment — it is a
CLI-internal gate, not a Capability or a finding emitter. Cited for completeness (P4), not restated.

## Evals to write (P1)

All in `tests/add.test.ts`, as a new sibling `describe('runAdd — the layout gate')` with its own
`useTmpDir` (project + clone as subdirs), matching the existing suite's structure. Mapped 1:1 to the
brief's invariants:

| #  | Invariant                                          | Test                                                                                                                                                                                    |
| -- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0  | zero fixture churn (the flat≡flat silence)         | **Not a new test** — a build step: land the gate, run the existing 595 first, confirm all green *before* writing anything below. Reported in HALT 2.                                       |
| 1a/1b/1d | named path refuses, names both layouts + the resolution, exits non-zero | `refuses a named add when the clone's layout differs from the recorded one` — pharn-marker clone dir + `layout: 'flat'` config; expect `ProcessExit(1)`; `lastError()` contains `flat`, `pharn`, `pharn update` |
| 1c/1d | picker refuses **before any prompt**               | `refuses the picker BEFORE the multi-select ever renders (layout)` — TTY true; `ProcessExit(1)` **and** `expect(prompts.groupMultiselect).not.toHaveBeenCalled()`                          |
| 2  | nothing written on refusal                         | `writes NOTHING when the layout gate refuses` — `installCapabilityDirs`/`writePharnConfig` `not.toHaveBeenCalled()`; **plus** a real-fs variant asserting a seeded `pharn.records.json` is **byte-identical** and no capability dir was created |
| 3  | ordering — version wins when BOTH mismatch         | `produces the VERSION refusal when both version and layout mismatch` — pharn clone + `layout: 'flat'` + `readSkillsVersion → '2.0.0'` vs config `1.0.0`; assert the message names the two **versions** and **not** the word `layout`  |
| 4a | flat↔flat unchanged                                | the existing 22 tests, untouched (fixture-only flat clone) — see row 0                                                                                                                     |
| 4b | absent `config.layout` + **flat** clone → proceeds  | `an absent layout field proceeds against a flat clone (configLayout's default)` — config omits `layout`, `/repo` clone; add succeeds, `source: 'manual'` entry appended                     |
| 4c | absent `config.layout` + **pharn** clone → refuses   | `an absent layout field REFUSES against a pharn clone` — same config, marker clone; `ProcessExit(1)`                                                                                       |
| 5  | **pharn↔pharn happy path — first pin ever**        | `installs at the pharn layout and records pharn/-prefixed paths` — marker clone dir + `layout: 'pharn'` config + seeded records store; mocked installer writes at `pharn/pharn-review/<n>/…`; assert (i) `installCapabilityDirs` called with the clone dir + `[{name, role}]`, (ii) the appended entry carries `source: 'manual'`, (iii) **the written store's keys are prefixed `pharn/`** — the load-bearing assertion, since it exercises the real `add.ts:396` → `capabilityRecordPaths` chain |
| 6  | cleanup ordering preserved                         | both refusal tests assert `expect(cleanup).toHaveBeenCalled()`. The **ordering** is structural (gate inside the existing `try`, `finally` unchanged) and, as `add-version-gate` recorded, unprovable in this harness — under `stubProcessExit` a thrown exit always runs `finally`. Labeled, not overclaimed. |
| 7  | single-sourced message                             | structural: one `layoutGate` helper, two call sites; pinned behaviorally by named + picker refusals asserting the same message shape                                                       |
| 8  | `versionGate` + `source` tagging byte-equivalent   | `git diff` review at HALT 2 + the untouched existing suite (row 0), which already pins both                                                                                               |

## Guarantee audit (P0)

| Claim                                                                              | Reduction                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "`add` refuses when the clone's layout differs from the recorded one"               | **FLOOR — enum check (§2 primitive #3).** Equality over a **two-value enum**, both sides produced by `layout.ts`'s own membership tests (`existsSync` marker; `=== 'pharn'`). No heuristic, no third outcome, no unvalidated string on either side.                            |
| "after this PR `add` can never write at a layout the config does not record"        | **FLOOR — structural.** The gate short-circuits before `resolveArchetypeAdd`/`resolveAddPicker` are entered, and those are the only functions in `add.ts` reaching `installCapabilityDirs`, `writeRecords`, or `writePharnConfig`. Pinned by test.                             |
| "nothing is written on refusal"                                                     | **FLOOR — structural** (same reason) + real-fs byte-identity test.                                                                                                                                                                                                            |
| "the picker never prompts on refusal"                                               | **FLOOR — structural.** `groupMultiselect` is called only inside `resolveAddPicker` (`add.ts:244`), which the gate prevents being entered. Pinned by `not.toHaveBeenCalled()`.                                                                                                 |
| "the version refusal wins when both mismatch"                                       | **FLOOR — structural.** `??` short-circuit evaluation order, not statement ordering. Pinned by test.                                                                                                                                                                          |
| "the temp clone is always cleaned up"                                               | **FLOOR** — `finally { repo.cleanup() }`, unchanged; the gate lives inside the `try`.                                                                                                                                                                                         |
| "this eliminates orphaned capability directories"                                   | **ADVISORY.** It eliminates the `add`-manufactured orphan only. A config hand-edited *after* an add, a third-party tool, or an interrupted `update` can still leave files the config does not address. `pharn status` reports the residue truthfully; no tombstones exist. Stated as a limit, not sold (P0/P7). |
| "`pharn update` resolves the refusal"                                               | **ADVISORY — and conditionally FALSE with bare `update`** (see the live finding + Open question (a)). Resolution to be pinned in the message text; not a floor claim.                                                                                                          |

## Trust audit (P2)

The clone is untrusted remote content. `detectLayout` reads it through `safeJoin(rootDir,
PHARN_CONTRACTS_DIR)` (`layout.ts:52`) and reduces the whole directory tree to **one bit** — a
`Layout` enum value. Nothing from the clone's bytes, names, or structure flows past that reduction.
The message interpolates only the two enum values, so taint reaches **stderr text** as a
closed-vocabulary token and terminates there. On the accept path nothing new flows anywhere: the gate
adds no sink, and `add.ts:347`/`:396` consume exactly what they consumed before this PR.

## Determinism audit (P5)

The single new branch is `detectLayout(repoDir) === configLayout(config)` — equality over a two-value
enum, both sides computed by existing membership tests whose else-branches are the safe legacy default
`flat`. No third outcome; the fallback is a hard-fail with a named resolution, never a guess and never
a silent proceed. A garbage `config.layout` resolves to `flat`, mismatches a `pharn` clone, and
**refuses** — the fail-closed direction.

## Open questions — RESOLVED at GATE 1 (human, 2026-08-09)

Both were answered before any code was written; neither remains open. **Plan approved as written.**

- **(a) The refusal's named resolution — bare `pharn update`, or `pharn update --force`?** By
  construction every project this gate refuses is **version-matched**, and `update`'s early-return
  (`update.ts:104-107`) fires before the layout-recording line (`:208`) — so bare `pharn update`
  prints "Already up to date" and leaves `layout` unfixed, sending the user back to a second refusal.
  `--force` does resolve it (and backs up every clobbered file to `.pharn-backup/<ts>/` first).
  → **RESOLVED: name bare `pharn update`.** The human chose message-symmetry with #75 over naming a
  file-overwriting flag in a terminal refusal, with the concern above stated and understood.
  **Consequence, carried honestly (P0/P4):** for the version-matched population the message names a
  command that will answer "Already up to date" without fixing `layout`. The terminal string does not
  carry that caveat, so **`docs/commands/add.md` must** — its `## Layout mismatch` section states
  plainly that a same-version layout drift needs `pharn update --force`, and the CHANGELOG entry says
  so too. The guarantee audit's "`pharn update` resolves the refusal" row stays **ADVISORY**, now
  additionally qualified: *bare* `update` resolves it only when the version also moved.
  **Follow-up ticket (not this PR):** `update`'s early-return is layout-blind — it should re-run when
  `detectLayout(clone) !== configLayout(config)` even at a matching version. Second axis, `update.ts`
  is an explicit non-goal here.
- **(b) `docs/reference/pharn-config.md:21`** — "Install layout mirrored from the clone" is true for
  `init`/`update` and now a blanket over-claim with respect to `add`.
  → **RESOLVED: include the one-clause edit.** A deliberate one-line whitelist widening (as #75 did
  for `status.md:39`), so no doc contradicts the code in this PR (P4). The file is now a declared
  entry under `## Files`, not conditional.
