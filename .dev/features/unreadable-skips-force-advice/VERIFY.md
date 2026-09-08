# VERIFY — unreadable-skips-force-advice

## FLOOR layer (owns the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |

No `structural:*` gate: this increment ships no committed eval pair (it is a TypeScript report-wording
change, not a markdown capability), so none is in the map — the same way `/pharn-dev-regress` handles it.

**VERIFIED: floor gates PASS** (`.dev/floor/check-verify.mjs` exit 0, `failing_gates: []`).

The feature's own deterministic signal rides inside `test`: four new cases in `tests/update.test.ts`
covering unreadable-only unforced, unreadable-only forced, mixed unforced, and mixed forced. All four
were RED before the `reportOutcome` change and GREEN after, so the gate is not vacuous.

## ADVISORY layer (verifiers)

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` —
**no verifiers registered; floor gates only.** Step 2 is a no-op and nothing advisory reached the
verdict (the helper's only input is the gate→exit-code map; it cannot receive a finding).

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates
check — verifier concerns would be advisory help, not assurance, and today there are none. A defect no
test, lint rule, or structural check covers is invisible to this verdict.

One named limit specific to this increment: the two closing lines of the new unreadable advice are
byte-identical *by hand* to `src/commands/status.ts`'s drift report. Nothing deterministic pins that
identity (P3 rightly forbids a command→command import), so it is an **advisory** property — raised as
a grill finding (`GRILL.md`, P0/important) and left standing.
