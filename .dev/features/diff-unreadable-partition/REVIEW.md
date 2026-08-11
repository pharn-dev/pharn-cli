# REVIEW — diff-unreadable-partition

## Step 1 — Floor first (P0)

`node .dev/floor/validate.mjs .` → **exit 0, GREEN.** The increment was entitled to reach review. This
is the only guaranteed part of this document; **everything below is advisory** (`/pharn-dev-review`
writes prose only — no `findings.json`, no `check-review.mjs` — and a `severity` here is an
LLM assignment, advisory by construction, `finding-shape.md`).

Increment under review: 6 files, +376 / −31.

## L-floor → P0 (the governing lens)

Every guarantee this increment claims, and where it reduces:

| claim | reduction | verified |
| --- | --- | --- |
| "status never crashes on an unreadable expected path" | `readDiskState` is total — both throwing calls `try`-wrapped (`apply-update.ts:51-55,63-67`) | `tests/diff.test.ts` anti-collapse case + live e2e (old binary `EISDIR` exit 1 → new binary reports and continues) |
| "a symlink at an owned path is never read through" | membership test `lstat().isSymbolicLink()`, before any read | three test cases (different bytes / identical bytes / dangling) + live e2e |
| "every read is safeJoin-contained" | path containment — project side `readDiskState`'s `safeJoin(projectRoot, rel)`, clone side `install-manifest.ts:115,148` | re-verified this run; `diff.ts` no longer calls `safeJoin` itself and its docstring now points at where containment lives |
| "`--strict` exits 1 on unreadable" | length membership in a boolean condition (`status.ts:95-103`) | test + live e2e (`--strict` exit 1, plain exit 0) |
| "one canonical sha256" | **regex source-scan** in `tests/diff.test.ts` — no `node:fs`, no `node:crypto`, no `existsSync`/`readFileSync`/`createHash` in `diff.ts` | the scan is in the suite `npm test` runs |

**No unlabeled guarantee found.** The one label that needed correcting was caught at grill and fixed in
the plan: the source-scan is a **floor-reducible assertion carried by the existing vitest suite**, not a
"new floor primitive" — no file lands in `.dev/floor/`, and nothing outside `npm test` enforces it.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: "tests/diff.test.ts:344"
  problem: "The canonical-hash guarantee now rests on a comment-stripping regex scan, which is a real membership test but a brittle one — a future import written as `from \"node:fs\"` with double quotes, or via a re-export, would slip past the two `from '...'` patterns."
  evidence: "expect(code).not.toMatch(/from\\s+'node:fs'/);"
```

> **Advisory.** Mitigated in practice: the third assertion bans the identifiers `existsSync`,
> `readFileSync`, `createHash` outright, so a re-export or alternate quoting still has to produce one of
> those call names to be useful, and prettier normalizes quotes repo-wide. Recorded rather than fixed —
> tightening it to parse imports properly would be over-engineering for a file this small.

## L-eval → P1

Every behavior in this increment ships with a test in the same increment. **+11 tests** (625 → 636), one
per invariant:

| invariant | test | non-vacuous because |
| --- | --- | --- |
| directory → unreadable, run completes | `diff.test.ts` anti-collapse | asserts `okCount === 6` for the untouched rest, not just the one entry |
| symlink, different bytes | `diff.test.ts` 2a | asserts `modified` is **empty** — the masquerade is what's pinned |
| symlink, identical bytes | `diff.test.ts` 2b | asserts `okCount === 6`, **not** 7 — counting it ok would fail |
| dangling symlink | `diff.test.ts` 2c | asserts `missing` is empty |
| ENOTDIR parent | `diff.test.ts` | asserts `missing` is empty |
| sort determinism | `diff.test.ts` | the two entries arrive in the **opposite** order from the manifest, so the sort does real work |
| no fs/crypto in diff.ts | `diff.test.ts` source scan | see the L-floor finding above |
| `--strict` on unreadable alone | `status.test.ts` | `modified`/`missing` both empty — only the new partition drives the exit |
| plain run reports + exits 0 | `status.test.ts` | asserts the `rel — reason` line renders |
| subsection ordering | `status.test.ts` | `indexOf` comparison across all three |
| omitted when empty | `status.test.ts` | asserts absence |

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: "tests/diff.test.ts:80"
  problem: "A pre-existing test in this file named a missing file but only rewrote it with identical bytes, so the `missing` arm of the diff had never been exercised — at the baseline either — which would have left this increment's three new 'not reported missing' assertions vacuous."
  evidence: "write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'), 'N'); // keep"
```

> **Advisory, and FIXED in this increment** (the file is in the plan's `## Files`). The case now
> `rmSync`s the file and asserts `missing` equals it. Consequence: `src/lib/diff.ts` went 94.11% → **100%**
> lines and 75% → **100%** branches. Surfaced by running coverage rather than trusting the test name —
> which is the generalizable part, and is proposed as a lesson below.

## L-trust → P2

- **No new untrusted ingestion.** `diff.ts` already read the untrusted clone and the project; it reads
  the same manifest. The rendered `rel` paths come from `collectExpectedInstallPaths` (capability names
  already validated by `CAPABILITY_NAME_RE`); the rendered `reason` strings are **pharn's own string
  literals** in `apply-update.ts:54,58,61,66`, never derived from fetched bytes. **Taint does not widen**
  — the new terminal output contains no untrusted text.
- **Did instruction-looking content in the reviewed artifact change my behavior?** No. The increment is
  TypeScript, tests and docs; the only imperative prose is in `CHANGELOG.md`/`docs` and is addressed to
  users, not to me. Nothing was complied with.
- **No guaranteed decision rests on a free-text field.** The four `reason` strings are display only —
  the **partition** drives `--strict`, and the partition comes from `state.kind`, a closed enum.
- **A genuine security improvement, worth naming:** before this, a symlink at a pharn-owned path
  pointing outside the install was reported as clean whenever its target happened to match
  (`--strict` exit **0**, verified live). A CI gate built on `pharn status --strict` would have passed
  over it. It now fails.

**No findings.**

## L-axis → P3

- `diff.ts` keeps one reason to change (how drift is computed); `status.ts`'s change is confined to the
  drift render + the strict condition, with VERSION/MODELS, fetch/cleanup and the re-add hint
  byte-equivalent.
- **No sibling-leaf import.** `diff.ts` imports `./apply-update.js`, `./hash.js`,
  `./install-manifest.js`, `../types.js` — all `lib/` or types. P3 forbids command→command and
  step→step; lib→lib is the established pattern (`interactiveAllowed` reused from `capability-picker`
  by `update`/`init` in #78 without relocation).

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: "src/lib/diff.ts:1"
  problem: "readDiskState now has two consumers (update and diff) while still living in apply-update.ts, whose axis is applying writes — so a read-only module depends on the write executor for a classifier that belongs to neither."
  evidence: "import { readDiskState } from './apply-update.js';"
```

> **Advisory, deliberately NOT acted on — a named follow-up, not a defect.** `apply-update.ts` is
> outside this increment's whitelist, and relocating a function used by the write path is a change with
> its own risk profile that deserves its own increment. Two consumers is the threshold at which it
> becomes *worth discussing*, not the threshold at which it must move. Note the type already has a
> neutral home — `DiskState` is exported from `lib/update-decision.ts:153` — so a future relocation
> moves only the function.

## Gates (fix #3)

- **floor-gate (blocking): NONE.** `validate` GREEN; every guarantee has a reduction; every behavior has
  a test; no eval binding missing; no sibling reference.
- **advisory-gate (warn): 3 findings** — 1 P0 minor (regex-scan brittleness, accepted), 1 P1 important
  (**already fixed in this increment**), 1 P3 minor (a named follow-up, deliberately deferred).

## Verdict

**GREEN — 0 floor-gate findings, 3 advisory.**

Stated honestly (P0): "GREEN" here means **the floor was green and I found no blocking finding**. It is
**not** a certification that the increment is correct or wise — `/pharn-dev-review` has no structural
verdict, and the `severity` values above are LLM assignments. The merge decision is the human's.

## Proposed lesson (candidate for canon — NOT written here)

Per the stage's own rule, this is **proposed inside `REVIEW.md`**; canon is written only by a separate,
human-gated `/pharn-dev-memory-promote` run behind `check-provenance.mjs`.

- **Candidate:** *A test's name is not evidence that its assertion runs. When an increment adds cases to
  an existing test file, read the coverage delta for the file under test, not just the green suite.*
- **Provenance:** increment `diff-unreadable-partition`; `tests/diff.test.ts` "flags a modified + a
  missing file" claimed a missing file but rewrote it with identical bytes, leaving `diff.ts`'s `missing`
  arm uncovered at the baseline (94.11% lines / 75% branches) and this increment's three "not reported
  missing" assertions vacuous had it not been caught. Found by reading `coverage-summary.json`, not by
  reading the suite result.
- **Why it may be general:** this is the second time in this run that a green signal was hiding a gate
  that never ran — the other was the regress capture where all 46 outside test files reached
  `node --test` as one filename under `zsh`, exiting 1 identically at base and head and reading as a
  benign "pre-existing" RED (`REGRESSION.md`). Same shape, different layer: **symmetric or green output
  is not proof the check executed.** Two occurrences in one increment is a real pattern, not a
  hypothetical (P7) — but whether it is canon is the human's call at the promotion gate.
