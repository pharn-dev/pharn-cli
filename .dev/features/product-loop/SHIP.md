# SHIP — product-loop (/pharn-dev-ship gated roll-up)

Advisory roll-up of the gated `/pharn-dev-ship` run for the `/pharn-loop` increment. This records **that
the chain ran and its floor verdicts** — it is **not** a "shipped" flag, an approval, or a
`PHARN ✓ reviewed` seal (P0).

## Stages run, in order, and where the run ended

`/pharn-dev-plan` → **[GATE 1: human approved]** → `/pharn-dev-grill` → `/pharn-dev-build` →
`/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → **ended at GATE 2 (post-review decision —
the human's)**. No RED-verdict STOP occurred; the run reached GATE 2.

## Structural verdicts read (verbatim — the only proceed/stop inputs, P5)

| stage                | verdict source                             | value read       | proceed? |
| -------------------- | ------------------------------------------ | ---------------- | -------- |
| `/pharn-dev-plan`    | its own approval halt (GATE 1)             | human approved   | yes      |
| `/pharn-dev-grill`   | advisory — no deterministic verdict        | 5 advisory conc  | yes      |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit code | `0` (GREEN, 35)  | yes      |
| `/pharn-dev-regress` | `regression-report.json` `.verdict`        | `no-regressions` | yes      |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`            | `PASS`           | yes      |
| `/pharn-dev-review`  | advisory — no structural verdict (GATE 2)  | GREEN, 0 block   | present  |

- **Build floor:** `validate.mjs` exit `0` — GREEN, 35 capabilities (unchanged; the 3 new files are in
  floor-ignored dirs).
- **Regress:** `no-regressions` — all outside gates (`tests` 626, `validate`, `structural:trust-fence`)
  green at both base (`843e74a`) and HEAD; `escaped: []` (no fix #7 scope breach). See `REGRESSION.md` for
  the capture-harness note (a zsh word-split artifact corrected via `xargs`).
- **Verify:** `PASS` — all six gates (`test`, `validate`, `lint`, `format:check`, `lint:md`,
  `structural:trust-fence`) exit 0; `verifiers: registered 0`. A first pass reddened `format:check` /
  `lint:md` on the new files; closed in-scope with the project formatter/linter + one manual fence edit
  (`VERIFY.md`), then all green.

## What landed (3 files, one axis, purely additive)

- `.claude/commands/pharn-loop.md` — the new **product** `/pharn-loop` command (bounded floor-gated loop;
  cites `/pharn-ship`'s gated front; iterates `build→regress→verify` under `check-loop.mjs`).
- `.dev/floor/check-loop.mjs` — the **Design-B** stop core (retryable-only): `CONTINUE` iff `INCOMPLETE ∧
regress clean ∧ iter<cap`; real red → `STOP_TERMINAL` (exit 4); cap → `STOP_CAP`; green → `STOP_GREEN`;
  bad input → `INCONCLUSIVE`. Generalizes `/pharn-ship` Step 2b (cap 1 → N).
- `.dev/floor/check-loop.test.mjs` — 20 hermetic tests (green). `check-ship.mjs` left byte-unchanged.

## Pointers (cite, do not restate — P4)

- `GRILL.md` — 5 advisory concerns (2 important-severity), all pre-build; none blocking.
- `REVIEW.md` — **GREEN**, 0 floor-gate findings; 2 advisory-minor + 1 lesson candidate (a build-time
  `npm run format` step, for a human-gated `/pharn-dev-memory-promote` to weigh against L9).
- `REGRESSION.md`, `VERIFY.md` — the machine `.verdict`s above, rendered for humans.

## Standing decision — the human's

The chain ran; the named floor verdicts are as shown, and the human approved the intent at GATE 1 — this is
**NOT** a judgment that the increment is good or wise; that is the human's call at the post-review gate
(merge / fix / abandon). `/pharn-dev-ship` does not merge, push, or seal.
