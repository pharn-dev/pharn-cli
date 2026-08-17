# VERIFY — symlink-guard-core

Feature: `symlink-guard-core` (plan `.dev/features/symlink-guard-core/PLAN.md`, spec pinned at
`bca940a5…`). Run at HEAD, in the working tree with the increment present.

## FLOOR layer — the deterministic gates (this OWNS the verdict)

| gate           | exit | what it covers                                                       |
| -------------- | ---- | -------------------------------------------------------------------- |
| `test`         | 0    | the hermetic vitest suite — **41 files / 754 tests**, incl. this increment's new `tests/symlink-guard.test.ts` and the `toPosix` pins added to `tests/validate.test.ts` |
| `validate`     | 0    | `.dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked` |
| `lint`         | 0    | `eslint src tests scripts --max-warnings 0`                          |
| `format:check` | 0    | prettier, whole-repo (L9)                                            |
| `lint:md`      | 0    | markdownlint-cli2 over `docs/**/*.md` + `*.md`, whole-repo (L9)      |

**No `structural:*` gate:** this increment ships no committed eval pair (it adds no Capability and no
`evals/` artifact), so by the membership convention there is no such gate — absent from the map rather
than passed vacuously.

`validate` is **vacuously green** here in the honest sense: it reports `0 capabilities checked`,
because this repo installs no markdown capability. It gates nothing about this increment's TypeScript;
the real feature-specific signal is the `test` gate, which collects the increment's own new pins.

**Gate-set composition is ADVISORY orchestration (two clocks).** `check-verify.mjs` is generic over
gate keys — it computes `PASS iff every gate exit 0` over whatever map this stage assembles. That the
two style gates are *in* the map is this command's composition (L9's remedy lives in this
orchestration layer), not a floor-locked fact.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict below is the floor
gates alone. No verifier free-text was produced, so no untrusted `problem` / `evidence` entered this
report this run (the P2 boundary is in place for when one lands). Per P7 none was authored
speculatively.

## Verdict (FLOOR — `check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.**

`verdict: "PASS"`, `failing_gates: []`.

**Honest residual (P0/P7):** verified = **the named gates passed**; this is NOT a guarantee of
correctness beyond what those gates check — verifier concerns would be advisory help, not assurance,
and today there are none. Two specific limits worth the human's eye, since they bound what this PASS
means for *this* increment:

- The refactor's headline claim is byte-preserved behavior. What the suite actually pins is the two
  adapter messages (now asserted on `.message` with `toBe`, so genuinely byte-exact) plus the 45
  pre-existing symlink mentions across the three untouched suites. Behavior the suite never encoded is
  as unverified after this change as before it.
- The anti-fork pin is green, but it proves only that **no copy-paste fork preserving the accumulator
  spelling** exists — not that no fourth walk could be written. That narrowing is recorded in the
  plan's guarantee audit and in the test's own comment, and it is the reading a green run here
  supports.

Separately, the `/pharn-dev-regress` stage recorded a **pre-existing** RED on the aggregate
`node --test` over the 46 `.dev/floor` / `.claude/hooks` suites (exit 1 at the base commit too). That
is a different runner from this stage's `test` gate (vitest, exit 0) and is untouched by this
increment, but it does mean the floor-suite side of the repo has a standing red that predates this
work. See `REGRESSION.md`.
