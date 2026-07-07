# VERIFY — model-routing-config

- Verdict source: `.dev/floor/check-verify.mjs` (exit-code threshold — PASS iff every gate exit 0). FLOOR layer owns the verdict; the advisory verifier layer only annotates.
- Run at HEAD (the working tree with the feature in it) — whole-repo gates, so PASS requires the entire repo green with this increment present.

## FLOOR layer — deterministic gates (gate → exit code)

| gate           | exit | note                                             |
| -------------- | ---- | ------------------------------------------------ |
| `test`         | 0    | `npm test` — vitest, 506 tests incl. the feature |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — 0 capabilities, GREEN |
| `lint`         | 0    | `eslint src`                                     |
| `format:check` | 0    | prettier, whole-repo (L9)                        |
| `lint:md`      | 0    | markdownlint, whole-repo (L9)                    |

No `structural:*` gate — the increment is product TypeScript (its spec is the `vitest` suite, collected by `test`), shipping no `evals/expected` ↔ `findings.json` pair.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` → `{"registered":0}` (deterministic frontmatter membership, not a prose grep). Step 2 is a no-op; the verdict is the floor gates alone.

## Verdict

**VERIFIED: floor gates PASS** (`check-verify.mjs` exit 0; `failing_gates: []`).

**GATE-2 re-run (after the human-directed fix).** Re-ran all five gates on the fixed working tree (P7 read-path wiring in `readPharnConfig` + P5 `resolveStageModel` hardening) → all `0`, **`PASS`** (`verify-report.json` unchanged — same verdict). `test` is now **509** vitest tests (3 added: absent-stages resolver, valid-`models` round-trip, invalid-`models` → `null`).

**Honest residual (P0/P7):** verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check. A defect no test/lint/validate covers is invisible to this verdict, and there is no verifier layer yet to raise it — verifier concerns, when they exist, are advisory help, not assurance. The advisory correctness read (the 4 review lenses) is `/pharn-dev-review`'s job, presented at the human gate.
