# SHIP — commands-off-manifest (roll-up)

Thin, **advisory** roll-up of the `/pharn-dev-ship` chain. It records **that the chain ran and its floor
verdicts** — it is NOT a self-issued "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Increment

Migrate `add`/`list`/`remove`/`status`/`update` off the dead `manifest.json` onto the archetype/capability
model + `pharn/` layout, then delete the orphaned module subsystem — closing Fable's `install-modules.ts`
symlink-write finding.

## Stages that ran, in order

| stage | outcome |
| ----- | ------- |
| `/pharn-dev-plan` | PLAN.md written; **GATE 1** — human approved (legacy → hard-fail message; `safeJoin` → `validate.ts`; one increment). |
| `/pharn-dev-grill` | GRILL.md — advisory, 8 concerns; F3/F4/F6 folded into the plan pre-build (added `src/index.ts`, `pharn-config.ts` helper, `pharn-config.test.ts`). Gated nothing. |
| `/pharn-dev-build` | Files written per the amended `## Files`; floor GREEN. |
| `/pharn-dev-regress` | regression-report.json — **`no-regressions`**. |
| `/pharn-dev-verify` | verify-report.json — **`PASS`**. |
| `/pharn-dev-review` | REVIEW.md — **GREEN**, 0 blocking findings (4 advisory + 1 proposed lesson). |

**Where the run ended:** **GATE 2** — the post-review human decision (merge / fix / abandon).

## Structural verdicts read, verbatim

- **`/pharn-dev-build` → floor:** `npm run check` (the repo's CI floor per CLAUDE.md: format:check + lint +
  typecheck + test) = **exit 0 (GREEN)**, 378 tests. Reconciliation: `node .dev/floor/validate.mjs .` =
  **exit 1**, but exclusively from untracked `test-app/test-fixtures/red/skill.md` (a deliberately-red
  scratch fixture, pre-existing, unrelated to this increment); the `/pharn-dev-build` command states
  validate.mjs "gates nothing" for an increment adding no PHARN markdown capability (this one adds none).
  For pharn the deterministic build floor is `npm run check`, and it is GREEN.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`:** `"no-regressions"` (the outside
  `.mjs/.cjs` suite is RED at both base and HEAD — pre-existing, identical, no pass→fail flip; `validate`
  excluded as confounded by untracked `test-app/`; style gates skipped — config untouched).
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`:** `"PASS"` (gates `test`/`typecheck`/`lint`/
  `format:check`/`lint:md` all exit 0; `validate` excluded with the same documented reason; 0 verifiers
  registered).

## Pointers (cite, not restated — P4)

- Advisory review: `.dev/features/commands-off-manifest/REVIEW.md` (4 advisory findings — a P3 note on
  `safeJoin`'s home, a P7 dead-code note on `constitution.ts`/`format.ts:shortDescription`, a P4 stale
  `repo.ts` comment, and the validate.mjs/`npm run check` reconciliation — plus a proposed lesson on the
  `set-writes-scope` `## Files` one-path-per-bullet parser).
- Advisory grill: `.dev/features/commands-off-manifest/GRILL.md`.
- The migration also synced all editable docs (CLAUDE.md + 12 `docs/` files) to the capability model. The
  four **trusted** docs (CONSTITUTION/ARCHITECTURE/THREAT-MODEL/LIMITS) still describe the module/manifest
  model and are **human-only / hook-protected** — surfaced in PLAN.md for human reconciliation, not
  agent-edited.

## Honest standing line

The chain ran; the named floor verdicts are as shown (`npm run check` GREEN, regress `no-regressions`,
verify `PASS`, review GREEN) — this is **NOT** a judgment that the increment is good or wise; that is the
human's call at the post-review gate.
