# VERIFY — detect-skip-framework-caches

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | command                          | exit |
| -------------- | -------------------------------- | ---- |
| `test`         | `npm test`                       | 0    |
| `validate`     | `node .dev/floor/validate.mjs .` | 0    |
| `lint`         | `npm run lint`                   | 0    |
| `format:check` | `npm run format:check`           | 0    |
| `lint:md`      | `npm run lint:md`                | 0    |

`npm test` collected **748** vitest tests across 41 files, all passing — 90 more than the 658 at the
base commit, which is this increment's own additions: 60 classification-neutrality assertions
(15 `SKIP_DIRS` members × 4 ancestor contexts) + 15 per-member skip pins with paired positive
controls + 15 case-folding pins.

No `structural:*` gate is present: this feature ships no committed eval pair, exactly as
`/pharn-dev-regress` found none. Its absence from the map is correct, not a skipped check.

`validate` is GREEN at 0 capabilities checked — this increment adds no PHARN markdown capability, so
that gate is vacuously green and guarantees nothing about this feature. Stated so it is not read as
coverage it does not provide.

**Gate-set caveat (advisory, two clocks).** `check-verify.mjs` is generic over gate keys — it
computes PASS iff every value is 0 over whatever map this stage assembles. That the two style gates
(`format:check`, `lint:md`) are in the map is this stage's **advisory composition**; nothing floor-locks
them into the set. The verdict below is floor; the choice of what it ranged over is not.

## Verdict (FLOOR — `check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS.**

```json
{ "verdict": "PASS", "failing_gates": [] }
```

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates
alone. No verifier is authored to fill the slot (P7), so no untrusted verifier free-text exists in
this report and the taint boundary, while in place, carries nothing today.

## Honest residual (P0/P7)

Verified = **the named gates passed**. This is NOT a guarantee of correctness beyond what those gates
check — verifier concerns would be advisory help, not assurance, and there are none.

Two things this verdict specifically does **not** cover, both already named upstream:

- The increment's headline mechanism — that a skipped subtree costs **zero** walk budget — rests on
  the skip `continue` preceding `budget -= 1`, and **no gate here observes that ordering**. Every test
  uses a handful of fixture files, so the budget never nears `MAX_ENTRIES`; all 748 would still pass
  if the decrement moved above the skip. That claim is labeled **advisory** in `PLAN.md`'s guarantee
  audit for exactly this reason, and it is held instead by the manual e2e measurement of record
  (FAT `["lib"]` 188ms → `["spa"]` 1ms, with the planted-file negative control) plus code review.
- The six cache names added at the gate beyond the measured five carry no measurement — only the
  same per-member pins as every other member, which prove they are skipped, not that skipping them
  was warranted.
