# SHIP — degit-fetch-boundary-truth (T5)

## Which stages ran

| Stage | Ran? | Structural verdict read |
| --- | --- | --- |
| Phase A discovery (fact table) | yes | not a floor stage — evidence in `FACT-TABLE.md` |
| `/pharn-dev-plan` | yes | spec hash pinned `bca940a5…d3c4e` |
| **GATE 1** (plan approval) | **implicit — a deviation** | see below |
| `/pharn-dev-grill` | yes (**retrospective** — a second deviation) | advisory; gates nothing |
| `/pharn-dev-build` | yes | `npm run check` **GREEN** |
| `/pharn-dev-regress` | yes | `regression-report.json` `.verdict` = **`no-regressions`** |
| `/pharn-dev-verify` | yes | `verify-report.json` `.verdict` = **`PASS`** |
| `/pharn-dev-review` | yes | no structural verdict by design (prose only) |
| **GATE 2** | **reached — standing** | the human decides merge / fix / abandon |

### Two ordering deviations, recorded not smoothed

1. **GATE 1 was not a clean halt.** `/pharn-dev-plan`'s approval halt was never separately presented;
   the human's standing "go" was treated as approval and plan+build ran in one continued turn.
2. **`/pharn-dev-grill` ran after `/pharn-dev-build`, not before.** A retrospective grill cannot do the
   one thing a grill exists to do — change the plan before it executes. Three of its six findings
   (G1, G2, G3) had already materialized by the time it was written.

A third correction happened *inside* `/pharn-dev-review`: the first review pass ran four **invented**
lenses instead of this repo's four (`L-floor`/`L-eval`/`L-trust`/`L-axis`). The lens set is not the
reviewer's to choose. That pass was discarded as a lens structure and re-run correctly; its factual
output was retained only as evidence.

## Floor verdicts, verbatim

- **`/pharn-dev-build`** → `npm run check` exit **0**. prettier clean · eslint clean (`--max-warnings 0`)
  · `tsc --noEmit` clean on both configs · **vitest 41 files / 755 tests passed**. `lint:md` 0 issues.
- **`/pharn-dev-regress`** → `.verdict` = **`no-regressions`**. `regressions[]` empty;
  `pre_existing[]` = `["tests"]` (the 46-file floor `node --test` gate was **already RED at base**
  `45c4be8`, measured in a clean worktree — same pre-existing RED #93 recorded). `validate` 0 at both
  base and head. Scope check `escaped: []` after declaring two paths (see `REGRESSION.md`).
- **`/pharn-dev-verify`** → `.verdict` = **`PASS`**, `failing_gates: []`, 0 verifiers registered (P7).

Two increment-specific mechanical instruments, both **0**: non-comment changed lines in
`src/lib/repo.ts`, and changed `##`/`###` header lines in `THREAT-MODEL.md` (header count 7 ↔ 7).

## Correction pass (second build round)

`/pharn-dev-review`'s three blocking findings were **fixed on this branch**, not deferred. The
correction pass touched `THREAT-MODEL.UPDATED.md` (a second handoff), `LIMITS.UPDATED.md` (a new
handoff — `LIMITS.md` is also `DEFAULT_PROTECTED`), `docs/troubleshooting.md`, `src/lib/repo.ts`
comments, and `CHANGELOG.md`; issue **#99** was amended for the Windows error. Full
finding-by-finding disposition table in `REVIEW.md`. Floor re-run after the fix:

- `/pharn-dev-regress` → **`no-regressions`** (unchanged; `pre_existing: ["tests"]`)
- `/pharn-dev-verify` → **`PASS`**, `failing_gates: []`
- both handoff header-immutability instruments → **0 / 0**; `repo.ts` comments-only → **0**
- `npm run check` GREEN · `lint:md` 0 issues across 25 files

Net direction of the correction: the text now claims **less** about the tar guards (they contain
traversal but do not reject malformed entries, and tripping the ratio cap degrades to `git clone`)
and **more** about the cache (a poisoned `map.json` can decide which commit pharn believes it
fetched). Both moves follow the evidence.

## `/pharn-dev-review` outcome — 3 blocking findings, all now resolved

`/pharn-dev-review` has **no** structural verdict and `/pharn-dev-ship` does not invent one. Its
content is presented for the human, not computed into a proceed/stop:

- **floor-gate (blocking): F1, F2, F3** — the increment's "Claimed upward" tar-guard bullet asserts a
  `TAR_ENTRY_INVALID` rejection that **does not exist** in degit's configuration (no `strict`, no
  `onwarn` → recoverable warn, entry dropped, extraction succeeds); the guards' effect is **inverted**
  on the decisive axis (a tripped guard routes to `git clone`, which has none of them); and the §3
  mitigation table asserts `maxDecompressionRatio` "bounds a compression bomb" in the row that admits
  no body cap.
- **advisory-gate:** F4, F6, F7, F10 plus eight accuracy items (A1–A8), including that the corrected
  "each tier falls through on an empty `catch{}`" sentence is **itself over-generalized** (tier 3
  throws), and that **issue #99 inherits an error** — `HTTPS_PROXY` *is* honored on Windows, where
  `process.env` is case-insensitive.

Five independent adversarial re-verifications ran against the installed `degit@3.6.6`; **three claims
survived unrefuted** (cache semantics, proxy, warn-relocation) and **two were refuted** (resolver
fall-through generality, tar-guard effect).

## HALT-1 decisions

- **H3 → option (a), docs-only.** The one-line `emitter.on('warn', …)` listener was declined; verified
  empirically that it would work. Still available as a separate increment.
- **H5 → ticket, not a change.** Filed as **issue #99**, and **amended** with the Windows correction
  (`process.env` is case-insensitive on win32, so `HTTPS_PROXY` *is* honored there).

## Artifacts

`PLAN.md` · `FACT-TABLE.md` (H1–H8, anchors pinned to chunk SHA-256s + live transcripts) · `GRILL.md`
· `REGRESSION.md` + `regression-report.json` · `VERIFY.md` + `verify-report.json` · `REVIEW.md`.
PR **#98**; issue **#99**. `THREAT-MODEL.md` was applied by the **human** from the
`THREAT-MODEL.UPDATED.md` handoff — the agent never wrote that protected path.

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate. The review's blocking findings
(F1/F2/F3) were corrected on this branch and the floor re-run green; **that the findings are resolved
is not itself a claim that the corrected prose is true** — prose accuracy is not floor-reducible, and
its backstop remains the evidence record plus the adversarial re-verification, both advisory.
