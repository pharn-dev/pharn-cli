# SHIP — root-footprint-consolidation (advisory roll-up)

## Stages run, in order

1. `/pharn-dev-plan` → `PLAN.md`. GATE 1: approved ("Approve as written", Q1–Q6). Re-approved after the regress
   scope STOP with the escaped product paths added to `## Files`.
2. `/pharn-dev-grill` → `GRILL.md` (advisory: 8 concerns, 0 blocking-severity).
3. `/pharn-dev-build` → `npm run check` exit **0**; `npm run build` exit 0.
4. `/pharn-dev-regress` — first run: `check-regress.mjs scope` exit **1** (32 escaped paths; STOP, handed to the
   human). After re-approval: scope exit 0; verdict **`no-regressions`** (`regression-report.json`).
5. `/pharn-dev-verify` → **`PASS`** (`verify-report.json`; test/validate/lint/format:check/lint:md/typecheck all 0).
6. `/pharn-dev-review` → `REVIEW.md`: GREEN, 0 floor-gate findings; an adversarial round found 7 defects, all
   confirmed; 6 fixed in-scope + 1 cosmetic left. After the fixes, check/regress/verify were re-run: exit 0 /
   `no-regressions` / `PASS` (3209 tests; every touched `src/` file ≥ 91.66 % lines).

The run ended at **GATE 2**: the merge decision is the human's.

## Real-world check (Phargus, scratch copies only; nothing pushed)

Against a local pharn-oss tree built from `pharn-oss@origin/main` (`acb0ebb`) with `THREAT-MODEL.md` / `LIMITS.md`
moved under `pharn/` and `SKILLS_VERSION` 7.0.0, served as a codeload tarball to the real `runUpdate`/`runStatus`:

- **Phargus as it is:** its root `LIMITS.md` / `THREAT-MODEL.md` no longer match their records (Prettier rewrote
  their front matter quotes), and it already has unrecorded `pharn/LIMITS.md` / `pharn/THREAT-MODEL.md`. Outcome:
  both root docs **kept** (`keep-edited`, listed as orphans), the two `pharn/` copies **skipped** (`unrecorded`),
  the version bump withheld at 6.72.0; `.pharn/` scratch noticed; `.gitignore` hints `pharn/.run/`,
  `pharn/.backup/`. `status --strict` exits 1 because of those two pre-existing `pharn/` files — correct: pharn
  never overwrites bytes it cannot prove are its own. The brief's "both root docs gone, status clean" cannot hold
  for Phargus as it is without `--force`.
- **Phargus with the root docs restored to their recorded 6.72.0 bytes, the unrecorded `pharn/` copies removed and a
  `memory-bank/` added:** both root docs **deleted**, `memory-bank/` **moved** to `pharn/memory-bank/` (backed up to
  `pharn/.backup/<ts>/` first), records hold only the `pharn/` keys at 7.0.0, `status --strict` exit **0** (no
  drift; one unrelated pre-existing orphan, `pharn/floor/check-ship.mjs`), and the next `update` says "Already up
  to date". Root after: nothing of PHARN's but `.claude/`, `pharn/`, the two JSON files, the `.pharn/` scratch
  (notice only, by the brief) and the `.pharn-backup/` an older pharn left (never deleted).

## Correcting the record (falsified or imprecise claims in the brief)

- `:496`/`:538` are `src/lib/project-lock.ts` lines (`release`, `withProjectLock`), not `uninstall.ts`.
- A stale root key does not make `status` report the doc missing (drift never reads records); it makes every
  `update` re-open its early return via `findMissingInstalled`.
- pharn-oss is past `56e3989` / 6.73.2 (now 6.74.0); no 7.0.0 layout exists yet.
- "uninstall leaving no empty `pharn/`": uninstall always backs up the config into `pharn/.backup/`, so `pharn/`
  is never empty after a real uninstall; it is never left empty, and the leftover is named.
- `ARCHITECTURE.md` and `LIMITS.md` name none of the moved paths; only a new THREAT-MODEL residual was needed
  (`THREAT-MODEL.updated.md`, for the human to apply).
- Phargus: see above — its root docs are edited, so the acceptance outcome there is "kept", not "gone".

## Pointers

`PLAN.md`, `GRILL.md`, `REGRESSION.md`, `VERIFY.md`, `REVIEW.md`, `THREAT-MODEL.updated.md`.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise;
that is the human's call at the post-review gate.
