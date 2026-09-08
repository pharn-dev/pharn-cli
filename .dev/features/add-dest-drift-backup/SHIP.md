# SHIP — add-dest-drift-backup

A roll-up of the `/pharn-dev-ship` chain for this increment. **Advisory.** It records that the chain
ran and what each stage's floor verdict was — nothing more.

## Stages, in order

| stage       | ran | outcome                                                   |
| ----------- | --- | --------------------------------------------------------- |
| `plan`      | yes | `PLAN.md` written; **GATE 1** — human approved as written |
| `grill`     | yes | `GRILL.md` — 6 advisory findings (0 blocking)             |
| `build`     | yes | 15 files; floor GREEN                                     |
| `regress`   | yes | `regression-report.json` — `no-regressions`               |
| `verify`    | yes | `verify-report.json` — `PASS`                             |
| `review`    | yes | `REVIEW.md` — GREEN, 0 floor-gate, 5 advisory             |
| post-review | yes | 4 advisories fixed; `regress` + `verify` **recomputed**   |

The run ended at **GATE 2** — the post-review human decision — not at a RED-verdict STOP.

## Structural verdicts read, verbatim

- **`build`** → `node .dev/floor/validate.mjs .` exit **0** (`FLOOR: GREEN — 0 capabilities checked`),
  and the repo floor `npm run check` GREEN.
- **`regress`** → `.dev/features/add-dest-drift-backup/regression-report.json` `.verdict` =
  **`"no-regressions"`** (`check-regress.mjs verdict` exit 0). Eight gates compared base→head, all
  `0 → 0`; `regressions[]` and `pre_existing[]` both empty.
- **`verify`** → `.dev/features/add-dest-drift-backup/verify-report.json` `.verdict` = **`"PASS"`**
  (`check-verify.mjs` exit 0). Five gates, all exit 0; `failing_gates[]` empty; `verifiers.registered`
  = 0 (none exist — floor gates only).

Both verdicts were **recomputed after** the post-review fixes; neither is carried over from the
pre-fix run.

## Advisory artifacts (cited, not restated — P4)

- [`GRILL.md`](GRILL.md) — 6 findings on the plan. Two were acted on during the build: the backup
  directory is announced **at creation** rather than only on the success path (so a later throw cannot
  hide the user's only pointer back), and `install-manifest.ts`'s consumer list was corrected.
- [`REVIEW.md`](REVIEW.md) — GREEN, 0 floor-gate findings, 5 advisory. Four were fixed in this same
  branch: the `capabilityCloneFiles` ↔ real-`installCapabilityDirs` mirror pin (verified non-vacuous by
  temporarily breaking the symlink skip and watching it go red), the clone-side per-component symlink
  guard in `collectDestDrift`, the picker-path backup-message assertion, and the `.pharn-backup`
  retention cross-reference in `docs/commands/add.md`. The fifth is a **named limit**, left open on
  purpose: the composition "the drift scan's `[]` lets the pre-flight's curated message win" is tested
  in two halves and argued at the join, because `tests/add.test.ts` mocks the installer file-wide.
- [`REVIEW.md`](REVIEW.md) also proposes **one** lesson for canon (fixtures that fabricate outputs their
  input does not contain). It is a proposal only — promotion is a separate human-gated
  `/pharn-dev-memory-promote` run.

## Rebase interaction (recorded, because it changed the increment)

The branch was rebased onto two commits that landed on `main` mid-run. `#132` was a CHANGELOG-only
overlap. **`#131` was not:** it made `findSymlinkComponent` **non-total** — a component below a
regular file now raises ENOTDIR — and documented where each of its callers stands. `collectDestDrift`
is a new caller and had no stance, so it acquired one: it wraps the walk and **skips** the rel, the
same terminal `readDiskState` gives `update`. That is load-bearing rather than cosmetic — `createBackup`
does **not** wrap its own walk and consumes exactly this set, so a non-directory component reaching it
would be fatal. Two tests pin it (dest-side and clone-side ancestors), `symlink-guard.ts`'s caller list
names the new caller, and `src/lib/symlink-guard.ts` was declared in the plan's `## Files` with the
setter re-run before it was touched. Both stage verdicts were then recomputed at base `4942006`.

## External review (Greptile) — one P1, confirmed and fixed

`Greptile Review` raised one **P1 / security** finding on `src/lib/dest-drift.ts`: symlinked
destinations were excluded from the backup set while the copy could still write through them.

It was **reproduced empirically** rather than argued, against node v24.13.1, because `cpSync`'s
destination-side behavior is not uniform:

| dest shape                    | measured `cpSync` behavior                              | data loss                     |
| ----------------------------- | ------------------------------------------------------- | ----------------------------- |
| leaf is a symlink             | link REPLACED by a regular file; target keeps its bytes | the user's link, silently     |
| capability ROOT is a symlink  | throws `ERR_FS_CP_DIR_TO_NON_DIR`, nothing written      | none                          |
| INTERMEDIATE dir is a symlink | **writes THROUGH it**                                   | **bytes outside the project** |

The third row confirms the finding, though by a different mechanism than the report described. It
also shows why a **skip** is worse than doing nothing there: the copy writes through the link anyway
while the backup that was supposed to protect the file silently omits it. Backing it up is not
available either — `createBackup` refuses a symlinked component by design, and `copyFileSync` would
save the link's TARGET rather than the link.

`scanDest` (renamed from `collectDestDrift`) therefore returns a **partition**: `drifted[]` to back
up, `unsafe[]` to refuse on. `add` refuses the whole install and names the offending component — the
same shape as its version and layout gates, and the same answer `update` reaches by classifying such
a path `unreadable`. An ENOTDIR walk stays a skip: `cpSync` throws on that tree by itself, and keeping
it out of the set is what keeps `createBackup`'s unwrapped walk unreachable.

Both stage verdicts were recomputed again after this fix.

**A second P1 followed, and is LABELLED rather than fixed here.** Greptile then raised the TOCTOU: a
component that becomes a symlink _between_ `scanDest` and `cpSync` is caught by neither, since the
copy's `filter` guards only the source. The finding is correct. Closing it needs a destination-side
guard inside the copy — `cpSync`'s filter receives `(src, dest)`, so refusing a symlinked dest there
would stop the descent at copy time — but that filter belongs to `installCapabilityDirs`, which is
**`init`'s installer too**, and this increment's plan turns on not changing it (that is what makes
"init's flow is byte-identical" true by construction). Widening scope mid-branch would also skip the
gate chain for a change to the shared write path.

So it is named where P0/P7 require: in `dest-drift.ts`'s header, in `docs/commands/add.md` as a
**Known limit**, and in the PR. What this increment closes is the case that actually occurs — a
symlink already present when `add` runs; what it does not close is a concurrent local attacker, a
threat `THREAT-MODEL.md` does not model (its Surface B is hostile REMOTE content). Selling the check
as a lock would be the disease; a follow-up increment is the honest route.

## What this file is not

The chain ran; the named floor verdicts are as shown. **This is NOT a judgment that the increment is
good or wise** — that is the human's call at the post-review gate. No `PHARN ✓ reviewed` seal is
applied here, and `/pharn-dev-ship` added no new floor primitive: every guarantee above belongs to a
sub-stage's own checker.
