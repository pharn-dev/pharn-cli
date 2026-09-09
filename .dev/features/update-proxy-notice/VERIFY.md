# VERIFY — update-proxy-notice

Did the feature get built **correctly**? Two layers, kept separate: the **FLOOR** layer owns the
verdict (an exit-code threshold computed by `.dev/floor/check-verify.mjs`); the **ADVISORY** layer
only annotates.

## FLOOR layer — the gates that own the verdict

| gate           | exit | what it covers                                          |
| -------------- | ---- | ------------------------------------------------------- |
| `test`         | 0    | the hermetic vitest suite — 1175 tests, 56 files         |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — the structural floor       |
| `lint`         | 0    | eslint, `--max-warnings 0`                               |
| `format:check` | 0    | prettier over `src/**`, `tests/**`, `*.config.ts`        |
| `lint:md`      | 0    | markdownlint over `docs/**/*.md` + `*.md`                |
| `typecheck`    | 0    | `tsc --noEmit` over src **and** tests (two configs)      |

No `structural:*` gate: this increment ships no committed eval pair (a TypeScript increment, no
markdown Capability), so none is in the map — exactly as `/pharn-dev-regress` handles the same case.

**VERIFIED: floor gates PASS** — `verify-report.json` `.verdict` = `PASS`, `failing_gates` empty,
`check-verify.mjs` exit **0**.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op and contributes nothing to the
verdict. No verifier is authored speculatively (P7); the slot stays empty until a real one is
triggered.

## Mutation-check (ADVISORY evidence — not a gate)

The floor above says the suite is green. It does **not** say the suite would go red if the fix were
removed — and for this increment that distinction is the whole point, because the previous
assertion passed **because of** the bug. So the tests were mutation-checked by hand:

**Reverting `src/commands/update.ts` alone to `origin/main`, leaving `tests/update.test.ts` at
HEAD:**

- **5 failures, all of them mine, all inside `describe('proxy notice')`:**
  1. `warns before the SKILLS_VERSION fetch on the up-to-date early return, which still fetches` —
     the **inverted** case
  2. `warns before the SKILLS_VERSION fetch, not merely before the clone` — first-fetch order
  3. `warns before the fetch even when that fetch then fails` — the proxy-only failure path
  4. `warns even when the lock is held, because the version fetch already happened` — the
     grill-adopted lock-refusal case
  5. `warns exactly once on the up-to-date early return`
- **1170 passed, 55 of 56 files green** — no unrelated case moved.
- Restoring the file: **1175 / 1175 green**.

Three results are worth naming rather than burying, because they are the honest limits of the
suite:

- `warns before the clone` (the pre-existing case) stayed **green under the bug**. It was never
  wrong, only weak — it pinned the second fetch while the first went unguarded. That is why case 2
  above exists.
- `warns exactly once on the full update path` also stayed **green under the bug** — the two paths
  are mutually exclusive, so a count cannot distinguish them. This is precisely the P0 relabel
  carried from the `status` grill: "there is exactly one call site in the source" is **advisory**, not
  something a `log.warn` count can check.
- `stays silent when the config load refuses` / `stays silent when the TTY gate refuses` stayed green
  either way. They are over-reach guards — they pin that the hoist did **not** climb above the two
  promptless refusals — not bug detectors, and the plan labels them so.

This is orchestration evidence and is **advisory**: nothing on the floor re-runs it. It is recorded
because "the tests are green" and "the tests would catch the regression" are different claims, and
only the second one was in doubt.

## The honest residual (P0/P7)

**Verified = the named gates passed.** This is **NOT** a guarantee of correctness beyond what those
gates check — a defect no test, eval, rule, or lint covers is invisible to this verdict, and the
verifier layer that might notice it is advisory and, today, empty. Verifier concerns are advisory
help, not assurance.

Specifically out of reach of this verdict: whether the notice's **wording** helps a real proxy-only
user, and whether the source keeps **one** call site rather than two. Both rest on review, not the
floor.
