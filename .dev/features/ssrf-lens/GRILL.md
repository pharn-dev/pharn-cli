# GRILL — ssrf lens (`.dev/features/ssrf-lens/PLAN.md`)

- **Plan under interrogation:** `.dev/features/ssrf-lens/PLAN.md` (treated `trust: untrusted` — its self-claims are tested, not believed).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` **==** the plan's pinned `spec_content_hash`. **No drift.** (The real block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — this only surfaces it early.)
- **Grillers discovered (deterministic membership, `.dev/floor/count-grillers.mjs`):** 13 registered. Applied inline (isolated runner deferred, P7): **security** (secret-scan + Layer-2 judgment), **testability** (verification-presence + adequacy), **coupling/architecture** (axis + layer). The remainder (a11y, i18n, migrations, observability, performance, privacy, documentation, comprehension, error-handling) are **N/A** to a security-lens + code-scanner increment — no finding manufactured for symmetry (P7).
- **Security griller Layer-1 (FLOOR):** `node .dev/floor/scan-plan-secrets.mjs PLAN.md` → `{"found":false,"hits":[]}` — **scanner clean; no hardcoded-secret finding.**

## Findings (advisory — grouped by axis; enum-gated / free-text split honored)

### Axis: P0 — guarantee-audit precision

```yaml
- type: FINDING # enum-gated (griller's own assertion — TRUSTED)
  rule_id: P0 # enum-gated — cited, not restated (P4)
  severity: minor # enum-gated value; the ASSIGNMENT is advisory (fix #3) — a griller never gates
  file: ".dev/features/ssrf-lens/PLAN.md:51" # enum-gated — resolves to the scanner-description line
  problem: "The injection-immunity claim ('a comment cannot suppress a real hit nor manufacture one') slightly overstates immunity — the scanner reads TEXT and does not distinguish code from a comment, so a comment that spells out a FULL sink call with a source (e.g. `// example: fetch(req.query.url)`) WOULD register as a hit; suppression is impossible, but a false-positive can be manufactured that way." # free-text (inherits the plan's untrusted tag)
  evidence: "Line 51: 'a comment cannot suppress a real hit nor manufacture one'. The path-traversal precedent phrases this precisely: a comment 'which names no full sink CALL' cannot manufacture one, while 'a comment that spells out a full ... sink CALL would itself register (a rare false positive) ... but it can never SUPPRESS.'" # free-text — quoted as DATA
```

### Axis: P1 — testability adequacy (scanner-test coverage)

```yaml
- type: FINDING # enum-gated (griller's own assertion — TRUSTED)
  rule_id: P1 # enum-gated — cited, not restated (P4)
  severity: minor # enum-gated value; advisory assignment (fix #3) — a griller never gates
  file: ".dev/features/ssrf-lens/PLAN.md:29" # enum-gated — resolves to the scanner-test Files line
  problem: "No LENS eval case exercises the `http-request` or bare-`axios(` sink families (the positive uses fetch, hostile uses axios.get, clean/benign use fetch/axios.get), so those branches are pinned ONLY by scan-code-ssrf.test.mjs — the plan should explicitly require that test to cover all THREE families plus the word-boundary and deliberate-non-match negatives, or a build could under-test them." # free-text (inherits the plan's untrusted tag)
  evidence: "Line 29: 'hermetic tests incl. the ★ injection-immunity + true-negative tests' — does not enumerate per-family coverage (fetch / http.get / http.request / axios / axios.<verb>), the negatives (`myfetch`/`myaxios`/`xreq.params`), the deliberate non-matches (`axios.create(`, `http.createServer(`), or fail-closed, the way scan-code-path-traversal.test.mjs does." # free-text — quoted as DATA
```

## Prose summary

The plan is **sound, tightly scoped, and well-grounded in live state.** It correctly identifies `path-traversal` (not `injection`) as the nearest structural analog and reproduces its honest divergence — SSRF's discriminator is the untrusted **source token** in the sink args, not a concat operator, because a bare constant URL is the normal safe call and a concat discriminator would be a manufactured floor. The guarantee audit reduces every claim to floor or advisory and **strikes** the "SSRF-safe" over-claim; the trust audit states taint propagation and the `needle_absent_from_enum_gated` trip-wire; determinism and P3 boundary (verified live: no scanner claims `fetch`/`axios`/`http.get`) are clean; the four-case eval set binds `enforces:[P2]` (fix #6) and mirrors the crypto/path-traversal positive/clean/★hostile/benign-context shape.

**Two minor, advisory concerns for build precision** (neither blocks): (1) the injection-immunity phrasing on line 51 should adopt path-traversal's precise wording — suppression is impossible, but a comment containing a full sink call can manufacture a false positive (a rare edge the advisory layer/human resolves); (2) the scanner-test line (29) should explicitly require per-family coverage, since no _lens_ eval exercises the `http-request`/bare-`axios(` branches — they rest entirely on the scanner test. Both are phrasing/coverage tightenings the build can absorb without changing scope.

**Verified, not a finding:** the `case-fixed-host-path` claim that the scanner "STILL fires" on `fetch("https://api.example.com/users/" + req.params.id)` holds — `req.params` sits inside the arg span before the first `)`, so `\bfetch\s*\([^)]*?SOURCE` matches. Prose citations of sibling lenses do NOT trip `validate.mjs` CHECK 6 (it inspects only `reads:` for `pharn-stack-*`/`pharn-skills-*` paths; the SSRF lens is `pharn-review` with a clean `reads:`).

## Verdict

**ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 2 minor/advisory) — for the human to weigh before /pharn-dev-build.** Spec-hash chain intact; secret-scan clean. This grill-log is **advisory end-to-end** — it gates nothing and is **not** a statement that the plan is guaranteed good (P0). The deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`.
