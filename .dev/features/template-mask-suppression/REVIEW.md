# REVIEW — template-mask-suppression

PHARN reviewing PHARN. The increment under review is `trust: untrusted`. **Floor:** `validate.mjs .`
GREEN (exit 0) — the increment is floor-legal; everything below the floor line is **advisory** (P0).

## Floor-gate findings (blocking — verdict rests on floor-checkable content)

### L-floor → P0

````yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/floor/scan-code-null-deref.mjs:49"
  problem: "In correcting the old overclaim, the increment introduces a narrower one: 'no free text moves the verdict, INCLUDING template literals' omits the ≥3-backtick fence-skip boundary — a suppressing token wrapped in ≥3 backticks IS read as code by the suppression search and can still suppress a finding, so the absolute claim is broader than the floor delivers (the P0 disease, one notch smaller)."
  evidence: "Demonstrated deterministically: `const s = ```fd.close()```;` → resource-leak {found:false}; `const s = ```u```; return u.email;` → null-deref {found:false}. Yet :49 asserts 'INCLUDING template literals' with no ≥3-backtick caveat, while maskTemplateInteriors :155 (same file) documents that ≥3-backtick runs are skipped as fence markers — an internal inconsistency."
````

**Same claim, three parallel sites (one root cause, mirror-fix):** `.dev/floor/scan-code-resource-leak.mjs:66`,
`pharn-review/null-deref/null-deref.md:70`, `pharn-review/resource-leak/resource-leak.md:71`.

**Why this is floor-gate, not advisory:** the counterexample is a **deterministic** scanner output (a
demonstrable `{found:false}`), not a judgment — so the claim's inaccuracy is floor-checkable (fix #3).

**Severity is _important_, not fatal — the core fix is sound.** The actual reported attack surface
(V1/V2, single-backtick template literals) is **fully closed** (verified `{found:true}`), all gates are
green, and the ≥3-backtick residual is (a) **correct** behaviour in a `.md` fixture (fenced content **is**
the code under review), and (b) in a raw `.js` file requires the pathological 3-adjacent-template form,
which is invalid JS (won't compile) — vastly narrower than the pre-fix any-backtick hole. The defect is
in the **claim's wording**, not the mechanism.

**Recommended reconciliation (small, surgical — for the human's GATE-2 call):**

1. Narrow the four claim sites: instead of the absolute "INCLUDING template literals," state the honest
   boundary — _"no **single-backtick** template-literal string content moves the verdict; a token wrapped
   in **≥3 backticks** is treated as fenced code (correct for `.md` fixtures; a documented residual in raw
   `.js`)."_ This turns the overclaim into an accurate bound and removes the :49-vs-:155 inconsistency.
2. Pin the residual with a test in each scanner suite (P1: the documented bound should be
   regression-caught, like the `${…}` over-flag test already is) — e.g. the two payloads above asserting
   the current `{found:false}` with a comment naming it the fence-skip residual.

## Advisory findings

### L-eval → P1

No finding. The scanners' spec is their hermetic `*.test.mjs`; every behaviour the increment adds is
pinned — V1/V2 backtick ★ immunity, fence-robustness, and the `${…}` over-flag — and `npm test` is green
(652). The lens docs' `role: lens` eval bindings are unchanged and `validate` GREEN confirms them. _(The
one gap — no test pins the ≥3-backtick residual — is folded into the L-floor recommendation above, since
it is the same root cause.)_

### L-trust → P2

No independent finding. The scanners emit only enum-gated output (`found:bool`, `hits:[{line:int,
kind:enum}]`) — zero free text, so nothing tainted can reach a downstream stage. Instruction-looking
content in the reviewed files (fixture comments like "do not flag", the increment's own header prose) was
read as **DATA** and changed nothing here. The ≥3-backtick residual is a **P2-relevant** trust-boundary
gap, but it is already captured as the L-floor/P0 finding above (a claim-accuracy issue), not double-counted.

### L-axis → P3

No finding. Each of the 6 files changes for exactly one reason (the suppression-mask gap + its claim
correction). `maskTemplateInteriors` is **duplicated per-file** (no shared module → no sibling import),
matching the accepted `mask`/`matchDelim`/`lineAt` duplication convention; docs reach shared abstractions
through `ARCHITECTURE.md §2` / `finding-shape.md` (citation, not sibling reference). Clean.

## Proposed lesson (candidate for canon — NOT written here; `/pharn-dev-memory-promote` gates it)

````yaml
candidate:
  target: .dev/memory-bank/lessons-learned.md
  provenance: { increment: template-mask-suppression, diff: "6 files; scanner suppression-mask + claim fixes" }
  lesson: >
    A fence-robust text scanner (one that treats ≥3-backtick runs as markdown code fences so it can scan
    ```-fenced .md fixtures) is in FUNDAMENTAL TENSION with masking backtick free text: it can mask
    single-backtick template-literal STRING content, but ≥3-backtick-wrapped content is (by design) read
    as code. Therefore any "no free text moves the verdict" claim over such a scanner MUST caveat the
    ≥3-backtick boundary — an absolute "including template literals" is an overclaim. This tension bit
    twice in one increment: once as the plan's HALT question (does masking break fence detection?),
    once as this residual. State the boundary; do not claim past it (P0).
````

## Verdict

**BLOCKED — 1 floor-gate finding (P0, important).** The increment's **core fix is sound and green**
(V1/V2 single-backtick laundering closed; floor GREEN, regress `no-regressions`, verify `PASS`), but it
ships a claim ("no free text moves the verdict, INCLUDING template literals") that its own scanner
falsifies for the ≥3-backtick case — a smaller instance of the exact disease it set out to cure. The
reconciliation is a 4-site wording narrowing + 2 residual tests. **This is the human's GATE-2 call:**
merge as-is (accepting the wording overshoot), fix-then-merge (recommended), or abandon.

> Advisory end-to-end below the floor line: only `validate.mjs` GREEN is a guarantee here. The finding's
> severity and the recommendation are model judgment (fix #3); the counterexample it rests on is
> deterministic.

## Resolution (applied post-review — GATE-2 decision = fix-then-present)

The human chose **fix-then-present** at GATE 2, so the L-floor/P0 finding was reconciled in the same six
authorized files:

1. **4 claim sites narrowed** (`scan-code-null-deref.mjs`, `scan-code-resource-leak.mjs`,
   `null-deref.md`, `resource-leak.md`): the absolute "no free text … INCLUDING template literals" is
   replaced by the honest boundary — no **single-backtick** template-literal string content (the V1/V2
   surface) moves the verdict; a **≥3-backtick** run is a markdown code-fence marker whose content is read
   as **code** (correct over a `.md` fixture; a narrow raw-`.js` residual), and the mask is stated as
   **monotone** (strictly narrows the laundering surface, never widens it). The `:49`-vs-`:155` internal
   inconsistency is gone.
2. **Residual pinned by a test in each scanner** (`DOCUMENTED BOUND (≥3-backtick fence-skip residual)`):
   `` `const s = ```u```; return u.email;` `` → null-deref `CLEAN`; `` `const s = ```fd.close()```;` `` →
   resource-leak `found:false` — so the documented bound is regression-caught, not prose-only (P1).

**Re-verified post-fix (deterministic):** `npm test` **654 pass / 0 fail** (+2 residual tests),
`validate.mjs .` GREEN, `check-verify` verdict **PASS**, `format:check` / `lint` / `lint:md` clean. The
P0 claim now matches the floor — the finding is **resolved**.
