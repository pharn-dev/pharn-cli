# REVIEW — crypto-lens (insecure-crypto lens increment) — iteration 2 (post-GATE-2 refinement)

- **Under review (`trust: untrusted`):** the increment as refined — `pharn-review/insecure-crypto/**` (lens + 4 eval cases + 8 expected) and `.dev/floor/scan-code-crypto.{mjs,test.mjs}` (8-kind scanner).
- **Floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN — 20 capabilities** (exit 0). The floor is the only guaranteed part of this review; everything below is **advisory**.

## Floor-gate findings (blocking)

**None.** No guarantee lacks a floor reduction; `enforces: [P2]` is eval-bound (floor confirms); no sibling `reads:`; the finding-object split is dogfooded. Not blocked.

## Advisory findings (inform — never the sole basis for a guaranteed block)

### L-floor → P0 — CLEAN

The guarantee audit still reduces every claim to floor-or-advisory and **strikes** the disease ("ensures the crypto is correct → struck"). The refinement kept it honest: the "named precisely" line and the Scope section were updated to eight kinds, and the previously-flagged **contradiction risk is resolved** — RC4 / `createCipher` are no longer listed as "future" now that they are included; only PBKDF2 / short-RSA remain named as future (P7). No unlabeled guarantee.

### L-eval → P1 — CLEAN (floor agrees); the prior adequacy note is now partly addressed

`enforces: ["P2"]` is produced by `expected-md5-password.json` / `expected-secure-comment.json` / `expected-md5-cachekey.json`; `validate.mjs` CHECK 3 agrees. The GATE-2 refinement added the **benign-context** case (`case-md5-cachekey`), which directly exercises the Layer-1/Layer-2 **surface-don't-suppress** boundary the iteration-1 grill flagged as untested:

```yaml
- type: FINDING
  rule_id: P1
  severity: minor # advisory — a commendation for closing the gap
  file: "pharn-review/insecure-crypto/evals/expected/expected-md5-cachekey.json:1"
  problem: "The new benign-context eval asserts the scanner STILL fires (finding_count == 1) on MD5-as-a-cache-key while the Layer-2 'plausibly benign' note only surfaces — pinning surface-don't-suppress, previously unmeasured."
  evidence: "expected-md5-cachekey.json: finding_count == 1 + file_resolves :15; the semantic judge forbids suppression on the benign judgment."
```

Residual (advisory): the two new scanner kinds (`weak-cipher-rc4`, `deprecated-createcipher`) and the broadened `insecure-random` are exercised at the **scanner-test** level (26 tests, per-kind positive + true-negative incl. the `createCipheriv` safe-form negative), not via dedicated lens evals — consistent with the precedent lenses; a strengthening opportunity, not a defect.

### L-trust → P2 — CLEAN, trust-fence held

The ★ `case-secure-comment` still pins `needle_absent_from_enum_gated: "approved"` with `file` on the code line (15), not the injected comment (13). Instruction-looking content in the fixtures/lens prose was treated as DATA — I did not suppress or downgrade anything on its basis. No guaranteed decision rests on a tainted/free-text field (the scanner's regex never reads a comment as a directive; the two new kinds are pure code-text regexes). No finding.

### L-axis → P3 — CLEAN

One axis per file holds through the refinement: the scanner is still "adding/removing a pattern is the ONLY axis" (now eight patterns — same axis, not a new one); each eval file is one fixture. `reads:` routes through `pharn-contracts` only — no sibling reference (`validate.mjs` CHECK 6 GREEN). No finding.

## Verdict

**GREEN — 0 floor-gate (blocking) findings.** Floor `validate` GREEN, `enforces` eval-bound (now across 4 cases), trust-fence held, one axis per file, and the two new cipher kinds are correctly anchored (the safe `createCipheriv(...)` is a verified true-negative for `deprecated-createcipher`). The advisory notes are forward-looking. **This GREEN is the floor verdict + advisory judgment — NOT a decision to merge; that is the human's call at the post-review gate (GATE 2).**

## Proposed lesson candidate (P7 — real failures this run; NOT written to canon here)

Canon is written only by a separate human-gated `/pharn-dev-memory-promote` run (own scope + `check-provenance.mjs` + accept/deny halt; the model never self-promotes, P2). Two candidates, both real and reproduced this run:

- **`node --test` word-splitting:** run `git ls-files … | xargs node --test`, not `node --test $VAR` — this shell doesn't word-split unquoted expansions, so an un-split list makes `node --test` report "could not find" → a FALSE symmetric RED. _(Provenance: iteration-1 `/pharn-dev-regress`; corrected to `xargs`, re-captured 0/0.)_
- **Trace-artifact style hygiene:** the pipeline's own `.md` trace artifacts (SHIP/VERIFY/REVIEW with tables) must be `prettier --write`-formatted or they fail the whole-repo `lint:md` (MD060 table alignment) + `format:check` at the **next** `/pharn-dev-verify` — because a stage's own trace file doesn't exist yet when that stage's verify runs, so it is first checked on a later iteration. _(Provenance: iteration-2 verify caught the iteration-1 SHIP/VERIFY/REVIEW tables; fixed by prettier before capture.)_
