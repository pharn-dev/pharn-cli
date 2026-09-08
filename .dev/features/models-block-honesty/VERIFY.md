# VERIFY — models-block-honesty

**FLOOR layer** — `check-verify.mjs` over the six deterministic gates: every exit code 0 →
**`PASS`**, `failing_gates: []`.

**ADVISORY layer** — zero `role: verifier` capabilities exist (P7), so no verifier annotated this run.
A verifier finding could not have flipped the verdict anyway (fix #3).

**What the PASS does and does not mean.** It means the six gates are green with the new pins in place.
It does **not** mean the documentation is now honest — no floor primitive can judge prose. The only
mechanical evidence for the increment's actual claim is the two string pins, and one of them was
adversarially checked: reverting the outro to its old wording turns
`tests/init-archetype.test.ts` RED (`expected … not to contain 'Change per-stage routing anytime'`),
so the pin is a real test and not a tautology.
