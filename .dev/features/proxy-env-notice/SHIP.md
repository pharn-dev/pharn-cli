# SHIP — proxy-env-notice

A `/pharn-dev-ship` roll-up across **three passes**: the initial gated chain, a fix pass driven by
`/pharn-dev-review`'s blocking finding, and a third closing the two advisories that pass 2 recorded as
out of scope. It records **that the chain ran and its floor verdicts** —
nothing more.

## Stages

| # | stage | pass 1 verdict | pass 2 verdict | source |
| - | ----- | -------------- | -------------- | ------ |
| 1 | `/pharn-dev-plan` | GATE 1 approved | plan **amended**, 9 → 15 declared files | human approval |
| 2 | `/pharn-dev-grill` | 7 concerns (advisory) | — (not re-run; advisory, gates nothing) | `GRILL.md` |
| 3 | `/pharn-dev-build` | `validate` exit **0** | `validate` exit **0** | floor exit code |
| 4 | `/pharn-dev-regress` | **`no-regressions`** | **`no-regressions`** | `regression-report.json` `.verdict` |
| 5 | `/pharn-dev-verify` | **`PASS`** | **`PASS`** | `verify-report.json` `.verdict` |
| 6 | `/pharn-dev-review` | **BLOCKED — 1 floor-gate finding** | **GREEN — 0 floor-gate findings** | `REVIEW.md` |

Pass 3 (amendment 2) re-ran build → regress → verify → review against an expanded scope of **17**
declared files: `validate` exit **0**, **`no-regressions`**, **`PASS`**, review **GREEN with 0 open
advisories**.

**Where the run ended: GATE 2** — the post-review human decision. No stage returned a non-GREEN floor
verdict in either pass.

## The structural verdicts, verbatim (pass 2)

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit `0`.** All six repo gates green
  independently: `format:check`, `lint`, `lint:md`, `typecheck`, `test` **807/807 across 43 files**,
  `build`.
- **`/pharn-dev-regress` → `"verdict": "no-regressions"`**, `regressions[]` and `pre_existing[]` both
  empty. Gates `tests` 0→0, `validate` 0→0 against base `03160c8`. `scope` exit 0 with
  `inside == declared` — **15 files each**.
- **`/pharn-dev-verify` → `"verdict": "PASS"`**, `failing_gates[]` empty, `verifiers.registered: 0`.

## Why there was a second pass

Every floor verdict in pass 1 was green **with a false sentence in the tree**. `/pharn-dev-review`
caught it: `docs/troubleshooting.md` claimed `degit@3.6.6` was "the version this release resolves."
Re-measured, that was wrong *today*, not merely fragile — degit's latest is **3.8.0**, `package.json`
declares `^3.6.1`, `files: ["dist"]` ships no lockfile, and `scripts/build.mjs:15` marks degit
`external`, so a fresh install resolves 3.8.0.

No deterministic check in this repo compares a doc sentence to a dependency range, which is
`/pharn-dev-verify`'s named residual behaving exactly as documented — "verified = the named gates
passed," never "the feature is correct."

The fix replaced the claim with a mechanism: all nine published versions in the declared range were
swept, they became `MEASURED_DEGIT_VERSIONS`, and the confident wording is now gated on a runtime
version read. A tripwire test re-derives the claim from the installed bytes each run — **verified to
be a real tripwire** by mutating the expected list and observing RED.

## Every review finding, and its disposition

| # | principle | run-1 severity | disposition |
| - | --------- | -------------- | ----------- |
| 1 | P0 | **blocking** | **Fixed** — false pin claim removed; claim now an enum membership test |
| 2 | P0 | important | **Fixed** — unhedged message gated on a measured version |
| 3 | P1 | important | **Fixed** — wiring tests at all five call sites + `--no-drift` silence |
| 4 | P5 | minor | **Fixed** — POSIX casing hole closed; the notice names the variant found |
| 5 | P2 | minor | **Fixed** — length bound + no-echo now tested |
| 6 | P3 | minor | **Fixed** — presentation split into `proxy-env-format.ts` |
| 7 | P6 | minor | **Fixed** — `FACT-TABLE.md` H5 corrected |
| 8 | P0 | minor | **Fixed (pass 3)** — `repo.ts`'s degit claims re-measured at 3.8.0 and re-scoped to the range |
| 9 | P7 | minor | **Fixed (pass 3)** — lockfile bumped to 3.8.0; published range deliberately unchanged |

**Nine findings raised across three review passes, nine addressed.**

## Self-inflicted problems this run produced and corrected — recorded, not smoothed over

1. **`/pharn-dev-regress` `scope` exited 1** on three "escapes", each traced to its author (the plan
   and grill stages' own declared `writes:`, plus a pre-existing staged `.gitignore`). Not a build escape.
2. **A false `tests = 1` at both ends** — a zsh word-splitting bug in the stage's own harness. Would
   have been reported as `pre_existing`, the label under which a self-inflicted red goes unexamined.
3. **The scope setter silently scoped 9 of 15 paths** after the plan amendment, because `**+**` markers
   broke its `isPathItem` pattern. The **plan format was corrected to match the parser**, never the
   hook loosened.
4. **`markdownlint-cli2 --fix` corrupted `FACT-TABLE.md`** — a file outside the `lint:md` gate's scope —
   turning `#331/#345/…` into a heading and flipping six bullets. Reverted to `HEAD` and re-applied
   without `--fix`.

## Pointers (cited, not restated — P4)

- [`PLAN.md`](PLAN.md) — approved, then amended after review. Picks Option 1 (both directions);
  **rejects Option 3** on two measured grounds.
- [`GRILL.md`](GRILL.md) — advisory, 7 concerns. Its finding 2 named the dependency-range axis
  **before** the build; it was not folded in, and it is what blocked run 1.
- [`REGRESSION.md`](REGRESSION.md) / [`regression-report.json`](regression-report.json)
- [`VERIFY.md`](VERIFY.md) / [`verify-report.json`](verify-report.json)
- [`REVIEW.md`](REVIEW.md) — run 2: GREEN, 2 advisory findings open by design. Read before deciding.

## What the chain still does NOT establish

- `MEASURED_DEGIT_VERSIONS` is re-derived from the installed bytes on every run — but only for the
  **one** version installed. It is now **3.8.0**, the version consumers resolve, which is the strongest
  form this check has taken; that the other eight were measured correctly still rests on a manual sweep
  no gate repeats.
- Nothing compares a doc sentence to `package.json`. The class of defect that blocked pass 1 would
  still be caught only by review.
- `repo.ts`'s cache / ref-tier / tar claims are re-measured but **not** tripwired — unlike the proxy
  read, no test re-derives them. They are labeled ADVISORY / provenance-bounded, which is honest, not
  guaranteed.
- The published range still permits a future degit past what was measured. That is handled by
  **degradation** (the notice hedges) rather than by pinning, which remains a maintainer's call.

---

**Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.**
