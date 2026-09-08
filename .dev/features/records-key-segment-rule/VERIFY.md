# VERIFY — records-key-segment-rule

Machine report: `.dev/features/records-key-segment-rule/verify-report.json`.

## FLOOR layer — the deterministic gates (these OWN the verdict)

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

Six gates — the full `npm run check` aggregate (`format:check` + `lint` + `typecheck` + `test`) plus
`lint:md` (the fifth CI gate, outside that aggregate) and `.dev/floor/validate.mjs`. This closes L9's
style-gate hole at verify: the increment touched `docs/reference/pharn-records.md`, so `lint:md` is
the gate that would have caught a markdown style miss here rather than at CI.

**No `structural:*` gate:** this feature ships no committed eval-actual pair. It is a TypeScript
increment, so its feature-specific correctness signal is its own `*.test.ts` files, collected by
`npm test` — 998 assertions across 49 files, including the 12 new cases this increment added
(7 reader positives incl. the original-key pin, 6 negatives, 1 round-trip, 1 end-to-end).

**VERIFIED: floor gates PASS.** (`check-verify.mjs` exit **0**, `"verdict": "PASS"`,
`failing_gates: []`.)

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates
alone, and no untrusted verifier free-text was produced or consumed in this run.

## The honest residual (P0/P7)

**Verified = the named gates passed.** This is NOT a guarantee of correctness beyond what those gates
check — verifier concerns are advisory help, not assurance, and today there are none.

Concretely, what the gates do and do not cover for this increment:

- **Covered deterministically:** that the relaxed key rule accepts the three benign shapes and rejects
  the six malformed ones; that a `..`-in-basename key round-trips through `writeRecords` → `readRecords`
  byte-identically; that a trailing-slash key is stored verbatim rather than normalized; and that an
  installed tree carrying such a file upgrades instead of degrading the run to `unverifiable`.
- **NOT covered:** whether the rule is the RIGHT rule. No gate here can tell that rejecting a `.`
  segment is wise, or that accepting a backslash-bearing key on posix is safe — those rest on the
  argument that a record key is compared and never joined, which is prose plus the existing
  no-filesystem-access pin, not a gate. That judgment belongs to the human at the post-review gate.

## Two clocks

The **verdict** is floor-grade: `check-verify.mjs` compared six integers and nothing else — it cannot
receive a finding, so no judgment could have reached it. Everything else in this run — choosing the
gate set, running them, assembling the map, writing this file — is **advisory orchestration**. In
particular, that `format:check` and `lint:md` are IN the map is this command's composition, not a
floor-locked fact.
