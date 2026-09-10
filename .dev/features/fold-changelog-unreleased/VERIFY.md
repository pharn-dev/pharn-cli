# VERIFY — `fold-changelog-unreleased`

## FLOOR layer — the deterministic gates (these own the verdict)

| gate | exit |
| --- | --- |
| `test` (`npm test` — vitest, 57 files / 1216 tests) | 0 |
| `validate` (`.dev/floor/validate.mjs .`) | 0 |
| `lint` (`npm run lint` — eslint, `--max-warnings 0`) | 0 |
| `format:check` (`npm run format:check` — prettier) | 0 |
| `lint:md` (`npm run lint:md` — markdownlint-cli2) | 0 |
| `typecheck` (`npm run typecheck` — tsc over src AND tests) | 0 |

No `structural:*` gate is present: this repo ships **no** committed eval pairs (no
`*/evals/expected/*.json`), which is the same reason `validate` reports `0 capabilities checked`. A
feature shipping no eval-actual pair simply has no such gate — it is absent from the map, not
silently passed.

**VERIFIED: floor gates PASS** (`.dev/floor/check-verify.mjs` exit **0**, `verdict: "PASS"`,
`failing_gates: []`).

### The gate that carries this increment

`lint:md` is the gate P-6 exists to make meaningful, so its exit code is worth reading carefully. It
is `0` here **with `CHANGELOG.md` in scope** — `Linting: 24 files` (it was 23 with the changelog
ignored), `Summary: 0 issues`. Before this increment the same gate was also `0`, but over a set that
excluded the file: green by not looking. The exit code is unchanged; what it certifies is not.

The 21 violations that appear when the ignore is lifted are resolved as follows, and the split
matters because only one bucket involved editing prose:

- **11× MD024** (duplicate sibling headings) — removed **structurally**, by consolidating 17
  `[Unreleased]` subsections into one per kind. No prose touched.
- **10× MD049** (asterisk emphasis) — the **only** hand edit in the increment: 10 characters on 5
  lines (86, 162, 195, 196, 301), `*` → `_`, no word altered.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op and the verdict is the floor gates
alone. No verifier was authored for this increment (P7 — authoring one speculatively for an empty
slot is the speculation the constitution forbids).

## Feature-specific conservation checks (NOT part of the floor verdict)

Stated here because the floor above cannot reach them, and a reader should not mistake `PASS` for
coverage of them. Nothing in this repo asserts the **content** of `CHANGELOG.md`, so no gate in the
table could detect prose lost during a 1000-line block move. That property was established
separately, by construction rather than by inspection:

- **Phase A (MD049 isolated):** `git diff -U0` showed exactly **5** changed lines;
  `git diff --word-diff=porcelain` showed only `*`↔`_` tokens.
- **Phase B (the fold as a pure block move):** every non-heading, non-blank line between the
  `[Unreleased]` and `[0.3.2]` headings — a region definition that means the same thing pre- and
  post-fold — was extracted on both sides: **943 lines each**, sorted sha256
  `23d62afd011611c920324dea8d5d7896209f19f8fe671051f89607a9cab76913` on **both**.
- **Order + kind assignment (stronger than Phase B):** the sorted hash is order-blind and
  heading-blind by construction. So each content line was additionally tagged with its (Docs-mapped)
  kind and **stable-sorted by that tag alone**; the pre- and post-fold files are **byte-identical**
  (`diff` exit 0), which pins kind assignment and within-kind order together.
- **Bullet census:** top-level `- ` bullets balance per kind — Added 12, Changed 14, Removed 2,
  Fixed 44, Security 8 (total 80 on both sides).
- **Link integrity:** the set of `## [X]` headings and the set of `[X]:` link definitions are now
  **equal** (`diff` exit 0) — the dangling `[0.4.0]` reference is closed.

These are real deterministic checks, but they were run **by this increment**, not by a standing gate,
and they are **not** inputs to `check-verify.mjs`.

## Honest residual (P0/P7)

**verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check — verifier concerns are advisory help, not assurance.**

Two specifics for this increment:

- The gates cannot judge whether these ~72 entries **belong** under `0.4.0` rather than split across
  two releases, nor whether `2026-09-10` is the right date. Those are editorial calls for the human.
- Nothing pins the `.markdownlint-cli2.jsonc` `ignores` value, so no gate would notice if a later
  change re-added `CHANGELOG.md` to it. `GRILL.md` raised this (P1, `important`); it was surfaced
  rather than acted on, because adding a test would write outside the approved plan's `## Files`.
