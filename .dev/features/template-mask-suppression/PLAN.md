# PLAN — template-mask-suppression (fix two launderable floor scanners)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # sha256 of ARCHITECTURE.md (fix #4), pinned this run
- increment: For `scan-code-null-deref.mjs` and `scan-code-resource-leak.mjs`, run **only** the suppression-token clause (`firstUseDerefLine` / `isCleanedUp`) over a copy whose JS template-literal string content is also masked, so untrusted backtick free text can no longer silence a real finding — then correct the now-false "no free text moves the verdict / injection-immune by construction" claims in the two `.mjs` headers and the two lens docs to match the floor.
- layer(s): `.dev/floor` (build-apparatus deterministic scanners — not a product layer) + `pharn-review` (the `null-deref` / `resource-leak` lens docs, a leaf per `ARCHITECTURE.md §4`)
- constitution_refs: [P0, P2, P5, P6, P7]

## The bug (confirmed LIVE this run — not from the report)

Both scanners are **HIT-unless-a-suppressing-token-is-found** scanners. Their shared per-file `mask()`
(null-deref `.mjs:93-138`, resource-leak `.mjs:108-153`) deliberately leaves **template-literal
(backtick) interiors unmasked** so the scanner survives ` ``` `-fenced code in `.md` eval fixtures
(null-deref `.mjs:88-92`, resource-leak `.mjs:103-107`). But the **suppression** clause searches that
same `masked` text, so a backtick literal is unmasked free text that supplies the suppressing token —
untrusted string content silences a real finding:

- **V1** `firstUseDerefLine` (null-deref `.mjs:182`): reproduced live — `const user = db.findOne(id);` /
  ``const label = `current user shown`;`` / `console.log(user.name);` → `{found:false}` (the backtick
  "user" is read as the first use → CLEAN; the real deref is never examined). Remove "user" from the
  backticks → `{found:true}`. **String-content-dependent verdict.**
- **V2** `isCleanedUp` (resource-leak `.mjs:200`): reproduced live — `const fd = fs.openSync(path);` /
  ``const note = `reminder: call fd.close() at shutdown`;`` → `{found:false}` (the backtick
  `fd.close(` reads as cleanup). Drop the `fd.close` text → `{found:true}`. Note: the ★ immunity test
  `scan-code-resource-leak.test.mjs:69` uses this exact payload but in **double quotes** (masked →
  passes); the **backtick** form fails today.

The two `.mjs` headers (null-deref `:39-44`, resource-leak `:15-17`, `:54-59`) and the two lens docs
(null-deref.md `:62-66`, `:155`; resource-leak.md `:63-68`, `:158`) all claim "**no free text moves the
verdict / injection-immune by construction**" — **unconditionally**. That is the P0 disease at the floor:
a guarantee broader than the floor primitive actually delivers. Same one-line mask gap, two files, one
root cause → **one axis, one PR** (P3/P7).

## Files

- `.dev/floor/scan-code-null-deref.mjs` — add the suppression-only template-interior masker; route `firstUseDerefLine` through it; correct the header injection-immunity claim + mask-comment. — layer `.dev/floor`
- `.dev/floor/scan-code-resource-leak.mjs` — mirror: same masker (duplicated per-file, see below); route `isCleanedUp` through it; correct the header claims + mask-comment. — layer `.dev/floor`
- `.dev/floor/scan-code-null-deref.test.mjs` — add the V1 backtick-laundering ★ immunity case (→ found:true @ deref line) + a fence-robustness regression assertion. — layer `.dev/floor`
- `.dev/floor/scan-code-resource-leak.test.mjs` — add the V2 backtick case (→ found:true @ binding line) + augment the ★ immunity test (:69) to also cover the backtick form + a fence-robustness assertion. — layer `.dev/floor`
- `pharn-review/null-deref/null-deref.md` — correct the false injection-immunity claim (:62-66) + the guarantee-audit bullet (:155). — layer `pharn-review`
- `pharn-review/resource-leak/resource-leak.md` — correct the false injection-immunity claim (:63-68) + the guarantee-audit bullet (:158). — layer `pharn-review`

> Line numbers above are the CURRENT live locations (read this run); `/pharn-dev-build` re-reads and
> anchors on the claim TEXT, never blindly on a line number (P6). Both `.mjs` also carry the same claim
> in their `mask()` comment blocks (null-deref `:34-37`/`:88-92`, resource-leak `:49-52`/`:103-107`) —
> those get the same two-copy-design correction.

### Explicitly not touched

- `pharn-review/null-deref/evals/**` and `pharn-review/resource-leak/evals/**` — the lens eval fixtures.
  Verified LIVE that all 8 case fixtures keep IDENTICAL verdicts after the fix (null-deref: HIT@15 /
  CLEAN / CLEAN / HIT@18; resource-leak: HIT@16 / CLEAN / CLEAN / HIT@14), so no fixture or expected
  output changes. Listed here (under this heading, which ends the authorized-write list) so the build's
  `--from-plan` scope does NOT authorize them.
- The other `scan-code-*` siblings — out of scope (see Open questions Q2).

## The fix (deterministic; mirrored in both scanners)

**Detection is UNCHANGED and stays fence-robust:** `ASSIGN_RE` + `matchDelim` continue to run over
`masked` (backticks intact), so `const NAME = recv.OPEN(` bindings inside ` ``` `-fenced `.md` code are
still found. **Only the suppression clause changes its input source.**

1. Add a second deterministic pass `maskTemplateInteriors(masked)` that takes the already
   comment/string-masked text and returns a length-and-newline-preserving copy in which JS
   template-literal string content is blanked to spaces, with **two rules that keep detection
   fence-robust** (both verified live, see Discovery evidence):
   - a **run of ≥3 backticks is a markdown code-fence marker** → emitted unchanged, does NOT open a
     template (this is exactly what preserves the code that lives BETWEEN ` ``` ` fences in `.md`
     fixtures — the naive "mask everything between backticks" masker blanks the whole fenced block and
     WOULD break detection; the ≥3-run skip is the load-bearing rule);
   - a **single backtick** toggles template state; inside a template every char is blanked (newline
     preserved).
2. Route the suppression clause through the new copy — **nothing else**:
   - null-deref: `firstUseDerefLine` scans `maskTemplateInteriors(masked)` instead of `masked`.
   - resource-leak: `isCleanedUp` scans `maskTemplateInteriors(masked)` instead of `masked`.
   - Offsets map 1:1 (same length), so `searchStart` (from `matchDelim` over `masked`) stays valid.
3. Do **NOT** unmask backticks globally in `mask()` — that would break fence survival for DETECTION.
   The change is a **second, suppression-only** masking pass, never a change to detection's input.
4. **Duplicate `maskTemplateInteriors` per-file** (one copy in each `.mjs`), mirroring the existing
   accepted duplication of `mask`/`matchDelim`/`lineAt` (null-deref `.mjs:86`, resource-leak
   `.mjs:101`). A shared module would be a **separate axis** (consolidation, P7) — not bundled here.

**`${…}` interpolation handling — a real choice (see Open questions Q1):**

- **Option A (specified / recommended):** blank the WHOLE template interior, including `${…}`. Simplest
  (single boolean state), and consistent with the sibling convention that already accepts "template TEXT
  read as code = a documented false-POSITIVE, the honest price of the shared mask"
  (`scan-code-n-plus-one.mjs:40`, `scan-code-magic-values.mjs:31-34`, `scan-code-missing-await.mjs:36`).
  Cost: a contrived over-flag — e.g. `` `${u?.name}` `` as the first use of `u` is masked, so a later
  raw `u.name` reads as a HIT (verified: A → HIT@3 where truth is CLEAN). Over-flagging is the SAFE
  direction for an advisory-backing floor; the bound gets documented in both `.mjs` + both docs.
- **Option B (alternative):** preserve `${…}` expression code (brace/stack tracking) so no new
  false-positive is introduced (verified: B → CLEAN on that case). More masker logic.

Both options fully close the suppression laundering (V1→HIT@3, V2→HIT@1) and regress zero fixtures/tests
(both verified live). The `## Files` and `## Tests` lists are identical either way.

**Doc/comment correction (the P0 fix, applied only AFTER the code fix makes it true):** rewrite each
"no free text moves the verdict / injection-immune by construction" claim to the qualified-true form —
the DETECTION mask keeps backticks (fence-robust), AND the SUPPRESSION search additionally masks
template-literal string content, so **no free text — a `//`/`/* */` comment, a single/double-quoted
string, OR a template-literal's text — can suppress a real finding** (Option A: also state the `${…}`
false-positive as the honest price). Update each `mask()` comment to describe the two-copy design.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the enum-gated (trusted) / free-text (untrusted) split. The
  scanner's `found`/`hits` are the enum-gated verdict the lens's FLOOR finding rests on; the fix restores
  that **no untrusted free text moves that verdict** (cite, do not restate — P4).
- `ARCHITECTURE.md §2` primitive #3 (regex / enum / text-membership). The fix adds **no new floor
  primitive** — it repairs an existing one so its stated scope matches its actual behavior.

## Tests to write (P1 — the scanners' spec IS their hermetic `.test.mjs`)

- null-deref.test.mjs: `★ IMMUNITY: a backtick template literal supplying a non-deref "first use" does NOT suppress a real deref` → V1 payload → `HIT @ deref line (3)`; and `fence-robustness: a real deref inside a ``` ``` ```-fenced block is still found` → `HIT`.
- resource-leak.test.mjs: `★ IMMUNITY: a`fd.close()`inside a BACKTICK literal is not cleanup` → V2 payload → `HIT @ binding line (1)` (augment the existing `:69` double-quote ★ test to also assert the backtick form); and a `fence-robustness` assertion → `HIT`.
- Every case asserts BOTH `r.status === 0` and the exact `{found, hits}` JSON (assert exit codes — the scanner arg contract is `node <scanner> <code-file>`, exit 0 on a successful scan, nonzero + empty stdout when the target is missing).

## Guarantee audit (P0)

- "The suppression search reads no untrusted free text — comments, single/double-quoted strings, AND
  template-literal string content — so no free text can SUPPRESS a real finding" → **FLOOR** (regex /
  text-membership over a deterministically masked copy; `ARCHITECTURE.md §2` primitive #3). This is the
  corrected, now-true claim.
- "Detection stays fence-robust over `.md` fixtures" → **FLOOR** (the ≥3-backtick-run skip; verified: all
  8 fixtures keep verdicts; locked by the new fence-robustness tests; primitive #3).
- "The scanner detects a SHAPE, never 'the code is null-safe / leak-free'" → **ADVISORY**, unchanged —
  the HONEST BOUND the lens surfaces. Not touched by this fix.
- The prior **unconditional** "no free text moves the verdict / injection-immune by construction" was
  **false** (template free text could move it) → it was the disease; the fix makes the claim true by
  construction and the docs are re-qualified to the floor's real scope (Option A additionally documents
  the `${…}` false-positive). No guarantee is left broader than its floor reduction.

## Trust audit (P2)

- Input: the scanned artifact is `trust: untrusted` code (`THREAT-MODEL.md §2`, surface #4 — reviewed
  code is untrusted). **Before:** untrusted template-literal STRING content reached the enum-gated
  `found`/`hits` verdict through the suppression clause — taint laundering INTO a floor verdict (the
  fix#1 disease, at the floor level). **After:** template string content is masked to whitespace before
  the suppression search, so it can no longer move the guaranteed verdict; detection still reads code
  tokens (fence-robust); `${…}` is real code (preserved under Option B; blanked-as-honest-price under
  Option A). No untrusted free text moves a guaranteed decision — P2 restored at the floor.

## Determinism audit (P5)

- `maskTemplateInteriors` is a deterministic character scan (membership over backtick-run-length +
  toggle/stack state) — no LLM classification. The suppression clause remains regex / text-membership
  over the masked copy. Branch on deterministic membership, never judgment. ✓

## Discovery evidence (verified LIVE this run — P6)

- Located files, read both scanners in full, both `mask()` bodies, both `.test.mjs`, both lens docs,
  and all 8 `.md` case fixtures (code lives inside ` ``` `-fences).
- Reproduced both bugs: V1/V2 → `{found:false}` on today's scanners.
- **Prototyped the fence-safe masker (Options A and B) and ran both over the real fixtures + payloads:**
  all 8 fixtures keep their exact verdicts, V1→HIT@3, V2→HIT@1, existing ★ immunity payloads unchanged,
  the new backtick ★ immunity payloads now HIT. **⇒ the HALT condition ("masking template interiors
  breaks fence-robust detection") is DISPROVEN with evidence — the ≥3-run fence-skip preserves the
  fenced code.**
- Baseline confirmed: current scanners over the fixtures match the prototype; `node --test` over both
  suites is GREEN (fail 0) today.

## Resolved decisions (GATE 1 — human-approved 2026-07-06)

No open questions remain; both were resolved at the plan-approval gate:

- **Q1 — `${…}` handling → Option A (blank the WHOLE template interior, including `${…}`).** Document
  the contrived `${…}`-first-use false-positive as the honest price (consistent with the sibling
  convention). The specified approach in "The fix" above IS Option A.
- **Q2 — sibling scope → TWO scanners only** (`null-deref` + `resource-leak`). No demonstrated failing
  payload exists for any other sibling; the siblings that read template TEXT do so as documented
  false-positives (safe, over-flag direction), only these two have the suppression (HIT→CLEAN) shape, so
  the two-file scope is the honest one-axis boundary. A sweep of siblings is a separate axis (P7).

Grill refinements to fold into the build (all within the authorized `## Files`, advisory):

- **F1 (testability, P1):** add a test PINNING Option A's `${…}` over-flag (e.g. `` `${u?.name}` ``
  first-use → HIT), so the documented bound is regression-caught, not prose-only.
- **F2 (determinism, P5):** specify the exactly-2-backtick run (` ` ``) in the masker — under the
  single-backtick toggle it is an empty template (open+close, no interior masked); state it, don't leave
  it incidental.
- **F3 (trust, P2):** state the MONOTONICITY property in the doc corrections — the suppression-only
  second mask can only ADD masking (over-flag / safe direction) and never removes masking from detection
  (which reads the untouched `masked`), so it can never re-enable laundering-suppression.
