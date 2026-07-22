# SHIP — npm-publish-metadata (roll-up)

Increment: **make the package publishable to npm as `pharn`** — PR1 / axis 1 of 2 (npm publish metadata). Version unchanged (0.2.0); no `src/` change. The OIDC release workflow (PR2) is a **separate** `/pharn-dev-ship` run.

## Which stages ran, in order, and where the run ended

`/pharn-dev-plan` → **[GATE 1: human approved]** → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → **ended at GATE 2 (this halt).** No RED-verdict STOP occurred.

## Structural floor verdicts read (verbatim)

| stage | verdict source | verdict |
| --- | --- | --- |
| build | `npm run check` exit code (build's own floor; `validate.mjs` vacuous — no md capability added) | **GREEN** (0) — 378/378 tests, format/lint/typecheck clean |
| regress | `.dev/features/npm-publish-metadata/regression-report.json` `.verdict` | **`no-regressions`** (exit 0) — `tests` gate pre_existing, `regressions: []` |
| verify | `.dev/features/npm-publish-metadata/verify-report.json` `.verdict` | **`PASS`** (exit 0) — gates `{test, validate, lint, format:check, lint:md}` all 0, `failing_gates: []` |

Advisory stages (no structural verdict): `/pharn-dev-grill` → `GRILL.md` (4 concerns, 1 important, none blocking); `/pharn-dev-review` → `REVIEW.md` (**GREEN**, 3 advisory findings). See those files — not restated here (P4).

## What landed (git diff — 4 files, no `src/`)

- `package.json` — `name` pharn-cli→**pharn**; `description`/`keywords`/`repository`/`bugs`/`homepage`; single `pharn` bin; `publishConfig{access:public, provenance:true}`; `scripts.prepack "npm run build"` + `scripts.prepublishOnly "npm run check"`; **`build` → clean-then-`tsc`**; `engines` kept `>=20`.
- `README.md` — Install section (`npx pharn@latest init`); npm badge → `pharn`; single-bin note.
- `CHANGELOG.md` — `[Unreleased]` rename entry.
- `CLAUDE.md` — rename note (single `pharn` bin).

Publish artifact verified: `npm pack --dry-run` → `pharn@0.2.0`, **34 files / 43.4 kB**, `prepack` clean-build fires, **zero orphans/junk** (`dist/**` + LICENSE + README + package.json only).

## Decisions for the human at GATE 2 (merge / fix / abandon)

1. **Ratify the `build` clean-then-`tsc` deviation** (`REVIEW.md` P7 finding). Beyond the plan's listed values, but surfaced by `npm pack --dry-run` shipping ~11 orphaned `dist/` modules from the deleted module system; needed for a correct manual-local first publish. Sound and recommended — but yours to ratify.
2. **README module-model staleness** — pre-existing P4 drift, deferred to a **fast-follow** per GATE 1 (`REVIEW.md` P4 finding). Confirm the fast-follow.
3. **Two proposed lesson candidates** in `REVIEW.md` (clean gitignored `dist/` before publish; floor scans polluted by `test-*/` scratch) — promote only via a separate human-gated `/pharn-dev-memory-promote` run, if you want them in canon.
4. **PR2** (OIDC `release.yml` + `docs/RELEASING.md`) — the second increment; run it after this lands (release.yml depends on this PR's `prepack`).

## Named repo-hygiene issue surfaced (out of scope, flagged not fixed)

The dev-loop floor scans that walk the whole tree (`validate.mjs .`, `count-grillers .`, `lens-scanner-map.test.mjs`) are polluted by gitignored `test-*/` scratch installs — false-RED at the repo root, absent from a fresh checkout/CI. Handled honestly at each stage (measured over tracked content / held constant across the regress baseline); flagged for the human, **not** fixed here.

---

**Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or apply any `PHARN ✓ reviewed` seal.
