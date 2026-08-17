# VERIFY — dead-legacy-symbols

Verdict computed by `.dev/floor/check-verify.mjs`, **exit 0**.

## FLOOR layer — the gates that own the verdict

| gate | exit | |
| --- | --- | --- |
| `test` (`npm test` — vitest, 40 files / 734 tests) | 0 | ✅ |
| `validate` (`.dev/floor/validate.mjs .`) | 0 | ✅ |
| `lint` (eslint, `--max-warnings 0`) | 0 | ✅ |
| `format:check` (prettier) | 0 | ✅ |
| `lint:md` (markdownlint-cli2) | 0 | ✅ |

`failing_gates: []`

## ⚠️ Disclosed: the `test` gate was captured RED once, then green twice

This is reported in full rather than quietly retried, per the procedure the grill
pre-committed **before** the red appeared (`GRILL.md`, P6 finding) — the whole point of deciding
it in advance was to remove the temptation to improvise here.

| capture | context | `test` exit | result |
| --- | --- | --- | --- |
| **1** | immediately after `/pharn-dev-regress`'s 46-file `node --test` sweep | **1** | 40 files / **734 passed**, `fail 0` |
| 2 | isolated re-run | 0 | 734 passed |
| 3 | isolated re-run | 0 | 734 passed |
| 4 | the recorded capture (quiet machine, full gate set) | **0** | 734 passed |

**What the red was — and was not.** Capture 1's own output reports **every test passing** (`Tests
734 passed (734)`, zero `×` lines). No assertion failed. The nonzero exit accompanied a fully
green report, under contention from the `node --test` sweep that had just finished. It is the same
species as the two other load-sensitive results already on the record this run: the
`tests/lint-gate.test.ts` 5s timeout disclosed in `PLAN.md:12` (that file shells out to eslint per
test), and the `tests` gate red at **both** ends of `/pharn-dev-regress` where all 748 assertions
passed and all 46 files passed individually.

**Why capture 4 is the recorded one, stated plainly:** captures 2–4 agree, `/pharn-dev-build`'s own
floor (`npm run check`) was green before any of them, and capture 1's contended condition is
identifiable and reproducible in kind. I re-measured; I did not run the gate repeatedly and keep
the green one. **This judgment is mine and it is ADVISORY** — it is exactly the kind of call the
floor cannot make, which is why it is surfaced here in full rather than buried in an exit code. The
raw first capture is preserved verbatim at `.pharn/pharn-dev-verify/results-capture1.json`. **If you
want the red treated as authoritative, the verdict flips to FAIL and the stage stops** — that call
is yours at GATE 2.

**Worth separating from this increment:** this repo's suite is load-sensitive in at least three
places, which makes red/green partly a function of machine contention rather than of code. That is
real maintenance debt, it is **pre-existing**, and it is **outside this increment's axis** — nothing
here touches it. Flagged for a future increment, not fixed by stealth.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`

**No verifiers registered — floor gates only.** Membership is a deterministic frontmatter read, not
a prose grep. Step 2 is a no-op; nothing annotates this report.

## Feature-specific signal (granularity, P7)

`test` / `validate` / `lint` / `format:check` / `lint:md` are **whole-repo** — PASS means the whole
repo is clean with this increment in it. This feature ships **no eval-actual pair**, so there is
**no `structural:*` gate** (absent from the map, exactly as the stage specifies). Its
feature-specific correctness signal is therefore its own `*.test.ts` files collected by `npm test`:
the rewritten `assertSafeString` ladder (4 pins now against `CAPABILITY_NAME_RE`), `row`'s
surviving pins, and the `stackAnswers` / `installedSkills` P7 pass-through pin.

---

**VERIFIED: floor gates PASS.**

Verified = the named gates passed. This is **NOT** a guarantee of correctness beyond what those
gates check — a defect no test, eval, rule, or lint covers is invisible to this verdict, and the
verifier layer that might have noticed one is advisory and, today, empty. In particular, **nothing
here verifies the `LIMITS.md:30` follow-up**, which no gate in this repo can see.
