# GRILL — insecure-crypto lens (`.dev/features/crypto-lens/PLAN.md`)

- **Plan under interrogation:** `.dev/features/crypto-lens/PLAN.md` (treated as `trust: untrusted`).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking):** recomputed
  `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's pinned `spec_content_hash`. No drift. (The block on drift is `/pharn-dev-build`'s floor-gate, not this stage.)
- **Security griller Layer 1 (floor sub-check):** `node .dev/floor/scan-plan-secrets.mjs PLAN.md` → `{"found":false,"hits":[]}` — **no hardcoded secret in the plan text.**
- **Griller discovery (FLOOR membership):** `count-grillers.mjs` → 13 registered. Load-bearing axes for a methodology-lens increment (**security**, **testability**) applied inline below; the remaining axes (a11y, i18n, migrations, observability, privacy, performance, error-handling, comprehension, documentation, architecture, coupling) are interrogated by their axis inline and raised no concern beyond those recorded — the fully-isolated per-griller `claude -p` runner is deferred (P7).

> **This whole grill-log is ADVISORY (P0).** It **surfaces** concerns; it does **not** block `/pharn-dev-build` and is **not** a "grill passed." Every finding below rests on model judgment. The only floor-grade facts in this run are the content-hash match and the secret-scan result (both labeled above).

---

## Findings (advisory — grouped by axis; finding-shape, enum-gated / free-text split honored)

### Security axis (P2 / P7 — coverage completeness)

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P7 # enum-gated — honest-scope: is the pattern set the right size?
  severity: minor # enum-gated value; ASSIGNMENT is advisory (fix #3) — grillers never gate
  file: ".dev/features/crypto-lens/PLAN.md:39" # enum-gated — the Fixed detection set line
  problem: "The six-pattern set omits same-tier well-known weak primitives a security reviewer would expect — notably RC4 (broken stream cipher) and Node's deprecated crypto.createCipher() (no -iv, insecure key/IV derivation, distinct from createCipheriv) — so a reader could over-read its coverage."
  evidence: "PLAN.md:39 'six high-signal, named-constant / context-scoped patterns' enumerates md5/sha1/des/ecb/insecure-random/hardcoded-iv-salt; the guarantee audit already bounds this ('novel formats … evade a fixed regex set'), so this is a scope choice, not the P0 disease."
```

_Weighing:_ the plan is **honestly bounded** here (FLOOR = "detects these patterns," never "detects all weak crypto"). The precedent (the secret scanner shipped 6 patterns in one increment) supports shipping the named six now and deferring RC4 / `createCipher` to a follow-up (P7 — smallest increment). **For the human:** fold RC4 + `createCipher` in now, or defer? Not blocking either way.

### Testability axis (P1 — eval adequacy; Layer-1 presence: PRESENT, no absence finding)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/crypto-lens/PLAN.md:26" # the scanner-test file entry
  problem: "Only MD5 (positive + ★injection) and bcrypt (clean) are exercised by LENS evals; the other five scanner kinds (sha1, des, ecb, insecure-random, hardcoded-iv-salt) are exercised — if at all — only in scan-code-crypto.test.mjs, and the plan does not pin per-kind coverage."
  evidence: "PLAN.md:26 'hermetic tests incl. the ★ injection-immunity tests' does not enumerate a positive AND a true-negative near-miss per kind (e.g. createHash('sha256') NOT flagged; iv = crypto.randomBytes(16) NOT flagged; a parameterized/args-array call NOT flagged) — without which the 'fixed regex set' could silently over- or under-match a kind."
```

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/crypto-lens/PLAN.md:49" # the Evals-to-write section
  problem: "No eval covers a weak primitive used in a GENUINELY BENIGN, non-security context (e.g. MD5 as a cache/ETag key) — where the scanner (by design) STILL fires and the lens's Layer-2 advisory must ANNOTATE 'may be benign' WITHOUT suppressing the finding."
  evidence: "PLAN.md:52 the only clean case (case-bcrypt-clean) exercises scanner-truly-clean (no weak primitive named); the surface-don't-suppress behavior at the Layer-1/Layer-2 boundary — the plan's central honesty claim — is left unmeasured by the three cases."
```

_Weighing:_ P1 is **satisfied** (one capability, `enforces: [P2]` bound by `case-md5-password`); these are **adequacy** concerns, not a P1 absence. Consider adding the two negatives during build, or explicitly accepting them as a bound (they mirror the kind of coverage `scan-code-secrets.test.mjs` already carries).

### Determinism / correctness axis (P5 — build caution, not a plan defect)

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/crypto-lens/PLAN.md:42" # weak-cipher-des / named-token patterns
  problem: "The named-token patterns (des / ECB / the security-material word list for insecure-random) risk matching substrings inside unrelated identifiers (e.g. 'nodes', 'describe', a non-crypto variable literally named 'token'), producing deterministic-but-wrong hits."
  evidence: 'PLAN.md:42 ''createCipheriv("des-...")'' and PLAN.md:44 the word list must be anchored (word boundaries / API-call context) at build; add a false-positive-guard true-negative per kind so the ''ONLY axis of change'' regex stays high-signal (P5 determinism means deterministic AND correct membership).'
```

_Weighing:_ this is guidance for the **build**, not a hole in the plan — the plan already commits to "high-signal" patterns; this names the concrete failure mode to guard in the regex + tests.

---

## Prose summary

The plan is **fundamentally sound and unusually complete**: its guarantee audit reduces every claim to floor-or-advisory and **strikes** the over-claim ("ensures the crypto is correct") explicitly (P0); its trust audit routes injected directives to free-text only with a `needle_absent_from_enum_gated` trip-wire (P2); its determinism audit is fail-closed with an ask-the-human terminal fallback (P5); the dev/product boundary is correct and mirrors `secrets-in-code` precisely; the spec-hash matches and the plan carries no secret. `enforces: [P2]` is eval-bound by `case-md5-password` (P1, fix #6).

The four concerns above are all **advisory adequacy/scope refinements**, not defects: (1) the pattern set is a deliberately-bounded subset (RC4/`createCipher` are candidate additions to weigh against P7); (2–3) two eval negatives would strengthen the suite (per-kind scanner true-negatives; the benign-context surface-don't-suppress case); (4) a concrete regex-anchoring caution for the build. None of them contradicts the plan's own honesty — they extend it. The context-scoped `insecure-random` design was already ratified by the human at GATE 1.

## ADVISORY VERDICT

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 advisory/minor) — for the human to weigh before /pharn-dev-build.** This is not a gate and not a "pass"; `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved open questions) and `.dev/floor/validate.mjs` remain the deterministic backstops.
