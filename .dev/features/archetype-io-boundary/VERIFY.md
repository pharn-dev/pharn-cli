# VERIFY — archetype-io-boundary

**Verdict (FLOOR, `check-verify.mjs` exit 0):** `VERIFIED: floor gates PASS`.

## FLOOR layer — deterministic gates (own the verdict)

| gate | exit | note |
| --- | --- | --- |
| `test` | 0 | `npm test` — whole hermetic suite (38 files / 372 tests), incl. the feature's own `tests/detect-archetype.test.ts` |
| `validate` | 0 | `node .dev/floor/validate.mjs .` — structural floor GREEN (0 markdown capabilities; vacuous for a TS increment) |
| `lint` | 0 | `eslint src` clean |
| `format:check` | 0 | prettier clean (whole-repo — closes L9 style-coverage at verify) |
| `lint:md` | 0 | markdownlint clean (whole-repo — L9) |

- `failing_gates`: **none**.
- **No `structural:*` gate** — the feature ships no committed `EXPECTED::ACTUAL` eval pair (it is a TypeScript lib increment; its correctness signal is its own `*.test.ts`, collected by `npm test`, plus the whole-repo gates above).

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `count-verifiers .` → `{"registered":0}` (deterministic frontmatter membership, not a prose grep). Step 2 is a no-op; the verdict is the floor gates alone. `verifiers: { registered: 0, findings: [] }`.

## Honest residual (P0/P7)

`VERIFIED` = the named gates passed — this is **NOT** a guarantee of correctness beyond what those gates check. A defect no test / eval / rule / lint covers is invisible to this verdict, and the verifier layer that might notice it is advisory (and empty today). The verdict is floor-grade (an exit-code threshold by `check-verify.mjs`, independent of any free-text); the orchestration around it (running the gates, assembling the map) is advisory. Verifier concerns, when they exist, are advisory help — not assurance.
