# PLAN — diff.ts joins the canonical hash and stops crashing on what it cannot read

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `lib/diff.ts` stops owning its own disk primitives — it consumes `readDiskState` and
  `sha256File`, gaining a fourth `unreadable` partition that `status` renders and `--strict` counts.
- layer(s): lib (`diff.ts`) + command (`status.ts`) + tests + docs
- constitution_refs: [P0, P1, P3, P4, P5, P6, P7]

## Phase A — Discovery (read-only), completed this run

**Baseline (untouched base, HEAD `8ff7240`, `main`):** `npm run check` → **exit 0** (39 test files, 625
tests). `npm run lint:md` → **0 issues in 0 files**. GREEN.

### Anchors verified

| Anchor | Claimed | Found |
| --- | --- | --- |
| `src/lib/diff.ts` `compareExpected` | `:47` | `:47-67` — confirmed |
| `src/lib/diff.ts` local `hash` | `:69` | `:69-71` — confirmed, byte-identical body to `sha256File` |
| `src/lib/diff.ts` `InstallDiff` | 3 fields | `:7-14` — `modified`, `missing`, `okCount` |
| `readDiskState` exported | `apply-update.ts:44` | `:44` — confirmed |
| `readDiskState` union | 3 arms | `update-decision.ts:153-156` — confirmed, unchanged |
| `tests/status.test.ts` mocks `diff.js` | `:17` | `:17` — confirmed |
| `docs/commands/status.md` partition narration | `:9`, `:38-44`, `:63-64` | confirmed + one more, see below |

**`diffInstalledCapabilities` has exactly ONE consumer** (absence claim, full grep of `src/`, `tests/`,
`docs/`, `.dev/`): `src/commands/status.ts:5,87`. `tests/status.test.ts` mocks it; `tests/diff.test.ts`
tests it. **`InstallDiff` is imported nowhere** outside `diff.ts` — the type can be extended freely.

### Three anchor divergences (the build prompt's premises, corrected)

1. **`DiskState` IS exported — the "no public home" premise is false.** It lives at
   `src/lib/update-decision.ts:153` (exported), and `apply-update.ts:5` imports it *from there* as a
   type. So the union already has a neutral, pure home and needs no relocation for any reason.
   **Decision: still do not import it.** `readDiskState`'s inferred return narrows structurally on
   `state.kind`; a type import would buy nothing. The P3 relocation follow-up (moving the *function*)
   remains out of scope and is not needed by this PR — recorded, not acted on.
2. **Status stub churn is 6 literal definitions across 7 call sites, not 7 literals.** `:96` and
   `:124` both pass the shared `CLEAN` const defined at `tests/status.test.ts:52`. The five inline
   literals are `:138`, `:158`, `:174`, `:195`, `:215`. Churn: **`CLEAN` + 5 inline = 6 edits.**
3. **`update` already owns the copy this PR needs.** `src/commands/update.ts:468` (`skipHeading`'s
   default arm) renders `UNREADABLE — not a regular readable file`, and `SKIP_ORDER`
   (`update-decision.ts:190-195`) puts `unreadable` **last**. The new status subsection reuses both
   verbatim — same words, same position. This is what "same voice" means here; it is not a paraphrase.

### One additional docs line beyond the three named

Sweeping `docs/commands/status.md` untruncated (73 lines) found a **fourth** site: `:15` — "**`status`
never writes, deletes, or overwrites anything.** It is a report, not a guard." — unaffected, stays. The
three narration sites are as claimed (`:9`, `:35-44`, `:63-64`). No further partition narration exists.

## Files

- `src/lib/diff.ts` — rewrite `compareExpected` to branch on `readDiskState`; add the `unreadable`
  field to `InstallDiff`; delete the local `hash()`; import `sha256File` for the clone side only.
  layer: lib
- `src/commands/status.ts` — `printDriftSection` gains the third subsection + the clean-bill condition
  gains `unreadable`; the `--strict` condition at `:94-96` gains `|| result.unreadable.length`.
  layer: command
- `tests/diff.test.ts` — the five new unreadable-state cases + the sort pin + the import source-scan.
  layer: test
- `tests/status.test.ts` — 6 stub literals gain `unreadable: []`; 3 new rendering/strict cases.
  layer: test
- `docs/commands/status.md` — four partitions documented; `--strict` scope updated. layer: docs
- `CHANGELOG.md` — the four user-facing changes. layer: docs

**New files: none. Nothing outside this list is touched.**

## The mapping table (restated, with what discovery forced)

| `readDiskState` returns | Driven by | `InstallDiff` partition |
| --- | --- | --- |
| `{kind:'absent'}` | no entry at the path | `missing` — unchanged |
| `{kind:'file', hash}`, hash **equals** clone | regular file, same bytes | `okCount` — unchanged |
| `{kind:'file', hash}`, hash **differs** | regular file, edited bytes | `modified` — unchanged |
| `{kind:'unreadable', reason:'the path is a symlink'}` | any symlink, **live or dangling** | `unreadable` — NEW |
| `{kind:'unreadable', reason:'the path is not a regular file'}` | a **directory** at the path | `unreadable` — NEW |
| `{kind:'unreadable', reason:'the path could not be inspected'}` | `lstat` ENOTDIR (parent is a file) | `unreadable` — NEW |
| `{kind:'unreadable', reason:'the file could not be read'}` | EACCES on the hash read | `unreadable` — NEW |

**Correction discovery forced:** the build prompt's evidence 1 (`mkdir` over a doc) lands on **`'the
path is not a regular file'`** (the `isFile()` arm, `apply-update.ts:60-62`), **not** on
`'could not be inspected'` — `lstat` on a directory succeeds. The raw `EISDIR` the live evidence showed
came from `readFileSync`, which is exactly the call being deleted. Four reasons, one partition.

**Clone side is deliberately NOT symmetric.** It stays a plain `sha256File(repoPath)`, with a comment
saying why: `collectExpectedInstallPaths` only ever emits paths it `existsSync`-verified in a fresh
private temp clone this same run, and its walkers exclude symlinks (`install-manifest.ts:77`). A
clone-side read failure is genuinely exceptional (corruption mid-run) and keeps today's behavior —
surfacing through `runStatus`'s catch. **There is no fifth state.**

## The type diff

```ts
export interface InstallDiff {
  modified: string[];
  missing: string[];
  // Expected paths that EXIST but cannot be compared: a symlink (live or
  // dangling), a directory, a non-regular file, an unreadable file, or a path
  // whose parent is a regular file. Reported by name with its reason — never
  // silently folded into ok/modified/missing. Sorted by `rel`.
  unreadable: { rel: string; reason: string }[];
  okCount: number;
}
```

Additive: `modified`, `missing`, `okCount` keep their names, types, and sorted order.

**Sort is `<`/`>` comparison, NOT `localeCompare`** — `localeCompare` is locale-dependent and would
break P5 determinism across machines; `<`/`>` gives the same UTF-16 code-unit order the existing
`.sort()` calls already produce, so all four partitions order identically.

## The new subsection copy (draft)

Rendered inside the **existing DRIFT note**, as the **third** subsection after MISSING (mirroring
`SKIP_ORDER`'s placement), and **only when non-empty**:

```text
  UNREADABLE — not a regular readable file
  pharn/CONSTITUTION.md — the path is not a regular file
  pharn/ARCHITECTURE.md — the path is a symlink

  pharn cannot compare these, and `pharn update` skips them too.
  Inspect each path by hand — a directory, a symlink, or an
  unreadable file sits where pharn expects a regular file.
```

The clean bill (`No drift — N file(s) match …`) now requires **all three** arrays empty.

**No defensive `?? []` anywhere.** `printDriftSection` reads `result.unreadable.length` directly and
takes the `InstallDiff` type (type-only import — erased at compile time, so `status.test.ts`'s
`vi.mock` of `diff.js` is unaffected). A stub that forgets the field crashes the test loudly. A
`?? []` default would make every one of the six stub edits optional and turn the new rendering tests
vacuous — the precise hazard flagged for HALT 2, designed out here rather than reviewed for later.

## Evals to write (P1) — one per invariant

In `tests/diff.test.ts` (real-fs fixtures, mirroring `tests/apply-update.test.ts:39-72`):

- **Inv 1 — anti-collapse.** `mkdir` over an expected doc → the call **does not throw**, that rel is in
  `unreadable`, **and** every other expected file still lands in `okCount`/`modified`/`missing` (assert
  the full partition, not just the one entry). The direct inversion of evidence 1.
- **Inv 2a — symlink, different bytes.** Symlink → a file with different content → in `unreadable`,
  **absent from `modified`**.
- **Inv 2b — symlink, IDENTICAL bytes.** Symlink → a byte-identical copy → in `unreadable`, and
  `okCount` **excludes** it. The silent-`ok` case; the one the build prompt names as the vacuous-test
  trap, so it asserts the count, not just membership.
- **Inv 2c — DANGLING symlink.** → in `unreadable`, **absent from `missing`**.
- **Inv 3 — ENOTDIR.** A regular file where a parent directory belongs → in `unreadable`, **absent from
  `missing`** (evidence 3 inverted).
- **Inv 5 — determinism.** Two unreadable entries created out of order → `unreadable` sorted by `rel`;
  `modified`/`missing` order unchanged.
- **Inv 7 — the fork cannot return.** Source-scan `src/lib/diff.ts` (the `check-*` house pattern):
  assert it contains **neither** `node:fs` **nor** `node:crypto`.
- **Inv 4 — regression.** The four existing cases stay green; each additionally asserts
  `unreadable: []` so a regular-file run is pinned as byte-equivalent.

**Reason-string assertion policy (stated, because it differs from next door).** `apply-update.test.ts`
asserts `kind` only — it *has* a `kind` to assert. `InstallDiff` has no `kind`, only `reason`, so the
symlink cases assert `/symlink/` matches the reason: evidence 2's whole complaint is that "the *reason*
— a link sits there — is erased", and a test that ignores the reason does not invert it. The
directory/ENOTDIR cases assert only that `reason` is a non-empty string (the `kind`-equivalent),
leaving that copy free.

In `tests/status.test.ts`:

- **Inv 6a.** `--strict` with **only** `unreadable` non-empty → exits 1, cleanup called first.
- **Inv 6b.** Plain `status` with `unreadable` non-empty → **resolves** (exit 0), and the DRIFT body
  contains the heading and `rel — reason`. Report-only, pinned.
- **Inv 8.** Zero unreadable with drift present → DRIFT body does **not** contain `UNREADABLE`.

**Coverage note (honest, P0/P7).** All four `unreadable` reasons are drivable *through `diff.ts`*
except EACCES — but that branch lives in **`apply-update.ts:65-67`**, not in `diff.ts`. `diff.ts` has a
single `state.kind === 'unreadable'` arm, which the five cases above cover. So `diff.ts` can reach 100%
line coverage, and `apply-update.ts`'s coverage is unchanged by this PR. No mock will be invented.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — untouched; this PR reports no findings. Cited for the
  enum-gated/free-text split only: the new `reason` strings are **pharn-authored constants**
  (`apply-update.ts`), not untrusted content. (P4 — cite, do not restate.)

## Guarantee audit (P0)

- **"Every read is `safeJoin`-contained"** (`diff.ts`'s docstring claim) → **FLOOR: path containment,
  preserved end-to-end.** `diff.ts` stops calling `safeJoin` itself — but the project side is contained
  by `readDiskState`'s own `safeJoin(projectRoot, rel)` (`apply-update.ts:45`) and the clone side by
  `collectExpectedInstallPaths`' `safeJoin(repoDir, …)` (`install-manifest.ts:115,148`). Verified this
  run. The docstring is updated to point at *where* the containment now lives, so the claim keeps a
  floor reduction rather than becoming prose.
- **"`status` never crashes on an unreadable expected path"** → **FLOOR: `readDiskState` is total** —
  both throwing calls are `try`-wrapped (`apply-update.ts:51-55, 63-67`). Pinned by Inv 1.
- **"A symlink at an owned path is never read through"** → **FLOOR: membership test** —
  `lstat().isSymbolicLink()`, evaluated before any read. Pinned by Inv 2a/2b/2c.
- **"Read and write agree about what a symlink at an owned path means"** → **FLOOR: structural** — it
  is literally the same function, not two implementations kept in sync by discipline.
- **"`--strict` exits 1 when anything is unreadable"** → **FLOOR: enum/length membership** —
  `result.unreadable.length` in a boolean condition. Pinned by Inv 6a; the exit-0 half by Inv 6b.
- **"One canonical sha256"** → **FLOOR: source-scan (NEW).** `hash.ts`'s header has claimed one
  canonical implementation all along while `diff.ts:69` forked it — a **prose** claim. Inv 7 turns it
  into a checked one. This is the increment's only *new* floor primitive, and it is a test assertion in
  the existing suite, not a new checker.
- **Advisory:** the `reason` display strings, the subsection wording, and the hint copy. Advisory, and
  labeled so — no proceed/stop and no partition assignment rests on them.

## Trust audit (P2)

No new untrusted ingestion. `diff.ts` already read both the untrusted clone and the project; it
continues to, through the *same* manifest. Taint is unchanged and does not widen: the `rel` paths
rendered come from `collectExpectedInstallPaths` (capability names already validated by
`CAPABILITY_NAME_RE`), and the `reason` strings are **pharn's own constants**, never derived from
fetched content. The new subsection therefore adds no untrusted text to the terminal.

## Determinism audit (P5)

The four-way branch is a **membership test on `state.kind`** over a closed three-arm union, plus a
string equality on the hash — no classification, no guess, no fallback that ends in one. Ordering is
code-unit comparison (locale-independent). The unreadable **reasons** never drive a branch; they are
display only.

## Non-goals (HALT and renegotiate if any is needed)

`src/lib/apply-update.ts`, `src/lib/hash.ts`, `src/lib/update-decision.ts`, `planUpdate`/`update`,
`install-manifest.ts`, the known status re-add hint copy (separate LOW ticket), streaming hashes, a
fifth state, any other `--strict` semantics change, and relocating `readDiskState`.

## Open questions — ALL RESOLVED at GATE 1 (none outstanding)

1. ~~**The working tree is not clean at `8ff7240`.**~~ `package.json` + `package-lock.json` are
   **staged** with unrelated changes: `version` `0.3.2` → **`0.4.0`**, a new `globals@^17.9.0`
   devDependency, and an `esbuild` reorder. **RESOLVED — human chose "Leave them; they're
   intentional".** They stay staged in the working tree and are **never** `git add`-ed or committed by
   this increment; the branch `fix/diff-unreadable-partition` carries only the six planned files.
2. **Plan approval — RESOLVED: "Approve as written"** at GATE 1.

## Post-grill amendment (advisory input accepted, `GRILL.md`)

`/pharn-dev-grill` raised 5 advisory concerns (0 blocking). One is accepted into the eval set here
because it names a claim this plan makes with nothing behind it:

- **Accepted (P1, `GRILL.md` finding on `:115`) — subsection ORDER gets an eval.** Add to
  `tests/status.test.ts`: with all three partitions non-empty, assert the DRIFT body's
  `indexOf('DIFFERS FROM') < indexOf('MISSING') < indexOf('UNREADABLE')`. The plan asserted the
  ordering in prose; now a test holds it, matching the write side's `SKIP_ORDER` discipline.
- **Accepted (P0, finding on `:201`) — relabel.** The Inv-7 source-scan is a **floor-reducible
  assertion carried by the existing vitest suite**, NOT a "new floor primitive": no file lands in
  `.dev/floor/` and nothing outside `npm test` enforces it. Wording corrected above in spirit; the
  reduction itself (a regex membership test inside a floor gate) is unchanged and real.
- **Accepted (P4, finding on `:65`) — CHANGELOG target named.** `CHANGELOG.md:8` `## [Unreleased]` →
  the existing `### Fixed` subsection. Verified live this run; no `0.4.0` heading exists.
- **Accepted (P7, finding on `:57`) — scope widening stated, not silent.** `status.ts` also gains one
  top-level `import type { InstallDiff }` line, outside `printDriftSection` and the strict condition.
  Type-only, erased at compile time, no runtime behavior; VERSION/MODELS, fetch/cleanup, and the
  re-add hint stay byte-equivalent.
- **Noted, not acted on (P1 minor, finding on `:145`).** The directory/ENOTDIR reason strings stay
  asserted as non-empty only. The partition is the contract and the partition is pinned; coupling the
  tests to three more display strings buys less than it costs.
