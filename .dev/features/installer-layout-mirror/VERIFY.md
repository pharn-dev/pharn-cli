# VERIFY — installer-layout-mirror

**Verdict (FLOOR, `check-verify.mjs`):** `VERIFIED: floor gates PASS` — exit `0`, `failing_gates: []`.

## FLOOR gates (whole-repo, at HEAD with the feature present)

| gate           | exit | meaning |
| -------------- | ---- | ------- |
| `test`         | 0    | vitest suite green (**616/616**, incl. the new layout/install/capability-index/diff/status/remove/config tests for both layouts) |
| `validate`     | 0    | structural floor GREEN (no PHARN markdown capability added; vacuously green) |
| `lint`         | 0    | eslint clean — no unused constants left after the resolver split |
| `format:check` | 0    | prettier clean, whole-repo |
| `lint:md`      | 0    | markdownlint clean, whole-repo |

No `structural:*` gate — this increment ships no committed eval pair (it is CLI product code, not a Capability). The feature's correctness signal is its own vitest coverage collected by `test`.

## What the new tests pin (P1)

- `detectLayout` keys on the specific `pharn/pharn-contracts` marker — pharn/flat detection, plus a **no-false-positive** case (bare `pharn/` → flat) and empty-dir → flat.
- `installCapabilities` mirrors a `pharn/` clone under `pharn/`, **drops** THREAT-MODEL/LIMITS, keeps `.claude/*` at root, and records `layout: pharn`; a flat clone still installs flat and records `layout: flat` (the P7 regression guard).
- `diffInstalledCapabilities` compares at the recorded layout's paths (pharn happy-path + a cross-layout graceful-degradation case); `status` passes the recorded layout through; `remove` deletes the capability at the layout's subtree (flat + pharn).
- `pharn-config` round-trips the additive `layout` field, loads a legacy config without it (P7), and drops a garbage value.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor gates only.**

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance, and none exist today. Notably out of scope of what the floor can see: the `pharn/` path set encodes PR #86's **current, unmerged** layout (GRILL.md finding P7) — the tests prove the CLI mirrors *that* shape, not that #86 will merge unchanged; and `add`'s cross-layout edge (installing from a clone whose layout differs from the project's) is a documented follow-up, not covered here.
