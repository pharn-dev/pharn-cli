# SHIP — race-condition-lens (advisory roll-up; ends at the human gate)

`/pharn-dev-ship` (gated mode, **no `--loop`**) ran the build loop in order. It adds **no floor primitive** — every
verdict below belongs to a sub-stage. This roll-up records **that the chain ran and its floor verdicts**; it is
**not** a "shipped", an approval, or a seal.

## Stages run, in order — ended at GATE 2 (post-review human decision)

| stage                | outcome                 | structural verdict read (verbatim)                                       |
| -------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `/pharn-dev-plan`    | GATE 1 — **approved**   | human approved "as written" (membership-only floor; one hostile eval)    |
| `/pharn-dev-grill`   | advisory, proceeded     | no deterministic verdict (advisory by design) — see `GRILL.md`           |
| `/pharn-dev-build`   | proceeded               | `validate.mjs` exit **0** (GREEN — 32 capabilities, 31 → 32)             |
| `/pharn-dev-regress` | proceeded               | `regression-report.json` `.verdict` = **`no-regressions`**               |
| `/pharn-dev-verify`  | proceeded               | `verify-report.json` `.verdict` = **`PASS`** (5/5 gates exit 0)          |
| `/pharn-dev-review`  | GATE 2 — **presenting** | no structural verdict (advisory; LLM severity ≠ floor) — see `REVIEW.md` |

**Where the run ended:** **GATE 2** — the chain reached `/pharn-dev-review`. `/pharn-dev-ship` **presents**; it does not
merge, push, commit, or seal.

## The structural verdicts read (the only floor-grade content of this run)

- **`/pharn-dev-build` → `validate` exit `0`** (GREEN — 32 capabilities). The membership floor: the new lens is a
  `role: lens` with required frontmatter, non-empty evals, and `enforces: [P2]` produced by ≥1 eval (fix #6).
- **`/pharn-dev-regress` → `.verdict = "no-regressions"`** (`check-regress.mjs` exit 0). All 3 outside gates
  (`tests`, `validate`, `structural:trust-fence`) GREEN at base `7cca07e` and at HEAD. (Honest note in
  `REGRESSION.md`: a first ad-hoc `node --test` list invocation flaked to exit 1 at base **and** head — a
  `pre_existing`-class, never a regression — and was re-captured with canonical `npm test` → 0/0.)
- **`/pharn-dev-verify` → `.verdict = "PASS"`** (`check-verify.mjs` exit 0). Gates `test` / `validate` / `lint` /
  `format:check` / `lint:md` all exit 0; no `structural:*` gate (the feature ships no committed eval-actual —
  matching off-by-one). Honest note in `VERIFY.md`: the two style gates initially FAILED on the increment's own
  markdown (L9), fixed **mechanically** (`prettier --write` + `markdownlint --fix`); prettier shifted the fixture's
  racy write 19 → 20, so the eval's `file_resolves` + expected-MD line refs were re-pinned and re-confirmed, then
  all 5 gates re-ran to a true PASS.

## Pointers (cited, not restated — P4)

- **`REVIEW.md`** — the 4 advisory lenses (L-floor/P0, L-eval/P1, L-trust/P2, L-axis/P3). Verdict: **GREEN**, 0
  floor-gate (blocking) findings; 1 minor advisory (line-pinned `file_resolves` fragility, demonstrated this build)
  - 1 **proposed lesson** for `/pharn-dev-memory-promote` (prettier-canonicalize fixtures before pinning eval line
    numbers). The lesson is a **candidate only** — the human decides via a separate gated run; the model never
    self-promotes.
- **`GRILL.md`** — advisory interrogation (2 important tightenings, both folded into the built lens: the P7 roadmap
  trigger; the "assert exit codes" honesty about the deferred runner / hand-built actual; + 2 minor notes).

## Standing decision — the human's, at GATE 2

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise;
that is the human's call at the post-review gate.** `/pharn-dev-ship` did not merge, push, or apply the
`PHARN ✓ reviewed` seal. Next step is the human's: **merge / fix / abandon.**
