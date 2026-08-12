# SHIP — trust-map-records-era

**Where the run ended: GATE 2** — the post-review human decision. Nothing was merged, committed, pushed,
or sealed.

## Stages run, in order

| # | Stage | Outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` — **GATE 1 passed**, human approved "as written", then re-approved a mid-run amendment (Q4) |
| 2 | `/pharn-dev-grill` | `GRILL.md` — advisory, gated nothing. 5 findings; F1/F3/F4/F5 folded into the text before writing |
| 3 | `/pharn-dev-build` | **Halted on first attempt** (floor denial), completed after the human applied the two protected files by hand |
| 4 | `/pharn-dev-regress` | `regression-report.json` — **halted once** on a scope breach, resolved by declaration, then completed |
| 5 | `/pharn-dev-verify` | `verify-report.json` — completed |
| 6 | `/pharn-dev-review` | `REVIEW.md` — completed. **GATE 2.** |

## Structural verdicts read, verbatim

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit `0`** (GREEN).
- **`/pharn-dev-regress` → `regression-report.json` `.verdict` = `"no-regressions"`** (exit 0).
  `regressions: []`, `pre_existing: ["tests"]`.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict` = `"PASS"`** (exit 0). `failing_gates: []`.
  Gates: `test` 0 · `validate` 0 · `lint` 0 · `format:check` 0 · `lint:md` 0.
- **Spec-hash gate (fix #4) — PASS**, re-verified after `main` moved: `sha256(ARCHITECTURE.md)` =
  `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`.
- **Header invariant:** the only changed `###` line is `1d.`, and the changed-header identifier set is
  `{1d.}` on **both** sides of the diff — no `§` identifier moved.

## Two halts worth recording (neither was routed around)

1. **`/pharn-dev-build` — floor denial on the two protected docs.** `protect-trusted-paths.cjs` denies
   agent writes to `LIMITS.md` / `THREAT-MODEL.md` unconditionally (`DEFAULT_PROTECTED` `:58`;
   `PHARN_PROTECTED` composes by **addition only** `:63`), so the writes-scope setter cannot unlock them —
   contrary to the build prompt's stated remedy. Resolved the sanctioned way: the corrected content was
   delivered as `*.UPDATED.md` side-by-side files and **a human moved them into place**. No hook bypass
   was attempted, including under direct repeated instruction to write the files anyway.
2. **`/pharn-dev-regress` — `scope` exit 1.** The loop's own `PLAN.md` / `GRILL.md` / `SHIP.md` were
   reported as escaping the plan's `## Files`; `check-regress scope` compares every changed path against
   the plan's list and has no concept of an artifact written by a **different stage under its own scope**.
   Resolved by **declaring** them (human decision at the halt), not by suppressing the check.

## Artifacts

- [`PLAN.md`](PLAN.md) · [`GRILL.md`](GRILL.md) · [`REGRESSION.md`](REGRESSION.md) ·
  [`VERIFY.md`](VERIFY.md) · [`REVIEW.md`](REVIEW.md) — findings cited, not restated (P4).

## Standing at GATE 2 — for the human

`REVIEW.md` returned **0 floor-gate findings, 5 advisory**. Two are worth a decision before merge:

- **`THREAT-MODEL.md:118`** — the new §4c writes `unrecorded`/`unverifiable` for a condition that
  deterministically yields only `unverifiable` (`update-decision.ts:101-102`). One-clause fix.
- **`LIMITS.md:51` (T3)** — deferring T3 was defensible before this increment and is weaker after it:
  §1c now denies what the corrected §4c asserts, inside the same trust map.

Open tickets: **T1** §1a `module.json` example · **T2** §1c legacy field names · **T3** (above) ·
**T4** §3c "modules" wording · **T5** the degit fetch-boundary facts (S3 — premises falsified, needs its
own verification pass) · **T6** answered **negative** (pharn-oss's copies are different documents and
carry none of these claims).

Also surfaced, not this increment's to fix: the floor's own `node --test` suite over 46 files is **RED on
`main`** (`3645fdf`), pre-existing and unrelated — `npm test` (vitest) is green.

---

Chain ran to completion; the named floor verdicts are as shown. This is **NOT** a judgment that the
increment is good or wise, and it is explicitly **not** a "shipped", an approval, or a `PHARN ✓ reviewed`
seal. Merge / fix / abandon is the human's call.
