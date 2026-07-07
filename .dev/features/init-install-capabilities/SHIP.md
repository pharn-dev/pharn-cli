# SHIP — init-install-capabilities (gated /pharn-dev-ship roll-up)

Advisory roll-up of one gated `/pharn-dev-ship` run. `/pharn-dev-ship` adds **no** floor primitive — every
verdict below belongs to a sub-stage; this file only records that the chain ran and its floor verdicts.

## Stages run, in order

`/pharn-dev-plan` → **[GATE 1: human approved as-written]** → `/pharn-dev-grill` → `/pharn-dev-build` →
`/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → **[GATE 2: this halt]**.

The run ended at **GATE 2** (post-review human decision) — not at a RED-verdict STOP. Every structural
floor verdict came back GREEN/PASS, so the chain proceeded stage to stage.

## Structural verdicts read (verbatim — the floor, each owned by its sub-stage)

| stage             | verdict source                                    | verdict            |
| ----------------- | ------------------------------------------------- | ------------------ |
| `/pharn-dev-build`    | `node .dev/floor/validate.mjs .` exit + `npm run check` | **GREEN** (validate exit 0, vacuous — TS increment; `npm run check` exit 0, 452 tests) |
| `/pharn-dev-regress`  | `regression-report.json` `.verdict`               | **`no-regressions`** |
| `/pharn-dev-verify`   | `verify-report.json` `.verdict`                   | **`PASS`** (6/6 gates exit 0) |

- **Build** floor: `validate.mjs` GREEN (0 capabilities — the increment adds no markdown capability), and
  the repo's real floor `npm run check` (format:check + lint + typecheck + test) exit 0.
- **Regress** (`.dev/features/init-install-capabilities/regression-report.json`): `regressions: []`; the
  `tests` gate is `pre_existing` (the floor/hook `node --test` suite is RED at the clean baseline SHA
  `43e16b3`, independent of this feature — RED→RED is not a flip). Base = HEAD (working-tree build).
- **Verify** (`.dev/features/init-install-capabilities/verify-report.json`): `PASS`; `failing_gates: []`;
  `verifiers: { registered: 0 }` (floor gates only).

## Advisory stages (gate nothing — pointers, not restated, P4)

- **`/pharn-dev-grill`** → `.dev/features/init-install-capabilities/GRILL.md` — 9 concerns (4 important, 5 minor),
  advisory. Three actionable in-scope ones were folded into the build: `settings.json` overwrite guard,
  the `archetype-summary` P1 test, and verifying the live `SKILLS_VERSION` format (`1.0.0` — matches
  `VERSION_RE`).
- **`/pharn-dev-review`** → `.dev/features/init-install-capabilities/REVIEW.md` — verdict **GREEN** (no floor-gate
  blocking findings); 4 advisory findings (1 important: the archetype config shape is not understood by
  the sibling `add`/`update`/`remove`/`list`/`status` commands; 3 minor). See the file — not restated here.

## The standing decision is the human's

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push,
commit, or apply the `PHARN ✓ reviewed` seal. The changes remain an uncommitted working tree on `main`.
