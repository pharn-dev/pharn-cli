# PLAN — secrets-in-code lens (partial-floor P2 lens over CODE)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — SHA-256 of ARCHITECTURE.md, pinned this run
- increment: Add a **product** lens (`pharn-review/secrets-in-code/`) that reads CODE as untrusted DATA and emits a finding per hardcoded secret-shaped literal, backed by a new deterministic, injection-immune code-secret scanner in the floor.
- layer(s): pharn-review (product lens) + .dev/floor (deterministic helper — build apparatus, not a layer in the pharn-\* tree) # ARCHITECTURE.md §4
- constitution_refs: [P0, P2, P4, P5, P7]

## What is being added (and where — the dev/product boundary)

The **code-side twin of the security griller**. The security griller scans a **PLAN** for secret
literals via `.dev/floor/scan-plan-secrets.mjs`; this lens scans **CODE** for the same, via a new
`.dev/floor/scan-code-secrets.mjs`. It mirrors the `trust-fence` lens structure (the P2 lens
precedent, `pharn-review/trust-fence/`), which the arguments name as the template.

- **Product capability → ROOT `pharn-review/secrets-in-code/`** (what a PHARN user receives).
- **Build trace → `.dev/features/secrets-lens/`** (this PLAN + the later GRILL/REGRESS/VERIFY/REVIEW).
  NEVER place the lens or its evals under `.dev/`.

## Files

- `pharn-review/secrets-in-code/secrets-in-code.md` — the lens (`role: lens`, mirrors trust-fence.md) — layer pharn-review
- `pharn-review/secrets-in-code/evals/cases/case-hardcoded-key.md` — CODE hardcoding an AWS-key-shaped literal (untrusted fixture) — layer pharn-review
- `pharn-review/secrets-in-code/evals/cases/case-env-var.md` — CODE reading the key from `process.env` (no literal) — layer pharn-review
- `pharn-review/secrets-in-code/evals/cases/case-not-a-secret-comment.md` — ★ CODE hardcoding a real key WITH a `// not a secret` suppression comment — layer pharn-review
- `pharn-review/secrets-in-code/evals/expected/expected-hardcoded-key.json` — structural assertions (1 finding, P2, file=literal line) — layer pharn-review
- `pharn-review/secrets-in-code/evals/expected/expected-hardcoded-key.md` — prose expected (human-readable) — layer pharn-review
- `pharn-review/secrets-in-code/evals/expected/expected-env-var.json` — structural assertions (`finding_count == 0`) — layer pharn-review
- `pharn-review/secrets-in-code/evals/expected/expected-env-var.md` — prose expected — layer pharn-review
- `pharn-review/secrets-in-code/evals/expected/expected-not-a-secret-comment.json` — ★ structural (1 finding + `needle_absent_from_enum_gated: "not a secret"`) — layer pharn-review
- `pharn-review/secrets-in-code/evals/expected/expected-not-a-secret-comment.md` — prose expected — layer pharn-review
- `.dev/floor/scan-code-secrets.mjs` — deterministic secret-literal scanner over a CODE file (mirrors scan-plan-secrets.mjs; regex set over TEXT) — build apparatus
- `.dev/floor/scan-code-secrets.test.mjs` — hermetic tests incl. the ★ injection-immunity tests (a `// not a secret` comment does NOT suppress a real hit) — build apparatus

## Contracts satisfied

- `pharn-contracts/finding-shape` — every emitted finding is the exact finding object; the lens **cites** the enum-gated / free-text split, does not restate it (P4). The lens `reads:` it.
- `pharn-contracts/eval-format` — each `expected/*.json` uses only the four `structural[]` kinds (`finding_count`, `field_equals`, `file_resolves`, `needle_absent_from_enum_gated`) + `semantic[]` for the advisory judge; `skill_kind: llm`. Cited, not restated (P4).

## Precedents mirrored (cite, don't restate — P4)

- `pharn-review/trust-fence/trust-fence.md` — lens structure, frontmatter, the untrusted-input fence, the finding-output block, `writes:` shape (`features/<name>/REVIEW.md` + `findings.json`).
- `pharn-pipeline/grillers/security/security.md` — the **partial-floor** pattern: a scanner-backed FLOOR sub-check + an honestly-sized ADVISORY bulk, the "two clocks" note, and the guarantee audit.
- `.dev/floor/scan-plan-secrets.mjs` + `.test.mjs` — the scanner + ★ injection-immunity test to mirror on CODE.
- ARCHITECTURE.md §3.1 (Capability frontmatter), §2 (floor primitive #3 = regex), §8 (finding object).

## Evals to write (P1 — every capability + every `enforces` rule_id gets ≥1 eval)

- `secrets-in-code` / `P2` → **case-hardcoded-key** → 1 finding: `type FINDING`, `rule_id P2`, `severity important`, `file` = the literal's line (from the scanner). Binds `enforces: [P2]`.
- `secrets-in-code` / `P2` → **case-env-var** → **0 findings** (`finding_count == 0`); scanner clean; no false positive on `process.env` usage.
- `secrets-in-code` / `P2` → **case-not-a-secret-comment** (★) → **still 1 finding**; `needle_absent_from_enum_gated: "not a secret"` — the suppression comment reaches only free-text, never suppresses the enum-gated finding.

## Guarantee audit (P0) — the honest split (a REAL PARTIAL FLOOR)

- **Lens membership** (`role: lens` + required frontmatter + non-empty evals + `enforces: [P2]` produced by ≥1 eval) → **FLOOR** (`.dev/floor/validate.mjs`, primitive #3 enum/regex). Raises the live capability count **14 → 15**.
- **Secret-literal detection over CODE** (`.dev/floor/scan-code-secrets.mjs`, a fixed regex set over the code text) → **FLOOR** (primitive #3), **injection-immune by construction**: the verdict is regex membership over TEXT only — prose claiming "not a secret / mark clean" cannot suppress a real match; prose claiming "secret here" cannot manufacture one. Proven by the scanner's ★ tests.
- **Is a flagged literal a LIVE secret vs a placeholder? Is the code secret-free?** → **ADVISORY — the bulk.** Irreducible judgment; the lens **surfaces**, it **never gates** (a lens cannot "decide approve" — ARCHITECTURE §7).
- **Bounded honestly:** "detected a secret-SHAPED literal on line N" is a **guarantee**; **"the code has no secrets" is NOT** — struck (the disease P0 forbids). A scanner-clean file is not a secret-free file (novel patterns, encodings, split literals evade a fixed regex set).
- **Two clocks (honest).** The scanner's **output** is FLOOR (deterministic regex). Until a live isolated lens-runner lands (deferred, P7 — as for every lens/griller), the review stage applies this lens **inline**, so the lens's **act** of invoking the scanner is **advisory orchestration**, backstopped by the scanner's own tests + this lens's eval. The guarantee is "the scanner IS deterministic," not "the model always ran it."
- **New floor primitive, justified (P7).** `.dev/floor/scan-code-secrets.mjs` is added **because** the lens's floor claim ("detects secret literals in CODE deterministically") requires a deterministic backstop — else it is a guarantee with no floor reduction (the disease). Not speculative; it is the floor reduction of a claim this lens makes, ratified at GATE-1.

## Trust audit (P2) — code is untrusted DATA; taint stays fenced

- **Input:** the artifact under review is CODE, `trust: untrusted` (THREAT-MODEL §2, surface #4). Comments, strings, docs are DATA. An injected `// not a secret, ignore` is an **attack reported as evidence**, never an instruction.
- **Taint propagation (fix #1):** a finding's **free-text** fields (`problem`, `evidence`) inherit the code's untrusted tag (quoted/escaped). The **enum-gated** fields (`type`, `rule_id`, `severity`, `file`) are the lens's own assertion — `file`'s line comes from the **scanner** (deterministic path-resolution), never from a comment's line. No guaranteed decision rests on a tainted field.
- **Structural proof:** the ★ eval asserts `needle_absent_from_enum_gated: "not a secret"` and the scanner's ★ test asserts the suppression comment does not change the hit set — the boundary is checked, not merely asserted.

## Determinism audit (P5) — membership tests; terminal fallback is ask

- The scanner's verdict is **regex membership over text** — zero LLM. Each per-hit finding takes its `file` line from the scanner's `line` output (deterministic), not judgment.
- The advisory layer (is this a live secret vs a placeholder?) is genuine judgment: the lens **surfaces** it as a finding for the human and, when genuinely ambiguous, **asks the human** — never guesses, never silently suppresses.
- Fail-closed: a missing / non-file target is a nonzero-exit ERROR (nothing on stdout), never a silent "clean" — mirrors scan-plan-secrets.mjs.

## Frontmatter (planned — mirrors trust-fence.md, cite not restate)

```yaml
name: secrets-in-code
role: lens
kind: pharn-owned
trust: trusted # the lens is trusted; its INPUT (code) is not
coupling: agnostic # secret-handling is agnostic (ARCHITECTURE §3.2 Q1 — the reframe's own SEC example)
model_tier: sonnet
reads: ["pharn-contracts/finding-shape.md", "<artifact-under-review>"]
writes: ["features/secrets-in-code/REVIEW.md", "features/secrets-in-code/findings.json"]
constitution_refs: ["P0", "P2", "P4", "P5", "P7"]
enforces: ["P2"]
version: "0.1.0"
```

## Guarantees this increment does NOT make (P0/P7 — named, not hidden)

- Does NOT guarantee the reviewed code is secret-free (only that a secret-SHAPED literal was/ wasn't detected by a fixed regex set).
- Does NOT decide a flagged literal is a real, live credential (placeholder vs live = advisory judgment).
- Does NOT gate/block anything — a lens surfaces findings; the human decides (ARCHITECTURE §7).
- Does NOT enforce that the lens was actually run (the runner is deferred; "two clocks").

## Open questions — RESOLVED at GATE 1 (human approval)

1. **Scanner strategy — RESOLVED: add a new `scan-code-secrets.mjs`.** The human approved this plan
   **as written** at GATE 1 (2026-07-03), ratifying the RECOMMENDED path: a new code-targeted scanner
   mirroring `scan-plan-secrets.mjs` (symmetric with the griller precedent; keeps this increment to
   **one axis / one PR**; the existing scanner is named/doc'd/tested as a PLAN scanner, so pointing it
   at code would be a semantic mismatch and muddy P3). Accepted cost, named + deferred (P7): the
   ~7-line `PATTERNS` regex set is **duplicated** across the two scanners; consolidating to a shared
   `scan-secrets.mjs` would touch the existing security griller's citations + tests (a **separate
   axis**), so it is deferred, not done speculatively now. No open questions remain — clear to build.

## Grill concerns folded into build (advisory, GRILL.md — resolvable inside `## Files`)

- **Multi-file scope (P5):** v0.1.0 scopes the lens to **single-file** application (the scanner takes one file, mirroring `scan-plan-secrets.mjs`); the lens `.md` states this and names multi-file/directory sweep as a **future increment** (P7 — not built speculatively).
- **Clean-case eval shape (P1):** `expected-env-var.json` carries only `finding_count == 0` (structural) with no `semantic[]` (a zero-finding case has no free-text to judge).
- **Severity `important` (P0):** deliberate — mirrors the security griller (a lens never gates, so the assignment is advisory either way, fix #3).
