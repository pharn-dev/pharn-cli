# GRILL — symlink-guard-core

Plan under interrogation: `.dev/features/symlink-guard-core/PLAN.md` (`trust: untrusted` to this
stage). **Spec-hash check: MATCH** — recomputed `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, identical to the plan's
`spec_content_hash` (`PLAN.md:3`). No spec drift to surface; `/pharn-dev-build`'s floor-gate remains
the place drift actually blocks (fix #4).

**Griller discovery (FLOOR — enum membership):** `node .dev/floor/count-grillers.mjs .` →
`{"registered":0,"grillers":[]}`. No `role: griller` capability is installed in this repo, so the
pluggable griller slot contributes nothing this run and the inline axes (Step 2) carry the whole
interrogation. Stated so the empty slot is not mistaken for "the grillers found nothing."

Contracts read this run to ground the interrogation: `pharn-contracts/finding-shape.md`,
`pharn-contracts/eval-format.md`.

---

## Findings

### Axis: P1 — eval coverage / test surface

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: blocking
  file: '.dev/features/symlink-guard-core/PLAN.md:88'
  problem: 'The plan relocates toPosix into the security-sensitive validate.ts as a public export but plans no direct test for it, and its whitelist omits tests/validate.test.ts — so a function that currently has zero direct tests becomes part of validate.ts''s exported surface still untested.'
  evidence: '"`src/lib/validate.ts` — **one pure additive export**: `toPosix` relocated here (OQ2 resolution (a)); stays fs-free"'
```

Grounding (measured this run, not from memory): `grep -rn "toPosix" tests/` → **zero hits**. Today
`toPosix` is exercised only transitively through `collectExpectedInstallPaths`. Relocating it to
`validate.ts` — the file `CLAUDE.md:58` labels "security-sensitive" and whose invariants it tells the
reader to preserve — makes it a public lexical-path primitive sitting beside `safeJoin`, which *is*
directly tested. Its own branches (the `split(sep).join('/')` normalization and the
`.replace(/\/+$/, '')` trailing-slash strip) would remain unpinned. The plan's own P1 framing
("tests are the spec") argues against its own whitelist here.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/symlink-guard-core/PLAN.md:189'
  problem: 'The plan claims the two adapter messages will be pinned "byte-exact" via toThrow, but in the installed vitest a string argument to toThrow is a SUBSTRING test, so the planned assertion cannot deliver the byte-exactness the PR''s headline invariant rests on.'
  evidence: '"**the two adapter messages, byte-exact** (OQ4 → pin), via the public `createBackup` / `applyWrites` entries"'
```

Grounding: `node_modules/@vitest/expect/dist/index.js:1295` —
`typeof expected === "string" ? actual.includes(expected) : actual.match(expected)`. So
`.toThrow('Cannot back up a.md: a is a symlink.')` passes against
`'WRAPPED: Cannot back up a.md: a is a symlink. — extra'`. The OQ4 decision (pin the messages) is
sound; **the instrument named for it is not**. To actually pin bytes the build must assert on the
message itself — e.g. catch and `expect(err.message).toBe(…)`, or `toThrow(/^…$/)` with the regex
metacharacters (`.`) escaped. Left as specified, the guarantee audit's upgrade of invariant 2 from
advisory to floor (`PLAN.md:207`) is **not earned**.

### Axis: P0 — guarantee-audit completeness

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/symlink-guard-core/PLAN.md:192'
  problem: 'The anti-fork pin''s claim is broader than what the instrument computes: matching the literal string "current = current ?" detects only a copy-paste fork that preserves that exact spelling, yet the guarantee audit attaches it to the wider claim that no fourth fork is reintroduced.'
  evidence: '"the accumulator idiom `current = current ?` occurs in exactly one `src/**` file, `symlink-guard.ts`"'
```

The reduction itself is real and I stand by adding the pin — a literal-string membership test over
`src/**` is deterministic, non-LLM, and matches the repo's existing `isTTY` inv-6 precedent
(`tests/init.test.ts:188`). The problem is the **width of the sentence bolted onto it**. A future
fork written as `current += '/' + segment`, `current = [current, segment].filter(Boolean).join('/')`,
or via `path.posix.join` walks the same components and sails past the pin. The honest claim is *"no
copy-paste fork preserving the accumulator spelling"* — narrower, still worth having. This is exactly
the P0 disease in miniature: a genuine floor primitive quietly asked to carry a guarantee one size
too large. Recommend the build narrow the wording in the guarantee audit and in the test's own
comment, so the next reader is not misled about what the green pin proves.

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/symlink-guard-core/PLAN.md:192'
  problem: 'The anti-fork pin couples a passing test to a formatting-sensitive source spelling without saying so, so a prettier or lint rule change that reflows the accumulator line would fail the suite for a reason unrelated to any fork.'
  evidence: '"⚠️ **Consequence the build must respect:** the core''s body must keep that exact accumulator spelling, since the pin matches it literally."'
```

The plan does flag the consequence for the build (credit where due), but not the maintenance
liability it creates. Worth one sentence in the test's comment naming the trade deliberately.

### Axis: P1 / P4 — contract citation

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/symlink-guard-core/PLAN.md:175'
  problem: 'The section is headed "Evals to write (P1)" but lists vitest cases, never stating that eval-format.md''s structural[]/semantic[] split does not apply because this increment adds no Capability and no evals/ files — leaving a reader to expect an eval artifact the plan will not produce.'
  evidence: '"## Evals to write (P1)"'
```

`pharn-contracts/eval-format.md` governs the Capability `{case, expected}` pair and its
`structural[]` / `semantic[]` partition. This increment adds no Capability, so the correct answer is
"not applicable" — but the plan should **say** that rather than leave the heading to imply
conformance. Note the substantive requirement is met: every listed case is deterministic and
none is routed through an LLM judge, so nothing is being laundered.

### Axis: P3 — one axis of change

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/symlink-guard-core/PLAN.md:262'
  problem: 'The plan asserts moving toPosix into validate.ts is "P3-cleanest" without arguing the counter — that validate.ts''s stated axis is VALIDATION of untrusted input while toPosix performs normalization, which is a different verb.'
  evidence: '"(a) move `toPosix` to `validate.ts` (P3-cleanest: purely lexical, sits beside `safeJoin`, already imports `sep`)"'
```

I judge the decision **defensible and still the best of the three** — `safeJoin` already establishes
that validate.ts owns lexical path handling, and P3's test is "what forces this file to change", to
which both answer "the lexical path rules". But P3 is this repo's sharpest rule and the plan asserts
rather than argues. One sentence would close it. Flagging my own reasoning here, not just the prose.

### Axis: P7 — honest scope

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/symlink-guard-core/PLAN.md:249'
  problem: 'The increment grew past the originating build prompt''s declared whitelist — validate.ts plus two new test concerns (the anti-fork pin, the message pins) — and while each was explicitly chosen by the human at HALT 1, the plan does not state that the scope now exceeds the prompt it cites as its source.'
  evidence: '"OQ2 → **(a) move `toPosix` to `validate.ts`** (adds `validate.ts` to the whitelist for one pure additive export)"'
```

Not a violation: the `toPosix` move is **forced** by the circular import (so it is triggered by a
real, measured need, not speculation), and OQ3/OQ4 were human decisions at the gate — P7 forbids
*speculative* additions, not human-chosen ones. Surfaced only so the scope delta between the build
prompt and the approved plan is explicit in the record rather than discovered at review.

### Axis: build-mechanics (no principle — a concrete break the plan would hit)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: blocking
  file: '.dev/features/symlink-guard-core/PLAN.md:87'
  problem: 'Deleting toPosix from install-manifest.ts orphans its `sep` import, which under eslint --max-warnings 0 fails the lint gate — a red `npm run check` the plan does not anticipate in its file-level description.'
  evidence: '"delete the private walker **and its private `toPosix`** (now imported from `validate.ts`, per OQ2)"'
```

Grounding: `grep -n "sep" src/lib/install-manifest.ts` → exactly two hits, the import at `:2`
(`import { join, resolve, sep } from 'node:path'`) and the sole use at `:58`, inside `toPosix`.
Once `toPosix` leaves, `sep` is unused. `npm run lint` is `eslint … --max-warnings 0`, so **any**
warning fails, and `npm run check` fails with it. The fix is trivial (narrow the import to
`{ join, resolve }`) but it must be *in* the diff; it is listed here so `/pharn-dev-build` does not
discover it as a mystery red floor. `join` and `resolve` both remain used.

---

## Prose summary

The plan is unusually well-grounded on the axes this stage exists to test: every §0 receipt was
re-verified against live bytes rather than inherited from the build prompt, the base-commit drift
(`e097adb` → `2cd061d`) is disclosed instead of papered over, the `isSymbolicLink` sweep is
untruncated with all 11 hits classified (six more than the prompt anticipated), and the trust and
determinism audits are concrete rather than ceremonial. Two of its strongest moves are things the
originating prompt got wrong and the plan corrected: the circular-import problem in `toPosix`, and
the measurement that no existing test pins either adapter message.

The concerns that matter are three, and two are mechanical:

1. **The message pin cannot do what it claims** (P1, important). `toThrow(string)` is a substring
   test in the installed vitest — verified in `@vitest/expect` source, not assumed. The OQ4 decision
   is right; the named instrument is wrong. Unfixed, the plan's own upgrade of invariant 2 from
   advisory to floor is unearned — which is precisely the confusion this repo exists to prevent, so
   it should not survive into the build.
2. **`sep` becomes an orphan import** (blocking, mechanical). A one-token fix, but it turns
   `npm run check` red if the build does not carry it.
3. **`toPosix` lands in validate.ts untested** (blocking, P1). The plan's whitelist has no
   `tests/validate.test.ts`, so a newly-public primitive in the file the docs call security-sensitive
   would ship with zero direct coverage. Either add the file to the whitelist or pin `toPosix`'s two
   branches inside `tests/symlink-guard.test.ts`.

The anti-fork finding is the one I would most want the human to weigh, because it is the plan
committing a small version of the disease it is otherwise scrupulous about: the pin is a real floor
primitive, but the sentence attached to it ("no fourth fork is reintroduced") is wider than what a
literal-string match can prove. Narrowing the wording costs nothing and keeps the record honest.

Nothing here suggests the increment is wrong or should not proceed. No hostile or
instruction-shaped content was found in the plan (P2); its free-text is quoted above as DATA and was
not treated as direction to this stage.

---

**ADVISORY VERDICT: 8 concerns raised (3 blocking-severity, 2 important, 3 minor) — for the human to
weigh before `/pharn-dev-build`.**

This grill-log is **advisory end-to-end and gates nothing** (fix #3). The severity assignments above
are LLM-assigned and therefore advisory, per `finding-shape.md`; only the spec-hash comparison and
the griller-membership count in the header are floor-grade computations, and neither blocks here. The
deterministic backstops stay where they are: `/pharn-dev-build`'s spec-hash floor-gate and its
unresolved-open-questions check, plus `.dev/floor/validate.mjs`. Nothing in this file constitutes
"grill passed" or any judgment that the plan is sound — that is the human's call.
