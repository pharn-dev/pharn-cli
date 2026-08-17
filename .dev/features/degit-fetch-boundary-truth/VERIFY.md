# VERIFY — degit-fetch-boundary-truth

Two cleanly separated layers. The **floor** layer owns the verdict; the **advisory** layer annotates
and can never flip it (fix #3).

## Floor layer — owns the verdict

| Gate | Command | Exit |
| --- | --- | --- |
| `format:check` | `prettier --check` | **0** |
| `lint` | `eslint src tests scripts --max-warnings 0` | **0** |
| `lint:md` | `markdownlint-cli2` over `docs/**/*.md` + `*.md` | **0** |
| `typecheck` | `tsc --noEmit` × 2 configs | **0** |
| `test` | `vitest run` — **41 files, 755 tests passed** | **0** |
| `validate` | `node .dev/floor/validate.mjs .` | **0** |

**`verdict: "PASS"`**, `failing_gates: []`. Machine report: `verify-report.json`.

### The two increment-specific instruments

This increment's whole claim is "nothing behavioral changed," so the mechanical diff instruments carry
more weight here than the suite does:

```
git diff main -- src/lib/repo.ts | grep -vE '^[-+]\s*(//|\*|/\*|\*/|$)|^[^-+]|^[-+]{3}' | wc -l   → 0
git diff main...HEAD -- THREAT-MODEL.md | grep -E '^[-+]#{2,3} ' | wc -l                          → 0
header count: main 7 · head 7                                                                     → identical
```

Zero non-comment lines changed in `repo.ts`. Zero `##`/`###` header lines changed in the trust map —
which matters because the #93 citer inventory found TM §2/§3/§5 referenced from floor checkers and
fixtures, so a renumber would break citers silently.

## Advisory layer — annotates, never flips

`count-verifiers.mjs` → `{"registered": 0, "verifiers": []}`. **Zero `role: verifier` capabilities
exist** (P7 — none has been needed yet), so the advisory layer contributes nothing this run and the
verdict rests on the floor gates alone.

Separately and **outside** this stage's verdict, the review stage ran five independent adversarial
re-verifications of the shipped factual claims against the installed dependency. Those are
`REVIEW.md`'s business and are **not** a verify input.

## Honest scope (P0)

`PASS` means **every named gate exited 0**. It does **not** mean the trust-map prose is true — prose
accuracy is not floor-reducible. The backstop for that is the evidence record (`FACT-TABLE.md`, source
anchors pinned to chunk SHA-256s plus live probe transcripts) and the independent re-verification in
`REVIEW.md`, both of which are **advisory**.
