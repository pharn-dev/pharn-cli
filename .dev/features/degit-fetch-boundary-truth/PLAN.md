# PLAN — degit-fetch-boundary-truth

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Make the fetch-boundary trust map tell the truth about `degit`, verified against the installed dependency (T5). Amend `THREAT-MODEL.md` §2 (true fetch mechanics: fork identity, three-tier resolver, cache-write semantics at the real path, tar provenance + guards) and §4b (residuals restated over what H1–H8 proved, including two claims made **upward**), correct the one false sentence in `src/lib/repo.ts`'s doc comment, and record the correction in `CHANGELOG.md`.
- layer(s): trusted governance doc (handoff) + one `src/lib` comment block + user-facing record
- constitution_refs: [P0, P2, P4, P6, P7]

## Files

- `THREAT-MODEL.UPDATED.md` — full corrected `THREAT-MODEL.md` (§2 + §4b applied), for a human to move into place — layer: handoff artifact
- `THREAT-MODEL.md` — **the applied result**, moved into place **by the human** (`mv`), never written by the agent — layer: trusted doc
- `src/lib/repo.ts` — **comment lines only**: correct the `git ls-remote` mechanism claim in the `fetchRepo` doc block — layer: lib
- `CHANGELOG.md` — one line under Unreleased, `Docs` — layer: user-facing record
- `.pharn/writes-scope.json` — rewritten by each stage's own Step 0 setter — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/PLAN.md` — this plan — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/FACT-TABLE.md` — the Phase A evidence record (H1–H8) — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/GRILL.md` — grill log — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/REGRESSION.md` — regression render — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/regression-report.json` — machine regression report — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/VERIFY.md` — verify render — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/verify-report.json` — machine verify report — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/REVIEW.md` — review log — layer: loop artifact
- `.dev/features/degit-fetch-boundary-truth/SHIP.md` — ship roll-up — layer: loop artifact

> **Two paths were added to this list after the first scope check exited 1** — `THREAT-MODEL.md` and
> `.pharn/writes-scope.json`. Neither is a build escape. `THREAT-MODEL.md` changed because the **human**
> applied the handoff (`mv THREAT-MODEL.UPDATED.md THREAT-MODEL.md`), which is the hook's own sanctioned
> route for a `DEFAULT_PROTECTED` file; `check-regress.mjs scope` compares changed paths against the
> plan's list and has no concept of "applied by a human." `.pharn/writes-scope.json` is rewritten by every
> stage's own Step 0 setter. Resolved by **declaring** them, exactly as #93 did — never by suppressing the
> check.

**Not touched:** `CONSTITUTION.md`, `ARCHITECTURE.md`, `LIMITS.md`, any `tests/**`, any `.dev/floor/**`,
any `src/**` other than `repo.ts` comment lines. **No behavior changes**: no `cache` option change, no
cache-dir override, no degit pin/swap/vendor change, no timeout/body-cap work, no `warn` listener
(HALT-1 option (b) declined — docs-only).

### Why the handoff file exists (the brief's instruction is not achievable)

The build prompt says `THREAT-MODEL.md` is `DEFAULT_PROTECTED` and to "scope via the setter, never a
bypass." Verified: `protect-trusted-paths.cjs:58` lists `THREAT-MODEL.md` in `DEFAULT_PROTECTED`, and
`PHARN_PROTECTED` (`:59-63`) composes **by addition only** — there is no subtraction and no
scope-based exemption, so the setter **cannot** grant this write. The #93 precedent
(`trust-map-records-era`) established the sanctioned alternative: deliver a side-by-side
`*.UPDATED.md` that a human moves into place. No bypass. The human applies it with:

```bash
mv THREAT-MODEL.UPDATED.md THREAT-MODEL.md
```

## The instrument (Phase C)

- `git diff main -- src/lib/repo.ts` must show every changed line matching comment-or-blank.
- `git diff main -- THREAT-MODEL.md` must show **zero** changed `##`/`###` header lines (§ numbering
  immutable — TM §2/§3/§5 are cited by floor checkers and fixtures per the #93 citer inventory). Because
  the amendment ships as `THREAT-MODEL.UPDATED.md`, the header-immutability check runs against a diff of
  the handoff file versus the original.
- `npm run lint:md && npm run check`.

## Contracts satisfied

- No `pharn-contracts` contract is implicated — prose + comments only, no finding shape, no schema.

## Guarantee audit (P0)

- **"the trust map now describes degit accurately"** → **ADVISORY.** Prose correctness is not
  floor-reducible; the backstop is the evidence record (`FACT-TABLE.md`) with a source anchor and/or a
  live transcript behind every sentence.
- **"no behavior changed"** → **FLOOR-adjacent, mechanical:** the comments-only diff instrument above,
  plus the untouched vitest suite staying green.
- **"§ numbering is unchanged"** → **FLOOR-adjacent, mechanical:** the header-diff grep.
